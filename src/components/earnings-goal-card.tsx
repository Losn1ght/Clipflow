"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SprocketTrack } from "@/components/ui/sprocket-meter";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { updateCurrentEarnings, updateEarningsGoalTarget, resetEarningsGoal } from "@/app/actions";
import type { DashboardEarningsGoal } from "@/lib/earnings-goal-data";

function formatDollars(amount: number) {
  return Number.isInteger(amount)
    ? `$${amount.toLocaleString("en-US")}`
    : `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NO_SPINNER_CLASSES =
  "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function EarningsGoalCard({ earningsGoal }: { earningsGoal: DashboardEarningsGoal }) {
  const { targetAmount, currentAmount } = earningsGoal;
  const [currentInput, setCurrentInput] = useState(String(currentAmount));
  const [isSavingCurrent, startSavingCurrent] = useTransition();
  const toast = useToast();

  const percent = targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;
  const reached = currentAmount >= targetAmount;
  const remaining = Math.max(0, targetAmount - currentAmount);

  const handleSaveCurrent = () => {
    const value = currentInput.trim() === "" ? 0 : Number(currentInput);
    if (!Number.isFinite(value) || value < 0 || value === currentAmount) {
      setCurrentInput(String(currentAmount));
      return;
    }
    startSavingCurrent(async () => {
      try {
        await updateCurrentEarnings(value);
      } catch {
        setCurrentInput(String(currentAmount));
        toast.add({ title: "Unable to update earnings", type: "error" });
      }
    });
  };

  // Matches MetricFrame's density (eyebrow / big stat / detail line, icon badge
  // top-right) and carries the same slate-mark corner ticks as the other log
  // cards, so it reads as part of the filmstrip it sits beside rather than a
  // smaller, emptier box next to it.
  return (
    <div className="slate-mark relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-5">
      <EarningsGoalEditDialog
        targetAmount={targetAmount}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit earnings goal"
            className="absolute top-3 right-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
          >
            <Pencil className="size-4" />
          </Button>
        }
      />

      <div>
        <p className="eyebrow">Earnings Goal</p>
        <div className="mt-2 flex items-baseline gap-1.5 pr-10">
          {/* Currency mark is muted and the figure carries the ink, so the number
              stays the thing you read first. */}
          <span className="timecode text-3xl font-semibold tracking-tight text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onBlur={handleSaveCurrent}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            disabled={isSavingCurrent}
            aria-label="Current earnings"
            // Width tracks the value in `ch` units. The timecode class makes this
            // a monospace face, so `ch` is exactly one digit wide: the field never
            // clips a long figure and never reserves space it isn't using.
            style={{ width: `${Math.max(currentInput.length, 2)}ch` }}
            className={`timecode h-auto border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0 ${NO_SPINNER_CLASSES}`}
          />
          <span className="shrink-0 truncate text-sm text-muted-foreground">of {formatDollars(targetAmount)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {/* Same perforated track as the Clip Stash meters, so earnings progress
            reads in the app's own visual language instead of a generic bar. */}
        <SprocketTrack
          percent={percent}
          label={`Earnings goal progress: ${Math.round(percent)}%`}
          tone={reached ? "positive" : "primary"}
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={reached ? "truncate text-positive" : "truncate text-muted-foreground"}>
            {reached ? "Target met" : `${formatDollars(remaining)} to go`}
          </span>
          <span className="timecode shrink-0 text-muted-foreground">{Math.round(percent)}%</span>
        </div>
      </div>
    </div>
  );
}

function EarningsGoalEditDialog({
  targetAmount,
  trigger,
}: {
  targetAmount: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(String(targetAmount));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  // ConfirmDialog below is nested inside this dialog's content. Base UI suppresses
  // its own backdrop while nested, but doesn't hide this dialog's own box - so
  // without this, the reset confirmation would show this box still sitting
  // behind it. Hide it while the nested dialog is open instead.
  const [nestedOpen, setNestedOpen] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a goal amount greater than $0.");
      return;
    }
    startTransition(async () => {
      try {
        await updateEarningsGoalTarget(value);
        setOpen(false);
        toast.add({ title: "Earnings goal updated", type: "success" });
      } catch {
        setError("Unable to save the goal. Try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTarget(String(targetAmount));
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent
        className={`sm:max-w-sm transition-opacity duration-200 ${nestedOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
        aria-hidden={nestedOpen || undefined}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit earnings goal</DialogTitle>
            <DialogDescription>Set the target you&rsquo;re tracking progress against.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="earnings-goal-target">Target amount ($)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">$</span>
              <Input
                id="earnings-goal-target"
                type="number"
                min="0.01"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="pl-5"
                required
                autoFocus
              />
            </div>
          </div>

          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4 justify-between sm:justify-between">
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
                  Reset goal
                </Button>
              }
              title="Reset earnings goal?"
              description="This sets the target back to $1,000 and current earnings back to $0."
              confirmLabel="Reset"
              onConfirm={async () => {
                await resetEarningsGoal();
                setOpen(false);
              }}
              successMessage="Earnings goal reset"
              onOpenChange={setNestedOpen}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
