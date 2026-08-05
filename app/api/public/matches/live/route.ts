import { NextResponse } from "next/server";

import {
  parsePublicMatchStripMatchIds,
  type PublicMatchStripLiveUpdate
} from "@/lib/public-match-strip-live-refresh";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = parsePublicMatchStripMatchIds(url.searchParams.get("ids"));

  if (ids.length === 0) {
    return NextResponse.json({ matches: [] }, { headers: RESPONSE_HEADERS });
  }

  try {
    const rows = await fetchSupabaseAdminTable<PublicMatchStripLiveUpdate>(
      "matches?select=id,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score" +
      `&id=in.(${ids.join(",")})&limit=${ids.length}`
    );
    const orderById = new Map(ids.map((id, index) => [id, index]));
    const matches = rows
      .filter((row) => orderById.has(row.id.toLowerCase()))
      .sort((first, second) => (
        (orderById.get(first.id.toLowerCase()) ?? 0)
        - (orderById.get(second.id.toLowerCase()) ?? 0)
      ));

    return NextResponse.json({ matches }, { headers: RESPONSE_HEADERS });
  }
  catch (error) {
    console.error("Public match strip refresh failed", error);
    return NextResponse.json(
      { error: "live-refresh-unavailable" },
      { status: 503, headers: RESPONSE_HEADERS }
    );
  }
}
