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
import { createAccount, disconnectDriveFolderMapping, updateAccount, upsertDriveFolderMapping } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardAccount } from "@/lib/dashboard-data";

const CLIP_TARGET_OPTIONS = [3, 4, 5, 6];

export function AccountDialog({ trigger, account }: { trigger: React.ReactNode; account?: DashboardAccount }) {
  const isEdit = Boolean(account);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [name, setName] = useState(account?.name ?? "");
  const [clipTarget, setClipTarget] = useState(String(account?.clipTargetPerDay ?? 3));
  // Notes has no field in this dialog anymore, but preserve whatever the account
  // already had so saving other fields doesn't silently wipe it (updateAccount
  // overwrites the column with whatever is sent).
  const notes = account?.notes ?? "";
  const [folderId, setFolderId] = useState(account?.mapping?.folderId ?? "");
  const [folderName, setFolderName] = useState(account?.mapping?.folderName ?? "");

  const resetIfCreate = () => {
    if (!isEdit) {
      setName("");
      setClipTarget("3");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = { name, clipTargetPerDay: Number(clipTarget), notes };
        if (isEdit && account) {
          await updateAccount(account.id, input);
          if (folderId.trim()) {
            await upsertDriveFolderMapping({ accountId: account.id, folderId, folderName });
          }
        } else {
          await createAccount(input);
        }
        setOpen(false);
        resetIfCreate();
        toast.add({ title: isEdit ? "Account updated" : "Account added", description: name });
      } catch {
        setError("Unable to save account. Check the fields and try again.");
      }
    });
  };

  const handleDisconnect = () => {
    if (!account?.mapping) return;
    setError(null);
    startTransition(async () => {
      try {
        await disconnectDriveFolderMapping(account.mapping!.id);
        setFolderId("");
        setFolderName("");
      } catch {
        setError("Unable to disconnect the folder mapping.");
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
            <DialogTitle>{isEdit ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the account's target and Drive folder." : "Track a new Instagram account and its daily clip target."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Name</Label>
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-target">Clip target per day</Label>
              <Select value={clipTarget} onValueChange={(value) => setClipTarget(value ?? "3")}>
                <SelectTrigger id="account-target" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIP_TARGET_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} clips / day
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEdit && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="eyebrow">Drive folder</p>
                <div className="space-y-1.5">
                  <Label htmlFor="account-folder-id">Folder ID</Label>
                  <Input
                    id="account-folder-id"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    placeholder="Google Drive folder ID"
                    maxLength={255}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-folder-name">Folder name (optional)</Label>
                  <Input
                    id="account-folder-name"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    maxLength={255}
                  />
                </div>
                {account?.mapping && !account.mapping.disconnectedAt && (
                  <Button type="button" variant="outline" size="sm" onClick={handleDisconnect} disabled={isPending}>
                    Disconnect folder
                  </Button>
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
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
