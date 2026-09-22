import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client authenticated with the service-role key. This BYPASSES
 * row-level security entirely - never import it into client components, never expose
 * its results to the browser, and never use it for tables the owner's RLS-scoped
 * session client can already read/write (accounts, campaigns, google_connections, etc.).
 *
 * Restrict use to tables that intentionally have no client RLS policy:
 * google_token_secrets and google_oauth_attempts.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service-role configuration.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
