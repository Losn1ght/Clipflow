import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { LOGIN_DISABLED } from "@/lib/dev-flags";

export function canonicalOwnerId() {
  const ownerId = process.env.CANONICAL_OWNER_ID;
  if (!ownerId) {
    throw new Error("CANONICAL_OWNER_ID must be configured.");
  }
  return ownerId;
}

export function canonicalOwnerEmail() {
  const ownerEmail = process.env.CANONICAL_OWNER_EMAIL;
  if (!ownerEmail) {
    throw new Error("CANONICAL_OWNER_EMAIL must be configured.");
  }
  return ownerEmail.toLowerCase();
}

export function isCanonicalOwner(userId: string | undefined, email: string | undefined) {
  return (
    Boolean(userId) &&
    userId === canonicalOwnerId() &&
    Boolean(email) &&
    email?.toLowerCase() === canonicalOwnerEmail()
  );
}

/** Returns the authenticated owner or throws a generic authorization error. */
export async function requireOwner() {
  if (LOGIN_DISABLED) {
    // No real session exists while the login gate is bypassed, so the normal
    // cookie-scoped client has no auth.uid() and RLS blocks every row. Use the
    // service-role client here instead so local testing still sees real data.
    return { supabase: createServiceRoleClient(), userId: canonicalOwnerId() };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = data?.claims?.email as string | undefined;

  if (error || !isCanonicalOwner(userId, email)) {
    throw new Error("Unauthorized");
  }

  return { supabase, userId };
}