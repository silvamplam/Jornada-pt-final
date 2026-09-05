import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
} from "@/lib/supabase";
import { syncLatestFourNewsProjection } from "@/lib/editorial-matchday-latest-four-projection";
import { applyMatchdayPlacementByLink } from "@/lib/editorial-matchday-physical-placement";

function positivePlacementOrder(placementKey: string, prefix: string) {
  if (!placementKey.startsWith(`${prefix}:`)) return null;

  const order = Number(placementKey.slice(prefix.length + 1));

  return Number.isInteger(order) && order > 0
    ? order
    : null;
}

function publicArticlePath(slug: string) {
  return `/noticias/${encodeURIComponent(slug)}`;
}

async function syncLatestProjectionAfterRelevantPlacement(matchdayId: string, placementKey: string) {
  const isEditorialZone = placementKey === "headline"
    || placementKey === "side_block"
    || placementKey === "complement";
  const isListZone = Boolean(
    positivePlacementOrder(placementKey, "highlight")
    || positivePlacementOrder(placementKey, "latest")
    || positivePlacementOrder(placementKey, "important_item"),
  );
  if (isEditorialZone || isListZone || placementKey.startsWith("live_")) {
    await syncLatestFourNewsProjection(matchdayId);
  }
}

type AuthoritativeTarget = {
  placementType: "opening" | "faixa" | "selection" | "video_highlight";
  slotPosition: number;
};

function authoritativeTarget(placementKey: string): AuthoritativeTarget | null {
  if (placementKey === "headline") {
    return { placementType: "opening", slotPosition: 1 };
  }
  if (placementKey === "side_block") {
    return { placementType: "opening", slotPosition: 5 };
  }
  if (placementKey === "complement") {
    return { placementType: "video_highlight", slotPosition: 1 };
  }

  const highlightOrder = positivePlacementOrder(placementKey, "highlight");
  if (highlightOrder && highlightOrder <= 3) {
    return { placementType: "opening", slotPosition: highlightOrder + 1 };
  }

  const faixaOrder = positivePlacementOrder(placementKey, "important_item");
  if (faixaOrder) {
    return { placementType: "faixa", slotPosition: faixaOrder };
  }

  const selectionOrder = positivePlacementOrder(placementKey, "live_four_news");
  if (selectionOrder && selectionOrder <= 4) {
    return { placementType: "selection", slotPosition: selectionOrder };
  }

  return null;
}

async function applyAuthoritativePlacement(
  matchdayId: string,
  placementKey: string,
  action: "place" | "clear",
  sourceLinkUrl: string | null = null,
) {
  const target = authoritativeTarget(placementKey);
  if (!target) return false;

  await applyMatchdayPlacementByLink({
    matchdayId,
    action,
    sourceLinkUrl,
    target: {
      placementType: target.placementType,
      zoneId: null,
      slotPosition: target.slotPosition,
    },
  });
  return true;
}

async function readInactivePlacementLink(matchdayId: string, placementKey: string) {
  if (placementKey === "headline" || placementKey === "side_block" || placementKey === "complement") {
    const rows = await fetchSupabaseAdminTable<{
      headline_link_url: string | null;
      side_block_link_url: string | null;
      complementary_link_url: string | null;
    }>(
      "matchday_editorials?select=headline_link_url,side_block_link_url,complementary_link_url"
        + `&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    if (placementKey === "headline") return rows[0]?.headline_link_url ?? null;
    if (placementKey === "side_block") return rows[0]?.side_block_link_url ?? null;
    return rows[0]?.complementary_link_url ?? null;
  }

  const highlightOrder = positivePlacementOrder(placementKey, "highlight");
  if (highlightOrder) {
    const rows = await fetchSupabaseAdminTable<{ link_url: string | null }>(
      "matchday_highlights?select=link_url"
        + `&matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${highlightOrder}&limit=1`,
    );
    return rows[0]?.link_url ?? null;
  }

  const faixaOrder = positivePlacementOrder(placementKey, "important_item");
  if (faixaOrder) {
    const rows = await fetchSupabaseAdminTable<{ link_url: string | null }>(
      "matchday_horizontal_news?select=link_url"
        + `&matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${faixaOrder}&limit=1`,
    );
    return rows[0]?.link_url ?? null;
  }

  return null;
}

async function removePlacement(
  matchdayId: string,
  placementKey: string,
) {
  if (await applyAuthoritativePlacement(matchdayId, placementKey, "clear")) return;

  const latestOrder = positivePlacementOrder(
    placementKey,
    "latest",
  );

  if (latestOrder) {
    await writeSupabaseAdmin(
      `matchday_latest_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${latestOrder}`,
      { method: "DELETE" },
    );
    return;
  }

  if (placementKey.startsWith("live_")) {
    await writeSupabaseAdmin(
      `matchday_live_layout_items?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&slot_type=eq.${encodeURIComponent(placementKey)}`,
      { method: "DELETE" },
    );
    return;
  }

  throw new Error("editorial-desk-placement-not-removable");
}

async function associatePlacement(
  matchdayId: string,
  placementKey: string,
  articleId: string,
  articleSlug: string,
) {
  const linkUrl = publicArticlePath(articleSlug);
  if (await applyAuthoritativePlacement(matchdayId, placementKey, "place", linkUrl)) return;

  const latestOrder = positivePlacementOrder(
    placementKey,
    "latest",
  );

  if (latestOrder) {
    await writeSupabaseAdmin(
      `matchday_latest_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${latestOrder}`,
      {
        method: "PATCH",
        body: JSON.stringify({ link_url: linkUrl }),
      },
    );
    return;
  }

  if (placementKey.startsWith("live_")) {
    await writeSupabaseAdmin(
      `matchday_live_layout_items?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&slot_type=eq.${encodeURIComponent(placementKey)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          article_id: articleId,
          link_url: linkUrl,
        }),
      },
    );
    return;
  }

  throw new Error("editorial-desk-placement-not-associable");
}

export async function resolveMatchdayEditorialDeskInactivePlacement(input: {
  matchdayId: string;
  placementKey: string;
  action: "activate" | "remove";
}) {
  const { matchdayId, placementKey, action } = input;

  if (action === "remove") {
    await removePlacement(matchdayId, placementKey);
    await syncLatestProjectionAfterRelevantPlacement(matchdayId, placementKey);
    return;
  }

  if (authoritativeTarget(placementKey)) {
    const sourceLinkUrl = await readInactivePlacementLink(matchdayId, placementKey);
    if (!sourceLinkUrl) throw new Error("editorial-desk-placement-link-required");
    await applyAuthoritativePlacement(matchdayId, placementKey, "place", sourceLinkUrl);
    await syncLatestFourNewsProjection(matchdayId);
    return;
  }

  const latestOrder = positivePlacementOrder(
    placementKey,
    "latest",
  );

  if (latestOrder) {
    await writeSupabaseAdmin(
      `matchday_latest_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${latestOrder}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      },
    );
    await syncLatestFourNewsProjection(matchdayId);
    return;
  }

  throw new Error("editorial-desk-placement-not-activatable");
}

export async function resolveMatchdayEditorialDeskCanonicalPlacement(input: {
  matchdayId: string;
  placementKey: string;
  action: "associate" | "remove";
  articleId?: string;
  articleSlug?: string;
}) {
  const {
    matchdayId,
    placementKey,
    action,
    articleId,
    articleSlug,
  } = input;

  if (action === "remove") {
    await removePlacement(matchdayId, placementKey);
    await syncLatestProjectionAfterRelevantPlacement(matchdayId, placementKey);
    return;
  }

  if (!articleId || !articleSlug) {
    throw new Error("editorial-desk-canonical-article-required");
  }

  await associatePlacement(
    matchdayId,
    placementKey,
    articleId,
    articleSlug,
  );
  await syncLatestProjectionAfterRelevantPlacement(matchdayId, placementKey);
}
