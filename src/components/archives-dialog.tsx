"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  fetchArchivedItems,
  restoreAccount,
  restoreCampaign,
  restorePrompt,
  restoreResource,
  restoreSubscription,
  type ArchivedItem,
  type ArchivedItems,
} from "@/app/actions";

const SECTIONS: { key: keyof ArchivedItems; label: string; restore: (id: string) => Promise<void> }[] = [
  { key: "accounts", label: "Accounts", restore: restoreAccount },
  { key: "campaigns", label: "Campaigns", restore: restoreCampaign },
  { key: "subscriptions", label: "Subscriptions", restore: restoreSubscription },
  { key: "prompts", label: "Prompts", restore: restorePrompt },
  { key: "resources", label: "Resources", restore: restoreResource },
];

// Archived timestamps are full timestamptz values, not the plain YYYY-MM-DD
// dates the rest of the app formats — MM/DD/YYYY built from the Date object
// directly, same avoid-locale-ambiguity intent as the app's other formatter.
function formatArchivedAt(iso: string) {
  const date = new Date(iso);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

export function ArchivesDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArchivedItems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const load = () => {
    setIsLoading(true);
    fetchArchivedItems()
      .then(setItems)
      .catch(() => toast.add({ title: "Unable to load archives", type: "error" }))
      .finally(() => setIsLoading(false));
  };

  const handleRestore = (section: (typeof SECTIONS)[number], item: ArchivedItem) => {
    startTransition(async () => {
      try {
        await section.restore(item.id);
        setItems((current) =>
          current ? { ...current, [section.key]: current[section.key].filter((row) => row.id !== item.id) } : current
        );
        toast.add({ title: `${item.name} restored`, description: `Back in ${section.label}`, type: "success" });
      } catch {
        toast.add({ title: "Unable to restore", description: item.name, type: "error" });
      }
    });
  };

  const totalCount = items ? SECTIONS.reduce((sum, section) => sum + items[section.key].length, 0) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archives</DialogTitle>
          <DialogDescription>Nothing is ever hard-deleted — restore anything you&apos;ve archived.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !items || totalCount === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing archived yet.</p>
          ) : (
            SECTIONS.map((section) => {
              const sectionItems = items[section.key];
              if (sectionItems.length === 0) return null;
              return (
                <div key={section.key} className="space-y-2">
                  <p className="eyebrow">
                    {section.label} · {sectionItems.length}
                  </p>
                  <div className="space-y-1.5">
                    {sectionItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">Archived {formatArchivedAt(item.archivedAt)}</p>
                        </div>
                        <Button variant="outline" size="xs" disabled={isPending} onClick={() => handleRestore(section, item)}>
                          <RotateCcw /> Restore
                        </Button>
                      </div>
                    ))}
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
