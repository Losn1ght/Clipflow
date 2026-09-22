"use server";

import { createClient } from "@/lib/supabase/server";

// The login form's "Username" is a display-only alias - Supabase Auth is
// email-based under the hood, and the real email never reaches the client.
export async function signInWithUsername(username: string, password: string) {
  const ownerUsername = process.env.CANONICAL_OWNER_USERNAME;
  const ownerEmail = process.env.CANONICAL_OWNER_EMAIL;

  if (!ownerUsername || !ownerEmail) {
    return { error: "Login is not configured." };
  }

  // Same generic error either way - never reveal which part was wrong.
  if (username.trim().toLowerCase() !== ownerUsername.toLowerCase()) {
    return { error: "Invalid username or password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: ownerEmail, password });
  if (error) {
    return { error: "Invalid username or password." };
  }

  return { error: null };
}
