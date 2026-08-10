"use client";

import { useState, useTransition } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSubscription, updateSubscription } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardSubscription } from "@/lib/subscriptions-data";
import type { BillingCycle } from "@/lib/validation";

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function SubscriptionDialog({
  trigger,
  subscription,
}: {
  trigger: React.ReactNode;
  subscription?: DashboardSubscription;
}) {
  const isEdit = Boolean(subscription);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [name, setName] = useState(subscription?.name ?? "");
  const [cost, setCost] = useState(subscription?.cost != null ? String(subscription.cost) : "");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(subscription?.billingCycle ?? "monthly");
  const [renewsOn, setRenewsOn] = useState(subscription?.renewsOn ?? "");
  const [url, setUrl] = useState(subscription?.url ?? "");
  const [notes, setNotes] = useState(subscription?.notes ?? "");

  const resetIfCreate = () => {
    if (!isEdit) {
      setName("");
      setCost("");
      setBillingCycle("monthly");
      setRenewsOn("");
      setUrl("");
      setNotes("");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          name,
          cost: cost.trim() === "" ? 0 : Number(cost),
          billingCycle,
          renewsOn,
          url,
          notes,
        };
        if (isEdit && subscription) {
          await updateSubscription(subscription.id, input);
        } else {
          await createSubscription(input);
        }
        setOpen(false);
        resetIfCreate();
        toast.add({
          title: isEdit ? "Subscription updated" : "Subscription added",
          description: name,
          type: "success",
        });
      } catch {
        setError("Unable to save subscription. Check the fields and try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit subscription" : "Add subscription"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update this recurring cost." : "Track a recurring cost for the clipping stack."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subscription-name">Name</Label>
              <Input id="subscription-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subscription-billing-cycle">Billing cycle</Label>
              <Select value={billingCycle} onValueChange={(value) => setBillingCycle((value ?? "monthly") as BillingCycle)}>
                <SelectTrigger id="subscription-billing-cycle" className="w-full">
                  <SelectValue>{(value: BillingCycle) => BILLING_CYCLE_LABELS[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="subscription-cost">Cost (₱)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">₱</span>
                  <Input
                    id="subscription-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="pl-5"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subscription-renews-on">Renews on (optional)</Label>
                <Input
                  id="subscription-renews-on"
                  type="date"
                  value={renewsOn}
                  onChange={(e) => setRenewsOn(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subscription-url">URL (optional)</Label>
              <Input
                id="subscription-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subscription-notes">Notes (optional)</Label>
              <Textarea id="subscription-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2_000} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
