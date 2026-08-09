export const EDITORIAL_EXTERNAL_ARTICLE_START_MARKER = "[JORNADA_ARTIGO_V1]";
export const EDITORIAL_EXTERNAL_ARTICLE_END_MARKER = "[/JORNADA_ARTIGO_V1]";
export const EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY =
  "jornada.editorial.external-article.v1";
export const EDITORIAL_EXTERNAL_ARTICLE_MAX_AGE_MS = 30 * 60 * 1000;
export const EDITORIAL_EXTERNAL_ARTICLE_MAX_IMAGE_CANDIDATES = 20;

const FIELD_LIMITS = {
  anteTitle: 240,
  title: 500,
  postTitle: 2000,
  body: 120000,
} as const;

type EditorialExternalArticleField =
  | "anteTitle"
  | "title"
  | "postTitle"
  | "body";

export type EditorialExternalArticle = Readonly<{
  anteTitle: string | null;
  title: string;
  postTitle: string | null;
  body: string;
}>;

export type EditorialExternalArticleSourcePackage = Readonly<{
  year: string;
  month: string;
  packageId: string;
}>;

export type EditorialExternalArticleImageCandidate = Readonly<{
  position: number;
  sourceCode: string;
  articleTitle: string;
  imageUrl: string;
}>;

export type EditorialExternalArticleTransfer = Readonly<{
  article: EditorialExternalArticle;
  sourcePackage: EditorialExternalArticleSourcePackage | null;
  imageCandidates: readonly EditorialExternalArticleImageCandidate[];
}>;

export type StoredEditorialExternalArticle = Readonly<{
  version: 1;
  storedAt: number;
  article: EditorialExternalArticle;
  sourcePackage?: EditorialExternalArticleSourcePackage;
  imageCandidates?: readonly EditorialExternalArticleImageCandidate[];
}>;

export type EditorialExternalArticleParseResult =
  | Readonly<{
      ok: true;
      value: EditorialExternalArticle;
    }>
  | Readonly<{
      ok: false;
      error:
        | "response_empty"
        | "markers_incomplete"
        | "structure_invalid"
        | "title_missing"
        | "body_missing"
        | "field_too_long";
    }>;


const SOURCE_PACKAGE_YEAR_PATTERN = /^\d{4}$/;
const SOURCE_PACKAGE_MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const SOURCE_PACKAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedSourcePackage(
  value: unknown,
): EditorialExternalArticleSourcePackage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EditorialExternalArticleSourcePackage>;
  const year = typeof candidate.year === "string" ? candidate.year.trim() : "";
  const month = typeof candidate.month === "string" ? candidate.month.trim() : "";
  const packageId = typeof candidate.packageId === "string"
    ? candidate.packageId.trim().toLowerCase()
    : "";

  return SOURCE_PACKAGE_YEAR_PATTERN.test(year)
    && SOURCE_PACKAGE_MONTH_PATTERN.test(month)
    && SOURCE_PACKAGE_ID_PATTERN.test(packageId)
    ? { year, month, packageId }
    : null;
}

function normalizedImageCandidate(
  value: unknown,
): EditorialExternalArticleImageCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EditorialExternalArticleImageCandidate>;
  const position = typeof candidate.position === "number"
    ? candidate.position
    : Number(candidate.position);
  const sourceCode = typeof candidate.sourceCode === "string"
    ? candidate.sourceCode.trim().slice(0, 120)
    : "";
  const articleTitle = typeof candidate.articleTitle === "string"
    ? candidate.articleTitle.trim().slice(0, 500)
    : "";
  const rawImageUrl = typeof candidate.imageUrl === "string"
    ? candidate.imageUrl.trim()
    : "";

  if (!Number.isInteger(position) || position < 1 || !rawImageUrl) {
    return null;
  }

  try {
    const imageUrl = new URL(rawImageUrl);
    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
      return null;
    }

    return {
      position,
      sourceCode: sourceCode || "fonte",
      articleTitle: articleTitle || "Notícia",
      imageUrl: imageUrl.toString(),
    };
  } catch {
    return null;
  }
}

export function normalizeEditorialExternalArticleImageCandidates(
  values: readonly unknown[],
): readonly EditorialExternalArticleImageCandidate[] {
  const unique = new Map<string, EditorialExternalArticleImageCandidate>();

  for (const value of values) {
    const candidate = normalizedImageCandidate(value);
    if (!candidate || unique.has(candidate.imageUrl)) {
      continue;
    }

    unique.set(candidate.imageUrl, candidate);
    if (unique.size >= EDITORIAL_EXTERNAL_ARTICLE_MAX_IMAGE_CANDIDATES) {
      break;
    }
  }

  return Array.from(unique.values());
}

function normalizedHeading(line: string): EditorialExternalArticleField | null {
  const cleaned = line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:\*\*|__)(.*)(?:\*\*|__)$/, "$1")
    .replace(/:$/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (cleaned === "ANTETITULO") {
    return "anteTitle";
  }
  if (cleaned === "TITULO") {
    return "title";
  }
  if (cleaned === "POS-TITULO" || cleaned === "POS TITULO") {
    return "postTitle";
  }
  if (cleaned === "CORPO") {
    return "body";
  }

  return null;
}

function normalizedSingleLine(value: string): string | null {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function normalizedBody(value: string): string | null {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || null;
}

function articleTextBetweenMarkers(text: string): EditorialExternalArticleParseResult | string {
  const startIndex = text.indexOf(EDITORIAL_EXTERNAL_ARTICLE_START_MARKER);
  const endIndex = text.indexOf(EDITORIAL_EXTERNAL_ARTICLE_END_MARKER);

  if (startIndex < 0 && endIndex < 0) {
    return text;
  }

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return { ok: false, error: "markers_incomplete" };
  }

  return text.slice(
    startIndex + EDITORIAL_EXTERNAL_ARTICLE_START_MARKER.length,
    endIndex,
  );
}

export function parseEditorialExternalArticleResponse(
  input: string,
): EditorialExternalArticleParseResult {
  const normalizedInput = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalizedInput) {
    return { ok: false, error: "response_empty" };
  }

  const markedText = articleTextBetweenMarkers(normalizedInput);
  if (typeof markedText !== "string") {
    return markedText;
  }

  const values: Record<EditorialExternalArticleField, string[]> = {
    anteTitle: [],
    title: [],
    postTitle: [],
    body: [],
  };
  const seen = new Set<EditorialExternalArticleField>();
  let currentField: EditorialExternalArticleField | null = null;

  for (const line of markedText.split("\n")) {
    const heading = normalizedHeading(line);
    const canStart = currentField === null
      && (heading === "anteTitle" || heading === "title");
    const canFollowAnteTitle = currentField === "anteTitle" && heading === "title";
    const canFollowTitle = currentField === "title"
      && (heading === "postTitle" || heading === "body");
    const canFollowPostTitle = currentField === "postTitle" && heading === "body";
    const isExpectedHeading =
      canStart || canFollowAnteTitle || canFollowTitle || canFollowPostTitle;

    if (heading && isExpectedHeading) {
      if (seen.has(heading)) {
        return { ok: false, error: "structure_invalid" };
      }

      seen.add(heading);
      currentField = heading;
      continue;
    }

    if (currentField) {
      values[currentField].push(line);
    }
  }

  if (!seen.has("title")) {
    return { ok: false, error: "title_missing" };
  }
  if (!seen.has("body")) {
    return { ok: false, error: "body_missing" };
  }

  const anteTitle = normalizedSingleLine(values.anteTitle.join("\n"));
  const title = normalizedSingleLine(values.title.join("\n"));
  const postTitle = normalizedSingleLine(values.postTitle.join("\n"));
  const body = normalizedBody(values.body.join("\n"));

  if (!title) {
    return { ok: false, error: "title_missing" };
  }
  if (!body) {
    return { ok: false, error: "body_missing" };
  }

  if (
    (anteTitle?.length ?? 0) > FIELD_LIMITS.anteTitle
    || title.length > FIELD_LIMITS.title
    || (postTitle?.length ?? 0) > FIELD_LIMITS.postTitle
    || body.length > FIELD_LIMITS.body
  ) {
    return { ok: false, error: "field_too_long" };
  }

  return {
    ok: true,
    value: {
      anteTitle,
      title,
      postTitle,
      body,
    },
  };
}

export function storedEditorialExternalArticle(
  article: EditorialExternalArticle,
  storedAt = Date.now(),
  metadata: Readonly<{
    sourcePackage?: EditorialExternalArticleSourcePackage | null;
    imageCandidates?: readonly EditorialExternalArticleImageCandidate[];
  }> = {},
): StoredEditorialExternalArticle {
  const sourcePackage = normalizedSourcePackage(metadata.sourcePackage);
  const imageCandidates = sourcePackage
    ? normalizeEditorialExternalArticleImageCandidates(metadata.imageCandidates ?? [])
    : [];

  return {
    version: 1,
    storedAt,
    article,
    ...(sourcePackage ? { sourcePackage } : {}),
    ...(imageCandidates.length > 0 ? { imageCandidates } : {}),
  };
}

export function parseStoredEditorialExternalArticleTransfer(
  input: string,
  now = Date.now(),
): EditorialExternalArticleTransfer | null {
  try {
    const parsed = JSON.parse(input) as Partial<StoredEditorialExternalArticle>;
    if (
      parsed.version !== 1
      || typeof parsed.storedAt !== "number"
      || !parsed.article
      || now - parsed.storedAt < 0
      || now - parsed.storedAt > EDITORIAL_EXTERNAL_ARTICLE_MAX_AGE_MS
    ) {
      return null;
    }

    const article = parsed.article as Partial<EditorialExternalArticle>;
    const result = parseEditorialExternalArticleResponse([
      EDITORIAL_EXTERNAL_ARTICLE_START_MARKER,
      "ANTETÍTULO",
      typeof article.anteTitle === "string" ? article.anteTitle : "",
      "TÍTULO",
      typeof article.title === "string" ? article.title : "",
      "PÓS-TÍTULO",
      typeof article.postTitle === "string" ? article.postTitle : "",
      "CORPO",
      typeof article.body === "string" ? article.body : "",
      EDITORIAL_EXTERNAL_ARTICLE_END_MARKER,
    ].join("\n"));

    if (!result.ok) {
      return null;
    }

    const sourcePackage = normalizedSourcePackage(parsed.sourcePackage);
    const imageCandidates = sourcePackage
      ? normalizeEditorialExternalArticleImageCandidates(
          Array.isArray(parsed.imageCandidates) ? parsed.imageCandidates : [],
        )
      : [];

    return {
      article: result.value,
      sourcePackage,
      imageCandidates,
    };
  } catch {
    return null;
  }
}

export function parseStoredEditorialExternalArticle(
  input: string,
  now = Date.now(),
): EditorialExternalArticle | null {
  return parseStoredEditorialExternalArticleTransfer(input, now)?.article ?? null;
}
