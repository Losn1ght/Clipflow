import { NextResponse, type NextRequest } from "next/server";
import { runSyncForAllMappings } from "@/lib/drive-sync";

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when the
// project has a CRON_SECRET env var configured; anything else is rejected so this
// route can't be triggered by an arbitrary public request.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runSyncForAllMappings();
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: "Drive sync failed to run." }, { status: 500 });
  }
}
