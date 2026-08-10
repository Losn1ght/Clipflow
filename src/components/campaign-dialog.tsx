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
import { createCampaign, linkAccountCampaign, unlinkAccountCampaign, updateCampaign } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardAccount, DashboardCampaign, DashboardPlatform } from "@/lib/dashboard-data";

const NONE = "none";

export function CampaignDialog({
  trigger,
  campaign,
  accounts,
  platforms,
}: {
  trigger: React.ReactNode;
  campaign?: DashboardCampaign;
  accounts: DashboardAccount[];
  platforms: DashboardPlatform[];
}) {
  const isEdit = Boolean(campaign);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [name, setName] = useState(campaign?.name ?? "");
  const [requirementsUrl, setRequirementsUrl] = useState(campaign?.requirementsUrl ?? "");
  const [submissionUrl, setSubmissionUrl] = useState(campaign?.submissionUrl ?? "");
  const [budget, setBudget] = useState(campaign?.budget != null ? String(campaign.budget) : "");
  const [platformId, setPlatformId] = useState<string>(campaign?.platformId ?? NONE);
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? "");
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>(campaign?.accountIds ?? []);

  const resetIfCreate = () => {
    if (!isEdit) {
      setName("");
      setRequirementsUrl("");
      setSubmissionUrl("");
      setBudget("");
      setPlatformId(NONE);
      setEndsOn("");
      setLinkedAccountIds([]);
    }
  };

  const toggleAccount = (accountId: string, checked: boolean) => {
    setLinkedAccountIds((current) => (checked ? [...current, accountId] : current.filter((id) => id !== accountId)));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          name,
          requirementsUrl,
          submissionUrl,
          budget: budget.trim() === "" ? undefined : Number(budget),
          platformId: platformId === NONE ? null : platformId,
          endsOn,
        };
        let linkChanges = 0;
        if (isEdit && campaign) {
          await updateCampaign(campaign.id, input);
          const previouslyLinked = new Set(campaign.accountIds);
          const nowLinked = new Set(linkedAccountIds);
          for (const accountId of nowLinked) {
            if (!previouslyLinked.has(accountId)) {
              await linkAccountCampaign(accountId, campaign.id);
              linkChanges += 1;
            }
          }
          for (const accountId of previouslyLinked) {
            if (!nowLinked.has(accountId)) {
              await unlinkAccountCampaign(accountId, campaign.id);
              linkChanges += 1;
            }
          }
        } else {
          await createCampaign(input);
        }
        setOpen(false);
        resetIfCreate();
        toast.add({
          title: isEdit ? "Campaign updated" : "Campaign added",
          description: linkChanges > 0 ? `${name} · account links updated` : name,
          type: "success",
        });
      } catch {
        setError("Unable to save campaign. Check the fields and try again.");
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
            <DialogTitle>{isEdit ? "Edit campaign" : "Add campaign"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update campaign links and linked accounts." : "Add a campaign with its manual requirements and submission links."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-requirements">Requirements</Label>
              <Input
                id="campaign-requirements"
                value={requirementsUrl}
                onChange={(e) => setRequirementsUrl(e.target.value)}
                maxLength={2_048}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-submission">Submission URL</Label>
              <Input
                id="campaign-submission"
                type="url"
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
                placeholder="https://…"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-platform">Platform (optional)</Label>
              <Select value={platformId} onValueChange={(value) => setPlatformId(value ?? NONE)}>
                <SelectTrigger id="campaign-platform" className="w-full">
                  <SelectValue>
                    {(value: string) => (value === NONE ? "None" : platforms.find((platform) => platform.id === value)?.name ?? "None")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {platforms.map((platform) => (
                    <SelectItem key={platform.id} value={platform.id}>
                      {platform.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-budget">Budget ($, optional)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">$</span>
                  <Input
                    id="campaign-budget"
                    type="number"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="pl-5"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="campaign-ends-on">Ends on (optional)</Label>
                <Input
                  id="campaign-ends-on"
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
            </div>

            {isEdit && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="eyebrow">Linked accounts</p>
                {accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active accounts to link.</p>
                ) : (
                  <div className="space-y-1.5">
                    {accounts.map((account) => (
                      <label key={account.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={linkedAccountIds.includes(account.id)}
                          onChange={(e) => toggleAccount(account.id, e.target.checked)}
                          className="size-4 rounded border-input accent-primary"
                        />
                        {account.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
