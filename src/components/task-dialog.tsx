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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTask, updateTask } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardCampaign, DashboardTask } from "@/lib/dashboard-data";
import type { TaskStatus } from "@/lib/validation";

const NONE = "none";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

export function TaskDialog({
  trigger,
  task,
  defaultStatus,
  campaigns,
}: {
  trigger: React.ReactNode;
  task?: DashboardTask;
  defaultStatus?: TaskStatus;
  campaigns: DashboardCampaign[];
}) {
  const isEdit = Boolean(task);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [title, setTitle] = useState(task?.title ?? "");
  const [status, setStatus] = useState<string>(task?.status ?? defaultStatus ?? "backlog");
  const [campaignId, setCampaignId] = useState<string>(task?.campaignId ?? NONE);
  const [externalUrl, setExternalUrl] = useState(task?.externalUrl ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");

  const resetIfCreate = () => {
    if (!isEdit) {
      setTitle("");
      setStatus(defaultStatus ?? "backlog");
      setCampaignId(NONE);
      setExternalUrl("");
      setNotes("");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          title,
          status: status as TaskStatus,
          accountId: task?.accountId ?? null,
          campaignId: campaignId === NONE ? null : campaignId,
          externalUrl,
          notes,
        };
        if (isEdit && task) {
          await updateTask(task.id, input);
        } else {
          await createTask(input);
        }
        setOpen(false);
        resetIfCreate();
        toast.add({ title: isEdit ? "Task updated" : "Task added", description: title, type: "success" });
      } catch {
        setError("Unable to save task. Check the fields and try again.");
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
            <DialogTitle>{isEdit ? "Edit task" : "Add task"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the task's title and links." : "Add a new task to the cutting queue."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={240} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value ?? "backlog")}>
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue>
                    {(value: string) => STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "Status"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-campaign">Campaign (optional)</Label>
              <Select value={campaignId} onValueChange={(value) => setCampaignId(value ?? NONE)}>
                <SelectTrigger id="task-campaign" className="w-full">
                  <SelectValue>
                    {(value: string) => (value === NONE ? "None" : campaigns.find((campaign) => campaign.id === value)?.name ?? "None")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-url">External URL (optional)</Label>
              <Input
                id="task-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2_000}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
