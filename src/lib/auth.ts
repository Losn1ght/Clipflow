import { createClient } from "@/lib/supabase/server";

export function canonicalOwnerId() {
  const ownerId = process.env.CANONICAL_OWNER_ID;
  if (!ownerId) {
    throw new Error("CANONICAL_OWNER_ID must be configured.");
  }
  return ownerId;
}

export function isCanonicalOwner(userId: string | undefined) {
  return Boolean(userId) && userId === canonicalOwnerId();
}

/** Returns the authenticated owner or throws a generic authorization error. */
export async function requireOwner() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !isCanonicalOwner(userId)) {
    throw new Error("Unauthorized");
  }

  return { supabase, userId };
}