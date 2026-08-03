import { createBrowserClient } from "@supabase/ssr";

function browserEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase browser configuration.");
  }

  return { url, key };
}

export function createClient() {
  const { url, key } = browserEnv();
  return createBrowserClient(url, key);
}