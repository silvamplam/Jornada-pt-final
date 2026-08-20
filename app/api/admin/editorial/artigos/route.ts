import {
  ARTICLE_ADMIN_PATH,
  articleAdminRedirect,
  isArticleAdminUuid,
  safeArticleAdminReturnTo,
} from "@/lib/admin-article-redirect";
import {
  createEditorialArticle,
  EditorialArticleServiceError,
  normalizeEditorialArticleSlug,
  updateEditorialArticle,
  type EditorialArticleInput,
  type EditorialArticlePlacementFailure,
} from "@/lib/editorial-article-service";
import type { EditorialInitialPlacement } from "@/lib/editorial-matchday-news-flow";
import { syncLatestFourNewsProjection } from "@/lib/editorial-matchday-latest-four-projection";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdmin,
} from "@/lib/supabase";

type ArticleIdRow = {
  id: string;
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

type EditorialAction = "save" | "publish";

type LinkRemovalTarget =
  | "matchday_editorials"
  | "matchday_highlights"
  | "matchday_latest_news"
  | "matchday_reference_composition_items"
  | "matchday_hierarchical_composition_slots"
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
  matchday_id?: string | null;
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
  matchday_hierarchical_composition_slots: ["link_url_snapshot"],
  site_editorials: ["headline_link_url", "complementary_link_url", "side_block_link_url"],
  site_editorial_highlights: ["link_url"],
  site_editorial_latest_news: ["link_url"],
};
const liveMatchdayLinkRemovalTargets = new Set<LinkRemovalTarget>([
  "matchday_editorials",
  "matchday_highlights",
  "matchday_latest_news",
]);

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

function cleanEditorialAction(value: string | null): EditorialAction {
  return value === "publish" ? "publish" : "save";
}

function cleanInitialPlacement(value: FormDataEntryValue | null): EditorialInitialPlacement {
  switch (cleanText(value)) {
    case "headline":
      return "headline";
    case "editorial_line_item":
      return "editorial_line_item";
    case "highlight":
      return "highlight";
    case "complement":
      return "complement";
    case "important_item":
      return "important_item";
    default:
      return "none";
  }
}

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : null;
}

function articleInputFromFormData(formData: FormData): EditorialArticleInput {
  return {
    label: formText(formData.get("label")),
    title: formText(formData.get("title")),
    subtitle: formText(formData.get("subtitle")),
    body: formText(formData.get("body")),
    slug: formText(formData.get("slug")),
    image_url: formText(formData.get("image_url")),
    image_caption: formText(formData.get("image_caption")),
    author: formText(formData.get("author")),
    published_at: formText(formData.get("published_at")),
    competition_id: formText(formData.get("competition_id")),
    season_id: formText(formData.get("season_id")),
    matchday_id: formText(formData.get("matchday_id")),
    editorial_destination: formText(formData.get("editorial_destination")),
  };
}

function placementErrorMessage(failure: EditorialArticlePlacementFailure | null) {
  if (!failure) {
    return null;
  }

  return failure.cause instanceof Error
    ? failure.cause.message
    : "Não foi possível aplicar a colocação editorial escolhida.";
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
  const matchdayIdSelection = liveMatchdayLinkRemovalTargets.has(target.table) ? ",matchday_id" : "";
  const rows = await fetchSupabaseAdminTable<LinkValueRow>(
    `${target.table}?select=id,${target.field}${matchdayIdSelection}&id=eq.${encodeURIComponent(targetId)}&limit=1`,
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
    `matchday_hierarchical_composition_slots?select=id&link_url_snapshot=eq.${encodedUrl}&limit=1`,
    `site_editorials?select=id&headline_link_url=eq.${encodedUrl}&limit=1`,
    `site_editorials?select=id&complementary_link_url=eq.${encodedUrl}&limit=1`,
    `site_editorials?select=id&side_block_link_url=eq.${encodedUrl}&limit=1`,
    `site_editorial_highlights?select=id&link_url=eq.${encodedUrl}&limit=1`,
    `site_editorial_latest_news?select=id&link_url=eq.${encodedUrl}&limit=1`,
  ];

  const linkRows = await Promise.all(queries.map((query) => fetchSupabaseAdminTable<ArticleIdRow>(query)));
  return linkRows.some((rows) => rows.length > 0);
}

async function createArticle(formData: FormData) {
  const editorialAction = cleanEditorialAction(cleanText(formData.get("editorial_action")));
  const result = await createEditorialArticle(articleInputFromFormData(formData), {
    action: editorialAction,
    initialPlacement: cleanInitialPlacement(formData.get("initial_placement")),
  });
  const placementError = placementErrorMessage(result.placementFailure);

  const returnTo = safeArticleAdminReturnTo(cleanText(formData.get("return_to"))) ?? ARTICLE_ADMIN_PATH;

  return articleAdminRedirect(
    returnTo,
    editorialAction === "publish"
      ? {
          articleId: result.articleId,
          published: "1",
          placement: result.placement,
          ...(placementError
            ? { placement_error: "1", detail: placementError }
            : {}),
        }
      : { articleId: result.articleId, created: "1" },
  );
}

async function updateArticle(formData: FormData) {
  const articleId = cleanArticleId(formData.get("article_id"));
  const editorialAction = cleanEditorialAction(cleanText(formData.get("editorial_action")));
  const result = await updateEditorialArticle(
    articleId,
    articleInputFromFormData(formData),
    {
      action: editorialAction,
      initialPlacement: cleanInitialPlacement(formData.get("initial_placement")),
    },
  );
  const placementError = placementErrorMessage(result.placementFailure);

  const returnTo = safeArticleAdminReturnTo(cleanText(formData.get("return_to"))) ?? `${ARTICLE_ADMIN_PATH}?articleId=${encodeURIComponent(articleId)}`;
  return articleAdminRedirect(
    returnTo,
    editorialAction === "publish"
      ? {
          articleId,
          published: "1",
          placement: result.placement,
          ...(placementError
            ? { placement_error: "1", detail: placementError }
            : {}),
        }
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
  const slug = normalizeEditorialArticleSlug(cleanText(formData.get("slug")) ?? "");
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
  if (liveMatchdayLinkRemovalTargets.has(target.table) && row.matchday_id) {
    await syncLatestFourNewsProjection(row.matchday_id);
  }

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
    if (error instanceof ArticleAdminError || error instanceof EditorialArticleServiceError) {
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
