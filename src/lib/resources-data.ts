import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardResource {
  id: string;
  name: string;
  url: string;
}

type ResourceRow = {
  id: string;
  name: string;
  url: string;
};

export async function fetchResources(supabase: SupabaseClient): Promise<DashboardResource[]> {
  const { data: rows, error } = await supabase
    .from("resources")
    .select("id, name, url")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);

  return ((rows ?? []) as ResourceRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
  }));
}
