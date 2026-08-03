"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { warmupDaySchema, warmupMetricSchema } from "@/lib/validation";

const idSchema = z.uuid();

const metricColumn = {
  likes: "likes_count",
  comments: "comments_count",
  reposts: "reposts_count",
  follows: "follows_count",
  links: "links_count",
} as const;

// Warm-up rows are lazily created by fetchWarmupStates() before the Warm-Up tab
// ever renders, so every action here can assume a row already exists for the
// account and operate with a plain update by account_id.

export async function recordWarmupInteraction(accountId: string, metric: string) {
  const id = idSchema.parse(accountId);
  const parsedMetric = warmupMetricSchema.parse(metric);
  const { supabase } = await requireOwner();

  const column = metricColumn[parsedMetric];
  const { data: current, error: lookupError } = await supabase
    .from("account_warmup_states")
    .select(column)
    .eq("account_id", id)
    .maybeSingle();
  if (lookupError) throw new Error("Unable to look up warm-up state.");

  const currentValue = ((current as Record<string, number> | null)?.[column] as number | undefined) ?? 0;

  const { error } = await supabase
    .from("account_warmup_states")
    .update({ [metricColumn[parsedMetric]]: currentValue + 1, reels_watched: 0 })
    .eq("account_id", id);
  if (error) throw new Error("Unable to record warm-up interaction.");

  revalidatePath("/");
}

export async function recordWarmupReelWatched(accountId: string) {
  const id = idSchema.parse(accountId);
  const { supabase } = await requireOwner();

  const { data: current, error: lookupError } = await supabase
    .from("account_warmup_states")
    .select("reels_watched")
    .eq("account_id", id)
    .maybeSingle();
  if (lookupError) throw new Error("Unable to look up warm-up state.");

  const nextValue = Math.min((current?.reels_watched ?? 0) + 1, 10);

  const { error } = await supabase
    .from("account_warmup_states")
    .update({ reels_watched: nextValue })
    .eq("account_id", id);
  if (error) throw new Error("Unable to record reel watched.");

  revalidatePath("/");
}

export async function setWarmupDay(accountId: string, day: string) {
  const id = idSchema.parse(accountId);
  const parsedDay = warmupDaySchema.parse(day);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("account_warmup_states")
    .update({ warmup_day: parsedDay })
    .eq("account_id", id);
  if (error) throw new Error("Unable to update warm-up day.");

  revalidatePath("/");
}

export async function resetWarmupDaily(accountId: string) {
  const id = idSchema.parse(accountId);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("account_warmup_states")
    .update({
      likes_count: 0,
      comments_count: 0,
      reposts_count: 0,
      follows_count: 0,
      links_count: 0,
      reels_watched: 0,
    })
    .eq("account_id", id);
  if (error) throw new Error("Unable to reset warm-up counts.");

  revalidatePath("/");
}
