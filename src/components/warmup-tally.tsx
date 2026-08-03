"use client";

import { useMemo, useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { recordWarmupInteraction, recordWarmupReelWatched, resetWarmupDaily, setWarmupDay } from "@/app/warmup-actions";
import { WARMUP_TARGETS, type WarmupState } from "@/lib/warmup-data";
import type { DashboardAccount } from "@/lib/dashboard-data";
import type { WarmupDay, WarmupMetric } from "@/lib/validation";

const DAY_OPTIONS: { value: WarmupDay; label: string }[] = [
  { value: "day_1", label: "Day 1" },
  { value: "day_2", label: "Day 2" },
  { value: "day_3_plus", label: "Day 3+" },
];

const METRIC_ROWS: { metric: WarmupMetric; label: string }[] = [
  { metric: "likes", label: "Likes" },
  { metric: "comments", label: "Comments" },
  { metric: "reposts", label: "Reposts" },
  { metric: "follows", label: "Follows" },
];

function formatTarget(target: { min: number; max: number } | { exact: number } | null) {
  if (!target) return null;
  if ("exact" in target) return `exactly ${target.exact}`;
  return `${target.min}–${target.max}`;
}

function targetState(count: number, target: { min: number; max: number } | { exact: number } | null): "none" | "under" | "met" | "over" {
  if (!target) return "none";
  if ("exact" in target) {
    if (count < target.exact) return "under";
    if (count === target.exact) return "met";
    return "over";
  }
  if (count < target.min) return "under";
  if (count <= target.max) return "met";
  return "over";
}

export function WarmupTally({
  accounts,
  initialWarmupStates,
}: {
  accounts: DashboardAccount[];
  initialWarmupStates: WarmupState[];
}) {
  const [statesByAccount, setStatesByAccount] = useState<Map<string, WarmupState>>(
    () => new Map(initialWarmupStates.map((state) => [state.accountId, state]))
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedState = selectedAccountId ? statesByAccount.get(selectedAccountId) ?? null : null;

  const targets = useMemo(() => (selectedState ? WARMUP_TARGETS[selectedState.warmupDay] : null), [selectedState]);

  const updateState = (accountId: string, patch: Partial<WarmupState>) => {
    setStatesByAccount((current) => {
      const existing = current.get(accountId);
      if (!existing) return current;
      const next = new Map(current);
      next.set(accountId, { ...existing, ...patch });
      return next;
    });
  };

  const handleDayChange = (accountId: string, day: WarmupDay) => {
    const previous = statesByAccount.get(accountId)?.warmupDay;
    updateState(accountId, { warmupDay: day });
    startTransition(async () => {
      try {
        await setWarmupDay(accountId, day);
      } catch {
        if (previous) updateState(accountId, { warmupDay: previous });
        toast.add({ title: "Unable to update warm-up day" });
      }
    });
  };

  const handleInteraction = (accountId: string, metric: WarmupMetric) => {
    const state = statesByAccount.get(accountId);
    if (!state) return;
    const countKey = (
      {
        likes: "likesCount",
        comments: "commentsCount",
        reposts: "repostsCount",
        follows: "followsCount",
        links: "linksCount",
      } as const
    )[metric];

    updateState(accountId, { [countKey]: state[countKey] + 1, reelsWatched: 0 } as Partial<WarmupState>);
    startTransition(async () => {
      try {
        await recordWarmupInteraction(accountId, metric);
      } catch {
        updateState(accountId, { [countKey]: state[countKey], reelsWatched: state.reelsWatched } as Partial<WarmupState>);
        toast.add({ title: "Unable to record interaction" });
      }
    });
  };

  const handleReelWatched = (accountId: string) => {
    const state = statesByAccount.get(accountId);
    if (!state) return;
    const previous = state.reelsWatched;
    updateState(accountId, { reelsWatched: Math.min(previous + 1, 10) });
    startTransition(async () => {
      try {
        await recordWarmupReelWatched(accountId);
      } catch {
        updateState(accountId, { reelsWatched: previous });
        toast.add({ title: "Unable to record reel watched" });
      }
    });
  };

  const handleDailyReset = async (accountId: string) => {
    const previous = statesByAccount.get(accountId);
    updateState(accountId, {
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      followsCount: 0,
      linksCount: 0,
      reelsWatched: 0,
    });
    try {
      await resetWarmupDaily(accountId);
    } catch (error) {
      if (previous) updateState(accountId, previous);
      throw error;
    }
  };

  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an account first to start tracking warm-up progress.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Select value={selectedAccountId ?? undefined} onValueChange={(value) => setSelectedAccountId(value ?? null)}>
          <SelectTrigger className="min-w-48">
            <SelectValue placeholder="Select an account">
              {(value: string | undefined) => accounts.find((account) => account.id === value)?.name ?? "Select an account"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mr-2 inline size-4 text-primary" />
        Only like, comment, repost, or follow accounts in the same niche and editing style as the account being warmed up.
      </div>

      {selectedAccount && selectedState && targets ? (
        <Card className="slate-mark shadow-none">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <p className="eyebrow">Warm-up</p>
              <CardTitle className="mt-1.5">{selectedAccount.name}</CardTitle>
              <CardDescription className="mt-1">Track manual daily warm-up interactions.</CardDescription>
            </div>
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm">Daily reset</Button>}
              title="Daily reset?"
              description="Resets all interaction and reel-watch counts for this account. The warm-up day selection is not changed."
              confirmLabel="Reset"
              onConfirm={() => handleDailyReset(selectedAccount.id)}
              successMessage="Warm-up counts reset"
            />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={selectedState.warmupDay === option.value ? "default" : "outline"}
                  onClick={() => handleDayChange(selectedAccount.id, option.value)}
                  disabled={isPending}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Reel watched</p>
                <p className="timecode text-sm">{selectedState.reelsWatched}/10</p>
              </div>
              <Progress value={(selectedState.reelsWatched / 10) * 100} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleReelWatched(selectedAccount.id)}
                disabled={isPending || selectedState.reelsWatched >= 10}
              >
                +1 Reel watched
              </Button>
            </div>

            <div className="space-y-2">
              {METRIC_ROWS.filter((row) => row.metric !== "follows" || selectedState.warmupDay !== "day_1").map((row) => {
                const countKey = (
                  {
                    likes: "likesCount",
                    comments: "commentsCount",
                    reposts: "repostsCount",
                    follows: "followsCount",
                  } as const
                )[row.metric as "likes" | "comments" | "reposts" | "follows"];
                const count = selectedState[countKey];
                const target = targets[row.metric as "likes" | "comments" | "reposts" | "follows"];
                const state = targetState(count, target);
                const targetLabel = formatTarget(target);
                const locked = selectedState.reelsWatched < 10;

                return (
                  <div
                    key={row.metric}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                      state === "met"
                        ? "border-positive/40 bg-positive/10"
                        : state === "over"
                          ? "border-warning/40 bg-warning/10"
                          : "border-border bg-background/50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{row.label}</p>
                      {targetLabel && <p className="text-xs text-muted-foreground">Target: {targetLabel}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="timecode text-lg font-semibold">{count}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleInteraction(selectedAccount.id, row.metric)}
                        disabled={isPending || locked}
                      >
                        +1
                      </Button>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
                <p className="text-sm font-medium">Copied links</p>
                <div className="flex items-center gap-3">
                  <p className="timecode text-lg font-semibold">{selectedState.linksCount}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleInteraction(selectedAccount.id, "links")}
                    disabled={isPending || selectedState.reelsWatched < 10}
                  >
                    +1
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
