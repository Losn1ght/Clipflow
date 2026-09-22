"use client";

import { useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { fetchActivityLogs, type ActivityLogEntry, type ActivityLogs } from "@/app/actions";

const ENTITY_LABELS: Record<string, string> = {
  accounts: "Account",
  campaigns: "Campaign",
  subscriptions: "Subscription",
  prompts: "Prompt",
  resources: "Resource",
  tasks: "Task",
  platforms: "Platform",
};

const ACTION_STYLES: Record<
  ActivityLogEntry["action"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "ghost"; icon: typeof Plus }
> = {
  created: { label: "Created", variant: "default", icon: Plus },
  updated: { label: "Updated", variant: "ghost", icon: Pencil },
  archived: { label: "Archived", variant: "secondary", icon: Archive },
  restored: { label: "Restored", variant: "outline", icon: RotateCcw },
  deleted: { label: "Deleted", variant: "destructive", icon: Trash2 },
};

// Relative time built by hand rather than via toLocaleString, matching the app's
// deliberate avoidance of locale-dependent formatting. Safe to call Date.now()
// here because these rows only ever render after the client-side fetch resolves,
// so this string is never part of server-rendered HTML and cannot desync.
function formatWhen(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(iso);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

export function LogsDialog({
  trigger,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  /** Notified on open/close - lets a dialog this is nested inside hide itself while this is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLogs | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const load = () => {
    setIsLoading(true);
    fetchActivityLogs()
      .then(setLogs)
      .catch(() => toast.add({ title: "Unable to load activity log", type: "error" }))
      .finally(() => setIsLoading(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
        onOpenChange?.(next);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Activity log</DialogTitle>
          <DialogDescription>Every change to your dashboard data, newest first.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : logs?.status === "unavailable" ? (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Activity logging isn&apos;t set up yet.</p>
              <p className="text-muted-foreground">
                Run{" "}
                <code className="font-mono text-xs">supabase/migrations/20260922090000_activity_logs.sql</code> in the
                Supabase SQL editor, then reopen this dialog.
              </p>
            </div>
          ) : !logs || logs.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            logs.entries.map((entry) => {
              const style = ACTION_STYLES[entry.action];
              const Icon = style.icon;
              const meta = [
                ENTITY_LABELS[entry.entity] ?? entry.entity,
                entry.systemActor ? "sync job" : null,
                formatWhen(entry.occurredAt),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-sm"
                >
                  <Badge variant={style.variant} className="shrink-0">
                    <Icon /> {style.label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entry.entityName}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
