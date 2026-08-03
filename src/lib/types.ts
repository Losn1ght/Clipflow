export type SyncStatus = "pending" | "running" | "completed" | "failed";
export type InventoryState =
  | "fresh"
  | "syncing"
  | "stale"
  | "failed"
  | "disconnected"
  | "unconfigured";

export interface Account {
  id: string;
  name: string;
  clipTargetPerDay: number;
  archivedAt: string | null;
}

export interface InventorySnapshot {
  accountId: string;
  clipCount: number;
  completedAt: string;
}