"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  getFirstCollision,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Archive, AlertTriangle, Bell, CheckCircle2, Cloud, ExternalLink, FolderOpen, GripVertical, Link2, Pencil, Plus, RefreshCw, Settings, StickyNote, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SprocketMeter } from "@/components/ui/sprocket-meter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { AccountDialog } from "@/components/account-dialog";
import { CampaignDialog } from "@/components/campaign-dialog";
import { TaskDialog } from "@/components/task-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { WarmupTally } from "@/components/warmup-tally";
import { archiveAccount, archiveCampaign, deleteTask, disconnectGoogleDrive, moveTaskStatus, syncDriveNow } from "@/app/actions";
import type { DashboardAccount, DashboardCampaign, DashboardGoogleConnection, DashboardPlatform, DashboardTask } from "@/lib/dashboard-data";
import type { WarmupState } from "@/lib/warmup-data";
import type { TaskStatus } from "@/lib/validation";

const columns: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In progress" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

function pad(value: number, size = 4) {
  return String(value).padStart(size, "0");
}

// Explicit MM/DD/YYYY construction — avoids locale-dependent toLocaleDateString output.
function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

function formatBudget(budget: number) {
  return Number.isInteger(budget) ? `$${budget}` : `$${budget.toFixed(2)}`;
}

// Custom keyboard coordinate getter: the board's columns are separate droppable
// zones (not a single sortable list), so dnd-kit's default coordinate getter
// (which just nudges by pixels) can't hop a task between them. This mirrors
// dnd-kit's own "multiple containers" keyboard example — arrow keys find the
// nearest droppable column in that direction and jump the virtual pointer to it.
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, collisionRect, droppableRects, droppableContainers } = context;

  if (!active || !collisionRect) return undefined;

  const directionalKeys = [KeyboardCode.Down, KeyboardCode.Right, KeyboardCode.Up, KeyboardCode.Left] as string[];
  if (!directionalKeys.includes(event.code)) return undefined;

  event.preventDefault();

  const candidates: DroppableContainer[] = [];
  droppableContainers.getEnabled().forEach((entry) => {
    if (!entry || entry.disabled) return;
    const rect = droppableRects.get(entry.id);
    if (!rect) return;

    switch (event.code) {
      case KeyboardCode.Right:
        if (collisionRect.left + collisionRect.width <= rect.left) candidates.push(entry);
        break;
      case KeyboardCode.Left:
        if (collisionRect.left >= rect.left + rect.width) candidates.push(entry);
        break;
      case KeyboardCode.Down:
      case KeyboardCode.Up:
        // Columns are laid out left-to-right only; up/down has nothing to target.
        break;
    }
  });

  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });
  const closestId = getFirstCollision(collisions, "id");
  if (closestId == null) return undefined;

  const closestRect = droppableRects.get(closestId);
  if (!closestRect) return undefined;

  return { x: closestRect.left, y: closestRect.top };
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DashboardClient({
  accounts,
  initialTasks,
  campaigns,
  platforms,
  lowStockDays,
  googleConnection,
  initialWarmupStates,
}: {
  accounts: DashboardAccount[];
  initialTasks: DashboardTask[];
  campaigns: DashboardCampaign[];
  platforms: DashboardPlatform[];
  lowStockDays: number;
  googleConnection: DashboardGoogleConnection | null;
  initialWarmupStates: WarmupState[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [isSyncing, startSyncTransition] = useTransition();
  const toast = useToast();

  const handleSyncDrive = () => {
    startSyncTransition(async () => {
      try {
        const summary = await syncDriveNow();
        const parts = [`${summary.synced} synced`];
        if (summary.checkpointed) parts.push(`${summary.checkpointed} in progress`);
        if (summary.skipped) parts.push(`${summary.skipped} skipped`);
        if (summary.failed) parts.push(`${summary.failed} failed`);
        toast.add({ title: "Drive sync ran", description: `${parts.join(", ")}.` });
      } catch {
        toast.add({ title: "Drive sync failed", description: "Something went wrong starting the sync." });
      }
    });
  };

  // Fire a toast for the redirect params the Google OAuth callback route sets
  // (?googleConnected=1 or ?googleError=...), then strip them from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("googleConnected");
    const errorCode = params.get("googleError");
    if (connected) {
      toast.add({ title: "Google Drive connected" });
    } else if (errorCode) {
      toast.add({ title: "Google Drive connection failed", description: `Error: ${errorCode}` });
    }
    if (connected || errorCode) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalClips = accounts.reduce((sum, account) => sum + (account.clipCount ?? 0), 0);
  const targetTotal = accounts.reduce((sum, account) => sum + account.clipTargetPerDay, 0);
  const coverage = useMemo(() => (targetTotal > 0 ? Math.floor(totalClips / targetTotal) : 0), [totalClips, targetTotal]);
  const lowCount = accounts.filter((account) => account.tone === "destructive").length;

  const alerts = accounts
    .filter((account) => account.tone === "destructive")
    .map((account) => {
      if (account.state === "disconnected") {
        return { key: account.id, title: `${account.name} folder disconnected`, text: "Reconnect the Drive folder to resume counting." };
      }
      if (account.state === "failed") {
        return { key: account.id, title: `${account.name} sync failed`, text: "The last sync attempt failed. The previous complete count is still shown." };
      }
      const days = account.coverageDays ?? 0;
      return { key: account.id, title: `${account.name} is low`, text: `${account.clipCount ?? 0} clips ≈ ${days.toFixed(1)} days at its target. Restock soon.` };
    });

  const moveTask = (id: string, nextStatus: TaskStatus) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === nextStatus) return;

    setTasks((current) => current.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
    setPendingTaskIds((current) => new Set(current).add(id));
    startTransition(async () => {
      try {
        await moveTaskStatus(id, nextStatus);
      } catch {
        setTasks((current) => current.map((item) => (item.id === id ? { ...item, status: task.status } : item)));
      } finally {
        setPendingTaskIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    });
  };

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTask = activeTaskId ? tasks.find((item) => item.id === activeTaskId) ?? null : null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates })
  );
  const dropAnimation: DropAnimation = { duration: prefersReducedMotion() ? 0 : 200, easing: "ease" };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
    if (!over) return;
    moveTask(String(active.id), over.id as TaskStatus);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/clipflow-logo.svg" alt="Clipflow" width={40} height={40} className="rounded-xl" priority />
            <div><p className="font-heading text-base font-semibold tracking-tight">Clipflow</p><p className="text-sm text-muted-foreground">Clipping operations, simplified.</p></div>
          </div>
          <div className="flex items-center gap-3">
            {googleConnection ? (
              <Button variant="outline" onClick={handleSyncDrive} disabled={isSyncing}>
                <RefreshCw className={isSyncing ? "animate-spin" : undefined} /> {isSyncing ? "Syncing…" : "Sync Drive"}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      aria-disabled="true"
                      className="cursor-not-allowed opacity-50"
                      onClick={(event) => event.preventDefault()}
                    >
                      <RefreshCw /> Sync Drive
                    </Button>
                  }
                />
                <TooltipContent>Connect Google Drive to enable this</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-disabled="true"
                    className="cursor-not-allowed opacity-50"
                    onClick={(event) => event.preventDefault()}
                  >
                    <FolderOpen /> Add folder
                  </Button>
                }
              />
              <TooltipContent>Map a folder from an account&apos;s edit dialog</TooltipContent>
            </Tooltip>
            {googleConnection?.needsReauth ? (
              <Button variant="destructive" size="sm" nativeButton={false} render={<a href="/auth/google/connect" />}>
                <AlertTriangle /> Reconnect Google Drive
              </Button>
            ) : googleConnection ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Link2 /> Connected as {googleConnection.email ?? "Google account"}
                    {googleConnection.agingSoon && (
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex" />}>
                          <AlertTriangle className="text-warning" />
                        </TooltipTrigger>
                        <TooltipContent>
                          This connection may need to be renewed soon (Google testing-mode limits refresh tokens to ~7 days).
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </Button>
                }
                title="Disconnect Google Drive?"
                description="Existing folder mappings and clip counts are kept, but syncing stops until you reconnect."
                confirmLabel="Disconnect"
                onConfirm={disconnectGoogleDrive}
                successMessage="Google Drive disconnected"
              />
            ) : (
              <Button variant="outline" size="sm" nativeButton={false} render={<a href="/auth/google/connect" />}>
                <Link2 /> Connect Google Drive
              </Button>
            )}
            <SettingsDialog
              lowStockDays={lowStockDays}
              platforms={platforms}
              trigger={
                <Button variant="outline" size="icon" aria-label="Dashboard settings">
                  <Settings />
                </Button>
              }
            />
          </div>
        </header>

        <Tabs defaultValue="dashboard" className="mt-8">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="warmup">Warm-Up</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
        {/* Light Table layout: left column (metrics banner + inventory strip + cutting queue) / right reel rail */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr] xl:items-start">
          <div className="flex min-w-0 flex-col gap-8">
            {/* Metrics banner — one continuous filmstrip, not three boxed cards */}
            <section className="slate-mark overflow-hidden rounded-xl border border-border bg-card">
              <div className="grid grid-cols-1 sm:grid-cols-3">
                <MetricFrame label="Available clips" value={String(totalClips)} detail={`Across ${accounts.length} active account${accounts.length === 1 ? "" : "s"}`} icon={<Cloud className="size-5" />} />
                <MetricFrame label="Workflow coverage" value={`${pad(coverage, 2)}d`} detail="Based on account-level targets" icon={<CheckCircle2 className="size-5" />} className="border-t border-border sm:border-t-0 sm:border-l" />
                <MetricFrame label="Needs attention" value={pad(lowCount, 2)} detail="Low stock or restock soon" icon={<Bell className="size-5" />} alert className="border-t border-border sm:border-t-0 sm:border-l" />
              </div>
            </section>

            {/* Inventory strip — horizontal contact-sheet, scan left to right */}
            <Card className="slate-mark shadow-none">
              <CardHeader className="flex-row items-start justify-between">
                <div><p className="eyebrow">Inventory log</p><CardTitle className="mt-1.5">Account inventory</CardTitle><CardDescription className="mt-1">Clip coverage is always calculated per account.</CardDescription></div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-border bg-background/50 px-2 py-1 text-xs">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-positive" />
                    </span>
                    <span className="timecode text-positive">Live</span>
                  </span>
                  <AccountDialog trigger={<Button variant="outline" size="sm"><Plus /> Add account</Button>} />
                </div>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No accounts yet.</p>
                    <AccountDialog trigger={<Button variant="outline" size="sm"><Plus /> Add account</Button>} />
                  </div>
                ) : (
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
                  >
                    {accounts.map((account) => (
                        <div key={account.id} className="rounded-xl border border-border bg-background/50 p-4 transition-colors hover:border-foreground/20 hover:bg-background/80">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><p className="font-heading text-sm font-medium">{account.name}</p><p className="mt-1 text-sm text-muted-foreground">{account.folderName ?? "No folder linked"}</p></div>
                            <div className="flex items-center gap-1">
                              {account.mapping && !account.mapping.disconnectedAt && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  nativeButton={false}
                                  aria-label={`Open ${account.name}'s Drive folder`}
                                  render={
                                    <a
                                      href={`https://drive.google.com/drive/folders/${account.mapping.folderId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    />
                                  }
                                >
                                  <ExternalLink />
                                </Button>
                              )}
                              <AccountDialog account={account} trigger={<Button variant="ghost" size="icon-xs" aria-label={`Edit ${account.name}`}><Pencil /></Button>} />
                              <ConfirmDialog
                                trigger={<Button variant="ghost" size="icon-xs" aria-label={`Archive ${account.name}`}><Archive /></Button>}
                                title="Archive account?"
                                description={`${account.name} will be hidden from the active dashboard. This can be reversed later from the database.`}
                                confirmLabel="Archive"
                                onConfirm={() => archiveAccount(account.id)}
                                successMessage={`${account.name} archived`}
                              />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <Badge variant={account.tone}>{account.statusLabel}</Badge>
                            <p className="timecode text-right text-sm font-semibold">{account.clipCount !== null ? `${account.clipCount} clips` : "—"}</p>
                          </div>
                          <SprocketMeter days={account.coverageDays ?? 0} label={`${account.name} clip coverage`} className="mt-4" />
                        </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Reel rail — restock alerts + active campaigns as one continuous column */}
          <Card className="slate-mark shadow-none">
            <CardContent className="space-y-3 border-b border-border pb-5">
              <p className="eyebrow text-warning/80">Reel status</p>
              <div className="flex items-center gap-2 text-warning"><Bell className="size-5" /><CardTitle>Restock alerts</CardTitle></div>
              <CardDescription>In-app only for this first release.</CardDescription>
              <div className="max-h-64 space-y-3 overflow-y-auto pt-1 pr-1">
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
                ) : (
                  alerts.map((alert) => <Alert key={alert.key} title={alert.title} text={alert.text} />)
                )}
              </div>
            </CardContent>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div><CardTitle>Active campaigns</CardTitle><CardDescription>Requirement and submission links for each campaign.</CardDescription></div>
                <CampaignDialog accounts={accounts} platforms={platforms} trigger={<Button variant="outline" size="sm"><Plus /> Add</Button>} />
              </div>
              <div className="max-h-72 space-y-3 overflow-y-auto pt-1 pr-1">
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                ) : (
                  campaigns.map((campaign) => {
                    const href = campaign.requirementsUrl || campaign.submissionUrl;
                    const label = `${campaign.name}${campaign.accountNames.length ? ` · ${campaign.accountNames.join(", ")}` : ""}`;
                    return (
                      <div key={campaign.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer" className="block truncate outline-none transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50">
                              {label}
                            </a>
                          ) : (
                            <span className="block truncate">{label}</span>
                          )}
                          {(campaign.platformName || campaign.budget !== null || campaign.endsOn) && (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              {campaign.platformName && (
                                campaign.platformUrl ? (
                                  <a
                                    href={campaign.platformUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline-offset-2 outline-none transition hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                                  >
                                    {campaign.platformName}
                                  </a>
                                ) : (
                                  <span>{campaign.platformName}</span>
                                )
                              )}
                              {campaign.budget !== null && <span>{formatBudget(campaign.budget)}</span>}
                              {campaign.endsOn && <span>Ends {formatDate(campaign.endsOn)}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <CampaignDialog
                            campaign={campaign}
                            accounts={accounts}
                            platforms={platforms}
                            trigger={<Button variant="ghost" size="icon-xs" aria-label={`Edit ${campaign.name}`}><Pencil /></Button>}
                          />
                          <ConfirmDialog
                            trigger={<Button variant="ghost" size="icon-xs" aria-label={`Archive ${campaign.name}`}><Archive /></Button>}
                            title="Archive campaign?"
                            description={`${campaign.name} will be hidden from the active dashboard.`}
                            confirmLabel="Archive"
                            onConfirm={() => archiveCampaign(campaign.id)}
                            successMessage={`${campaign.name} archived`}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work Board — kanban, full width below the metrics/inventory/reel-rail row */}
        <div className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <div><h2 className="font-heading text-2xl font-bold tracking-tight">Work Board</h2><p className="mt-1 text-sm text-muted-foreground">Keep campaign work visible from source to submission.</p></div>
            <div className="flex items-center gap-2">
              <TaskDialog accounts={accounts} campaigns={campaigns} trigger={<Button variant="outline" size="sm"><Plus /> Add task</Button>} />
            </div>
          </div>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              <p>Nothing in the queue.</p>
              <TaskDialog accounts={accounts} campaigns={campaigns} trigger={<Button variant="outline" size="sm"><Plus /> Add task</Button>} />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveTaskId(null)}
              accessibility={{
                announcements: {
                  onDragStart({ active }) {
                    const task = tasks.find((item) => item.id === active.id);
                    return `Picked up "${task?.title ?? "task"}".`;
                  },
                  onDragOver({ over }) {
                    if (!over) return undefined;
                    const column = columns.find((item) => item.status === over.id);
                    return column ? `Dragging over the ${column.label} column.` : undefined;
                  },
                  onDragEnd({ active, over }) {
                    const task = tasks.find((item) => item.id === active.id);
                    const column = columns.find((item) => item.status === over?.id);
                    if (!column) return `Cancelled moving "${task?.title ?? "task"}".`;
                    return `Moved "${task?.title ?? "task"}" to ${column.label}.`;
                  },
                  onDragCancel({ active }) {
                    const task = tasks.find((item) => item.id === active.id);
                    return `Cancelled moving "${task?.title ?? "task"}".`;
                  },
                },
              }}
            >
              <div className="grid gap-3 md:grid-cols-4">
                {columns.map((column) => {
                  const columnTasks = tasks.filter((task) => task.status === column.status);
                  return (
                    <KanbanColumn key={column.status} status={column.status} label={column.label} count={columnTasks.length}>
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          isMoving={pendingTaskIds.has(task.id)}
                          accounts={accounts}
                          campaigns={campaigns}
                        />
                      ))}
                    </KanbanColumn>
                  );
                })}
              </div>
              <DragOverlay dropAnimation={dropAnimation}>
                {activeTask ? <TaskCard task={activeTask} isMoving={false} accounts={accounts} campaigns={campaigns} overlay /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
          </TabsContent>
          <TabsContent value="warmup">
            <WarmupTally accounts={accounts} initialWarmupStates={initialWarmupStates} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function MetricFrame({ label, value, detail, icon, alert = false, className = "" }: { label: string; value: string; detail: string; icon: React.ReactNode; alert?: boolean; className?: string }) {
  return (
    <div className={`flex items-start justify-between p-5 ${alert ? "bg-warning/10" : ""} ${className}`}>
      <div><p className="eyebrow">{label}</p><p className="timecode mt-2 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
      <div className={`rounded-lg p-2 ${alert ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}>{icon}</div>
    </div>
  );
}
function Alert({ title, text }: { title: string; text: string }) { return <div className="rounded-lg border border-warning/15 bg-background/50 p-3"><p className="text-sm font-medium text-warning">{title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div> }

function KanbanColumn({
  status,
  label,
  count,
  children,
}: {
  status: TaskStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-56 rounded-xl border p-3 transition-colors duration-150 ${
        isOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="outline" className="timecode">{pad(count, 2)}</Badge>
      </div>
      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function TaskCard({
  task,
  isMoving,
  accounts,
  campaigns,
  overlay = false,
}: {
  task: DashboardTask;
  isMoving: boolean;
  accounts: DashboardAccount[];
  campaigns: DashboardCampaign[];
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: isMoving,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const [viewOpen, setViewOpen] = useState(false);
  const columnLabel = columns.find((column) => column.status === task.status)?.label ?? task.status;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        role="button"
        tabIndex={0}
        aria-label={`View "${task.title}"`}
        onClick={() => setViewOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setViewOpen(true);
          }
        }}
        className={`cursor-pointer rounded-lg border border-border bg-background p-3 outline-none transition-[opacity,colors,box-shadow] duration-200 hover:border-foreground/15 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50 ${
          isMoving ? "opacity-60" : ""
        } ${isDragging ? "opacity-40" : ""} ${overlay ? "scale-[1.03] border-foreground/20 shadow-lg" : ""}`}
        aria-busy={isMoving}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <button
              {...attributes}
              {...listeners}
              type="button"
              aria-label={`Move "${task.title}" (press space to pick up, arrow keys to choose a column, space to drop)`}
              disabled={isMoving}
              onClick={(event) => event.stopPropagation()}
              className="-ml-1 mt-0.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground/60 outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GripVertical className="size-4" />
            </button>
            <p className="text-sm font-medium leading-snug">{task.title}</p>
          </div>
          <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
            <TaskDialog
              task={task}
              accounts={accounts}
              campaigns={campaigns}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Edit ${task.title}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Pencil />
                </Button>
              }
            />
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${task.title}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Trash2 />
                </Button>
              }
              title="Delete task?"
              description={`"${task.title}" will be permanently removed from the board.`}
              confirmLabel="Delete"
              onConfirm={() => deleteTask(task.id)}
              successMessage={`"${task.title}" deleted`}
            />
          </div>
        </div>
        <p className="mt-2 pl-6 text-xs text-muted-foreground">{[task.campaignName, task.accountName].filter(Boolean).join(" · ") || "Unassigned"}</p>
        {task.notes ? (
          <Tooltip>
            <TooltipTrigger render={<p className="mt-1 flex min-w-0 cursor-help items-center gap-1 pl-6 text-xs text-muted-foreground/80" />}>
              <StickyNote className="size-3 shrink-0" />
              <span className="truncate">{task.notes}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-pre-wrap">{task.notes}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {!overlay && (
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{task.title}</DialogTitle>
              <DialogDescription>{columnLabel}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Account · Campaign</p>
                <p>{[task.accountName, task.campaignName].filter(Boolean).join(" · ") || "Unassigned"}</p>
              </div>
              {task.externalUrl && (
                <div>
                  <p className="text-xs text-muted-foreground">Link</p>
                  <a href={task.externalUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                    {task.externalUrl}
                  </a>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-foreground/90">{task.notes || "No notes."}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
