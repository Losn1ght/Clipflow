import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requireOwner } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { encryptSecret, toBytea } from "@/lib/crypto";

// drive.metadata.readonly alone does not reliably include account email; requesting
// the `email` scope alongside it lets the callback show "Connected as {email}" for
// display purposes only. No Drive content or write scopes are requested.
const OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.email";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function appUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
}

function base64url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(request: NextRequest) {
  const base = appUrl(request);

  try {
    await requireOwner();
  } catch {
    return NextResponse.redirect(new URL("/login", base));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(new URL("/?googleError=config", base));
  }

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const state = base64url(randomBytes(32));
  const stateDigest = createHash("sha256").update(state).digest("hex");

  const encryptedVerifier = encryptSecret(codeVerifier, "google-pkce-verifier");

  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient.from("google_oauth_attempts").insert({
    state_digest: stateDigest,
    pkce_verifier_ciphertext: toBytea(encryptedVerifier.ciphertext),
    pkce_verifier_nonce: toBytea(encryptedVerifier.nonce),
    pkce_verifier_aad: toBytea(encryptedVerifier.aad),
    key_version: encryptedVerifier.keyVersion,
    expires_at: new Date(Date.now() + ATTEMPT_TTL_MS).toISOString(),
  });
  if (error) {
    return NextResponse.redirect(new URL("/?googleError=attempt", base));
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", OAUTH_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl);
}
