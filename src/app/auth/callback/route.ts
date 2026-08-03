import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function appUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = "/";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ownerId = process.env.CANONICAL_OWNER_ID;

  if (!code || !url || !key || !ownerId) {
    return NextResponse.redirect(new URL("/auth/signout", appUrl(request)));
  }

  const response = NextResponse.redirect(new URL(next, appUrl(request)));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || data.user?.id !== ownerId) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/signout", appUrl(request)));
  }

  return response;
}