import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { fetchDashboardData } from "@/lib/dashboard-data";
import { fetchWarmupStates } from "@/lib/warmup-data";
import { DashboardClient } from "@/app/dashboard-client";

export default async function DashboardPage() {
  let supabase;
  try {
    ({ supabase } = await requireOwner());
  } catch {
    redirect("/login");
  }

  const { accounts, tasks, campaigns, platforms, lowStockDays, googleConnection } = await fetchDashboardData(supabase);
  const warmupStates = await fetchWarmupStates(supabase, accounts.map((account) => account.id));

  return (
    <DashboardClient
      accounts={accounts}
      initialTasks={tasks}
      campaigns={campaigns}
      platforms={platforms}
      lowStockDays={lowStockDays}
      googleConnection={googleConnection}
      initialWarmupStates={warmupStates}
    />
  );
}
