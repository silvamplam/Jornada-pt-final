import { randomUUID } from "crypto";

import {
  ARTICLE_ADMIN_PATH,
  articleAdminRedirect,
  isArticleAdminUuid,
  safeArticleAdminReturnTo,
} from "@/lib/admin-article-redirect";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

type ArticleIdRow = {
  id: string;
};

type ArticleStatusRow = {
  id: string;
  status: string | null;
};

type CreatedArticleRow = {
  id: string;
  slug: string | null;
};

type ArticleDeleteRow = {
  id: string;
  slug: string | null;
  title: string | null;
};

type ArticleSlugRow = {
  id: string;
  slug: string | null;
};

type CompetitionContextRow = {
  id: string;
};

type SeasonContextRow = {
  id: string;
  competition_id: string | null;
};

type MatchdayContextRow = {
  id: string;
  season_id: string | null;
};

type ArticlePayload = {
  title: string;
  slug: string;
  status: "draft" | "published";
  scope: ArticleScope;
  label: string | null;
  author: string | null;
  subtitle: string | null;
  body: string;
  image_url: string | null;
  image_caption: string | null;
  published_at: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
};

type ArticleScope = "home" | "competition" | "matchday" | "general";
type EditorialAction = "save" | "publish";

type LinkRemovalTarget =
  | "matchday_editorials"
  | "matchday_highlights"
  | "matchday_latest_news"
  | "matchday_reference_composition_items"
  | "site_editorials"
  | "site_editorial_highlights"
  | "site_editorial_latest_news";

type LinkRemovalField =
  | "headline_link_url"
  | "complementary_link_url"
  | "side_block_link_url"
  | "link_url"
  | "link_url_snapshot";

type LinkValueRow = {
  id: string;
  headline_link_url?: string | null;
  complementary_link_url?: string | null;
  side_block_link_url?: string | null;
  link_url?: string | null;
  link_url_snapshot?: string | null;
};

class ArticleAdminError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

const allowedLinkRemovalTargets: Record<LinkRemovalTarget, LinkRemovalField[]> = {
  matchday_editorials: ["headline_link_url", "complementary_link_url", "side_block_link_url"],
  matchday_highlights: ["link_url"],
  matchday_latest_news: ["link_url"],
  matchday_reference_composition_items: ["link_url_snapshot"],
  site_editorials: ["headline_link_url", "complementary_link_url", "side_block_link_url"],
  site_editorial_highlights: ["link_url"],
  site_editorial_latest_news: ["link_url"],
};

type ParsedSupabaseError = {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
};

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

function cleanStatus(value: string | null): "draft" | "published" {
  return value === "published" ? "published" : "draft";
}

function cleanEditorialAction(value: string | null): EditorialAction {
  return value === "publish" ? "publish" : "save";
}

function normalizePublishedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ArticleAdminError("invalid-published-at");
  }

  return date.toISOString();
}

function createInsertPayload(payload: ArticlePayload) {
  const now = new Date().toISOString();
  return Object.fromEntries(
    Object.entries({
      id: randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
    }).filter(([, value]) => value !== null),
  );
}

function sanitizeErrorText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey[=:]\s*[A-Za-z0-9._-]+/gi, "apikey=[redacted]")
    .trim()
    .slice(0, 260);
}

function parseSupabaseError(error: unknown): ParsedSupabaseError {
  const raw = error instanceof Error ? error.message : String(error);

  try {
    const parsed = JSON.parse(raw) as Partial<ParsedSupabaseError>;
    return {
      code: sanitizeErrorText(parsed.code) || "supabase-error",
      message: sanitizeErrorText(parsed.message) || "Erro Supabase.",
      details: sanitizeErrorText(parsed.details) || null,
      hint: sanitizeErrorText(parsed.hint) || null,
    };
  } catch {
    return {
      code: "supabase-error",
      message: sanitizeErrorText(raw) || "Erro Supabase.",
      details: null,
      hint: null,
    };
  }
}

function classifySupabaseError(error: ParsedSupabaseError) {
  if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
    return "duplicate-slug";
  }
  if (error.code === "23502" || /null value|not-null/i.test(error.message)) {
    return "required-field";
  }
  if (error.code === "23514" || /check constraint/i.test(error.message)) {
    return "constraint";
  }
  if (error.code === "42501" || /permission|rls|policy/i.test(error.message)) {
    return "permission";
  }

  return "supabase-error";
}

function supabaseDetailText(error: ParsedSupabaseError) {
  const pieces = [
    error.message ? `message: ${error.message}` : null,
    error.code ? `code: ${error.code}` : null,
    error.details ? `details: ${error.details}` : null,
    error.hint ? `hint: ${error.hint}` : null,
  ].filter(Boolean);

  return pieces.join(" | ");
}

async function assertSlugAvailable(slug: string, currentArticleId: string | null) {
  const rows = await fetchSupabaseAdminTable<ArticleIdRow>(
    `editorial_articles?select=id&slug=eq.${encodeURIComponent(slug)}&limit=2`,
  );

  const collision = rows.find((row) => row.id !== currentArticleId);
  if (collision) {
    throw new ArticleAdminError("duplicate-slug");
  }
}

async function readArticleStatus(articleId: string) {
  const rows = await fetchSupabaseAdminTable<ArticleStatusRow>(
    `editorial_articles?select=id,status&id=eq.${encodeURIComponent(articleId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function readArticleForDelete(articleId: string) {
  const rows = await fetchSupabaseAdminTable<ArticleDeleteRow>(
    `editorial_articles?select=id,slug,title&id=eq.${encodeURIComponent(articleId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function readArticleBySlug(slug: string) {
  const rows = await fetchSupabaseAdminTable<ArticleSlugRow>(
    `editorial_articles?select=id,slug&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function readCompetition(competitionId: string) {
  const rows = await fetchSupabaseAdminTable<CompetitionContextRow>(
    `competitions?select=id&id=eq.${encodeURIComponent(competitionId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function readSeason(seasonId: string) {
  const rows = await fetchSupabaseAdminTable<SeasonContextRow>(
    `seasons?select=id,competition_id&id=eq.${encodeURIComponent(seasonId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function readMatchday(matchdayId: string) {
  const rows = await fetchSupabaseAdminTable<MatchdayContextRow>(
    `matchdays?select=id,season_id&id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function normalizeContextIds(formData: FormData) {
  let competitionId = cleanText(formData.get("competition_id"));
  let seasonId = cleanText(formData.get("season_id"));
  const matchdayId = cleanText(formData.get("matchday_id"));

  if (competitionId && !(await readCompetition(competitionId))) {
    throw new ArticleAdminError("invalid-context");
  }

  if (matchdayId) {
    const matchday = await readMatchday(matchdayId);
    if (!matchday?.season_id) {
      throw new ArticleAdminError("invalid-context");
    }

    if (seasonId && matchday.season_id !== seasonId) {
      throw new ArticleAdminError("invalid-context");
    }

    seasonId = seasonId ?? matchday.season_id;
  }

  if (seasonId) {
    const season = await readSeason(seasonId);
    if (!season?.competition_id) {
      throw new ArticleAdminError("invalid-context");
    }

    if (competitionId && season.competition_id !== competitionId) {
      throw new ArticleAdminError("invalid-context");
    }

    competitionId = competitionId ?? season.competition_id;
  }

  return {
    competition_id: competitionId,
    season_id: seasonId,
    matchday_id: matchdayId,
  };
}

function scopeForContext(context: {
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
}): ArticleScope {
  if (context.matchday_id) {
    return "matchday";
  }

  if (context.competition_id || context.season_id) {
    return "competition";
  }

  return "home";
}

function cleanUuid(value: FormDataEntryValue | null) {
  const cleanValue = cleanText(value);
  if (!isArticleAdminUuid(cleanValue)) {
    throw new ArticleAdminError("invalid-link-target");
  }

  return cleanValue;
}

function cleanArticleId(value: FormDataEntryValue | null) {
  const articleId = cleanText(value);
  if (!articleId) {
    throw new ArticleAdminError("missing-article");
  }
  if (!isArticleAdminUuid(articleId)) {
    throw new ArticleAdminError("invalid-article");
  }

  return articleId;
}

function optionalArticleId(value: FormDataEntryValue | null) {
  const articleId = cleanText(value);
  return isArticleAdminUuid(articleId) ? articleId : null;
}

function cleanLinkRemovalTarget(table: string | null, field: string | null) {
  if (!table || !field || !(table in allowedLinkRemovalTargets)) {
    throw new ArticleAdminError("invalid-link-target");
  }

  const typedTable = table as LinkRemovalTarget;
  if (!allowedLinkRemovalTargets[typedTable].includes(field as LinkRemovalField)) {
    throw new ArticleAdminError("invalid-link-target");
  }

  return {
    table: typedTable,
    field: field as LinkRemovalField,
  };
}

function publicArticlePath(slug: string) {
  return `/noticias/${encodeURIComponent(slug)}`;
}

async function readLinkTargetValue(target: { table: LinkRemovalTarget; field: LinkRemovalField }, targetId: string) {
  const rows = await fetchSupabaseAdminTable<LinkValueRow>(
    `${target.table}?select=id,${target.field}&id=eq.${encodeURIComponent(targetId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function articleHasActiveLinks(slug: string) {
  const expectedUrl = publicArticlePath(slug);
  const encodedUrl = encodeURIComponent(expectedUrl);
  const queries = [
    `matchday_editorials?select=id&headline_link_url=eq.${encodedUrl}&limit=1`,
    `matchday_editorials?select=id&complementary_link_url=eq.${encodedUrl}&limit=1`,
    `matchday_editorials?select=id&side_block_link_url=eq.${encodedUrl}&limit=1`,
    `matchday_highlights?select=id&link_url=eq.${encodedUrl}&limit=1`,
    `matchday_latest_news?select=id&link_url=eq.${encodedUrl}&limit=1`,
    `matchday_reference_composition_items?select=id&link_url_snapshot=eq.${encodedUrl}&limit=1`,
    `site_editorials?select=id&headline_link_url=eq.${encodedUrl}&limit=1`,
    `site_editorials?select=id&complementary_link_url=eq.${encodedUrl}&limit=1`,
    `site_editorials?select=id&side_block_link_url=eq.${encodedUrl}&limit=1`,
    `site_editorial_highlights?select=id&link_url=eq.${encodedUrl}&limit=1`,
    `site_editorial_latest_news?select=id&link_url=eq.${encodedUrl}&limit=1`,
  ];

  const linkRows = await Promise.all(queries.map((query) => fetchSupabaseAdminTable<ArticleIdRow>(query)));
  return linkRows.some((rows) => rows.length > 0);
}

async function buildPayload(
  formData: FormData,
  currentArticleId: string | null,
  targetStatus: "draft" | "published",
): Promise<ArticlePayload> {
  const title = cleanText(formData.get("title"));
  if (!title) {
    throw new ArticleAdminError("missing-title");
  }

  const slug = normalizeSlug(cleanText(formData.get("slug")) ?? title);
  if (!slug) {
    throw new ArticleAdminError("missing-slug");
  }

  await assertSlugAvailable(slug, currentArticleId);

  const subtitle = cleanText(formData.get("subtitle"));
  const body = cleanText(formData.get("body")) ?? "";
  const imageUrl = cleanText(formData.get("image_url"));
  if (targetStatus === "published" && !subtitle) {
    throw new ArticleAdminError("missing-post-title");
  }
  if (targetStatus === "published" && !body) {
    throw new ArticleAdminError("missing-body");
  }
  if (targetStatus === "published" && !imageUrl) {
    throw new ArticleAdminError("missing-image");
  }

  let publishedAt = normalizePublishedAt(cleanText(formData.get("published_at")));

  if (targetStatus === "published" && !publishedAt) {
    publishedAt = new Date().toISOString();
  }

  const context = await normalizeContextIds(formData);
  const scope = scopeForContext(context);

  return {
    title,
    slug,
    status: targetStatus,
    scope,
    label: cleanText(formData.get("label")),
    author: cleanText(formData.get("author")),
    subtitle,
    body,
    image_url: imageUrl,
    image_caption: cleanText(formData.get("image_caption")),
    published_at: publishedAt,
    competition_id: context.competition_id,
    season_id: context.season_id,
    matchday_id: context.matchday_id,
  };
}

async function createArticle(formData: FormData) {
  const editorialAction = cleanEditorialAction(cleanText(formData.get("editorial_action")));
  const targetStatus = editorialAction === "publish" ? "published" : "draft";
  const payload = await buildPayload(formData, null, targetStatus);
  const rows = await writeSupabaseAdminReturning<CreatedArticleRow>("editorial_articles?select=id,slug", {
    method: "POST",
    body: JSON.stringify(createInsertPayload(payload)),
  });

  const created = rows[0];
  if (!created?.id || !isArticleAdminUuid(created.id)) {
    throw new ArticleAdminError("save-failed");
  }

  const returnTo = safeArticleAdminReturnTo(cleanText(formData.get("return_to"))) ?? ARTICLE_ADMIN_PATH;
  return articleAdminRedirect(
    returnTo,
    editorialAction === "publish"
      ? { articleId: created.id, published: "1" }
      : { articleId: created.id, created: "1" },
  );
}

async function updateArticle(formData: FormData) {
  const articleId = cleanArticleId(formData.get("article_id"));

  const currentArticle = await readArticleStatus(articleId);
  if (!currentArticle) {
    throw new ArticleAdminError("missing-article");
  }

  const editorialAction = cleanEditorialAction(cleanText(formData.get("editorial_action")));
  const targetStatus = editorialAction === "publish"
    ? "published"
    : cleanStatus(currentArticle.status);
  const payload = await buildPayload(formData, articleId, targetStatus);
  await writeSupabaseAdmin(`editorial_articles?id=eq.${encodeURIComponent(articleId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      updated_at: new Date().toISOString(),
    }),
  });

  const returnTo = safeArticleAdminReturnTo(cleanText(formData.get("return_to"))) ?? `${ARTICLE_ADMIN_PATH}?articleId=${encodeURIComponent(articleId)}`;
  return articleAdminRedirect(
    returnTo,
    editorialAction === "publish"
      ? { articleId, published: "1" }
      : { articleId, saved: "1" },
  );
}

async function deleteArticle(formData: FormData) {
  const articleId = cleanArticleId(formData.get("article_id"));
  if (cleanText(formData.get("confirm_delete")) !== "yes") {
    throw new ArticleAdminError("delete-not-confirmed");
  }

  const article = await readArticleForDelete(articleId);
  if (!article) {
    throw new ArticleAdminError("missing-article");
  }

  if (article.slug && (await articleHasActiveLinks(article.slug))) {
    throw new ArticleAdminError("article-has-links");
  }

  await writeSupabaseAdmin(`editorial_articles?id=eq.${encodeURIComponent(article.id)}`, {
    method: "DELETE",
  });

  return articleAdminRedirect(ARTICLE_ADMIN_PATH, { removed: "1" });
}

async function removeArticleLink(formData: FormData) {
  const slug = normalizeSlug(cleanText(formData.get("slug")) ?? "");
  if (!slug) {
    throw new ArticleAdminError("missing-article");
  }

  const article = await readArticleBySlug(slug);
  if (!article?.slug) {
    throw new ArticleAdminError("missing-article");
  }

  const target = cleanLinkRemovalTarget(cleanText(formData.get("target_table")), cleanText(formData.get("target_field")));
  const targetId = cleanUuid(formData.get("target_id"));
  const expectedUrl = publicArticlePath(article.slug);
  const submittedExpectedUrl = cleanText(formData.get("expected_url"));

  if (submittedExpectedUrl && submittedExpectedUrl !== expectedUrl) {
    throw new ArticleAdminError("link-mismatch");
  }

  const row = await readLinkTargetValue(target, targetId);
  if (!row) {
    throw new ArticleAdminError("missing-link-target");
  }

  const currentValue = row[target.field];
  if (currentValue !== expectedUrl) {
    throw new ArticleAdminError("link-mismatch");
  }

  await writeSupabaseAdmin(`${target.table}?id=eq.${encodeURIComponent(targetId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      [target.field]: null,
    }),
  });

  const returnTo = safeArticleAdminReturnTo(cleanText(formData.get("return_to"))) ?? ARTICLE_ADMIN_PATH;
  return articleAdminRedirect(returnTo, { link_removed: "1" });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const actionType = cleanText(formData.get("action_type"));

  try {
    try {
      getSupabaseServiceConfig();
    } catch {
      throw new ArticleAdminError("missing-service");
    }

    if (actionType === "create_article") {
      return await createArticle(formData);
    }

    if (actionType === "update_article") {
      return await updateArticle(formData);
    }

    if (actionType === "delete_article") {
      return await deleteArticle(formData);
    }

    if (actionType === "remove_article_link") {
      return await removeArticleLink(formData);
    }

    return articleAdminRedirect(ARTICLE_ADMIN_PATH, { error: "invalid-action" });
  } catch (error) {
    let code: string;
    let detail: string;
    if (error instanceof ArticleAdminError) {
      code = error.code;
      detail = error.message;
    } else {
      const parsedSupabaseError = parseSupabaseError(error);
      code = classifySupabaseError(parsedSupabaseError);
      detail = supabaseDetailText(parsedSupabaseError);
    }
    const articleId = optionalArticleId(formData.get("article_id"));
    const returnTo = safeArticleAdminReturnTo(cleanText(formData.get("return_to")));
    const fallbackPath =
      returnTo ??
      ((actionType === "update_article" || actionType === "delete_article") && articleId
        ? `${ARTICLE_ADMIN_PATH}?articleId=${encodeURIComponent(articleId)}`
        : `${ARTICLE_ADMIN_PATH}?mode=novo`);

    return articleAdminRedirect(fallbackPath, { error: code, detail });
  }
}
