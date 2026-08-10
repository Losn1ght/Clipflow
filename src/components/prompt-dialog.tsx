"use client";

import { useState, useTransition } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
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
import { createPrompt, updatePrompt } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import type { DashboardPrompt } from "@/lib/prompts-data";

export function PromptDialog({
  trigger,
  prompt,
}: {
  trigger: React.ReactNode;
  prompt?: DashboardPrompt;
}) {
  const isEdit = Boolean(prompt);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isMaximized, setIsMaximized] = useState(false);
  const toast = useToast();

  const [name, setName] = useState(prompt?.name ?? "");
  const [promptText, setPromptText] = useState(prompt?.promptText ?? "");
  const isValid = name.trim().length > 0 && promptText.trim().length > 0;

  const resetIfCreate = () => {
    if (!isEdit) {
      setName("");
      setPromptText("");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const input = { name, promptText };
        if (isEdit && prompt) {
          await updatePrompt(prompt.id, input);
        } else {
          await createPrompt(input);
        }
        setOpen(false);
        resetIfCreate();
        toast.add({
          title: isEdit ? "Prompt updated" : "Prompt added",
          description: name,
          type: "success",
        });
      } catch {
        setError("Unable to save prompt. Check the fields and try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setIsMaximized(false);
        }
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className={isMaximized ? "sm:max-w-3xl" : "sm:max-w-md"}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit prompt" : "Add prompt"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update this prompt." : "Save a reusable prompt for your clipping workflow."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prompt-title">Title</Label>
              <Input id="prompt-title" value={name} onChange={(e) => setName(e.target.value)} required maxLength={27} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt-text">Prompt</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={isMaximized ? "Minimize editor" : "Maximize editor"}
                  onClick={() => setIsMaximized((current) => !current)}
                >
                  {isMaximized ? <Minimize2 /> : <Maximize2 />}
                </Button>
              </div>
              <Textarea
                id="prompt-text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                required
                maxLength={8_000}
                className={isMaximized ? "min-h-[60vh]" : "min-h-48"}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add prompt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
