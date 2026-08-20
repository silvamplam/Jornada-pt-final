import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
} from "@/lib/supabase";
import { syncLatestFourNewsProjection } from "@/lib/editorial-matchday-latest-four-projection";

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

async function patchDeskEditorial(
  matchdayId: string,
  body: Record<string, unknown>,
) {
  await writeSupabaseAdmin(
    `matchday_editorials?matchday_id=eq.${encodeURIComponent(matchdayId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

async function normalizeHorizontalNewsOrder(matchdayId: string) {
  const rows = await fetchSupabaseAdminTable<{
    id: string;
    sort_order: number;
  }>(
    `matchday_horizontal_news?select=id,sort_order`
      + `&matchday_id=eq.${encodeURIComponent(matchdayId)}`
      + `&order=sort_order.asc,id.asc&limit=1000`,
  );

  for (let index = 0; index < rows.length; index += 1) {
    const expectedOrder = index + 1;
    const row = rows[index];

    if (row.sort_order === expectedOrder) continue;

    await writeSupabaseAdmin(
      `matchday_horizontal_news?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sort_order: expectedOrder }),
      },
    );
  }
}

async function removePlacement(
  matchdayId: string,
  placementKey: string,
) {
  if (placementKey === "headline") {
    await patchDeskEditorial(matchdayId, {
      title: null,
      summary: null,
      image_url: null,
      headline_link_url: null,
      status: "draft",
    });
    return;
  }

  if (placementKey === "side_block") {
    await patchDeskEditorial(matchdayId, {
      side_block_label: null,
      side_block_title: null,
      side_block_author: null,
      side_block_text: null,
      side_block_image_url: null,
      side_block_link_url: null,
      side_block_status: "draft",
    });
    return;
  }

  if (placementKey === "complement") {
    await patchDeskEditorial(matchdayId, {
      complementary_label: null,
      complementary_title: null,
      complementary_text: null,
      complementary_image_url: null,
      complementary_link_url: null,
      complementary_status: "draft",
    });
    return;
  }

  const highlightOrder = positivePlacementOrder(
    placementKey,
    "highlight",
  );

  if (highlightOrder) {
    await writeSupabaseAdmin(
      `matchday_highlights?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${highlightOrder}`,
      { method: "DELETE" },
    );
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
      { method: "DELETE" },
    );
    return;
  }

  const faixaOrder = positivePlacementOrder(
    placementKey,
    "important_item",
  );

  if (faixaOrder) {
    await writeSupabaseAdmin(
      `matchday_horizontal_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${faixaOrder}`,
      { method: "DELETE" },
    );

    await normalizeHorizontalNewsOrder(matchdayId);
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

  if (placementKey === "headline") {
    await patchDeskEditorial(matchdayId, {
      headline_link_url: linkUrl,
    });
    return;
  }

  if (placementKey === "side_block") {
    await patchDeskEditorial(matchdayId, {
      side_block_link_url: linkUrl,
    });
    return;
  }

  if (placementKey === "complement") {
    await patchDeskEditorial(matchdayId, {
      complementary_link_url: linkUrl,
    });
    return;
  }

  const highlightOrder = positivePlacementOrder(
    placementKey,
    "highlight",
  );

  if (highlightOrder) {
    await writeSupabaseAdmin(
      `matchday_highlights?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${highlightOrder}`,
      {
        method: "PATCH",
        body: JSON.stringify({ link_url: linkUrl }),
      },
    );
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
        body: JSON.stringify({ link_url: linkUrl }),
      },
    );
    return;
  }

  const faixaOrder = positivePlacementOrder(
    placementKey,
    "important_item",
  );

  if (faixaOrder) {
    await writeSupabaseAdmin(
      `matchday_horizontal_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${faixaOrder}`,
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

  if (placementKey === "headline") {
    await patchDeskEditorial(matchdayId, {
      status: "published",
    });
    await syncLatestFourNewsProjection(matchdayId);
    return;
  }

  if (placementKey === "side_block") {
    await patchDeskEditorial(matchdayId, {
      side_block_status: "published",
    });
    await syncLatestFourNewsProjection(matchdayId);
    return;
  }

  if (placementKey === "complement") {
    await patchDeskEditorial(matchdayId, {
      complementary_status: "published",
    });
    await syncLatestFourNewsProjection(matchdayId);
    return;
  }

  const highlightOrder = positivePlacementOrder(
    placementKey,
    "highlight",
  );

  if (highlightOrder) {
    await writeSupabaseAdmin(
      `matchday_highlights?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${highlightOrder}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      },
    );
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

  const faixaOrder = positivePlacementOrder(
    placementKey,
    "important_item",
  );

  if (faixaOrder) {
    await writeSupabaseAdmin(
      `matchday_horizontal_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
        + `&sort_order=eq.${faixaOrder}`,
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
