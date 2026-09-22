"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  deleteAccount,
  deleteArchivedItems,
  deleteCampaign,
  deletePrompt,
  deleteResource,
  deleteSubscription,
  fetchArchivedItems,
  restoreAccount,
  restoreArchivedItems,
  restoreCampaign,
  restorePrompt,
  restoreResource,
  restoreSubscription,
  type ArchivedItem,
  type ArchivedItems,
} from "@/app/actions";

type ArchiveSection = keyof ArchivedItems;

const SECTIONS: {
  key: ArchiveSection;
  label: string;
  /** Singular noun, used in the hard-delete confirmation title. */
  noun: string;
  restore: (id: string) => Promise<void>;
  hardDelete: (id: string) => Promise<void>;
  /** Spelled out per section because a hard delete's blast radius differs. */
  deleteDescription: (name: string) => string;
}[] = [
  {
    key: "accounts",
    label: "Accounts",
    noun: "account",
    restore: restoreAccount,
    hardDelete: deleteAccount,
    deleteDescription: (name) =>
      `Deleting ${name} also removes its Drive folder mapping, clip history, alerts, and warm-up tally. Tasks linked to it stay on the board but lose the account. This cannot be undone.`,
  },
  {
    key: "campaigns",
    label: "Campaigns",
    noun: "campaign",
    restore: restoreCampaign,
    hardDelete: deleteCampaign,
    deleteDescription: (name) =>
      `Deleting ${name} also unlinks it from every account. Tasks linked to it stay on the board but lose the campaign. This cannot be undone.`,
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    noun: "subscription",
    restore: restoreSubscription,
    hardDelete: deleteSubscription,
    deleteDescription: (name) => `Deleting ${name} removes it from monthly spend and renewals. This cannot be undone.`,
  },
  {
    key: "prompts",
    label: "Prompts",
    noun: "prompt",
    restore: restorePrompt,
    hardDelete: deletePrompt,
    deleteDescription: (name) => `Deleting ${name} discards the prompt text for good. This cannot be undone.`,
  },
  {
    key: "resources",
    label: "Resources",
    noun: "resource",
    restore: restoreResource,
    hardDelete: deleteResource,
    deleteDescription: (name) => `Deleting ${name} removes it from the link library. This cannot be undone.`,
  },
];

// Archived timestamps are full timestamptz values, not the plain YYYY-MM-DD
// dates the rest of the app formats - MM/DD/YYYY built from the Date object
// directly, same avoid-locale-ambiguity intent as the app's other formatter.
function formatArchivedAt(iso: string) {
  const date = new Date(iso);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

const keyOf = (section: ArchiveSection, id: string) => `${section}:${id}`;

// A mixed selection spans tables, so a single generic sentence can't describe the
// damage the way the per-row confirmations do. Name only what's actually selected.
function batchDeleteDescription(sections: Set<ArchiveSection>, count: number) {
  const parts = [`Deleting ${count} archived item${count === 1 ? "" : "s"} cannot be undone.`];
  if (sections.has("accounts")) parts.push("Accounts take their Drive folder mapping, clip history, alerts, and warm-up tally with them.");
  if (sections.has("campaigns")) parts.push("Campaigns are unlinked from every account.");
  if (sections.has("accounts") || sections.has("campaigns")) parts.push("Linked tasks stay on the board but lose the link.");
  return parts.join(" ");
}

export function ArchivesDialog({
  trigger,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  /** Notified on open/close - lets a dialog this is nested inside hide itself while this is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArchivedItems | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  // ConfirmDialog below is nested inside this dialog's content. Base UI
  // suppresses its own backdrop while nested, but doesn't hide this dialog's
  // own box - so without this, the delete confirmation would show the Archives
  // box still sitting behind it. Hide it while the nested dialog is open.
  const [nestedOpen, setNestedOpen] = useState(false);
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

  // Deliberately no try/catch: the rejection propagates to ConfirmDialog, which
  // owns the error state and only toasts on success.
  const handleDelete = async (section: (typeof SECTIONS)[number], item: ArchivedItem) => {
    await section.hardDelete(item.id);
    setItems((current) =>
      current ? { ...current, [section.key]: current[section.key].filter((row) => row.id !== item.id) } : current
    );
  };

  const totalCount = items ? SECTIONS.reduce((sum, section) => sum + items[section.key].length, 0) : 0;

  // Derived from `items` rather than tracked separately, so rows that a bulk
  // mutation removed drop out of the selection on their own.
  const selectedRefs = items
    ? SECTIONS.flatMap((section) =>
        items[section.key]
          .filter((item) => selected.has(keyOf(section.key, item.id)))
          .map((item) => ({ section: section.key, id: item.id })),
      )
    : [];
  const selectedCount = selectedRefs.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  const toggleSelected = (section: ArchiveSection, id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      const key = keyOf(section, id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected || !items) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(SECTIONS.flatMap((section) => items[section.key].map((item) => keyOf(section.key, item.id)))));
  };

  const dropLocally = (refs: { section: ArchiveSection; id: string }[]) => {
    const removed = new Set(refs.map((ref) => keyOf(ref.section, ref.id)));
    setItems((current) => {
      if (!current) return current;
      const next = { ...current };
      for (const section of SECTIONS) {
        next[section.key] = next[section.key].filter((row) => !removed.has(keyOf(section.key, row.id)));
      }
      return next;
    });
  };

  const handleRestoreSelected = () => {
    const refs = selectedRefs;
    if (refs.length === 0) return;
    startTransition(async () => {
      try {
        await restoreArchivedItems(refs);
        dropLocally(refs);
        setSelected(new Set());
        toast.add({ title: `${refs.length} restored`, type: "success" });
      } catch {
        // The bulk action isn't atomic, so reload instead of guessing how much
        // landed. Selection is kept for whatever survived.
        toast.add({ title: "Unable to restore", type: "error" });
        load();
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSelected(new Set());
          load();
        }
        onOpenChange?.(next);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent
        className={`sm:max-w-lg transition-opacity duration-200 ${nestedOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
        aria-hidden={nestedOpen || undefined}
      >
        <DialogHeader>
          <DialogTitle>Archives</DialogTitle>
          <DialogDescription>Restore anything you&apos;ve archived, or delete it permanently.</DialogDescription>
        </DialogHeader>

        {!isLoading && totalCount > 0 && (
          <div className="flex min-h-6 items-center justify-between gap-2">
            <Button variant="ghost" size="xs" onClick={toggleAll} disabled={isPending}>
              {allSelected ? "Clear" : "Select all"}
            </Button>
            {(selectedCount > 0 || nestedOpen) && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
                <Button variant="outline" size="xs" onClick={handleRestoreSelected} disabled={isPending || selectedCount === 0}>
                  <RotateCcw /> Restore
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" size="xs" disabled={isPending || selectedCount === 0}>
                      <Trash2 /> Delete
                    </Button>
                  }
                  title={`Permanently delete ${selectedCount} archived item${selectedCount === 1 ? "" : "s"}?`}
                  description={batchDeleteDescription(new Set(selectedRefs.map((ref) => ref.section)), selectedCount)}
                  confirmLabel="Delete forever"
                  onConfirm={async () => {
                    const refs = selectedRefs;
                    try {
                      await deleteArchivedItems(refs);
                      dropLocally(refs);
                      setSelected(new Set());
                    } catch (error) {
                      load();
                      throw error;
                    }
                  }}
                  successMessage={`${selectedCount} permanently deleted`}
                  onOpenChange={setNestedOpen}
                />
              </div>
            )}
          </div>
        )}

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
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
                        className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-sm"
                      >
                        <Checkbox
                          checked={selected.has(keyOf(section.key, item.id))}
                          onCheckedChange={() => toggleSelected(section.key, item.id)}
                          disabled={isPending}
                          aria-label={`Select ${item.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">Archived {formatArchivedAt(item.archivedAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button variant="outline" size="xs" disabled={isPending} onClick={() => handleRestore(section, item)}>
                            <RotateCcw /> Restore
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon-xs" aria-label={`Permanently delete ${item.name}`}>
                                <Trash2 />
                              </Button>
                            }
                            title={`Permanently delete ${section.noun}?`}
                            description={section.deleteDescription(item.name)}
                            confirmLabel="Delete forever"
                            onConfirm={() => handleDelete(section, item)}
                            successMessage={`${item.name} permanently deleted`}
                            onOpenChange={setNestedOpen}
                          />
                        </div>
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
