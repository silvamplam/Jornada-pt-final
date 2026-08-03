import { NextResponse } from "next/server";

import { refreshNewsroomCurrentFeed } from "@/lib/redacao-automatica/newsroom-current-feed";
import {
  newsroomTopicPeriod,
} from "@/lib/redacao-automatica/newsroom-topic-search";

export const maxDuration = 300;

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function redirectTo(params: Record<string, string>) {
  const url = new URL("/admin/editorial/redacao-automatica", "https://jornada.local");
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `${url.pathname}${url.search}` },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const period = newsroomTopicPeriod(cleanText(formData.get("period")));
  const source = cleanText(formData.get("source"));
  const query = cleanText(formData.get("query"));
  const result = await refreshNewsroomCurrentFeed(source || null);

  if (!result.ok) {
    return redirectTo({
      period,
      ...(source ? { source } : {}),
      ...(query ? { query } : {}),
      feed_error: result.error.code,
    });
  }

  return redirectTo({
    period,
    ...(source ? { source } : {}),
    ...(query ? { query } : {}),
    feed_state: result.value.status,
    feed_available: String(result.value.availableCount),
    feed_created: String(result.value.createdCount),
    feed_updated: String(result.value.updatedCount),
    feed_existing: String(result.value.existingCount),
    feed_failed: String(result.value.failedCount),
    feed_more: result.value.hasMore ? "1" : "0",
  });
}
