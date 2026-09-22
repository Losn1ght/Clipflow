import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardEarningsGoal {
  targetAmount: number;
  currentAmount: number;
}

const DEFAULT_EARNINGS_GOAL: DashboardEarningsGoal = { targetAmount: 1000, currentAmount: 0 };

export async function fetchEarningsGoal(supabase: SupabaseClient): Promise<DashboardEarningsGoal> {
  const { data: row, error } = await supabase
    .from("earnings_goal")
    .select("target_amount, current_amount")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return DEFAULT_EARNINGS_GOAL;

  return {
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
  };
}
