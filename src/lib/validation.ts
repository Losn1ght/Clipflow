import { z } from "zod";

export const clipTargetSchema = z.int().min(3).max(6);
export const lowStockDaysSchema = z.int().min(1).max(30);
export const optionalUrlSchema = z.url().max(2_048).optional().or(z.literal(""));
export const taskStatusSchema = z.enum(["backlog", "in_progress", "review", "done"]);
export const warmupDaySchema = z.enum(["day_1", "day_2", "day_3_plus"]);
export const warmupMetricSchema = z.enum(["likes", "comments", "reposts", "follows", "links"]);

export const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  clipTargetPerDay: clipTargetSchema.default(3),
  notes: z.string().trim().max(2_000).optional(),
});

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  requirementsUrl: z.string().trim().max(2_048).optional().or(z.literal("")),
  submissionUrl: z.url().max(2_048),
  budget: z.coerce.number().min(0).optional(),
  platformId: z.uuid().nullable().optional(),
  endsOn: z.iso.date().optional().or(z.literal("")),
});

export const platformInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().max(2_048),
});

export const driveFolderMappingInputSchema = z.object({
  accountId: z.uuid(),
  folderId: z.string().trim().min(1).max(255),
  folderName: z.string().trim().max(255).optional(),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  status: taskStatusSchema.default("backlog"),
  accountId: z.uuid().nullable().optional(),
  campaignId: z.uuid().nullable().optional(),
  externalUrl: optionalUrlSchema,
  notes: z.string().trim().max(2_000).optional(),
});

export type AccountInput = z.infer<typeof accountInputSchema>;
export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type DriveFolderMappingInput = z.infer<typeof driveFolderMappingInputSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type WarmupDay = z.infer<typeof warmupDaySchema>;
export type WarmupMetric = z.infer<typeof warmupMetricSchema>;