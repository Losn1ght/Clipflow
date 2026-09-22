import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingCycle } from "@/lib/validation";

export interface DashboardSubscription {
  id: string;
  name: string;
  cost: number;
  billingCycle: BillingCycle;
  monthlyCost: number;
  renewsOn: string | null;
  renewsInDays: number | null;
  url: string | null;
  notes: string;
}

type SubscriptionRow = {
  id: string;
  name: string;
  cost: number | string;
  billing_cycle: BillingCycle;
  renews_on: string | null;
  url: string | null;
  notes: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Months per billing cycle - monthlyCost = cost / CYCLE_MONTHS[cycle]. Weekly
// uses a 30-day month approximation (30/7); the others are exact month counts.
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  weekly: 7 / 30,
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export async function fetchSubscriptions(supabase: SupabaseClient, today: string): Promise<DashboardSubscription[]> {
  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("id, name, cost, billing_cycle, renews_on, url, notes")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);

  const todayMs = new Date(today).getTime();

  return ((rows ?? []) as SubscriptionRow[]).map((row) => {
    const cost = Number(row.cost);
    const monthlyCost = cost / CYCLE_MONTHS[row.billing_cycle];
    const renewsInDays = row.renews_on
      ? Math.round((new Date(row.renews_on).getTime() - todayMs) / MS_PER_DAY)
      : null;

    return {
      id: row.id,
      name: row.name,
      cost,
      billingCycle: row.billing_cycle,
      monthlyCost,
      renewsOn: row.renews_on,
      renewsInDays,
      url: row.url,
      notes: row.notes ?? "",
    };
  });
}
