import { load } from "cheerio";

import type { AdapterArticleInput } from "@/lib/redacao-automatica/adapters/source-adapter";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import type {
  AdapterResult,
  ArticleBodyBlock,
  CollectionErrorCode,
  NormalizedDetectedArticle,
} from "@/lib/redacao-automatica/types";

type JsonLdObject = Record<string, unknown>;
type CheerioRoot = ReturnType<typeof load>;
type CheerioSelection = ReturnType<CheerioRoot>;

type ValidatedArticleUrl = Readonly<{
  url: string;
  externalId: string;
}>;

type JsonLdAnalysis = Readonly<{
  nodes: readonly JsonLdObject[];
  nodesById: ReadonlyMap<string, JsonLdObject>;
  validScriptCount: number;
}>;

type CanonicalSelection = Readonly<{
  value: ValidatedArticleUrl;
  source: "canonical" | "open_graph" | "final_url";
}>;

type ParsedPublishedAt = Readonly<{
  value: string;
  precision: "date" | "instant";
}>;

const ABOLA_SOURCE_CODE = "abola";
const ABOLA_DOMAIN = "abola.pt";
const ABOLA_HOSTNAME = "www.abola.pt";
const ABOLA_ARTICLE_PATH_PATTERN = /^\/noticias\/[^/]+-(\d{19})\/?$/;
// This threshold rejects descriptions masquerading as bodies while allowing short news updates.
const MINIMUM_BODY_TEXT_LENGTH = 120;
const MAX_JSON_LD_DEPTH = 12;
const MAX_JSON_LD_NODES = 10_000;
const META_DESCRIPTION_SUFFIX = /\s*Continue a ler\.\s*$/i;
const COMPLETE_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const EXCLUDED_BODY_SELECTOR = [
  "script",
  "style",
  "noscript",
  "iframe",
  "video",
  "picture",
  "template",
  "form",
  "button",
  "svg",
  "canvas",
  ".ad",
  ".twitter-tweet",
  ".jwplayer",
  "[data-slot-adunit]",
  "[data-slot-name]",
  "[data-widget-id]",
  "[id^='jwVideo-']",
  "#gallery",
  "#comments",
  "a[class~='group/article']",
  "[class*='newsletter']",
  "[id*='newsletter']",
  "[class*='recommend']",
  "[id*='recommend']",
  "[class*='share']",
  "[id*='share']",
].join(", ");

function normalizeArticleText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function safeErrorUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return null;
  }
}

function articleError<T>(
  code: CollectionErrorCode,
  recoverable: boolean,
  detail: string,
  url: unknown,
): AdapterResult<T> {
  return {
    ok: false,
    error: {
      code,
      stage: "article",
      sourceCode: ABOLA_SOURCE_CODE,
      url: safeErrorUrl(url),
      recoverable,
      detail,
    },
  };
}

function parseStrictAbolaUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== ABOLA_HOSTNAME ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function normalizeAbolaArticleUrl(value: unknown): ValidatedArticleUrl | null {
  const parsedUrl = parseStrictAbolaUrl(value);
  if (!parsedUrl) {
    return null;
  }

  const normalizedUrl = normalizeUrl({
    url: parsedUrl.toString(),
    allowedDomain: ABOLA_DOMAIN,
    sourceCode: ABOLA_SOURCE_CODE,
  });
  if (!normalizedUrl.ok) {
    return null;
  }

  const normalizedParsedUrl = parseStrictAbolaUrl(normalizedUrl.value);
  if (!normalizedParsedUrl) {
    return null;
  }

  const articleMatch = ABOLA_ARTICLE_PATH_PATTERN.exec(normalizedParsedUrl.pathname);
  if (!articleMatch) {
    return null;
  }

  return {
    url: normalizedParsedUrl.toString(),
    externalId: articleMatch[1],
  };
}

function selectCanonical(
  $: CheerioRoot,
  finalArticleUrl: ValidatedArticleUrl,
): AdapterResult<CanonicalSelection> {
  const canonicalElements = $("link[rel='canonical']");
  if (canonicalElements.length > 1) {
    return articleError(
      "invalid_url",
      false,
      "A página contém múltiplas URLs canónicas.",
      finalArticleUrl.url,
    );
  }

  if (canonicalElements.length === 1) {
    const canonical = normalizeAbolaArticleUrl(canonicalElements.first().attr("href"));
    if (!canonical) {
      return articleError(
        "invalid_url",
        false,
        "A URL canónica do artigo não é válida.",
        finalArticleUrl.url,
      );
    }

    return { ok: true, value: { value: canonical, source: "canonical" } };
  }

  const openGraphUrl = normalizeArticleText($("meta[property='og:url']").first().attr("content"));
  if (openGraphUrl) {
    const canonical = normalizeAbolaArticleUrl(openGraphUrl);
    if (!canonical) {
      return articleError(
        "invalid_url",
        false,
        "A URL Open Graph do artigo não é válida.",
        finalArticleUrl.url,
      );
    }

    return { ok: true, value: { value: canonical, source: "open_graph" } };
  }

  return {
    ok: true,
    value: { value: finalArticleUrl, source: "final_url" },
  };
}

function isJsonLdObject(value: unknown): value is JsonLdObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectJsonLdNodes(
  value: unknown,
  nodes: JsonLdObject[],
  depth = 0,
): void {
  if (depth > MAX_JSON_LD_DEPTH || nodes.length >= MAX_JSON_LD_NODES) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdNodes(item, nodes, depth + 1);
      if (nodes.length >= MAX_JSON_LD_NODES) {
        return;
      }
    }
    return;
  }

  if (!isJsonLdObject(value)) {
    return;
  }

  nodes.push(value);
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) {
      collectJsonLdNodes(child, nodes, depth + 1);
      if (nodes.length >= MAX_JSON_LD_NODES) {
        return;
      }
    }
  }
}

function analyseJsonLd($: CheerioRoot): JsonLdAnalysis {
  const nodes: JsonLdObject[] = [];
  let validScriptCount = 0;

  $("script[type='application/ld+json']").each((_index, element) => {
    const serializedValue = $(element).text().replace(/^\uFEFF/, "").trim();
    if (!serializedValue) {
      return;
    }

    try {
      const parsedValue: unknown = JSON.parse(serializedValue);
      validScriptCount += 1;
      collectJsonLdNodes(parsedValue, nodes);
    } catch {
      // A malformed block does not invalidate other independent JSON-LD blocks.
    }
  });

  const nodesById = new Map<string, JsonLdObject>();
  for (const node of nodes) {
    const id = normalizeArticleText(node["@id"]);
    if (!id) {
      continue;
    }

    const existingNode = nodesById.get(id);
    if (
      !existingNode ||
      (!normalizeArticleText(existingNode.name) && normalizeArticleText(node.name))
    ) {
      nodesById.set(id, node);
    }
  }

  return { nodes, nodesById, validScriptCount };
}

function jsonLdTypes(node: JsonLdObject): readonly string[] {
  const value = node["@type"];
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [];
}

function hasJsonLdType(node: JsonLdObject, expectedType: string): boolean {
  return jsonLdTypes(node).includes(expectedType);
}

function jsonLdUrlValue(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeArticleText(value);
  }

  if (!isJsonLdObject(value)) {
    return null;
  }

  return normalizeArticleText(value["@id"]) ?? normalizeArticleText(value.url);
}

function selectNewsArticle(
  analysis: JsonLdAnalysis,
  canonicalUrl: string,
): JsonLdObject | null {
  const exactMatches: JsonLdObject[] = [];
  const candidatesWithoutMainEntity: JsonLdObject[] = [];

  for (const node of analysis.nodes) {
    if (!hasJsonLdType(node, "NewsArticle")) {
      continue;
    }

    const mainEntityValue = jsonLdUrlValue(node.mainEntityOfPage);
    if (!mainEntityValue) {
      candidatesWithoutMainEntity.push(node);
      continue;
    }

    const normalizedMainEntity = normalizeAbolaArticleUrl(mainEntityValue);
    if (normalizedMainEntity?.url === canonicalUrl) {
      exactMatches.push(node);
    }
  }

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    return null;
  }

  return candidatesWithoutMainEntity.length === 1
    ? candidatesWithoutMainEntity[0]
    : null;
}

function jsonLdString(node: JsonLdObject, key: string): string | null {
  return normalizeArticleText(node[key]);
}

function resolveAuthorName(
  value: unknown,
  nodesById: ReadonlyMap<string, JsonLdObject>,
): string | null {
  if (typeof value === "string") {
    const normalizedValue = normalizeArticleText(value);
    if (!normalizedValue) {
      return null;
    }

    const referencedNode = nodesById.get(normalizedValue);
    if (referencedNode && hasJsonLdType(referencedNode, "Person")) {
      return normalizeArticleText(referencedNode.name);
    }

    try {
      new URL(normalizedValue);
      return null;
    } catch {
      return normalizedValue;
    }
  }

  if (!isJsonLdObject(value)) {
    return null;
  }

  const directName = normalizeArticleText(value.name);
  if (directName) {
    return directName;
  }

  const reference = normalizeArticleText(value["@id"]);
  if (!reference) {
    return null;
  }

  const referencedNode = nodesById.get(reference);
  if (!referencedNode || !hasJsonLdType(referencedNode, "Person")) {
    return null;
  }

  return normalizeArticleText(referencedNode.name);
}

function uniqueNames(values: readonly string[]): readonly string[] {
  const names: string[] = [];
  const seenNames = new Set<string>();

  for (const value of values) {
    const normalizedName = normalizeArticleText(value);
    if (!normalizedName) {
      continue;
    }

    const key = normalizedName.toLocaleLowerCase("pt-PT");
    if (seenNames.has(key)) {
      continue;
    }

    seenNames.add(key);
    names.push(normalizedName);
  }

  return names;
}

function jsonLdAuthors(
  article: JsonLdObject,
  nodesById: ReadonlyMap<string, JsonLdObject>,
): readonly string[] {
  const authorValues = Array.isArray(article.author)
    ? article.author
    : [article.author];
  return uniqueNames(
    authorValues
      .map((value) => resolveAuthorName(value, nodesById))
      .filter((value): value is string => Boolean(value)),
  );
}

function domAuthorText($: CheerioRoot, link: CheerioSelection): string | null {
  const leafTexts: string[] = [];
  link.find("*").each((_index, element) => {
    const leaf = $(element);
    if (leaf.children().length === 0) {
      const text = normalizeArticleText(leaf.text());
      if (text) {
        leafTexts.push(text);
      }
    }
  });

  const leafName = leafTexts.find(
    (text) => !/^\d{1,2}:\d{2}\b/.test(text) && !/^\d{1,2}\.\s/.test(text),
  );
  if (leafName) {
    return leafName;
  }

  const combinedText = normalizeArticleText(link.text());
  return combinedText?.replace(/\s+\d{1,2}:\d{2}\s+-\s+.*$/, "") ?? null;
}

function domAuthors(
  $: CheerioRoot,
  titleElement: CheerioSelection,
  canonicalUrl: string,
): readonly string[] {
  const editorialHeaders = titleElement.parents().filter((_index, element) => {
    const candidate = $(element);
    return (
      candidate.find("#article_intro").length === 1 &&
      candidate.find("a[href*='/autor/']").length > 0
    );
  });

  if (editorialHeaders.length === 0) {
    return [];
  }

  const editorialHeader = editorialHeaders.first();
  const names: string[] = [];
  editorialHeader.find("a[href*='/autor/']").each((_index, element) => {
    const link = $(element);
    const href = normalizeArticleText(link.attr("href"));
    if (!href) {
      return;
    }

    try {
      const authorUrl = new URL(href, canonicalUrl);
      if (
        authorUrl.protocol !== "https:" ||
        authorUrl.hostname !== ABOLA_HOSTNAME ||
        !authorUrl.pathname.startsWith("/autor/")
      ) {
        return;
      }
    } catch {
      return;
    }

    const name = domAuthorText($, link);
    if (name) {
      names.push(name);
    }
  });

  return uniqueNames(names);
}

function parseDate(value: unknown): string | null {
  const normalizedValue = normalizeArticleText(value);
  if (!normalizedValue) {
    return null;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function parsePublishedAt(value: unknown): ParsedPublishedAt | null {
  const normalizedValue = normalizeArticleText(value);
  if (!normalizedValue) {
    return null;
  }

  if (COMPLETE_INSTANT_PATTERN.test(normalizedValue)) {
    const parsed = parseDate(normalizedValue);
    return parsed ? { value: parsed, precision: "instant" } : null;
  }

  if (CALENDAR_DATE_PATTERN.test(normalizedValue)) {
    const parsed = parseDate(`${normalizedValue}T00:00:00.000Z`);
    if (parsed?.slice(0, 10) === normalizedValue) {
      return { value: parsed, precision: "date" };
    }
  }

  return null;
}

function safeImageUrl(value: unknown): string | null {
  const normalizedValue = normalizeArticleText(value);
  if (!normalizedValue) {
    return null;
  }

  try {
    const url = new URL(normalizedValue);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function collectImageCandidates(
  value: unknown,
  nodesById: ReadonlyMap<string, JsonLdObject>,
  candidates: string[],
  visitedReferences: Set<string>,
  depth = 0,
): void {
  if (depth > MAX_JSON_LD_DEPTH) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectImageCandidates(entry, nodesById, candidates, visitedReferences, depth + 1);
    }
    return;
  }

  if (typeof value === "string") {
    const candidate = safeImageUrl(value);
    if (candidate) {
      candidates.push(candidate);
    }
    return;
  }

  if (!isJsonLdObject(value)) {
    return;
  }

  collectImageCandidates(value.url, nodesById, candidates, visitedReferences, depth + 1);
  collectImageCandidates(value.contentUrl, nodesById, candidates, visitedReferences, depth + 1);

  const reference = normalizeArticleText(value["@id"]);
  if (!reference) {
    return;
  }

  const directReferenceUrl = safeImageUrl(reference);
  if (directReferenceUrl) {
    candidates.push(directReferenceUrl);
  }

  if (visitedReferences.has(reference)) {
    return;
  }

  const referencedNode = nodesById.get(reference);
  if (referencedNode && referencedNode !== value) {
    visitedReferences.add(reference);
    collectImageCandidates(
      referencedNode,
      nodesById,
      candidates,
      visitedReferences,
      depth + 1,
    );
  }
}

function jsonLdImage(
  article: JsonLdObject,
  nodesById: ReadonlyMap<string, JsonLdObject>,
): string | null {
  const candidates: string[] = [];
  collectImageCandidates(article.image, nodesById, candidates, new Set<string>());
  return candidates[0] ?? null;
}

function isExcludedBodyChild(child: CheerioSelection): boolean {
  return child.is(EXCLUDED_BODY_SELECTOR) || child.find(EXCLUDED_BODY_SELECTOR).length > 0;
}

function extractBodyBlocks($: CheerioRoot, bodyElement: CheerioSelection): readonly ArticleBodyBlock[] {
  const blocks: ArticleBodyBlock[] = [];
  const seenBlocks = new Set<string>();

  function addBlock(block: ArticleBodyBlock): void {
    const key = `${block.type}\u0000${block.text}`;
    if (seenBlocks.has(key)) {
      return;
    }

    seenBlocks.add(key);
    blocks.push(block);
  }

  bodyElement.children().each((_index, element) => {
    const child = $(element);
    if (isExcludedBodyChild(child)) {
      return;
    }

    const directParagraphs = child.children("p");
    if (directParagraphs.length > 0) {
      directParagraphs.each((_paragraphIndex, paragraph) => {
        const text = normalizeArticleText($(paragraph).text());
        if (text) {
          addBlock({ type: "paragraph", text });
        }
      });
      return;
    }

    if (
      child.find("p, picture, script, iframe, video, a[href]").length > 0
    ) {
      return;
    }

    const headingElements = child
      .children("h2, h3")
      .add(child.children("span").children("h2, h3"));
    if (headingElements.length !== 1) {
      return;
    }

    const headingText = normalizeArticleText(headingElements.first().text());
    const childText = normalizeArticleText(child.text());
    if (headingText && headingText === childText) {
      addBlock({ type: "heading", text: headingText });
    }
  });

  return blocks;
}

export function parseAbolaArticle(
  input: AdapterArticleInput,
): AdapterResult<NormalizedDetectedArticle> {
  const { source, page } = input;

  if (source.code !== ABOLA_SOURCE_CODE) {
    return articleError(
      "unsupported_content",
      false,
      "A fonte recebida não é suportada pelo parser de A Bola.",
      page.finalUrl,
    );
  }

  if (page.statusCode !== 200) {
    return articleError(
      "unsupported_content",
      false,
      "A página do artigo não possui status HTTP 200.",
      page.finalUrl,
    );
  }

  if (!page.contentType?.toLowerCase().includes("text/html")) {
    return articleError(
      "unsupported_content",
      false,
      "A página do artigo não contém HTML suportado.",
      page.finalUrl,
    );
  }

  if (!page.body.trim()) {
    return articleError(
      "parse_failed",
      true,
      "A página do artigo não contém HTML para analisar.",
      page.finalUrl,
    );
  }

  const finalPageUrl = parseStrictAbolaUrl(page.finalUrl);
  if (!finalPageUrl) {
    return articleError(
      "invalid_url",
      false,
      "A URL final do artigo não é válida.",
      page.finalUrl,
    );
  }

  try {
    const $ = load(page.body);
    const openGraphType = normalizeArticleText(
      $("meta[property='og:type']").first().attr("content"),
    )?.toLowerCase();
    if (openGraphType !== "article") {
      return articleError(
        "unsupported_content",
        false,
        "A página não está identificada como artigo.",
        page.finalUrl,
      );
    }

    const finalArticleUrl = normalizeAbolaArticleUrl(finalPageUrl.toString());
    if (!finalArticleUrl) {
      return articleError(
        "invalid_url",
        false,
        "A URL final não corresponde a um artigo suportado de A Bola.",
        page.finalUrl,
      );
    }

    const canonicalResult = selectCanonical($, finalArticleUrl);
    if (!canonicalResult.ok) {
      return canonicalResult;
    }
    const canonical = canonicalResult.value;

    const jsonLdAnalysis = analyseJsonLd($);
    if (jsonLdAnalysis.validScriptCount === 0 || jsonLdAnalysis.nodes.length === 0) {
      return articleError(
        "parse_failed",
        true,
        "A página não contém JSON-LD analisável.",
        canonical.value.url,
      );
    }

    const newsArticle = selectNewsArticle(jsonLdAnalysis, canonical.value.url);
    if (!newsArticle) {
      return articleError(
        "parse_failed",
        true,
        "Não foi possível identificar um NewsArticle inequívoco.",
        canonical.value.url,
      );
    }

    const titleElements = $("#article_title");
    if (titleElements.length === 0) {
      return articleError(
        "required_field_missing",
        false,
        "O artigo não contém título editorial.",
        canonical.value.url,
      );
    }
    if (titleElements.length > 1) {
      return articleError(
        "parse_failed",
        true,
        "A página contém múltiplos títulos editoriais.",
        canonical.value.url,
      );
    }

    const titleElement = titleElements.first();
    let title = normalizeArticleText(titleElement.text());
    let titleSource: "dom" | "json_ld" | "open_graph" = "dom";
    if (!title) {
      title = jsonLdString(newsArticle, "headline");
      titleSource = "json_ld";
    }
    if (!title) {
      title = normalizeArticleText($("meta[property='og:title']").first().attr("content"));
      titleSource = "open_graph";
    }
    if (!title) {
      return articleError(
        "required_field_missing",
        false,
        "O artigo não contém título válido.",
        canonical.value.url,
      );
    }

    const introElements = $("#article_intro");
    if (introElements.length > 1) {
      return articleError(
        "parse_failed",
        true,
        "A página contém múltiplas introduções editoriais.",
        canonical.value.url,
      );
    }
    const subtitle = introElements.length === 1
      ? normalizeArticleText(introElements.first().text())
      : null;

    let summary = jsonLdString(newsArticle, "description");
    let summarySource: "json_ld" | "open_graph" | "meta_description" | null = summary
      ? "json_ld"
      : null;
    if (!summary) {
      summary = normalizeArticleText(
        $("meta[property='og:description']").first().attr("content"),
      );
      summarySource = summary ? "open_graph" : null;
    }
    if (!summary) {
      const metaDescription = normalizeArticleText(
        $("meta[name='description']").first().attr("content"),
      );
      summary = normalizeArticleText(metaDescription?.replace(META_DESCRIPTION_SUFFIX, ""));
      summarySource = summary ? "meta_description" : null;
    }

    let authors = jsonLdAuthors(newsArticle, jsonLdAnalysis.nodesById);
    let authorSource: "json_ld" | "dom" | null = authors.length > 0
      ? "json_ld"
      : null;
    if (authors.length === 0) {
      authors = domAuthors($, titleElement, canonical.value.url);
      authorSource = authors.length > 0 ? "dom" : null;
    }
    const author = authors.length > 0 ? authors.join(" & ") : null;

    const jsonLdPublishedAt = parsePublishedAt(newsArticle.datePublished);
    const metaPublishedAt = parsePublishedAt(
      $("meta[property='article:published_time']").first().attr("content"),
    );
    const publishedAtSelection = jsonLdPublishedAt?.precision === "instant"
      ? { parsed: jsonLdPublishedAt, source: "json_ld" as const }
      : metaPublishedAt?.precision === "instant"
        ? { parsed: metaPublishedAt, source: "meta" as const }
        : jsonLdPublishedAt
          ? { parsed: jsonLdPublishedAt, source: "json_ld" as const }
          : metaPublishedAt
            ? { parsed: metaPublishedAt, source: "meta" as const }
            : null;
    const publishedAt = publishedAtSelection?.parsed.value ?? null;
    const publishedAtSource = publishedAtSelection?.source ?? null;
    const publishedAtPrecision = publishedAtSelection?.parsed.precision ?? null;

    let modifiedAt = parseDate(newsArticle.dateModified);
    let modifiedAtSource: "json_ld" | "meta" | null = modifiedAt
      ? "json_ld"
      : null;
    if (!modifiedAt) {
      modifiedAt = parseDate(
        $("meta[property='article:modified_time']").first().attr("content"),
      );
      modifiedAtSource = modifiedAt ? "meta" : null;
    }

    let imageUrl = jsonLdImage(newsArticle, jsonLdAnalysis.nodesById);
    let imageSource: "json_ld" | "open_graph" | null = imageUrl
      ? "json_ld"
      : null;
    if (!imageUrl) {
      imageUrl = safeImageUrl($("meta[property='og:image']").first().attr("content"));
      imageSource = imageUrl ? "open_graph" : null;
    }

    const bodyElements = $("#article_body");
    if (bodyElements.length !== 1) {
      return articleError(
        "parse_failed",
        true,
        "A página não contém um corpo editorial inequívoco.",
        canonical.value.url,
      );
    }

    const body = extractBodyBlocks($, bodyElements.first());
    const paragraphCount = body.filter((block) => block.type === "paragraph").length;
    const bodyTextLength = body.reduce((total, block) => total + block.text.length, 0);
    if (paragraphCount === 0 || bodyTextLength < MINIMUM_BODY_TEXT_LENGTH) {
      return articleError(
        "required_field_missing",
        false,
        "O artigo não contém corpo editorial suficiente.",
        canonical.value.url,
      );
    }

    return {
      ok: true,
      value: {
        sourceCode: ABOLA_SOURCE_CODE,
        originalUrl: page.requestedUrl,
        normalizedUrl: canonical.value.url,
        externalId: canonical.value.externalId,
        title,
        subtitle,
        summary,
        author,
        publishedAt,
        modifiedAt,
        detectedAt: input.detectedAt,
        imageUrl,
        excerpt: null,
        body,
        processingStatus: "detected",
        sourceMetadata: {
          parser: "abola-article-v1",
          finalUrl: finalArticleUrl.url,
          loadedAt: page.loadedAt,
          statusCode: page.statusCode,
          redirectCount: page.redirectCount,
          byteLength: page.byteLength,
          canonicalSource: canonical.source,
          titleSource,
          summarySource,
          authorSource,
          publishedAtSource,
          publishedAtPrecision,
          modifiedAtSource,
          imageSource,
          bodySelector: "#article_body",
          bodyBlockCount: body.length,
        },
      },
    };
  } catch {
    return articleError(
      "parse_failed",
      true,
      "Não foi possível analisar o artigo de A Bola.",
      page.finalUrl,
    );
  }
}
