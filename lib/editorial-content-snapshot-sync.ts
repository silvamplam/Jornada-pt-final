import { syncLatestFourNewsProjection } from "@/lib/editorial-matchday-latest-four-projection";
import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

export type EditorialContentSnapshotSource = {
  slug: string | null;
  content_type: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  author: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
};

type SnapshotPayload = Record<string, string>;

function cleanText(value: string | null | undefined) {
  const cleanValue = value?.trim();
  return cleanValue || null;
}

function publicContentHref(slug: string) {
  return `/conteudos/${encodeURIComponent(slug)}`;
}

function addIfValue(payload: SnapshotPayload, field: string, value: string | null | undefined) {
  const cleanValue = cleanText(value);
  if (cleanValue) {
    payload[field] = cleanValue;
  }
}

function contentLabel(content: EditorialContentSnapshotSource) {
  return cleanText(content.label) || cleanText(content.content_type) || "Conteudo";
}

function contentSubtitle(content: EditorialContentSnapshotSource) {
  return cleanText(content.subtitle) || cleanText(content.summary);
}

function contentImageUrl(content: EditorialContentSnapshotSource) {
  return cleanText(content.thumbnail_url) || cleanText(content.image_url);
}

function uniqueLinks(previousSlug: string | null | undefined, nextSlug: string) {
  return Array.from(
    new Set(
      [cleanText(previousSlug), cleanText(nextSlug)]
        .filter((slug): slug is string => Boolean(slug))
        .map(publicContentHref),
    ),
  );
}

async function patchSnapshots(table: string, linkField: string, currentLink: string, payload: SnapshotPayload) {
  await writeSupabaseAdmin(`${table}?${linkField}=eq.${encodeURIComponent(currentLink)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function readAffectedLiveMatchdayIds(currentLink: string) {
  const encodedLink = encodeURIComponent(currentLink);
  const rows = await Promise.all([
    fetchSupabaseAdminTable<{ matchday_id: string }>(
      `matchday_editorials?select=matchday_id&headline_link_url=eq.${encodedLink}`,
    ),
    fetchSupabaseAdminTable<{ matchday_id: string }>(
      `matchday_editorials?select=matchday_id&side_block_link_url=eq.${encodedLink}`,
    ),
    fetchSupabaseAdminTable<{ matchday_id: string }>(
      `matchday_editorials?select=matchday_id&complementary_link_url=eq.${encodedLink}`,
    ),
    fetchSupabaseAdminTable<{ matchday_id: string }>(
      `matchday_highlights?select=matchday_id&link_url=eq.${encodedLink}`,
    ),
    fetchSupabaseAdminTable<{ matchday_id: string }>(
      `matchday_latest_news?select=matchday_id&link_url=eq.${encodedLink}`,
    ),
  ]);
  return rows.flatMap((tableRows) => tableRows.map((row) => row.matchday_id));
}

export async function syncEditorialContentSnapshots({
  previousSlug,
  content,
}: {
  previousSlug?: string | null;
  content: EditorialContentSnapshotSource;
}) {
  const nextSlug = cleanText(content.slug);
  const title = cleanText(content.title);
  if (!nextSlug || !title) {
    return;
  }

  const nextLink = publicContentHref(nextSlug);
  const label = contentLabel(content);
  const subtitle = contentSubtitle(content);
  const imageUrl = contentImageUrl(content);
  const author = cleanText(content.author);
  const links = uniqueLinks(previousSlug, nextSlug);
  const affectedLiveMatchdayIds = new Set<string>();

  for (const currentLink of links) {
    const affectedMatchdayIds = await readAffectedLiveMatchdayIds(currentLink);
    affectedMatchdayIds.forEach((matchdayId) => affectedLiveMatchdayIds.add(matchdayId));

    const homeHeadline: SnapshotPayload = { headline_title: title, headline_link_url: nextLink };
    addIfValue(homeHeadline, "headline_subtitle", subtitle);
    addIfValue(homeHeadline, "headline_image_url", imageUrl);

    const homeSideBlock: SnapshotPayload = {
      side_block_label: label,
      side_block_title: title,
      side_block_link_url: nextLink,
    };
    addIfValue(homeSideBlock, "side_block_text", subtitle);
    addIfValue(homeSideBlock, "side_block_author", author);
    addIfValue(homeSideBlock, "side_block_image_url", imageUrl);

    const homeComplement: SnapshotPayload = {
      complementary_label: label,
      complementary_title: title,
      complementary_link_url: nextLink,
    };
    addIfValue(homeComplement, "complementary_text", subtitle);
    addIfValue(homeComplement, "complementary_image_url", imageUrl);

    const listItem: SnapshotPayload = { label, title, link_url: nextLink };
    addIfValue(listItem, "subtitle", subtitle);
    addIfValue(listItem, "image_url", imageUrl);

    const latestItem: SnapshotPayload = { title, link_url: nextLink };
    addIfValue(latestItem, "subtitle", subtitle);
    addIfValue(latestItem, "image_url", imageUrl);

    const matchdayHeadline: SnapshotPayload = { title, headline_link_url: nextLink };
    addIfValue(matchdayHeadline, "summary", subtitle);
    addIfValue(matchdayHeadline, "image_url", imageUrl);

    const matchdaySideBlock: SnapshotPayload = {
      side_block_label: label,
      side_block_title: title,
      side_block_link_url: nextLink,
    };
    addIfValue(matchdaySideBlock, "side_block_text", subtitle);
    addIfValue(matchdaySideBlock, "side_block_author", author);
    addIfValue(matchdaySideBlock, "side_block_image_url", imageUrl);

    const matchdayComplement: SnapshotPayload = {
      complementary_label: label,
      complementary_title: title,
      complementary_link_url: nextLink,
    };
    addIfValue(matchdayComplement, "complementary_text", subtitle);
    addIfValue(matchdayComplement, "complementary_image_url", imageUrl);

    const referenceItem: SnapshotPayload = {
      label_snapshot: label,
      title_snapshot: title,
      link_url_snapshot: nextLink,
    };
    addIfValue(referenceItem, "subtitle_snapshot", subtitle);
    addIfValue(referenceItem, "image_url_snapshot", imageUrl);

    await Promise.all([
      patchSnapshots("site_editorials", "headline_link_url", currentLink, homeHeadline),
      patchSnapshots("site_editorials", "side_block_link_url", currentLink, homeSideBlock),
      patchSnapshots("site_editorials", "complementary_link_url", currentLink, homeComplement),
      patchSnapshots("site_editorial_highlights", "link_url", currentLink, listItem),
      patchSnapshots("site_editorial_latest_news", "link_url", currentLink, latestItem),
      patchSnapshots("matchday_editorials", "headline_link_url", currentLink, matchdayHeadline),
      patchSnapshots("matchday_editorials", "side_block_link_url", currentLink, matchdaySideBlock),
      patchSnapshots("matchday_editorials", "complementary_link_url", currentLink, matchdayComplement),
      patchSnapshots("matchday_highlights", "link_url", currentLink, listItem),
      patchSnapshots("matchday_latest_news", "link_url", currentLink, latestItem),
      patchSnapshots("matchday_reference_composition_items", "link_url_snapshot", currentLink, referenceItem),
    ]);
  }

  await Promise.all(
    Array.from(affectedLiveMatchdayIds, (matchdayId) => syncLatestFourNewsProjection(matchdayId)),
  );
}
