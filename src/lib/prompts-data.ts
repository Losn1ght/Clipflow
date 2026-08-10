import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardPrompt {
  id: string;
  name: string;
  promptText: string;
}

type PromptRow = {
  id: string;
  name: string;
  prompt_text: string;
};

export async function fetchPrompts(supabase: SupabaseClient): Promise<DashboardPrompt[]> {
  const { data: rows, error } = await supabase
    .from("prompts")
    .select("id, name, prompt_text")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);

  return ((rows ?? []) as PromptRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    promptText: row.prompt_text,
  }));
}
