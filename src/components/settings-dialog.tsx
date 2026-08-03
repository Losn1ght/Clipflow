"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createPlatform, deletePlatform, updateLowStockDays, updatePlatform } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardPlatform } from "@/lib/dashboard-data";

const LOW_STOCK_DAYS_OPTIONS = [1, 2, 3, 5, 7];

export function SettingsDialog({
  trigger,
  lowStockDays,
  platforms,
}: {
  trigger: React.ReactNode;
  lowStockDays: number;
  platforms: DashboardPlatform[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [days, setDays] = useState(String(lowStockDays));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateLowStockDays(Number(days));
        setOpen(false);
        toast.add({ title: "Settings updated", description: `Low stock threshold set to ${days} day${days === "1" ? "" : "s"}.` });
      } catch {
        setError("Unable to save settings. Try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDays(String(lowStockDays));
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dashboard settings</DialogTitle>
            <DialogDescription>Choose how many days of coverage counts as low stock.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="low-stock-days">Low stock threshold</Label>
              <Select value={days} onValueChange={(value) => setDays(value ?? String(lowStockDays))}>
                <SelectTrigger id="low-stock-days" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOW_STOCK_DAYS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} day{option === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>

        <div className="mt-2 space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Platforms</p>
            <PlatformFormDialog trigger={<Button type="button" variant="outline" size="sm"><Plus /> Add platform</Button>} />
          </div>
          {platforms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platforms yet.</p>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {platforms.map((platform) => (
                <div key={platform.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{platform.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{platform.url}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <PlatformFormDialog
                      platform={platform}
                      trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${platform.name}`}><Pencil /></Button>}
                    />
                    <ConfirmDialog
                      trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete ${platform.name}`}><Trash2 /></Button>}
                      title="Delete platform?"
                      description={`${platform.name} will be removed. Campaigns using it will keep their other fields but lose this platform link.`}
                      confirmLabel="Delete"
                      onConfirm={() => deletePlatform(platform.id)}
                      successMessage={`${platform.name} deleted`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlatformFormDialog({ trigger, platform }: { trigger: React.ReactNode; platform?: DashboardPlatform }) {
  const isEdit = Boolean(platform);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [name, setName] = useState(platform?.name ?? "");
  const [url, setUrl] = useState(platform?.url ?? "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = { name, url };
        if (isEdit && platform) {
          await updatePlatform(platform.id, input);
        } else {
          await createPlatform(input);
          setName("");
          setUrl("");
        }
        setOpen(false);
        toast.add({ title: isEdit ? "Platform updated" : "Platform added", description: name });
      } catch {
        setError("Unable to save platform. Check the fields and try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(platform?.name ?? "");
          setUrl(platform?.url ?? "");
        }
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit platform" : "Add platform"}</DialogTitle>
            <DialogDescription>Platforms are reusable across campaigns.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="platform-name">Name</Label>
              <Input id="platform-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-url">URL</Label>
              <Input
                id="platform-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add platform"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
