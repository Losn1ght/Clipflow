import type { SupabaseClient } from "@supabase/supabase-js";
import type { WarmupDay } from "@/lib/validation";

export interface WarmupTargets {
  likes: { min: number; max: number } | null;
  comments: { min: number; max: number } | null;
  reposts: { exact: number } | null;
  follows: { min: number; max: number } | null;
}

export const WARMUP_TARGETS: Record<WarmupDay, WarmupTargets> = {
  day_1: {
    likes: { min: 5, max: 10 },
    comments: { min: 1, max: 3 },
    reposts: { exact: 2 },
    follows: null,
  },
  day_2: {
    likes: { min: 10, max: 20 },
    comments: { min: 3, max: 5 },
    reposts: { exact: 4 },
    follows: { min: 2, max: 3 },
  },
  day_3_plus: {
    likes: { min: 10, max: 20 },
    comments: { min: 3, max: 5 },
    reposts: { exact: 6 },
    follows: { min: 5, max: 8 },
  },
};

export interface WarmupState {
  accountId: string;
  warmupDay: WarmupDay;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  followsCount: number;
  linksCount: number;
  reelsWatched: number;
}

type WarmupStateRow = {
  account_id: string;
  warmup_day: WarmupDay;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  follows_count: number;
  links_count: number;
  reels_watched: number;
};

function toWarmupState(row: WarmupStateRow): WarmupState {
  return {
    accountId: row.account_id,
    warmupDay: row.warmup_day,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    repostsCount: row.reposts_count,
    followsCount: row.follows_count,
    linksCount: row.links_count,
    reelsWatched: row.reels_watched,
  };
}

/**
 * Fetches the warm-up state for each given (active) account, lazily inserting a
 * default row (day_1, all counts 0) for any account that doesn't have one yet.
 * Lazy-inserting keeps every downstream consumer (actions, UI) working with a
 * real row rather than having to special-case "no state yet" everywhere.
 */
export async function fetchWarmupStates(supabase: SupabaseClient, accountIds: string[]): Promise<WarmupState[]> {
  if (accountIds.length === 0) return [];

  const { data: existingRows, error } = await supabase
    .from("account_warmup_states")
    .select("account_id, warmup_day, likes_count, comments_count, reposts_count, follows_count, links_count, reels_watched")
    .in("account_id", accountIds);
  if (error) throw new Error(error.message);

  const rows = (existingRows ?? []) as WarmupStateRow[];
  const existingAccountIds = new Set(rows.map((row) => row.account_id));
  const missingAccountIds = accountIds.filter((id) => !existingAccountIds.has(id));

  if (missingAccountIds.length > 0) {
    const { data: insertedRows, error: insertError } = await supabase
      .from("account_warmup_states")
      .insert(missingAccountIds.map((accountId) => ({ account_id: accountId })))
      .select("account_id, warmup_day, likes_count, comments_count, reposts_count, follows_count, links_count, reels_watched");
    if (insertError) throw new Error(insertError.message);
    rows.push(...((insertedRows ?? []) as WarmupStateRow[]));
  }

  return rows.map(toWarmupState);
}
