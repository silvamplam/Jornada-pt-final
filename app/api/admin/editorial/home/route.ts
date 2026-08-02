import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

type SiteEditorialIdRow = {
  id: string;
};

type MatchIdRow = {
  id: string;
};

type SiteFeaturedMatchRow = {
  id: string;
  match_id: string | null;
  sort_order: number | null;
};

type SiteEditorialHighlightRow = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
};

type SiteEditorialLatestNewsRow = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
};

type SiteEditorialRoundupItemRow = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
};

class HomeEditorialAdminError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

const allowedTextFields = [
  "headline_title",
  "headline_subtitle",
  "headline_image_url",
  "headline_link_url",
  "side_block_type",
  "side_block_label",
  "side_block_title",
  "side_block_text",
  "side_block_author",
  "side_block_image_url",
  "side_block_link_url",
  "complementary_mode",
  "complementary_label",
  "complementary_title",
  "complementary_text",
  "complementary_image_url",
  "complementary_link_url",
  "complementary_roundup_item_id",
  "below_headline_mode",
  "below_headline_heading",
  "roundup_video_heading",
  "final_zone_title"
] as const;

const allowedColorFields = [
  "headline_title_color",
  "side_block_title_color",
  "side_block_label_color",
  "below_headline_heading_color",
  "roundup_video_heading_color",
  "final_zone_title_color"
] as const;

const allowedStatusFields = ["status", "side_block_status", "complementary_status"] as const;

function cleanText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim();
  return cleanValue.length > 0 ? cleanValue : null;
}

function cleanMatchId(value: FormDataEntryValue | null) {
  const cleanValue = cleanText(value);
  if (!cleanValue) {
    return null;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanValue)) {
    throw new HomeEditorialAdminError("invalid-featured-match");
  }

  return cleanValue;
}

function cleanInteger(value: FormDataEntryValue | null) {
  const cleanValue = cleanText(value);
  if (!cleanValue) {
    return null;
  }

  const parsed = Number.parseInt(cleanValue, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function cleanReturnAnchor(value: FormDataEntryValue | null) {
  const cleanValue = cleanText(value);
  if (!cleanValue) {
    return null;
  }

  if (/^home-(highlight|roundup|final)-item-\d{2,3}$/.test(cleanValue)) {
    return cleanValue;
  }

  return null;
}

function uniqueCleanMatchIds(values: FormDataEntryValue[]) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const id = cleanMatchId(value);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function cleanStatus(value: string | null) {
  if (!value) {
    return "draft";
  }

  if (value === "published" || value === "draft") {
    return value;
  }

  throw new HomeEditorialAdminError("invalid-status");
}

function cleanColor(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) {
    return value;
  }

  throw new HomeEditorialAdminError("invalid-color");
}

function cleanFinalZoneMode(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === "latest_news" || value === "editorial_line") {
    return value;
  }

  throw new HomeEditorialAdminError("invalid-final-zone-mode");
}

function cleanRoundupType(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === "video" || value === "golos" || value === "resumo" || value === "noticia") {
    return value;
  }

  throw new HomeEditorialAdminError("invalid-roundup-type");
}

const contextAnchors = {
  games: "home-games",
  headline: "home-headline",
  side: "home-side-block",
  composition: "home-composition",
  complement: "home-complement",
  highlights: "home-highlights",
  roundup: "home-roundup",
  "final-zone": "home-final-zone"
} as const;

type SaveContext = keyof typeof contextAnchors;

function cleanSaveContext(value: string | null): SaveContext | null {
  if (!value) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(contextAnchors, value) ? (value as SaveContext) : null;
}

function gameFilterParams(formData: FormData) {
  const params: Record<string, string> = {};

  for (const key of ["home_competition_id", "home_season_id", "home_matchday_id"]) {
    const value = cleanText(formData.get(key));
    if (value) {
      params[key] = value;
    }
  }

  return params;
}

function redirectTo(request: Request, params: Record<string, string>, anchor?: string | null) {
  const url = new URL("/admin/editorial/home", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  if (anchor) {
    url.hash = anchor;
  }

  return NextResponse.redirect(url, { status: 303 });
}

function sanitizeErrorText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey[=:]\s*[A-Za-z0-9._-]+/gi, "apikey=[redacted]")
    .trim()
    .slice(0, 220);
}

function classifyError(error: unknown) {
  if (error instanceof HomeEditorialAdminError) {
    return error.code;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/permission|row-level|rls/i.test(message)) {
    return "permission";
  }
  if (/not-null|null value|required/i.test(message)) {
    return "required-field";
  }
  if (/constraint|check/i.test(message)) {
    return "constraint";
  }

  return "save-failed";
}

async function ensureHomeEditorialExists(siteEditorialId: string) {
  const rows = await fetchSupabaseAdminTable<SiteEditorialIdRow>(
    `site_editorials?select=id&id=eq.${encodeURIComponent(siteEditorialId)}&slug=eq.home&limit=1`
  );

  if (!rows[0]) {
    throw new HomeEditorialAdminError("missing-home-editorial");
  }
}

function buildPayload(formData: FormData) {
  const payload: Record<string, string | null> = {};

  for (const field of allowedTextFields) {
    payload[field] = cleanText(formData.get(field));
  }

  for (const field of allowedColorFields) {
    payload[field] = cleanColor(cleanText(formData.get(field)));
  }

  for (const field of allowedStatusFields) {
    payload[field] = cleanStatus(cleanText(formData.get(field)));
  }

  payload.final_zone_mode = cleanFinalZoneMode(cleanText(formData.get("final_zone_mode")));

  return payload;
}

function chunkList<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function readExistingMatchIds(matchIds: string[]) {
  const existing = new Set<string>();

  for (const chunk of chunkList(matchIds, 80)) {
    if (chunk.length === 0) {
      continue;
    }

    const rows = await fetchSupabaseAdminTable<MatchIdRow>(
      `matches?select=id&id=in.(${chunk.map((id) => encodeURIComponent(id)).join(",")})`
    );

    for (const row of rows) {
      existing.add(row.id);
    }
  }

  return existing;
}

function orderedSelectedMatches(formData: FormData, selectedIds: string[]) {
  return selectedIds
    .map((matchId, index) => ({
      matchId,
      index,
      requestedOrder: cleanInteger(formData.get(`featured_order_${matchId}`)) ?? index + 1
    }))
    .sort((a, b) => a.requestedOrder - b.requestedOrder || a.index - b.index)
    .map((item, index) => ({
      match_id: item.matchId,
      sort_order: index + 1
    }));
}

async function updateFeaturedMatches(request: Request, formData: FormData) {
  const availableIds = uniqueCleanMatchIds(formData.getAll("available_match_id"));
  const selectedIds = uniqueCleanMatchIds(formData.getAll("featured_match_id"));

  if (availableIds.length === 0) {
    throw new HomeEditorialAdminError("missing-selection-set");
  }

  if (selectedIds.length === 0) {
    throw new HomeEditorialAdminError("empty-featured-selection");
  }

  const availableSet = new Set(availableIds);
  if (selectedIds.some((matchId) => !availableSet.has(matchId))) {
    throw new HomeEditorialAdminError("invalid-featured-match");
  }

  const existingMatchIds = await readExistingMatchIds(availableIds);
  if (availableIds.some((matchId) => !existingMatchIds.has(matchId))) {
    throw new HomeEditorialAdminError("invalid-featured-match");
  }

  const currentRows = await fetchSupabaseAdminTable<SiteFeaturedMatchRow>(
    "site_featured_matches?select=id,match_id,sort_order&limit=1000"
  );
  const currentByMatchId = new Map(
    currentRows.filter((row): row is SiteFeaturedMatchRow & { match_id: string } => Boolean(row.match_id)).map((row) => [row.match_id, row])
  );
  const selectedSet = new Set(selectedIds);
  const rowsToRemove = currentRows
    .filter((row): row is SiteFeaturedMatchRow & { match_id: string } => Boolean(row.match_id))
    .filter((row) => availableSet.has(row.match_id) && !selectedSet.has(row.match_id));

  for (const chunk of chunkList(rowsToRemove, 80)) {
    await writeSupabaseAdmin(
      `site_featured_matches?match_id=in.(${chunk.map((row) => encodeURIComponent(row.match_id)).join(",")})`,
      { method: "DELETE" }
    );
  }

  const ordered = orderedSelectedMatches(formData, selectedIds);
  const now = new Date().toISOString();
  const rowsToInsert: Array<{ id: string; match_id: string; sort_order: number; created_at: string; updated_at: string }> = [];

  for (const item of ordered) {
    const current = currentByMatchId.get(item.match_id);

    if (current) {
      await writeSupabaseAdmin(`site_featured_matches?id=eq.${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          sort_order: item.sort_order,
          updated_at: now
        })
      });
    } else {
      rowsToInsert.push({
        id: randomUUID(),
        match_id: item.match_id,
        sort_order: item.sort_order,
        created_at: now,
        updated_at: now
      });
    }
  }

  if (rowsToInsert.length > 0) {
    await writeSupabaseAdmin("site_featured_matches", {
      method: "POST",
      body: JSON.stringify(rowsToInsert)
    });
  }

  return redirectTo(request, { saved: "games", ...gameFilterParams(formData) }, contextAnchors.games);
}

function hasFinalZoneContent(payload: Record<string, string | number | null>) {
  return Boolean(payload.time_label || payload.title || payload.subtitle || payload.image_url || payload.link_url);
}

function hasHighlightContent(payload: Record<string, string | number | null>) {
  return Boolean(payload.label || payload.title || payload.subtitle || payload.image_url || payload.link_url);
}

function hasRoundupContent(payload: Record<string, string | number | null>) {
  return Boolean(payload.label || payload.title || payload.subtitle || payload.image_url || payload.video_url || payload.duration);
}

async function updateHighlights(request: Request, formData: FormData) {
  const siteEditorialId = cleanText(formData.get("site_editorial_id"));
  if (!siteEditorialId) {
    throw new HomeEditorialAdminError("missing-home-editorial");
  }

  await ensureHomeEditorialExists(siteEditorialId);

  const currentRows = await fetchSupabaseAdminTable<SiteEditorialHighlightRow>(
    `site_editorial_highlights?select=id,site_editorial_id,sort_order&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&limit=1000`
  );
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const rowKeys = formData.getAll("highlight_row").filter((value): value is string => typeof value === "string");
  const now = new Date().toISOString();

  for (const [index, rowKey] of rowKeys.entries()) {
    const rowId = cleanText(formData.get(`highlight_${rowKey}_id`));
    const sortOrder = cleanInteger(formData.get(`highlight_${rowKey}_sort_order`)) ?? index + 1;
    const payload = {
      sort_order: sortOrder,
      label: cleanText(formData.get(`highlight_${rowKey}_label`)),
      label_color: cleanColor(cleanText(formData.get(`highlight_${rowKey}_label_color`))),
      title: cleanText(formData.get(`highlight_${rowKey}_title`)),
      subtitle: cleanText(formData.get(`highlight_${rowKey}_subtitle`)),
      image_url: cleanText(formData.get(`highlight_${rowKey}_image_url`)),
      link_url: cleanText(formData.get(`highlight_${rowKey}_link_url`)),
      status: cleanStatus(cleanText(formData.get(`highlight_${rowKey}_status`))),
      updated_at: now
    };

    if (rowId) {
      if (!currentById.has(rowId)) {
        throw new HomeEditorialAdminError("invalid-highlight-item");
      }

      await writeSupabaseAdmin(
        `site_editorial_highlights?id=eq.${encodeURIComponent(rowId)}&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      continue;
    }

    if (!hasHighlightContent(payload)) {
      continue;
    }

    await writeSupabaseAdmin("site_editorial_highlights", {
      method: "POST",
      body: JSON.stringify({
        id: randomUUID(),
        site_editorial_id: siteEditorialId,
        created_at: now,
        ...payload
      })
    });
  }

  return redirectTo(request, { saved: "highlights" }, contextAnchors.highlights);
}

async function updateHighlightItem(request: Request, formData: FormData) {
  const siteEditorialId = cleanText(formData.get("site_editorial_id"));
  const returnAnchor = cleanReturnAnchor(formData.get("return_anchor"));
  if (!siteEditorialId) {
    throw new HomeEditorialAdminError("missing-home-editorial");
  }

  await ensureHomeEditorialExists(siteEditorialId);

  const rowKey = cleanText(formData.get("highlight_row"));
  if (!rowKey) {
    throw new HomeEditorialAdminError("invalid-highlight-item");
  }

  const rowId = cleanText(formData.get(`highlight_${rowKey}_id`));
  const sortOrder = cleanInteger(formData.get(`highlight_${rowKey}_sort_order`)) ?? 1;
  const now = new Date().toISOString();
  const payload = {
    sort_order: sortOrder,
    label: cleanText(formData.get(`highlight_${rowKey}_label`)),
    label_color: cleanColor(cleanText(formData.get(`highlight_${rowKey}_label_color`))),
    title: cleanText(formData.get(`highlight_${rowKey}_title`)),
    subtitle: cleanText(formData.get(`highlight_${rowKey}_subtitle`)),
    image_url: cleanText(formData.get(`highlight_${rowKey}_image_url`)),
    link_url: cleanText(formData.get(`highlight_${rowKey}_link_url`)),
    status: cleanStatus(cleanText(formData.get(`highlight_${rowKey}_status`))),
    updated_at: now
  };

  if (rowId) {
    const currentRows = await fetchSupabaseAdminTable<SiteEditorialHighlightRow>(
      `site_editorial_highlights?select=id,site_editorial_id,sort_order&id=eq.${encodeURIComponent(
        rowId
      )}&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&limit=1`
    );

    if (!currentRows[0]) {
      throw new HomeEditorialAdminError("invalid-highlight-item");
    }

    await writeSupabaseAdmin(
      `site_editorial_highlights?id=eq.${encodeURIComponent(rowId)}&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
  } else {
    if (!hasHighlightContent(payload)) {
      throw new HomeEditorialAdminError("empty-highlight-item");
    }

    await writeSupabaseAdmin("site_editorial_highlights", {
      method: "POST",
      body: JSON.stringify({
        id: randomUUID(),
        site_editorial_id: siteEditorialId,
        created_at: now,
        ...payload
      })
    });
  }

  return redirectTo(request, {
    saved: "highlights",
    ...(returnAnchor ? { item: returnAnchor } : {})
  }, returnAnchor ?? contextAnchors.highlights);
}

async function updateRoundupItems(request: Request, formData: FormData) {
  const siteEditorialId = cleanText(formData.get("site_editorial_id"));
  const returnAnchor = cleanReturnAnchor(formData.get("return_anchor"));
  if (!siteEditorialId) {
    throw new HomeEditorialAdminError("missing-home-editorial");
  }

  await ensureHomeEditorialExists(siteEditorialId);

  const currentRows = await fetchSupabaseAdminTable<SiteEditorialRoundupItemRow>(
    `site_editorial_roundup_items?select=id,site_editorial_id,sort_order&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&limit=1000`
  );
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const rowKeys = formData.getAll("roundup_row").filter((value): value is string => typeof value === "string");
  const now = new Date().toISOString();

  for (const [index, rowKey] of rowKeys.entries()) {
    const rowId = cleanText(formData.get(`roundup_${rowKey}_id`));
    const sortOrder = cleanInteger(formData.get(`roundup_${rowKey}_sort_order`)) ?? index + 1;
    const payload = {
      sort_order: sortOrder,
      type: cleanRoundupType(cleanText(formData.get(`roundup_${rowKey}_type`))),
      label: cleanText(formData.get(`roundup_${rowKey}_label`)),
      title: cleanText(formData.get(`roundup_${rowKey}_title`)),
      subtitle: cleanText(formData.get(`roundup_${rowKey}_subtitle`)),
      image_url: cleanText(formData.get(`roundup_${rowKey}_image_url`)),
      video_url: cleanText(formData.get(`roundup_${rowKey}_video_url`)),
      duration: cleanText(formData.get(`roundup_${rowKey}_duration`)),
      status: cleanStatus(cleanText(formData.get(`roundup_${rowKey}_status`))),
      updated_at: now
    };

    if (rowId) {
      if (!currentById.has(rowId)) {
        throw new HomeEditorialAdminError("invalid-roundup-item");
      }

      await writeSupabaseAdmin(
        `site_editorial_roundup_items?id=eq.${encodeURIComponent(rowId)}&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      continue;
    }

    if (!hasRoundupContent(payload)) {
      continue;
    }

    await writeSupabaseAdmin("site_editorial_roundup_items", {
      method: "POST",
      body: JSON.stringify({
        id: randomUUID(),
        site_editorial_id: siteEditorialId,
        created_at: now,
        ...payload
      })
    });
  }

  return redirectTo(request, {
    saved: "roundup",
    ...(returnAnchor ? { item: returnAnchor } : {})
  }, returnAnchor ?? contextAnchors.roundup);
}

async function updateFinalZone(request: Request, formData: FormData) {
  const siteEditorialId = cleanText(formData.get("site_editorial_id"));
  const returnAnchor = cleanReturnAnchor(formData.get("return_anchor"));
  if (!siteEditorialId) {
    throw new HomeEditorialAdminError("missing-home-editorial");
  }

  await ensureHomeEditorialExists(siteEditorialId);

  const currentRows = await fetchSupabaseAdminTable<SiteEditorialLatestNewsRow>(
    `site_editorial_latest_news?select=id,site_editorial_id,sort_order&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&limit=1000`
  );
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const rowKeys = formData.getAll("final_news_row").filter((value): value is string => typeof value === "string");
  const now = new Date().toISOString();

  for (const [index, rowKey] of rowKeys.entries()) {
    const rowId = cleanText(formData.get(`final_news_${rowKey}_id`));
    const sortOrder = cleanInteger(formData.get(`final_news_${rowKey}_sort_order`)) ?? index + 1;
    const payload = {
      sort_order: sortOrder,
      time_label: cleanText(formData.get(`final_news_${rowKey}_time_label`)),
      time_label_color: cleanColor(cleanText(formData.get(`final_news_${rowKey}_time_label_color`))),
      title: cleanText(formData.get(`final_news_${rowKey}_title`)),
      subtitle: cleanText(formData.get(`final_news_${rowKey}_subtitle`)),
      image_url: cleanText(formData.get(`final_news_${rowKey}_image_url`)),
      link_url: cleanText(formData.get(`final_news_${rowKey}_link_url`)),
      status: cleanStatus(cleanText(formData.get(`final_news_${rowKey}_status`))),
      updated_at: now
    };

    if (rowId) {
      if (!currentById.has(rowId)) {
        throw new HomeEditorialAdminError("invalid-final-zone-item");
      }

      await writeSupabaseAdmin(
        `site_editorial_latest_news?id=eq.${encodeURIComponent(rowId)}&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      continue;
    }

    if (!hasFinalZoneContent(payload)) {
      continue;
    }

    await writeSupabaseAdmin("site_editorial_latest_news", {
      method: "POST",
      body: JSON.stringify({
        id: randomUUID(),
        site_editorial_id: siteEditorialId,
        created_at: now,
        ...payload
      })
    });
  }

  return redirectTo(request, {
    saved: "final-zone",
    ...(returnAnchor ? { item: returnAnchor } : {})
  }, returnAnchor ?? contextAnchors["final-zone"]);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const actionType = cleanText(formData.get("action_type"));
  const saveContext = actionType === "update_featured_matches"
    ? "games"
    : actionType === "update_highlight_item"
      ? "highlights"
    : actionType === "update_highlights"
      ? "highlights"
    : actionType === "update_roundup_items"
      ? "roundup"
    : actionType === "update_final_zone"
      ? "final-zone"
    : cleanSaveContext(cleanText(formData.get("save_context"))) ?? "headline";

  if (
    actionType !== "update_site_editorial_home" &&
    actionType !== "update_featured_matches" &&
    actionType !== "update_highlight_item" &&
    actionType !== "update_highlights" &&
    actionType !== "update_roundup_items" &&
    actionType !== "update_final_zone"
  ) {
    return redirectTo(request, { error: "invalid-action", failed: saveContext }, contextAnchors[saveContext]);
  }

  try {
    if (actionType === "update_featured_matches") {
      return await updateFeaturedMatches(request, formData);
    }
    if (actionType === "update_highlight_item") {
      return await updateHighlightItem(request, formData);
    }
    if (actionType === "update_highlights") {
      return await updateHighlights(request, formData);
    }
    if (actionType === "update_roundup_items") {
      return await updateRoundupItems(request, formData);
    }
    if (actionType === "update_final_zone") {
      return await updateFinalZone(request, formData);
    }

    const siteEditorialId = cleanText(formData.get("site_editorial_id"));
    if (!siteEditorialId) {
      throw new HomeEditorialAdminError("missing-home-editorial");
    }

    await ensureHomeEditorialExists(siteEditorialId);

    await writeSupabaseAdmin(
      `site_editorials?id=eq.${encodeURIComponent(siteEditorialId)}&slug=eq.home`,
      {
        method: "PATCH",
        body: JSON.stringify(buildPayload(formData))
      }
    );

    return redirectTo(request, { saved: saveContext }, contextAnchors[saveContext]);
  } catch (error) {
    const returnAnchor = cleanReturnAnchor(formData.get("return_anchor"));

    return redirectTo(request, {
      error: classifyError(error),
      failed: saveContext,
      detail: sanitizeErrorText(error instanceof Error ? error.message : String(error)),
      ...(saveContext === "games" ? gameFilterParams(formData) : {}),
      ...(returnAnchor ? { item: returnAnchor } : {})
    }, returnAnchor ?? contextAnchors[saveContext]);
  }
}
