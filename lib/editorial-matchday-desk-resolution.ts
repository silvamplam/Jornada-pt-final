import { writeSupabaseAdmin } from "@/lib/supabase";

function positivePlacementOrder(placementKey: string, prefix: string) {
  if (!placementKey.startsWith(`${prefix}:`)) return null;

  const order = Number(placementKey.slice(prefix.length + 1));

  return Number.isInteger(order) && order > 0
    ? order
    : null;
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

export async function resolveMatchdayEditorialDeskInactivePlacement(input: {
  matchdayId: string;
  placementKey: string;
  action: "activate" | "remove";
}) {
  const { matchdayId, placementKey, action } = input;

  if (placementKey === "headline") {
    await patchDeskEditorial(
      matchdayId,
      action === "activate"
        ? { status: "published" }
        : {
            title: null,
            summary: null,
            image_url: null,
            headline_link_url: null,
            status: "draft",
          },
    );
    return;
  }

  if (placementKey === "side_block") {
    await patchDeskEditorial(
      matchdayId,
      action === "activate"
        ? { side_block_status: "published" }
        : {
            side_block_label: null,
            side_block_title: null,
            side_block_author: null,
            side_block_text: null,
            side_block_image_url: null,
            side_block_link_url: null,
            side_block_status: "draft",
          },
    );
    return;
  }

  if (placementKey === "complement") {
    await patchDeskEditorial(
      matchdayId,
      action === "activate"
        ? { complementary_status: "published" }
        : {
            complementary_label: null,
            complementary_title: null,
            complementary_text: null,
            complementary_image_url: null,
            complementary_link_url: null,
            complementary_status: "draft",
          },
    );
    return;
  }

  const highlightOrder = positivePlacementOrder(
    placementKey,
    "highlight",
  );

  if (highlightOrder) {
    const path =
      `matchday_highlights?matchday_id=eq.${encodeURIComponent(matchdayId)}`
      + `&sort_order=eq.${highlightOrder}`;

    await writeSupabaseAdmin(
      path,
      action === "activate"
        ? {
            method: "PATCH",
            body: JSON.stringify({ status: "published" }),
          }
        : {
            method: "DELETE",
          },
    );
    return;
  }

  const latestOrder = positivePlacementOrder(
    placementKey,
    "latest",
  );

  if (latestOrder) {
    const path =
      `matchday_latest_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
      + `&sort_order=eq.${latestOrder}`;

    await writeSupabaseAdmin(
      path,
      action === "activate"
        ? {
            method: "PATCH",
            body: JSON.stringify({ status: "published" }),
          }
        : {
            method: "DELETE",
          },
    );
    return;
  }

  const faixaOrder = positivePlacementOrder(
    placementKey,
    "important_item",
  );

  if (faixaOrder) {
    const path =
      `matchday_horizontal_news?matchday_id=eq.${encodeURIComponent(matchdayId)}`
      + `&sort_order=eq.${faixaOrder}`;

    await writeSupabaseAdmin(
      path,
      action === "activate"
        ? {
            method: "PATCH",
            body: JSON.stringify({ status: "published" }),
          }
        : {
            method: "DELETE",
          },
    );
    return;
  }

  throw new Error("editorial-desk-placement-not-resolvable");
}