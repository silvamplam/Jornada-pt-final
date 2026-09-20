import { NextResponse } from "next/server";

import { syncRelevantMatchVideoSummaries } from "@/lib/match-video-summary-sync.server";
import { writeSupabaseAdminReturning } from "@/lib/supabase";

export const maxDuration = 300;

type AuthorizationRow = Readonly<{ authorized: boolean }>;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function authorized(request: Request): Promise<boolean | null> {
  const value = await request.json().catch(() => null) as unknown;
  const payload = objectValue(value);
  const token = typeof payload?.token === "string" ? payload.token.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return false;

  try {
    const rows = await writeSupabaseAdminReturning<AuthorizationRow>(
      "rpc/match_video_summary_consume_automation_token_v1",
      { method: "POST", body: JSON.stringify({ p_token: token }) },
    );
    return rows.length === 1 && rows[0]?.authorized === true;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const allowed = await authorized(request);
  if (allowed === null) {
    return NextResponse.json({ ok: false, code: "authorization_unavailable" }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }

  const result = await syncRelevantMatchVideoSummaries();
  return NextResponse.json({ ok: true, ...result });
}
