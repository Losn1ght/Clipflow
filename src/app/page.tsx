import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { fetchDashboardData, isCampaignActive } from "@/lib/dashboard-data";
import { fetchWarmupStates } from "@/lib/warmup-data";
import { fetchSubscriptions } from "@/lib/subscriptions-data";
import { fetchPrompts } from "@/lib/prompts-data";
import { fetchResources } from "@/lib/resources-data";
import { fetchEarningsGoal } from "@/lib/earnings-goal-data";
import { DashboardClient } from "@/app/dashboard-client";

// Renders per-request owner-scoped data (accounts, campaigns, subscriptions,
// and "today" for the active-campaign filter / renewal badges) - never static.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let supabase;
  try {
    ({ supabase } = await requireOwner());
  } catch {
    redirect("/login");
  }

  const { accounts, tasks, campaigns, platforms, lowStockDays, clipTargetOptions, lowStockDayOptions, googleConnection } =
    await fetchDashboardData(supabase);
  const warmupStates = await fetchWarmupStates(supabase, accounts.map((account) => account.id));

  const today = new Date().toISOString().slice(0, 10);
  const activeCampaigns = campaigns.filter((campaign) => isCampaignActive(campaign, today));
  const subscriptions = await fetchSubscriptions(supabase, today);
  const prompts = await fetchPrompts(supabase);
  const resources = await fetchResources(supabase);
  const earningsGoal = await fetchEarningsGoal(supabase);

  return (
    <DashboardClient
      accounts={accounts}
      initialTasks={tasks}
      campaigns={campaigns}
      activeCampaigns={activeCampaigns}
      platforms={platforms}
      lowStockDays={lowStockDays}
      clipTargetOptions={clipTargetOptions}
      lowStockDayOptions={lowStockDayOptions}
      googleConnection={googleConnection}
      initialWarmupStates={warmupStates}
      subscriptions={subscriptions}
      prompts={prompts}
      resources={resources}
      earningsGoal={earningsGoal}
      today={today}
    />
  );
}
