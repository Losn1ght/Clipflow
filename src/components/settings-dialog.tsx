"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  createPlatform,
  deletePlatform,
  updateClipTargetOptions,
  updateLowStockDayOptions,
  updateLowStockDays,
  updatePlatform,
} from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardPlatform } from "@/lib/dashboard-data";

function NumberListEditor({
  label,
  values,
  onChange,
  min,
  max,
  maxCount,
  formatValue,
}: {
  label: string;
  values: number[];
  onChange: (next: number[]) => void;
  min: number;
  max: number;
  maxCount: number;
  formatValue?: (value: number) => string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addValue = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(parsed) || parsed < min || parsed > max) {
      setError(`Enter a whole number between ${min} and ${max}.`);
      return;
    }
    if (values.includes(parsed)) {
      setError("That value is already in the list.");
      return;
    }
    if (values.length >= maxCount) {
      setError(`You can have at most ${maxCount} options.`);
      return;
    }
    onChange([...values, parsed].sort((a, b) => a - b));
    setDraft("");
    setError(null);
  };

  const removeValue = (value: number) => {
    if (values.length <= 1) {
      setError("Keep at least one option.");
      return;
    }
    onChange(values.filter((existing) => existing !== value));
    setError(null);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="outline" className="gap-0.5 pr-1">
            {formatValue ? formatValue(value) : value}
            <button
              type="button"
              onClick={() => removeValue(value)}
              aria-label={`Remove ${value}`}
              className="rounded-full p-0.5 outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          min={min}
          max={max}
          className="w-24"
          placeholder="Add…"
        />
        <Button type="button" variant="outline" size="sm" onClick={addValue}>
          <Plus /> Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SettingsDialog({
  trigger,
  lowStockDays,
  clipTargetOptions,
  lowStockDayOptions,
  platforms,
}: {
  trigger: React.ReactNode;
  lowStockDays: number;
  clipTargetOptions: number[];
  lowStockDayOptions: number[];
  platforms: DashboardPlatform[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [days, setDays] = useState(String(lowStockDays));
  const [lowStockDayChoices, setLowStockDayChoices] = useState(lowStockDayOptions);
  const [clipTargetChoices, setClipTargetChoices] = useState(clipTargetOptions);

  // The currently selected threshold might not be in the edited choices list
  // yet (e.g. it was just removed) — keep it selectable until the form saves.
  const availableLowStockDays = lowStockDayChoices.includes(Number(days))
    ? lowStockDayChoices
    : [...lowStockDayChoices, Number(days)].sort((a, b) => a - b);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await Promise.all([
          updateLowStockDays(Number(days)),
          updateLowStockDayOptions(lowStockDayChoices),
          updateClipTargetOptions(clipTargetChoices),
        ]);
        setOpen(false);
        toast.add({ title: "Settings updated", description: `Low stock threshold set to ${days} day${days === "1" ? "" : "s"}.`, type: "success" });
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
        if (next) {
          setDays(String(lowStockDays));
          setLowStockDayChoices(lowStockDayOptions);
          setClipTargetChoices(clipTargetOptions);
        }
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
                  <SelectValue>{(value: string) => `${value} day${value === "1" ? "" : "s"}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableLowStockDays.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} day{option === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <NumberListEditor
              label="Low stock day choices"
              values={lowStockDayChoices}
              onChange={setLowStockDayChoices}
              min={1}
              max={30}
              maxCount={12}
              formatValue={(value) => `${value}d`}
            />

            <NumberListEditor
              label="Clip target choices (clips / day)"
              values={clipTargetChoices}
              onChange={setClipTargetChoices}
              min={1}
              max={30}
              maxCount={12}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
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

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
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
        toast.add({ title: isEdit ? "Platform updated" : "Platform added", description: name, type: "success" });
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
