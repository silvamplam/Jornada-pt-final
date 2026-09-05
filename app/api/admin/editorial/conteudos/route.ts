import { NextResponse } from "next/server";

import { adminRelativeRedirect, adminRelativeUrl } from "@/lib/admin-relative-redirect";

import { syncEditorialContentSnapshots } from "@/lib/editorial-content-snapshot-sync";
import { fetchSupabaseAdminTable, writeSupabaseAdmin, writeSupabaseAdminReturning } from "@/lib/supabase";

type EditorialContentIdRow = {
  id: string;
  slug: string | null;
};

type EditorialContentSeasonContextRow = {
  id: string;
  competition_id: string | null;
};

type EditorialContentMatchdayContextRow = {
  id: string;
  season_id: string | null;
};

type EditorialContentPayload = {
  slug: string;
  status: "draft" | "published" | "archived";
  scope: "home" | "matchday" | "competition" | "general";
  content_type: "video" | "reportagem" | "entrevista" | "especial";
  label: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: string | null;
  author: string | null;
  image_url: string | null;
  image_caption: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  video_provider: string | null;
  embed_url: string | null;
  duration: string | null;
  is_embeddable: boolean;
  published_at: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
};

class EditorialContentAdminError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const allowedStatuses = new Set(["draft", "published", "archived"]);
const allowedScopes = new Set(["home", "matchday", "competition", "general"]);
const allowedContentTypes = new Set(["video", "reportagem", "entrevista", "especial"]);

function cleanText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim();
  return cleanValue.length > 0 ? cleanValue : null;
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanStatus(value: string | null): EditorialContentPayload["status"] {
  if (!value || !allowedStatuses.has(value)) {
    throw new EditorialContentAdminError("invalid-status");
  }

  return value as EditorialContentPayload["status"];
}

function cleanScope(value: string | null): EditorialContentPayload["scope"] {
  if (!value || !allowedScopes.has(value)) {
    throw new EditorialContentAdminError("invalid-scope");
  }

  return value as EditorialContentPayload["scope"];
}

function cleanContentType(value: string | null): EditorialContentPayload["content_type"] {
  if (!value || !allowedContentTypes.has(value)) {
    throw new EditorialContentAdminError("invalid-content-type");
  }

  return value as EditorialContentPayload["content_type"];
}

function normalizePublishedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new EditorialContentAdminError("invalid-published-at");
  }

  return date.toISOString();
}

function redirectTo(_request: Request, path: string, params: Record<string, string>) {
  const url = adminRelativeUrl(path);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return adminRelativeRedirect(url);
}

async function readSlugRows(slug: string) {
  return fetchSupabaseAdminTable<EditorialContentIdRow>(
    `editorial_contents?select=id,slug&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  ).catch(() => []);
}

async function uniqueSlug(baseSlug: string, currentContentId: string | null) {
  let candidate = baseSlug;

  for (let suffix = 1; suffix <= 50; suffix += 1) {
    const rows = await readSlugRows(candidate);
    const existing = rows[0] ?? null;

    if (!existing || existing.id === currentContentId) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix + 1}`;
  }

  return `${baseSlug}-${Date.now()}`;
}

async function readExistingContent(contentId: string) {
  const rows = await fetchSupabaseAdminTable<EditorialContentIdRow>(
    `editorial_contents?select=id,slug&id=eq.${encodeURIComponent(contentId)}&limit=1`,
  );

  const content = rows[0] ?? null;
  if (!content?.id) {
    throw new EditorialContentAdminError("missing-content");
  }

  return content;
}

async function readSeasonContext(seasonId: string) {
  const rows = await fetchSupabaseAdminTable<EditorialContentSeasonContextRow>(
    `seasons?select=id,competition_id&id=eq.${encodeURIComponent(seasonId)}&limit=1`,
  );

  const season = rows[0] ?? null;
  if (!season?.id) {
    throw new EditorialContentAdminError("invalid-scope");
  }

  return season;
}

async function readMatchdayContext(matchdayId: string) {
  const rows = await fetchSupabaseAdminTable<EditorialContentMatchdayContextRow>(
    `matchdays?select=id,season_id&id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
  );

  const matchday = rows[0] ?? null;
  if (!matchday?.id) {
    throw new EditorialContentAdminError("invalid-scope");
  }

  return matchday;
}

async function normalizeEditorialContentContext(
  submittedScope: EditorialContentPayload["scope"],
  submittedCompetitionId: string | null,
  submittedSeasonId: string | null,
  submittedMatchdayId: string | null,
) {
  let competitionId = submittedCompetitionId;
  let seasonId = submittedSeasonId;
  const matchdayId = submittedMatchdayId;

  if (matchdayId) {
    const matchday = await readMatchdayContext(matchdayId);
    if (!matchday.season_id) {
      throw new EditorialContentAdminError("invalid-scope");
    }
    if (seasonId && seasonId !== matchday.season_id) {
      throw new EditorialContentAdminError("invalid-scope");
    }
    seasonId = matchday.season_id;
  }

  if (seasonId) {
    const season = await readSeasonContext(seasonId);
    if (!season.competition_id) {
      throw new EditorialContentAdminError("invalid-scope");
    }
    if (competitionId && competitionId !== season.competition_id) {
      throw new EditorialContentAdminError("invalid-scope");
    }
    competitionId = season.competition_id;
  }

  if (matchdayId) {
    return { scope: "matchday" as const, competitionId, seasonId, matchdayId };
  }

  if (competitionId || seasonId) {
    return { scope: "competition" as const, competitionId, seasonId, matchdayId: null };
  }

  if (submittedScope === "competition" || submittedScope === "matchday") {
    throw new EditorialContentAdminError("invalid-scope");
  }

  return { scope: submittedScope === "general" ? "home" : submittedScope, competitionId: null, seasonId: null, matchdayId: null };
}

async function buildPayload(
  formData: FormData,
  currentContentId: string | null,
  currentSlug: string | null = null,
): Promise<EditorialContentPayload> {
  const title = cleanText(formData.get("title"));
  if (!title) {
    throw new EditorialContentAdminError("missing-title");
  }

  const submittedSlug = cleanText(formData.get("slug"));
  const baseSlug = normalizeSlug(submittedSlug ?? currentSlug ?? title);
  if (!baseSlug) {
    throw new EditorialContentAdminError("missing-slug");
  }

  const status = cleanStatus(cleanText(formData.get("status")) ?? "draft");
  const submittedScope = cleanScope(cleanText(formData.get("scope")) ?? "home");
  const contentType = cleanContentType(cleanText(formData.get("content_type")) ?? "video");
  const submittedCompetitionId = cleanText(formData.get("competition_id"));
  const submittedSeasonId = cleanText(formData.get("season_id"));
  const submittedMatchdayId = cleanText(formData.get("matchday_id"));
  const { scope, competitionId, seasonId, matchdayId } = await normalizeEditorialContentContext(
    submittedScope,
    submittedCompetitionId,
    submittedSeasonId,
    submittedMatchdayId,
  );
  let publishedAt = normalizePublishedAt(cleanText(formData.get("published_at")));

  if (status === "published" && !publishedAt) {
    publishedAt = new Date().toISOString();
  }

  return {
    slug: await uniqueSlug(baseSlug, currentContentId),
    status,
    scope,
    content_type: contentType,
    label: cleanText(formData.get("label")),
    title,
    subtitle: cleanText(formData.get("subtitle")),
    summary: cleanText(formData.get("summary")),
    body: cleanText(formData.get("body")),
    author: cleanText(formData.get("author")),
    image_url: cleanText(formData.get("image_url")),
    image_caption: cleanText(formData.get("image_caption")),
    thumbnail_url: cleanText(formData.get("thumbnail_url")),
    video_url: cleanText(formData.get("video_url")),
    video_provider: cleanText(formData.get("video_provider")),
    embed_url: cleanText(formData.get("embed_url")),
    duration: cleanText(formData.get("duration")),
    is_embeddable: cleanText(formData.get("is_embeddable")) === "true",
    published_at: publishedAt,
    competition_id: competitionId,
    season_id: seasonId,
    matchday_id: matchdayId,
  };
}

function errorCode(error: unknown) {
  return error instanceof EditorialContentAdminError ? error.code : "save-failed";
}

async function updateContent(formData: FormData) {
  const contentId = cleanText(formData.get("content_id"));
  if (!contentId) {
    throw new EditorialContentAdminError("missing-content");
  }

  const existing = await readExistingContent(contentId);
  const payload = await buildPayload(formData, contentId, existing.slug);

  await writeSupabaseAdmin(`editorial_contents?id=eq.${encodeURIComponent(contentId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  await syncEditorialContentSnapshots({
    contentId,
    previousSlug: existing.slug,
  });

  return { contentId, status: payload.status };
}

export async function POST(request: Request) {
  let failurePath = "/admin/editorial/conteudos?mode=novo";

  try {
    const formData = await request.formData();
    const actionType = cleanText(formData.get("action_type"));

    if (actionType === "update_content") {
      const submittedContentId = cleanText(formData.get("content_id"));
      if (submittedContentId) {
        failurePath = `/admin/editorial/conteudos?contentId=${encodeURIComponent(submittedContentId)}`;
      }

      const { contentId, status } = await updateContent(formData);

      return redirectTo(request, "/admin/editorial/conteudos", {
        contentId,
        [status === "archived" ? "archived" : "updated"]: "1",
      });
    }

    if (actionType !== "create_content") {
      return redirectTo(request, "/admin/editorial/conteudos?mode=novo", { error: "invalid-action" });
    }

    failurePath = "/admin/editorial/conteudos?mode=novo";
    const payload = await buildPayload(formData, null);
    const rows = await writeSupabaseAdminReturning<EditorialContentIdRow>("editorial_contents?select=id,slug", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const created = rows[0] ?? null;
    if (!created?.id) {
      throw new EditorialContentAdminError("save-failed");
    }
    await syncEditorialContentSnapshots({ contentId: created.id });

    return redirectTo(request, "/admin/editorial/conteudos", { created: "1", contentId: created.id });
  } catch (error) {
    return redirectTo(request, failurePath, { error: errorCode(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const formData = await request.formData();
    const { contentId, status } = await updateContent(formData);

    return NextResponse.json({
      ok: true,
      redirect: `/admin/editorial/conteudos?contentId=${encodeURIComponent(contentId)}&${
        status === "archived" ? "archived" : "updated"
      }=1`,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorCode(error) }, { status: 400 });
  }
}
