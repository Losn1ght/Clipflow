"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { decryptSecret, fromBytea } from "@/lib/crypto";
import { runSyncForAllMappings } from "@/lib/drive-sync";
import {
  accountInputSchema,
  campaignInputSchema,
  driveFolderMappingInputSchema,
  lowStockDaysSchema,
  platformInputSchema,
  taskInputSchema,
  taskStatusSchema,
} from "@/lib/validation";

const idSchema = z.uuid();

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const moveTaskInputSchema = z.object({
  taskId: z.uuid(),
  status: taskStatusSchema,
});

export async function moveTaskStatus(taskId: string, status: string) {
  const input = moveTaskInputSchema.parse({ taskId, status });
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("tasks").update({ status: input.status }).eq("id", input.taskId);
  if (error) {
    throw new Error("Unable to update task status.");
  }
}

export async function createTask(rawInput: unknown) {
  const input = taskInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("tasks").insert({
    title: input.title,
    status: input.status,
    account_id: input.accountId ?? null,
    campaign_id: input.campaignId ?? null,
    external_url: input.externalUrl || null,
    notes: input.notes ?? "",
  });
  if (error) throw new Error("Unable to create task.");

  revalidatePath("/");
}

export async function updateTask(taskId: string, rawInput: unknown) {
  const id = idSchema.parse(taskId);
  const input = taskInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      status: input.status,
      account_id: input.accountId ?? null,
      campaign_id: input.campaignId ?? null,
      external_url: input.externalUrl || null,
      notes: input.notes ?? "",
    })
    .eq("id", id);
  if (error) throw new Error("Unable to update task.");

  revalidatePath("/");
}

export async function deleteTask(taskId: string) {
  const id = idSchema.parse(taskId);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error("Unable to delete task.");

  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function createAccount(rawInput: unknown) {
  const input = accountInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("accounts").insert({
    name: input.name,
    clip_target_per_day: input.clipTargetPerDay,
    notes: input.notes ?? "",
  });
  if (error) throw new Error("Unable to create account.");

  revalidatePath("/");
}

export async function updateAccount(accountId: string, rawInput: unknown) {
  const id = idSchema.parse(accountId);
  const input = accountInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("accounts")
    .update({
      name: input.name,
      clip_target_per_day: input.clipTargetPerDay,
      notes: input.notes ?? "",
    })
    .eq("id", id);
  if (error) throw new Error("Unable to update account.");

  revalidatePath("/");
}

export async function archiveAccount(accountId: string) {
  const id = idSchema.parse(accountId);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("accounts").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Unable to archive account.");

  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Drive folder mappings
// ---------------------------------------------------------------------------

export async function upsertDriveFolderMapping(rawInput: unknown) {
  const input = driveFolderMappingInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { data: existing, error: lookupError } = await supabase
    .from("drive_folder_mappings")
    .select("id")
    .eq("account_id", input.accountId)
    .maybeSingle();
  if (lookupError) throw new Error("Unable to look up folder mapping.");

  if (existing) {
    const { error } = await supabase
      .from("drive_folder_mappings")
      .update({
        folder_id: input.folderId,
        folder_name: input.folderName || null,
        disconnected_at: null,
      })
      .eq("id", existing.id);
    if (error) throw new Error("Unable to update folder mapping.");
  } else {
    const { error } = await supabase.from("drive_folder_mappings").insert({
      account_id: input.accountId,
      folder_id: input.folderId,
      folder_name: input.folderName || null,
    });
    if (error) throw new Error("Unable to create folder mapping.");
  }

  revalidatePath("/");
}

export async function disconnectDriveFolderMapping(mappingId: string) {
  const id = idSchema.parse(mappingId);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("drive_folder_mappings")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Unable to disconnect folder mapping.");

  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function createCampaign(rawInput: unknown) {
  const input = campaignInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("campaigns").insert({
    name: input.name,
    requirements_url: input.requirementsUrl || null,
    submission_url: input.submissionUrl,
    budget: input.budget ?? null,
    platform_id: input.platformId || null,
    ends_on: input.endsOn || null,
  });
  if (error) throw new Error("Unable to create campaign.");

  revalidatePath("/");
}

export async function updateCampaign(campaignId: string, rawInput: unknown) {
  const id = idSchema.parse(campaignId);
  const input = campaignInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("campaigns")
    .update({
      name: input.name,
      requirements_url: input.requirementsUrl || null,
      submission_url: input.submissionUrl,
      budget: input.budget ?? null,
      platform_id: input.platformId || null,
      ends_on: input.endsOn || null,
    })
    .eq("id", id);
  if (error) throw new Error("Unable to update campaign.");

  revalidatePath("/");
}

export async function archiveCampaign(campaignId: string) {
  const id = idSchema.parse(campaignId);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("campaigns").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Unable to archive campaign.");

  revalidatePath("/");
}

const accountCampaignLinkSchema = z.object({
  accountId: z.uuid(),
  campaignId: z.uuid(),
});

export async function linkAccountCampaign(accountId: string, campaignId: string) {
  const input = accountCampaignLinkSchema.parse({ accountId, campaignId });
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("account_campaigns")
    .upsert({ account_id: input.accountId, campaign_id: input.campaignId }, { onConflict: "account_id,campaign_id", ignoreDuplicates: true });
  if (error) throw new Error("Unable to link account to campaign.");

  revalidatePath("/");
}

export async function unlinkAccountCampaign(accountId: string, campaignId: string) {
  const input = accountCampaignLinkSchema.parse({ accountId, campaignId });
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("account_campaigns")
    .delete()
    .eq("account_id", input.accountId)
    .eq("campaign_id", input.campaignId);
  if (error) throw new Error("Unable to unlink account from campaign.");

  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

export async function createPlatform(rawInput: unknown) {
  const input = platformInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("platforms").insert({
    name: input.name,
    url: input.url,
  });
  if (error) throw new Error("Unable to create platform.");

  revalidatePath("/");
}

export async function updatePlatform(platformId: string, rawInput: unknown) {
  const id = idSchema.parse(platformId);
  const input = platformInputSchema.parse(rawInput);
  const { supabase } = await requireOwner();

  const { error } = await supabase
    .from("platforms")
    .update({
      name: input.name,
      url: input.url,
    })
    .eq("id", id);
  if (error) throw new Error("Unable to update platform.");

  revalidatePath("/");
}

export async function deletePlatform(platformId: string) {
  const id = idSchema.parse(platformId);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("platforms").delete().eq("id", id);
  if (error) throw new Error("Unable to delete platform.");

  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Google Drive connection
// ---------------------------------------------------------------------------

export async function disconnectGoogleDrive() {
  const { supabase, userId } = await requireOwner();

  const { data: connection, error: connectionError } = await supabase
    .from("google_connections")
    .select("id")
    .eq("owner_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (connectionError) throw new Error("Unable to look up the Google connection.");
  if (!connection) return;

  const serviceClient = createServiceRoleClient();
  const { data: secret } = await serviceClient
    .from("google_token_secrets")
    .select("ciphertext, nonce, aad, key_version")
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (secret) {
    try {
      const refreshToken = decryptSecret({
        ciphertext: fromBytea(secret.ciphertext),
        nonce: fromBytea(secret.nonce),
        aad: fromBytea(secret.aad),
        keyVersion: secret.key_version,
      });
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch {
      // Best-effort revoke with Google; the local disconnect proceeds regardless.
    }
  }

  const { error } = await supabase
    .from("google_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", connection.id);
  if (error) throw new Error("Unable to disconnect Google Drive.");

  revalidatePath("/");
}

export async function syncDriveNow() {
  await requireOwner();

  const summary = await runSyncForAllMappings();
  revalidatePath("/");
  return summary;
}

// ---------------------------------------------------------------------------
// App config
// ---------------------------------------------------------------------------

export async function updateLowStockDays(days: number) {
  const lowStockDays = lowStockDaysSchema.parse(days);
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("app_config").update({ low_stock_days: lowStockDays }).eq("singleton", true);
  if (error) throw new Error("Unable to update low-stock threshold.");

  revalidatePath("/");
}
