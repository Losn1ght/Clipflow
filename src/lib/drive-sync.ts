import { canonicalOwnerId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { decryptSecret, fromBytea } from "@/lib/crypto";

// Shared Drive inventory sync engine. Both the daily Vercel Cron route and the
// manual "Sync Drive" server action call `runSyncForAllMappings()` — there is only
// one sync implementation.
//
// Client choice: this module uses the service-role client for every read/write
// (google_token_secrets, drive_folder_mappings, sync_runs, inventory_snapshots)
// rather than the owner-scoped RLS client used elsewhere in the app. That's a
// deliberate exception to the codebase's usual "service-role only for token
// secrets" pattern: the Vercel Cron invocation has no authenticated Supabase
// session at all (no cookies, no auth.uid()), so the owner-scoped client's RLS
// policies (`owner_id = auth.uid() and is_canonical_owner()`) could never be
// satisfied there. Since the manual trigger must run the exact same code path as
// cron, this module uses the service-role client uniformly instead of branching
// client type by caller.

const PAGE_BUDGET_PER_INVOCATION = 5;
const TIME_BUDGET_MS = 40_000;
const LEASE_DURATION_MS = 4 * 60 * 1000; // comfortably longer than one invocation

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export interface SyncableMapping {
  id: string;
  folder_id: string;
}

type SyncRunRow = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  lease_expires_at: string | null;
  accumulated_count: number;
  next_page_token: string | null;
  pages_processed: number;
  started_at: string | null;
};

export type MappingSyncResult =
  | { mappingId: string; outcome: "completed"; clipCount: number }
  | { mappingId: string; outcome: "checkpointed" }
  | { mappingId: string; outcome: "skipped"; httpStatus: 409 }
  | { mappingId: string; outcome: "failed"; errorCode: string; errorMessage: string };

export interface SyncAllSummary {
  synced: number;
  checkpointed: number;
  skipped: number;
  failed: number;
  results: MappingSyncResult[];
}

class DriveApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Thrown specifically when Google rejects a refresh token as invalid/expired/revoked
 * (HTTP 400, `error: "invalid_grant"`). This is a connection-level failure — the token
 * is permanently dead until the owner reconnects — distinct from a transient Drive API
 * hiccup, which should stay a per-run failure. */
class InvalidGrantError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function truncate(message: string, max = 500) {
  return message.length > max ? message.slice(0, max) : message;
}

function classifyError(err: unknown): { errorCode: string; errorMessage: string } {
  if (err instanceof InvalidGrantError) {
    return { errorCode: "invalid_grant", errorMessage: truncate(err.message) };
  }
  if (err instanceof DriveApiError) {
    const code = err.status === 403 ? "forbidden" : err.status === 404 ? "not_found" : String(err.status);
    return { errorCode: code, errorMessage: truncate(err.message) };
  }
  const message = err instanceof Error ? err.message : "Unknown sync error.";
  return { errorCode: "unknown", errorMessage: truncate(message) };
}

async function getRefreshTokenForConnection(serviceClient: ServiceClient, connectionId: string): Promise<string> {
  const { data: secret, error } = await serviceClient
    .from("google_token_secrets")
    .select("ciphertext, nonce, aad, key_version")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error || !secret) throw new Error("Google refresh token is not available.");

  return decryptSecret({
    ciphertext: fromBytea(secret.ciphertext),
    nonce: fromBytea(secret.nonce),
    aad: fromBytea(secret.aad),
    keyVersion: secret.key_version,
  });
}

async function exchangeForAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth client is not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    if (response.status === 400) {
      try {
        const errorBody = (await response.json()) as { error?: string; error_description?: string };
        if (errorBody?.error === "invalid_grant") {
          throw new InvalidGrantError(errorBody.error_description ?? "Google refresh token is invalid, expired, or revoked.");
        }
      } catch (err) {
        if (err instanceof InvalidGrantError) throw err;
        // Body wasn't JSON (or didn't match) — fall through to the generic error below.
      }
    }
    throw new Error(`Unable to refresh the Google access token (status ${response.status}).`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token response was missing an access token.");
  return json.access_token;
}

async function fetchDrivePage(folderId: string, accessToken: string, pageToken: string | null) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  // Direct children only (no recursion), non-trashed, video mime types only.
  url.searchParams.set("q", `'${folderId}' in parents and trashed = false and mimeType contains 'video/'`);
  url.searchParams.set("fields", "nextPageToken,files(id)");
  url.searchParams.set("pageSize", "1000");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("supportsAllDrives", "false");
  url.searchParams.set("includeItemsFromAllDrives", "false");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    let message = `Drive API request failed (status ${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Fall back to the generic message if the error body isn't JSON.
    }
    throw new DriveApiError(response.status, message);
  }

  return (await response.json()) as { nextPageToken?: string; files?: { id: string }[] };
}

/**
 * Finds the mapping's most recent sync_runs row and either resumes it (if it's an
 * incomplete run whose lease has expired or was never held), reports it as actively
 * leased by another invocation (409/skip), or starts a brand-new run.
 */
async function acquireOrResumeRun(
  serviceClient: ServiceClient,
  mapping: SyncableMapping,
  ownerId: string
): Promise<{ run: SyncRunRow } | { skipped: true }> {
  const { data: latest, error: latestError } = await serviceClient
    .from("sync_runs")
    .select("id, status, lease_expires_at, accumulated_count, next_page_token, pages_processed, started_at")
    .eq("mapping_id", mapping.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error("Unable to look up the current sync run.");

  const now = Date.now();
  const leaseExpiresAt = new Date(now + LEASE_DURATION_MS).toISOString();

  if (latest && (latest.status === "pending" || latest.status === "running")) {
    const leaseActive = Boolean(latest.lease_expires_at) && new Date(latest.lease_expires_at as string).getTime() > now;
    if (leaseActive) {
      return { skipped: true };
    }

    const { data: updated, error } = await serviceClient
      .from("sync_runs")
      .update({
        status: "running",
        lease_expires_at: leaseExpiresAt,
        started_at: latest.started_at ?? new Date(now).toISOString(),
      })
      .eq("id", latest.id)
      .select("id, status, lease_expires_at, accumulated_count, next_page_token, pages_processed, started_at")
      .single();
    if (error || !updated) throw new Error("Unable to acquire the sync lease.");
    return { run: updated };
  }

  const { data: created, error } = await serviceClient
    .from("sync_runs")
    .insert({
      mapping_id: mapping.id,
      owner_id: ownerId,
      status: "running",
      lease_expires_at: leaseExpiresAt,
      accumulated_count: 0,
      next_page_token: null,
      pages_processed: 0,
      started_at: new Date(now).toISOString(),
    })
    .select("id, status, lease_expires_at, accumulated_count, next_page_token, pages_processed, started_at")
    .single();
  if (error || !created) throw new Error("Unable to create a sync run.");
  return { run: created };
}

async function markConnectionNeedsReauth(serviceClient: ServiceClient, connectionId: string) {
  await serviceClient
    .from("google_connections")
    .update({ needs_reauth_at: new Date().toISOString() })
    .eq("id", connectionId);
}

async function markRunFailed(serviceClient: ServiceClient, runId: string, errorCode: string, errorMessage: string) {
  await serviceClient
    .from("sync_runs")
    .update({
      status: "failed",
      lease_expires_at: null,
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/** Runs (or resumes) the sync for a single mapping, bounded by the page/time budget. */
export async function runSyncForMapping(
  mapping: SyncableMapping,
  ctx: { serviceClient: ServiceClient; ownerId: string; accessToken: string }
): Promise<MappingSyncResult> {
  const { serviceClient, ownerId, accessToken } = ctx;

  let acquired: { run: SyncRunRow } | { skipped: true };
  try {
    acquired = await acquireOrResumeRun(serviceClient, mapping, ownerId);
  } catch (err) {
    const { errorCode, errorMessage } = classifyError(err);
    return { mappingId: mapping.id, outcome: "failed", errorCode, errorMessage };
  }
  if ("skipped" in acquired) {
    return { mappingId: mapping.id, outcome: "skipped", httpStatus: 409 };
  }
  const run = acquired.run;

  let accumulatedCount = run.accumulated_count;
  let pageToken = run.next_page_token;
  let pagesProcessed = run.pages_processed;
  const invocationStart = Date.now();
  let pagesThisInvocation = 0;

  try {
    while (true) {
      if (pagesThisInvocation >= PAGE_BUDGET_PER_INVOCATION || Date.now() - invocationStart >= TIME_BUDGET_MS) {
        await serviceClient
          .from("sync_runs")
          .update({
            status: "pending",
            lease_expires_at: null,
            accumulated_count: accumulatedCount,
            next_page_token: pageToken,
            pages_processed: pagesProcessed,
          })
          .eq("id", run.id);
        return { mappingId: mapping.id, outcome: "checkpointed" };
      }

      const page = await fetchDrivePage(mapping.folder_id, accessToken, pageToken);
      pagesThisInvocation += 1;
      pagesProcessed += 1;
      accumulatedCount += page.files?.length ?? 0;
      pageToken = page.nextPageToken ?? null;

      if (!pageToken) {
        const completedAt = new Date().toISOString();
        const { error: snapshotError } = await serviceClient.from("inventory_snapshots").insert({
          mapping_id: mapping.id,
          owner_id: ownerId,
          clip_count: accumulatedCount,
          completed_at: completedAt,
        });
        if (snapshotError) throw new Error(`Unable to persist the inventory snapshot: ${snapshotError.message}`);

        await serviceClient
          .from("sync_runs")
          .update({
            status: "completed",
            lease_expires_at: null,
            accumulated_count: accumulatedCount,
            next_page_token: null,
            pages_processed: pagesProcessed,
            completed_at: completedAt,
          })
          .eq("id", run.id);

        return { mappingId: mapping.id, outcome: "completed", clipCount: accumulatedCount };
      }
    }
  } catch (err) {
    const { errorCode, errorMessage } = classifyError(err);
    await markRunFailed(serviceClient, run.id, errorCode, errorMessage);
    return { mappingId: mapping.id, outcome: "failed", errorCode, errorMessage };
  }
}

/** Syncs every non-disconnected mapping belonging to the canonical owner. */
export async function runSyncForAllMappings(): Promise<SyncAllSummary> {
  const ownerId = canonicalOwnerId();
  const serviceClient = createServiceRoleClient();

  const { data: connection, error: connectionError } = await serviceClient
    .from("google_connections")
    .select("id")
    .eq("owner_id", ownerId)
    .is("revoked_at", null)
    .not("connected_at", "is", null)
    .maybeSingle();
  if (connectionError) throw new Error("Unable to look up the Google connection.");

  const { data: mappingRows, error: mappingsError } = await serviceClient
    .from("drive_folder_mappings")
    .select("id, folder_id")
    .eq("owner_id", ownerId)
    .is("disconnected_at", null);
  if (mappingsError) throw new Error("Unable to look up Drive folder mappings.");

  const mappings: SyncableMapping[] = mappingRows ?? [];
  if (mappings.length === 0) {
    return { synced: 0, checkpointed: 0, skipped: 0, failed: 0, results: [] };
  }

  if (!connection) {
    // No active Google connection: every mapping fails with the same reason rather
    // than the batch throwing outright.
    const results: MappingSyncResult[] = [];
    for (const mapping of mappings) {
      const acquired = await acquireOrResumeRun(serviceClient, mapping, ownerId).catch(() => null);
      if (acquired && "run" in acquired) {
        await markRunFailed(serviceClient, acquired.run.id, "no_connection", "No active Google Drive connection.");
        results.push({ mappingId: mapping.id, outcome: "failed", errorCode: "no_connection", errorMessage: "No active Google Drive connection." });
      } else if (acquired && "skipped" in acquired) {
        results.push({ mappingId: mapping.id, outcome: "skipped", httpStatus: 409 });
      } else {
        results.push({ mappingId: mapping.id, outcome: "failed", errorCode: "no_connection", errorMessage: "No active Google Drive connection." });
      }
    }
    return {
      synced: 0,
      checkpointed: 0,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      results,
    };
  }

  let accessToken: string;
  try {
    const refreshToken = await getRefreshTokenForConnection(serviceClient, connection.id);
    accessToken = await exchangeForAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof InvalidGrantError) {
      await markConnectionNeedsReauth(serviceClient, connection.id);
    }
    const { errorCode, errorMessage } = classifyError(err);
    const results: MappingSyncResult[] = [];
    for (const mapping of mappings) {
      const acquired = await acquireOrResumeRun(serviceClient, mapping, ownerId).catch(() => null);
      if (acquired && "run" in acquired) {
        await markRunFailed(serviceClient, acquired.run.id, errorCode, errorMessage);
        results.push({ mappingId: mapping.id, outcome: "failed", errorCode, errorMessage });
      } else if (acquired && "skipped" in acquired) {
        results.push({ mappingId: mapping.id, outcome: "skipped", httpStatus: 409 });
      } else {
        results.push({ mappingId: mapping.id, outcome: "failed", errorCode, errorMessage });
      }
    }
    return {
      synced: 0,
      checkpointed: 0,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      results,
    };
  }

  const results: MappingSyncResult[] = [];
  for (const mapping of mappings) {
    results.push(await runSyncForMapping(mapping, { serviceClient, ownerId, accessToken }));
  }

  return {
    synced: results.filter((r) => r.outcome === "completed").length,
    checkpointed: results.filter((r) => r.outcome === "checkpointed").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
  };
}
