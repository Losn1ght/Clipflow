import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { requireOwner } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { decryptSecret, encryptSecret, fromBytea, toBytea } from "@/lib/crypto";

function appUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const base = appUrl(request);

  let supabase;
  try {
    ({ supabase } = await requireOwner());
  } catch {
    return NextResponse.redirect(new URL("/login", base));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?googleError=missing_params", base));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL("/?googleError=config", base));
  }

  const serviceClient = createServiceRoleClient();
  const stateDigest = createHash("sha256").update(state).digest("hex");

  // Atomically consume the attempt: the update only matches (and returns) a row if it
  // is still unused and unexpired, which is how replay/race attempts are rejected —
  // a second request for the same state finds zero matching rows here.
  const { data: consumedRows, error: consumeError } = await serviceClient
    .from("google_oauth_attempts")
    .update({ used_at: new Date().toISOString() })
    .eq("state_digest", stateDigest)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("pkce_verifier_ciphertext, pkce_verifier_nonce, pkce_verifier_aad, key_version");

  if (consumeError || !consumedRows || consumedRows.length !== 1) {
    return NextResponse.redirect(new URL("/?googleError=invalid_state", base));
  }

  const attempt = consumedRows[0] as {
    pkce_verifier_ciphertext: string;
    pkce_verifier_nonce: string;
    pkce_verifier_aad: string;
    key_version: number;
  };

  let codeVerifier: string;
  try {
    codeVerifier = decryptSecret({
      ciphertext: fromBytea(attempt.pkce_verifier_ciphertext),
      nonce: fromBytea(attempt.pkce_verifier_nonce),
      aad: fromBytea(attempt.pkce_verifier_aad),
      keyVersion: attempt.key_version,
    });
  } catch {
    return NextResponse.redirect(new URL("/?googleError=decrypt", base));
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/?googleError=token_exchange", base));
  }

  const tokenJson = (await tokenResponse.json()) as {
    refresh_token?: string;
    access_token?: string;
  };

  if (!tokenJson.refresh_token || !tokenJson.access_token) {
    return NextResponse.redirect(new URL("/?googleError=no_refresh_token", base));
  }

  // Best-effort display email; drive.metadata.readonly + userinfo.email don't include
  // an id_token, so this is a plain userinfo call. Connection still succeeds without it.
  let googleAccountEmail: string | null = null;
  try {
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (userinfoResponse.ok) {
      const userinfo = (await userinfoResponse.json()) as { email?: string };
      googleAccountEmail = userinfo.email ?? null;
    }
  } catch {
    // Non-fatal: proceed without a display email.
  }

  const { data: connection, error: upsertError } = await supabase
    .from("google_connections")
    .upsert(
      {
        google_account_email: googleAccountEmail,
        connected_at: new Date().toISOString(),
        revoked_at: null,
        needs_reauth_at: null,
      },
      { onConflict: "owner_id" }
    )
    .select("id")
    .single();

  if (upsertError || !connection) {
    return NextResponse.redirect(new URL("/?googleError=save_connection", base));
  }

  const encryptedRefreshToken = encryptSecret(tokenJson.refresh_token, "google-refresh-token");
  const { error: secretError } = await serviceClient.from("google_token_secrets").upsert({
    connection_id: connection.id,
    ciphertext: toBytea(encryptedRefreshToken.ciphertext),
    nonce: toBytea(encryptedRefreshToken.nonce),
    aad: toBytea(encryptedRefreshToken.aad),
    key_version: encryptedRefreshToken.keyVersion,
    updated_at: new Date().toISOString(),
  });

  if (secretError) {
    return NextResponse.redirect(new URL("/?googleError=save_secret", base));
  }

  return NextResponse.redirect(new URL("/?googleConnected=1", base));
}
