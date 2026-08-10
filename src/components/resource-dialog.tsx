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
import { createResource, updateResource } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardResource } from "@/lib/resources-data";

export function ResourceDialog({
  trigger,
  resource,
}: {
  trigger: React.ReactNode;
  resource?: DashboardResource;
}) {
  const isEdit = Boolean(resource);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [name, setName] = useState(resource?.name ?? "");
  const [url, setUrl] = useState(resource?.url ?? "");
  const isValid = name.trim().length > 0 && url.trim().length > 0;

  const resetIfCreate = () => {
    if (!isEdit) {
      setName("");
      setUrl("");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = { name, url };
        if (isEdit && resource) {
          await updateResource(resource.id, input);
        } else {
          await createResource(input);
        }
        setOpen(false);
        resetIfCreate();
        toast.add({
          title: isEdit ? "Resource updated" : "Resource added",
          description: name,
          type: "success",
        });
      } catch {
        setError("Unable to save resource. Check the fields and try again.");
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
            <DialogTitle>{isEdit ? "Edit resource" : "Add resource"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update this link." : "Save a link to a tool or resource you use for clipping."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resource-name">Name</Label>
              <Input id="resource-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="SFX" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resource-url">URL</Label>
              <Input
                id="resource-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://…"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
