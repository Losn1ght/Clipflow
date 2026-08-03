import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryState } from "@/lib/types";
import type { TaskStatus } from "@/lib/validation";

// Defensive fallback if the app_config singleton row is somehow missing.
export const DEFAULT_LOW_STOCK_DAYS = 2;
const FRESH_WINDOW_MS = 26 * 60 * 60 * 1000;
// Google's testing-mode refresh tokens for restricted scopes expire after ~7 days.
// This app can't query the exact expiry, so it surfaces a soft heads-up once a
// connection is older than this conservative buffer.
const CONNECTION_AGING_SOON_MS = 5 * 24 * 60 * 60 * 1000;

export type AccountTone = "secondary" | "destructive" | "outline";

export interface DashboardAccountMapping {
  id: string;
  folderId: string;
  folderName: string | null;
  disconnectedAt: string | null;
}

export interface DashboardAccount {
  id: string;
  name: string;
  clipTargetPerDay: number;
  notes: string;
  folderName: string | null;
  mapping: DashboardAccountMapping | null;
  clipCount: number | null;
  coverageDays: number | null;
  state: InventoryState;
  statusLabel: string;
  tone: AccountTone;
}

export interface DashboardTask {
  id: string;
  title: string;
  status: TaskStatus;
  sortOrder: number;
  accountId: string | null;
  accountName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  externalUrl: string | null;
  notes: string;
}

export interface DashboardCampaign {
  id: string;
  name: string;
  accountIds: string[];
  accountNames: string[];
  requirementsUrl: string | null;
  submissionUrl: string | null;
  budget: number | null;
  platformId: string | null;
  platformName: string | null;
  platformUrl: string | null;
  endsOn: string | null;
}

export interface DashboardPlatform {
  id: string;
  name: string;
  url: string;
}

type MappingRow = {
  id: string;
  account_id: string;
  folder_id: string;
  folder_name: string | null;
  disconnected_at: string | null;
};

type SnapshotRow = { mapping_id: string; clip_count: number; completed_at: string };

type SyncRunRow = {
  mapping_id: string;
  status: "pending" | "running" | "completed" | "failed";
  completed_at: string | null;
  created_at: string;
};

type NamedRelation = { id: string; name: string } | { id: string; name: string }[] | null;

type TaskRow = {
  id: string;
  title: string;
  status: string;
  sort_order: number;
  account_id: string | null;
  campaign_id: string | null;
  external_url: string | null;
  notes: string | null;
  accounts: NamedRelation;
  campaigns: NamedRelation;
};

type PlatformRelation = { id: string; name: string; url: string } | { id: string; name: string; url: string }[] | null;

type CampaignRow = {
  id: string;
  name: string;
  requirements_url: string | null;
  submission_url: string | null;
  budget: number | string | null;
  platform_id: string | null;
  ends_on: string | null;
  account_campaigns: { accounts: NamedRelation }[] | null;
  platforms: PlatformRelation;
};

type PlatformRow = {
  id: string;
  name: string;
  url: string;
};

function deriveState({
  mapping,
  latestSnapshot,
  latestSyncRun,
  now,
}: {
  mapping: MappingRow | undefined;
  latestSnapshot: SnapshotRow | undefined;
  latestSyncRun: SyncRunRow | undefined;
  now: number;
}): { state: InventoryState; clipCount: number | null } {
  if (!mapping) return { state: "unconfigured", clipCount: null };
  if (mapping.disconnected_at) {
    return { state: "disconnected", clipCount: latestSnapshot?.clip_count ?? null };
  }

  const clipCount = latestSnapshot?.clip_count ?? null;
  const isActiveSync = latestSyncRun?.status === "pending" || latestSyncRun?.status === "running";
  if (isActiveSync) return { state: "syncing", clipCount };

  // A failed run only marks the account as "failed" if no snapshot has landed
  // since that run completed — otherwise a later successful sync superseded it.
  const failedIsNewest =
    latestSyncRun?.status === "failed" &&
    (!latestSnapshot ||
      !latestSyncRun.completed_at ||
      new Date(latestSnapshot.completed_at).getTime() < new Date(latestSyncRun.completed_at).getTime());
  if (failedIsNewest) return { state: "failed", clipCount };

  if (latestSnapshot) {
    const ageMs = now - new Date(latestSnapshot.completed_at).getTime();
    return { state: ageMs <= FRESH_WINDOW_MS ? "fresh" : "stale", clipCount };
  }

  // Connected mapping, no snapshot yet, no active/failed run to explain why.
  return { state: "stale", clipCount: null };
}

function labelForAccount(
  state: InventoryState,
  coverageDays: number | null,
  lowStockDays: number
): { label: string; tone: AccountTone } {
  switch (state) {
    case "unconfigured":
      return { label: "No folder linked", tone: "outline" };
    case "disconnected":
      return { label: "Folder disconnected", tone: "destructive" };
    case "syncing":
      return { label: "Syncing…", tone: "outline" };
    case "failed":
      return { label: "Sync failed", tone: "destructive" };
    case "stale":
      return { label: "Sync stale", tone: "outline" };
    case "fresh":
      if (coverageDays !== null && coverageDays <= lowStockDays) return { label: "Low stock", tone: "destructive" };
      if (coverageDays !== null && coverageDays <= lowStockDays + 1) return { label: "Restock soon", tone: "outline" };
      return { label: "Healthy", tone: "secondary" };
  }
}

export interface DashboardGoogleConnection {
  email: string | null;
  agingSoon: boolean;
  needsReauth: boolean;
}

export async function fetchDashboardData(supabase: SupabaseClient) {
  const now = Date.now();

  const { data: googleConnectionRow } = await supabase
    .from("google_connections")
    .select("google_account_email, connected_at, needs_reauth_at")
    .is("revoked_at", null)
    .not("connected_at", "is", null)
    .maybeSingle();
  const googleConnection: DashboardGoogleConnection | null = googleConnectionRow
    ? {
        email: googleConnectionRow.google_account_email,
        agingSoon: Boolean(
          googleConnectionRow.connected_at &&
            now - new Date(googleConnectionRow.connected_at).getTime() >= CONNECTION_AGING_SOON_MS
        ),
        needsReauth: Boolean(googleConnectionRow.needs_reauth_at),
      }
    : null;

  const { data: appConfigRow } = await supabase
    .from("app_config")
    .select("low_stock_days")
    .maybeSingle();
  const lowStockDays = appConfigRow?.low_stock_days ?? DEFAULT_LOW_STOCK_DAYS;

  const { data: accountRows, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, clip_target_per_day, notes")
    .is("archived_at", null)
    .order("name");
  if (accountsError) throw new Error(accountsError.message);

  const accountIds = (accountRows ?? []).map((account) => account.id);

  const { data: mappingRows, error: mappingsError } = accountIds.length
    ? await supabase
        .from("drive_folder_mappings")
        .select("id, account_id, folder_id, folder_name, disconnected_at")
        .in("account_id", accountIds)
    : { data: [] as MappingRow[], error: null };
  if (mappingsError) throw new Error(mappingsError.message);

  const mappingIds = (mappingRows ?? []).map((mapping) => mapping.id);

  const { data: snapshotRows, error: snapshotsError } = mappingIds.length
    ? await supabase
        .from("inventory_snapshots")
        .select("mapping_id, clip_count, completed_at")
        .in("mapping_id", mappingIds)
        .order("completed_at", { ascending: false })
    : { data: [] as SnapshotRow[], error: null };
  if (snapshotsError) throw new Error(snapshotsError.message);

  const { data: syncRunRows, error: syncRunsError } = mappingIds.length
    ? await supabase
        .from("sync_runs")
        .select("mapping_id, status, completed_at, created_at")
        .in("mapping_id", mappingIds)
        .order("created_at", { ascending: false })
    : { data: [] as SyncRunRow[], error: null };
  if (syncRunsError) throw new Error(syncRunsError.message);

  const mappingByAccount = new Map((mappingRows ?? []).map((mapping) => [mapping.account_id, mapping]));
  const latestSnapshotByMapping = new Map<string, SnapshotRow>();
  for (const snapshot of snapshotRows ?? []) {
    if (!latestSnapshotByMapping.has(snapshot.mapping_id)) latestSnapshotByMapping.set(snapshot.mapping_id, snapshot);
  }
  const latestSyncRunByMapping = new Map<string, SyncRunRow>();
  for (const run of syncRunRows ?? []) {
    if (!latestSyncRunByMapping.has(run.mapping_id)) latestSyncRunByMapping.set(run.mapping_id, run);
  }

  const accounts: DashboardAccount[] = (accountRows ?? []).map((account) => {
    const mapping = mappingByAccount.get(account.id);
    const latestSnapshot = mapping ? latestSnapshotByMapping.get(mapping.id) : undefined;
    const latestSyncRun = mapping ? latestSyncRunByMapping.get(mapping.id) : undefined;
    const { state, clipCount } = deriveState({ mapping, latestSnapshot, latestSyncRun, now });
    const coverageDays = clipCount !== null && account.clip_target_per_day > 0 ? clipCount / account.clip_target_per_day : null;
    const { label, tone } = labelForAccount(state, coverageDays, lowStockDays);

    return {
      id: account.id,
      name: account.name,
      clipTargetPerDay: account.clip_target_per_day,
      notes: account.notes ?? "",
      folderName: mapping?.folder_name ?? null,
      mapping: mapping
        ? { id: mapping.id, folderId: mapping.folder_id, folderName: mapping.folder_name, disconnectedAt: mapping.disconnected_at }
        : null,
      clipCount,
      coverageDays,
      state,
      statusLabel: label,
      tone,
    };
  });

  const { data: taskRows, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, status, sort_order, account_id, campaign_id, external_url, notes, accounts(id, name), campaigns(id, name)")
    .order("sort_order");
  if (tasksError) throw new Error(tasksError.message);

  const tasks: DashboardTask[] = ((taskRows ?? []) as unknown as TaskRow[]).map((row) => {
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
    const campaign = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
    return {
      id: row.id,
      title: row.title,
      status: row.status as TaskStatus,
      sortOrder: Number(row.sort_order),
      accountId: row.account_id,
      accountName: account?.name ?? null,
      campaignId: row.campaign_id,
      campaignName: campaign?.name ?? null,
      externalUrl: row.external_url,
      notes: row.notes ?? "",
    };
  });

  const { data: campaignRows, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      "id, name, requirements_url, submission_url, budget, platform_id, ends_on, account_campaigns(accounts(id, name)), platforms(id, name, url)"
    )
    .is("archived_at", null)
    .order("name");
  if (campaignsError) throw new Error(campaignsError.message);

  const campaigns: DashboardCampaign[] = ((campaignRows ?? []) as unknown as CampaignRow[]).map((row) => {
    const linkedAccounts = (row.account_campaigns ?? [])
      .map((link) => (Array.isArray(link.accounts) ? link.accounts[0] : link.accounts))
      .filter((account): account is { id: string; name: string } => Boolean(account));
    const platform = Array.isArray(row.platforms) ? row.platforms[0] : row.platforms;
    return {
      id: row.id,
      name: row.name,
      requirementsUrl: row.requirements_url,
      submissionUrl: row.submission_url,
      budget: row.budget !== null ? Number(row.budget) : null,
      platformId: row.platform_id,
      platformName: platform?.name ?? null,
      platformUrl: platform?.url ?? null,
      endsOn: row.ends_on,
      accountIds: linkedAccounts.map((account) => account.id),
      accountNames: linkedAccounts.map((account) => account.name),
    };
  });

  const { data: platformRows, error: platformsError } = await supabase
    .from("platforms")
    .select("id, name, url")
    .order("name");
  if (platformsError) throw new Error(platformsError.message);

  const platforms: DashboardPlatform[] = ((platformRows ?? []) as PlatformRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
  }));

  return { accounts, tasks, campaigns, platforms, lowStockDays, googleConnection };
}
