import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const publicPaths = new Set(["/auth/callback", "/auth/signout", "/login"]);

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ownerId = process.env.CANONICAL_OWNER_ID;

  if (publicPaths.has(request.nextUrl.pathname)) {
    return response;
  }

  // Fail closed: if required env vars are missing, don't silently skip the auth
  // check — send the request to /login instead of letting it through.
  if (!url || !key || !ownerId) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    return NextResponse.redirect(destination);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  if (error || data?.claims?.sub !== ownerId) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    
    return NextResponse.redirect(destination);
  }

  return response;
}

export const config = {
  // api/cron/* is excluded here (not added to publicPaths, which would read as
  // "no auth needed") — it has its own CRON_SECRET bearer-token check in the
  // route handler, and Vercel Cron never sends a session cookie, so this
  // middleware's owner check would otherwise redirect every scheduled run.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};