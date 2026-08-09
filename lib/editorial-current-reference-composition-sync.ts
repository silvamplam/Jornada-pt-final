import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

const NEWS_FLOW_SLOT_TYPES = [
  "headline",
  "editorial_line_item",
  "highlight",
  "complement",
  "important_item",
] as const;

type NewsFlowSlotType = (typeof NEWS_FLOW_SLOT_TYPES)[number];

type CurrentComposition = {
  id: string;
};

type EditorialRow = {
  id: string;
  status: string | null;
  title: string | null;
  summary: string | null;
  image_url: string | null;
  headline_link_url: string | null;
  complementary_label: string | null;
  complementary_title: string | null;
  complementary_text: string | null;
  complementary_image_url: string | null;
  complementary_link_url: string | null;
  complementary_status: string | null;
};

type HighlightRow = {
  id: string;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
};

type LatestRow = {
  id: string;
  time_label: string | null;
  time_label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
};

type HorizontalRow = {
  id: string;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
};

type ExistingReferenceItem = {
  id: string;
  slot_type: string;
  sort_order: number;
};

type NewsFlowSnapshot = {
  slot_type: NewsFlowSlotType;
  source_type: string;
  source_id: string;
  sort_order: number;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  label_snapshot: string | null;
  label_color_snapshot: string | null;
};

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function hasContent(...values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(cleanText(value)));
}

function snapshotKey(slotType: string, sortOrder: number) {
  return `${slotType}:${sortOrder}`;
}

async function readCurrentPublishedComposition(matchdayId: string) {
  const rows = await fetchSupabaseAdminTable<CurrentComposition>(
    `matchday_reference_compositions?select=id&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&status=eq.published&is_current=is.true&order=published_at.desc.nullslast&limit=1`,
  ).catch(() => []);
  return rows[0] ?? null;
}

async function buildLiveNewsFlowSnapshots(matchdayId: string): Promise<NewsFlowSnapshot[]> {
  const [editorialRows, highlights, latest, horizontal] = await Promise.all([
    fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,status,title,summary,image_url,headline_link_url,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    ).catch(() => []),
    fetchSupabaseAdminTable<HighlightRow>(
      `matchday_highlights?select=id,label,label_color,title,subtitle,image_url,link_url,sort_order&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=sort_order.asc`,
    ).catch(() => []),
    fetchSupabaseAdminTable<LatestRow>(
      `matchday_latest_news?select=id,time_label,time_label_color,title,subtitle,image_url,link_url,sort_order&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=sort_order.asc`,
    ).catch(() => []),
    fetchSupabaseAdminTable<HorizontalRow>(
      `matchday_horizontal_news?select=id,label,label_color,title,subtitle,image_url,link_url,sort_order&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=sort_order.asc`,
    ).catch(() => []),
  ]);

  const snapshots: NewsFlowSnapshot[] = [];
  const editorial = editorialRows[0] ?? null;

  if (
    editorial?.status === "published"
    && hasContent(editorial.title, editorial.summary, editorial.image_url, editorial.headline_link_url)
  ) {
    snapshots.push({
      slot_type: "headline",
      source_type: "matchday_editorial_headline",
      source_id: editorial.id,
      sort_order: 1,
      title_snapshot: cleanText(editorial.title),
      subtitle_snapshot: cleanText(editorial.summary),
      image_url_snapshot: cleanText(editorial.image_url),
      link_url_snapshot: cleanText(editorial.headline_link_url),
      label_snapshot: null,
      label_color_snapshot: null,
    });
  }

  if (
    editorial?.complementary_status === "published"
    && hasContent(
      editorial.complementary_label,
      editorial.complementary_title,
      editorial.complementary_text,
      editorial.complementary_image_url,
      editorial.complementary_link_url,
    )
  ) {
    snapshots.push({
      slot_type: "complement",
      source_type: "matchday_editorial_complement",
      source_id: editorial.id,
      sort_order: 1,
      title_snapshot: cleanText(editorial.complementary_title),
      subtitle_snapshot: cleanText(editorial.complementary_text),
      image_url_snapshot: cleanText(editorial.complementary_image_url),
      link_url_snapshot: cleanText(editorial.complementary_link_url),
      label_snapshot: cleanText(editorial.complementary_label),
      label_color_snapshot: null,
    });
  }

  for (const item of highlights) {
    snapshots.push({
      slot_type: "highlight",
      source_type: "matchday_highlight",
      source_id: item.id,
      sort_order: item.sort_order,
      title_snapshot: cleanText(item.title),
      subtitle_snapshot: cleanText(item.subtitle),
      image_url_snapshot: cleanText(item.image_url),
      link_url_snapshot: cleanText(item.link_url),
      label_snapshot: cleanText(item.label),
      label_color_snapshot: cleanText(item.label_color),
    });
  }

  for (const item of latest) {
    snapshots.push({
      slot_type: "editorial_line_item",
      source_type: "matchday_latest_news",
      source_id: item.id,
      sort_order: item.sort_order,
      title_snapshot: cleanText(item.title),
      subtitle_snapshot: cleanText(item.subtitle),
      image_url_snapshot: cleanText(item.image_url),
      link_url_snapshot: cleanText(item.link_url),
      label_snapshot: cleanText(item.time_label),
      label_color_snapshot: cleanText(item.time_label_color),
    });
  }

  for (const item of horizontal) {
    snapshots.push({
      slot_type: "important_item",
      source_type: "matchday_horizontal_news",
      source_id: item.id,
      sort_order: item.sort_order,
      title_snapshot: cleanText(item.title),
      subtitle_snapshot: cleanText(item.subtitle),
      image_url_snapshot: cleanText(item.image_url),
      link_url_snapshot: cleanText(item.link_url),
      label_snapshot: cleanText(item.label),
      label_color_snapshot: cleanText(item.label_color),
    });
  }

  return snapshots;
}

/**
 * Keeps only the CURRENT published reference composition aligned with the live
 * five-zone news flow. Older non-current published compositions are never
 * touched, so they stay frozen as historical snapshots.
 */
export async function syncCurrentPublishedReferenceCompositionNewsFlow(matchdayId: string) {
  const composition = await readCurrentPublishedComposition(matchdayId);
  if (!composition) return { synced: false, itemCount: 0 };

  const [desired, existing] = await Promise.all([
    buildLiveNewsFlowSnapshots(matchdayId),
    fetchSupabaseAdminTable<ExistingReferenceItem>(
      `matchday_reference_composition_items?select=id,slot_type,sort_order&composition_id=eq.${encodeURIComponent(
        composition.id,
      )}&slot_type=in.(${NEWS_FLOW_SLOT_TYPES.join(",")})&order=slot_type.asc,sort_order.asc`,
    ).catch(() => []),
  ]);

  const existingByKey = new Map(existing.map((item) => [snapshotKey(item.slot_type, item.sort_order), item] as const));
  const retainedIds = new Set<string>();
  const now = new Date().toISOString();

  // Update or create the desired live state first. Old items are removed only
  // after every desired item has been persisted, reducing destructive partial
  // states if a network/write error occurs.
  for (const snapshot of desired) {
    const existingItem = existingByKey.get(snapshotKey(snapshot.slot_type, snapshot.sort_order));
    const payload = {
      ...snapshot,
      article_id: null,
      status: "published",
      updated_at: now,
    };

    if (existingItem) {
      retainedIds.add(existingItem.id);
      await writeSupabaseAdmin(
        `matchday_reference_composition_items?id=eq.${encodeURIComponent(existingItem.id)}&composition_id=eq.${encodeURIComponent(
          composition.id,
        )}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
    } else {
      await writeSupabaseAdmin("matchday_reference_composition_items", {
        method: "POST",
        body: JSON.stringify({ composition_id: composition.id, ...payload }),
      });
    }
  }

  for (const item of existing) {
    if (retainedIds.has(item.id)) continue;

    await writeSupabaseAdmin(
      `matchday_reference_composition_items?id=eq.${encodeURIComponent(item.id)}&composition_id=eq.${encodeURIComponent(
        composition.id,
      )}`,
      { method: "DELETE" },
    );
  }

  await writeSupabaseAdmin(
    `matchday_reference_compositions?id=eq.${encodeURIComponent(composition.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published&is_current=is.true`,
    { method: "PATCH", body: JSON.stringify({ updated_at: now }) },
  );

  return { synced: true, itemCount: desired.length };
}
