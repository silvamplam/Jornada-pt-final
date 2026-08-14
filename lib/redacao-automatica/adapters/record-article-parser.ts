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

type JsonLdAnalysis = Readonly<{
  nodes: readonly JsonLdObject[];
  nodesById: ReadonlyMap<string, JsonLdObject>;
  validScriptCount: number;
}>;

type CanonicalSelection = Readonly<{
  url: string;
  source: "canonical" | "open_graph" | "final_url";
}>;

type ParsedPublishedAt = Readonly<{
  value: string;
  precision: "date" | "instant";
}>;

const RECORD_SOURCE_CODE = "record";
const RECORD_DOMAIN = "record.pt";
const RECORD_HOSTNAME = "www.record.pt";
const RECORD_ARTICLE_PATH_PATTERN =
  /^\/(?:(?:futebol|internacional|modalidades)\/.+\/detalhe|modalidades\/detalhe)\/[^/]+\/?$/;
const MINIMUM_BODY_TEXT_LENGTH = 120;
const MINIMUM_WORD_COUNT_RATIO = 0.8;
const MAX_JSON_LD_DEPTH = 12;
const MAX_JSON_LD_NODES = 10_000;
const COMPLETE_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /\b(?:[01]\d|2[0-3]):[0-5]\d\b/g;
const LISBON_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const EXCLUDED_BODY_SELECTOR = [
  ".pub_inside_text",
  "#mid_article",
  ".embed_foto",
  ".modal",
  ".fadeoutPremium",
  "script",
  "style",
  "noscript",
  "iframe",
  "video",
  "picture",
  "img",
  "template",
  "form",
  "button",
  "svg",
  "canvas",
  "[class*='player']",
  "[class*='gallery']",
  "[class*='galeria']",
  "[class*='share']",
  "[id*='share']",
  "[class*='comment']",
  "[id*='comment']",
  "[class*='recommend']",
  "[id*='recommend']",
  "[class*='newsletter']",
  "[id*='newsletter']",
  "[class*='related']",
  "[id*='related']",
  "[class*='tracking']",
  "[data-track]",
].join(", ");

function normalizeArticleText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeMetadataText(value: unknown): string | null {
  const normalized = normalizeArticleText(value);
  if (!normalized) {
    return null;
  }

  try {
    return normalizeArticleText(load(normalized, undefined, false).text());
  } catch {
    return normalized;
  }
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
      sourceCode: RECORD_SOURCE_CODE,
      url: safeErrorUrl(url),
      recoverable,
      detail,
    },
  };
}

function parseStrictRecordUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== RECORD_HOSTNAME ||
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

function hasSupportedArticlePathname(url: URL): boolean {
  return RECORD_ARTICLE_PATH_PATTERN.test(url.pathname);
}

function normalizeRecordArticleUrl(value: unknown): string | null {
  const parsedUrl = parseStrictRecordUrl(value);
  if (!parsedUrl || !hasSupportedArticlePathname(parsedUrl)) {
    return null;
  }

  const normalizedUrl = normalizeUrl({
    url: parsedUrl.toString(),
    allowedDomain: RECORD_DOMAIN,
    sourceCode: RECORD_SOURCE_CODE,
  });
  if (!normalizedUrl.ok) {
    return null;
  }

  const normalizedParsedUrl = parseStrictRecordUrl(normalizedUrl.value);
  return normalizedParsedUrl && hasSupportedArticlePathname(normalizedParsedUrl)
    ? normalizedParsedUrl.toString()
    : null;
}

function selectCanonical(
  $: CheerioRoot,
  finalUrl: URL,
): AdapterResult<CanonicalSelection> {
  const canonicalElements = $("link[rel='canonical']");
  if (canonicalElements.length > 1) {
    return articleError(
      "invalid_url",
      false,
      "A pagina contem multiplas URLs canonicas.",
      finalUrl.toString(),
    );
  }

  if (canonicalElements.length === 1) {
    const canonicalUrl = normalizeRecordArticleUrl(
      canonicalElements.first().attr("href"),
    );
    if (!canonicalUrl) {
      return articleError(
        "invalid_url",
        false,
        "A URL canonica do artigo nao e valida.",
        finalUrl.toString(),
      );
    }

    return { ok: true, value: { url: canonicalUrl, source: "canonical" } };
  }

  const openGraphElements = $("meta[property='og:url']");
  if (openGraphElements.length > 0) {
    const openGraphUrl = normalizeRecordArticleUrl(
      openGraphElements.first().attr("content"),
    );
    if (!openGraphUrl) {
      return articleError(
        "invalid_url",
        false,
        "A URL Open Graph do artigo nao e valida.",
        finalUrl.toString(),
      );
    }

    return { ok: true, value: { url: openGraphUrl, source: "open_graph" } };
  }

  const normalizedFinalUrl = normalizeRecordArticleUrl(finalUrl.toString());
  if (!normalizedFinalUrl) {
    return articleError(
      "invalid_url",
      false,
      "A URL final do artigo nao e valida.",
      finalUrl.toString(),
    );
  }

  return { ok: true, value: { url: normalizedFinalUrl, source: "final_url" } };
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
    if (child && typeof child === "object") {
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
    if (!existingNode || (!normalizeMetadataText(existingNode.name) && normalizeMetadataText(node.name))) {
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

  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
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

function articleReferenceValues(article: JsonLdObject): readonly string[] {
  return [jsonLdUrlValue(article.url), jsonLdUrlValue(article.mainEntityOfPage)].filter(
    (value): value is string => Boolean(value),
  );
}

function selectNewsArticle(
  analysis: JsonLdAnalysis,
  canonicalUrl: string,
): JsonLdObject | null {
  const candidates = analysis.nodes.filter((node) => {
    if (
      !hasJsonLdType(node, "NewsArticle") ||
      hasJsonLdType(node, "Product") ||
      "productID" in node ||
      !normalizeMetadataText(node.headline)
    ) {
      return false;
    }

    return articleReferenceValues(node).some(
      (value) => normalizeRecordArticleUrl(value) === canonicalUrl,
    );
  });

  return candidates.length === 1 ? candidates[0] : null;
}

function resolveAuthorName(
  value: unknown,
  nodesById: ReadonlyMap<string, JsonLdObject>,
): string | null {
  if (typeof value === "string") {
    const normalizedValue = normalizeMetadataText(value);
    if (!normalizedValue) {
      return null;
    }

    const referencedNode = nodesById.get(normalizedValue);
    if (referencedNode) {
      return normalizeMetadataText(referencedNode.name);
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

  const name = normalizeMetadataText(value.name);
  if (name) {
    return name;
  }

  const reference = normalizeArticleText(value["@id"]);
  return reference
    ? normalizeMetadataText(nodesById.get(reference)?.name)
    : null;
}

function uniqueNames(values: readonly string[]): readonly string[] {
  const names: string[] = [];
  const seenNames = new Set<string>();

  for (const value of values) {
    const name = normalizeMetadataText(value);
    if (!name) {
      continue;
    }

    const key = name.toLocaleLowerCase("pt-PT");
    if (!seenNames.has(key)) {
      seenNames.add(key);
      names.push(name);
    }
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

function domAuthors($: CheerioRoot, titleArea: CheerioSelection): readonly string[] {
  const names: string[] = [];
  titleArea
    .children(".bloco_journalists")
    .find(".journalist p.name")
    .each((_index, element) => {
      const name = normalizeArticleText($(element).text());
      if (name) {
        names.push(name);
      }
    });
  return uniqueNames(names);
}

function combineAuthors(
  domNames: readonly string[],
  jsonLdNames: readonly string[],
): readonly string[] {
  return uniqueNames([...domNames, ...jsonLdNames]);
}

function parseCompleteInstant(value: unknown): string | null {
  const normalizedValue = normalizeArticleText(value);
  if (!normalizedValue || !COMPLETE_INSTANT_PATTERN.test(normalizedValue)) {
    return null;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function parseCalendarDate(value: unknown): string | null {
  const normalizedValue = normalizeArticleText(value);
  if (!normalizedValue || !CALENDAR_DATE_PATTERN.test(normalizedValue)) {
    return null;
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== normalizedValue
  ) {
    return null;
  }

  return parsedDate.toISOString();
}

function parsePublishedAt(value: unknown): ParsedPublishedAt | null {
  const instant = parseCompleteInstant(value);
  if (instant) {
    return { value: instant, precision: "instant" };
  }

  const date = parseCalendarDate(value);
  return date ? { value: date, precision: "date" } : null;
}

function lisbonDateTimeKey(value: Date): string | null {
  const parts = new Map(
    LISBON_DATE_TIME_FORMATTER
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  return year && month && day && hour && minute
    ? `${year}-${month}-${day}T${hour}:${minute}`
    : null;
}

function combineLisbonCalendarDateAndClock(
  calendarDate: string,
  clock: string,
): string | null {
  if (!CALENDAR_DATE_PATTERN.test(calendarDate)) {
    return null;
  }

  const clockMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!clockMatch) {
    return null;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDate);
  if (!dateMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const wallClockKey = `${calendarDate}T${clock}`;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const matchingInstants: Date[] = [];

  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 30) {
    const candidate = new Date(utcGuess + offsetMinutes * 60_000);
    if (lisbonDateTimeKey(candidate) === wallClockKey) {
      matchingInstants.push(candidate);
    }
  }

  return matchingInstants.length === 1
    ? matchingInstants[0].toISOString()
    : null;
}

function domPublishedClock(titleArea: CheerioSelection): string | null {
  const clone = titleArea.clone();
  clone.children("h1, p, .bloco_journalists").remove();
  clone.find("script, style, noscript").remove();
  const matches = clone.text().match(CLOCK_PATTERN) ?? [];
  const clocks = [...new Set(matches)];
  return clocks.length === 1 ? clocks[0] : null;
}

function selectPublishedAt(
  $: CheerioRoot,
  titleArea: CheerioSelection,
  jsonLdValue: unknown,
): Readonly<{ parsed: ParsedPublishedAt; source: "json_ld" | "meta" | "dom" }> | null {
  const jsonLdPublishedAt = parsePublishedAt(jsonLdValue);
  const metaPublishedAt = parsePublishedAt(
    $("meta[property='article:published_time']").first().attr("content"),
  );

  if (jsonLdPublishedAt?.precision === "instant") {
    return { parsed: jsonLdPublishedAt, source: "json_ld" };
  }
  if (metaPublishedAt?.precision === "instant") {
    return { parsed: metaPublishedAt, source: "meta" };
  }

  const calendarDates = [jsonLdPublishedAt, metaPublishedAt]
    .filter((candidate): candidate is ParsedPublishedAt => candidate?.precision === "date")
    .map((candidate) => candidate.value.slice(0, 10));
  const uniqueCalendarDates = [...new Set(calendarDates)];
  const clock = uniqueCalendarDates.length === 1 ? domPublishedClock(titleArea) : null;
  const domInstant = clock
    ? combineLisbonCalendarDateAndClock(uniqueCalendarDates[0], clock)
    : null;
  if (domInstant) {
    return {
      parsed: { value: domInstant, precision: "instant" },
      source: "dom",
    };
  }

  if (jsonLdPublishedAt) {
    return { parsed: jsonLdPublishedAt, source: "json_ld" };
  }
  return metaPublishedAt ? { parsed: metaPublishedAt, source: "meta" } : null;
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
    const imageUrl = safeImageUrl(value);
    if (imageUrl) {
      candidates.push(imageUrl);
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

function domImage($: CheerioRoot, mainArticle: CheerioSelection): string | null {
  let selectedImage: string | null = null;
  mainArticle
    .children("figure, .article_image, .main_image")
    .find("img")
    .each((_index, element) => {
      if (selectedImage) {
        return;
      }

      selectedImage =
        safeImageUrl($(element).attr("src")) ??
        safeImageUrl($(element).attr("data-src"));
    });
  return selectedImage;
}

function hasExplicitAccessRestriction(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_LD_DEPTH) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasExplicitAccessRestriction(entry, depth + 1));
  }

  if (!isJsonLdObject(value)) {
    return false;
  }

  if (value.isAccessibleForFree === false) {
    return true;
  }

  return Object.values(value).some(
    (entry) => entry && typeof entry === "object" && hasExplicitAccessRestriction(entry, depth + 1),
  );
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  const normalizedValue = normalizeArticleText(value);
  if (!normalizedValue || !/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function countWords(text: string): number {
  const normalizedText = normalizeArticleText(text);
  return normalizedText ? normalizedText.split(/\s+/).length : 0;
}

function isExcludedBodyChild(child: CheerioSelection): boolean {
  return child.is(EXCLUDED_BODY_SELECTOR) || child.find(EXCLUDED_BODY_SELECTOR).length > 0;
}

function extractBodyBlocks(
  $: CheerioRoot,
  bodyElement: CheerioSelection,
): readonly ArticleBodyBlock[] {
  const blocks: ArticleBodyBlock[] = [];
  const seenBlocks = new Set<string>();

  function addParagraph(value: unknown): void {
    const text = normalizeArticleText(value);
    if (!text) {
      return;
    }

    const key = `paragraph\u0000${text}`;
    if (!seenBlocks.has(key)) {
      seenBlocks.add(key);
      blocks.push({ type: "paragraph", text });
    }
  }

  bodyElement.children().each((_index, element) => {
    const child = $(element);
    if (isExcludedBodyChild(child)) {
      return;
    }

    if (child.is("p")) {
      addParagraph(child.text());
      return;
    }

    if (child.is(".bloco_citacao, aside.blocknumber")) {
      addParagraph(child.text());
    }
  });

  return blocks;
}

function externalArticleId($: CheerioRoot): string | null {
  const values = new Set<string>();
  $("#texto_socialShare a[data-contentid]").each((_index, element) => {
    const value = normalizeArticleText($(element).attr("data-contentid"));
    if (value && /^\d+$/.test(value)) {
      values.add(value);
    }
  });

  return values.size === 1 ? Array.from(values)[0] : null;
}

function isSpecialFormat($: CheerioRoot): boolean {
  return (
    $(".timeline-editorial, .timeline-editorial__card").length > 0 ||
    $("#jed_resultado").length > 0
  );
}

export function parseRecordArticle(
  input: AdapterArticleInput,
): AdapterResult<NormalizedDetectedArticle> {
  const { source, page } = input;

  if (source.code !== RECORD_SOURCE_CODE) {
    return articleError(
      "unsupported_content",
      false,
      "A fonte recebida nao e suportada pelo parser do Record.",
      page.finalUrl,
    );
  }

  if (page.statusCode !== 200) {
    return articleError(
      "unsupported_content",
      false,
      "A pagina do artigo nao possui status HTTP 200.",
      page.finalUrl,
    );
  }

  if (!page.contentType?.toLowerCase().includes("text/html")) {
    return articleError(
      "unsupported_content",
      false,
      "A pagina do artigo nao contem HTML suportado.",
      page.finalUrl,
    );
  }

  if (!page.body.trim()) {
    return articleError(
      "parse_failed",
      true,
      "A pagina do artigo nao contem HTML para analisar.",
      page.finalUrl,
    );
  }

  const finalPageUrl = parseStrictRecordUrl(page.finalUrl);
  if (!finalPageUrl) {
    return articleError(
      "invalid_url",
      false,
      "A URL final do artigo nao e valida.",
      page.finalUrl,
    );
  }

  if (!hasSupportedArticlePathname(finalPageUrl)) {
    return articleError(
      "unsupported_content",
      false,
      "O pathname nao corresponde a um artigo linear suportado do Record.",
      page.finalUrl,
    );
  }

  try {
    const $ = load(page.body);
    if (isSpecialFormat($)) {
      return articleError(
        "unsupported_content",
        false,
        "A pagina utiliza um formato editorial especial nao suportado.",
        page.finalUrl,
      );
    }

    const openGraphType = normalizeMetadataText(
      $("meta[property='og:type']").first().attr("content"),
    )?.toLowerCase();
    if (openGraphType !== "article") {
      return articleError(
        "unsupported_content",
        false,
        "A pagina nao esta identificada como artigo.",
        page.finalUrl,
      );
    }

    const canonicalResult = selectCanonical($, finalPageUrl);
    if (!canonicalResult.ok) {
      return canonicalResult;
    }
    const canonical = canonicalResult.value;

    const jsonLdAnalysis = analyseJsonLd($);
    if (jsonLdAnalysis.validScriptCount === 0 || jsonLdAnalysis.nodes.length === 0) {
      return articleError(
        "parse_failed",
        true,
        "A pagina nao contem JSON-LD analisavel.",
        canonical.url,
      );
    }

    const newsArticle = selectNewsArticle(jsonLdAnalysis, canonical.url);
    if (!newsArticle) {
      const containsPrimaryNewsArticle = jsonLdAnalysis.nodes.some(
        (node) =>
          hasJsonLdType(node, "NewsArticle") &&
          !hasJsonLdType(node, "Product") &&
          !("productID" in node),
      );
      const containsSpecialStructuredData =
        !containsPrimaryNewsArticle && jsonLdAnalysis.nodes.some(
          (node) => hasJsonLdType(node, "VideoObject") || hasJsonLdType(node, "WebPage"),
        );
      return articleError(
        containsSpecialStructuredData ? "unsupported_content" : "parse_failed",
        !containsSpecialStructuredData,
        containsSpecialStructuredData
          ? "A pagina nao contem um NewsArticle linear completo."
          : "Nao foi possivel identificar um NewsArticle inequivoco.",
        canonical.url,
      );
    }

    const mainArticles = $("article.main_article");
    if (mainArticles.length !== 1) {
      return articleError(
        "parse_failed",
        true,
        "A pagina nao contem um artigo principal inequivoco.",
        canonical.url,
      );
    }
    const mainArticle = mainArticles.first();

    if (
      newsArticle.isAccessibleForFree === false ||
      hasExplicitAccessRestriction(newsArticle.hasPart) ||
      mainArticle.hasClass("premiumFechado") ||
      $(".fadeoutPremium").length > 0
    ) {
      return articleError(
        "unsupported_content",
        false,
        "O artigo esta restrito ou apresenta sinais de truncagem.",
        canonical.url,
      );
    }

    const titleAreas = mainArticle.children(".article_titles");
    if (titleAreas.length !== 1) {
      return articleError(
        "parse_failed",
        true,
        "A pagina nao contem uma zona de titulo inequivoca.",
        canonical.url,
      );
    }
    const titleArea = titleAreas.first();

    const bodyElements = mainArticle.children("#texto_styck").children(".text_container");
    if (bodyElements.length !== 1) {
      return articleError(
        "parse_failed",
        true,
        "A pagina nao contem um corpo editorial inequivoco.",
        canonical.url,
      );
    }

    const titleElements = titleArea.children("h1");
    if (titleElements.length === 0) {
      return articleError(
        "required_field_missing",
        false,
        "O artigo nao contem titulo editorial.",
        canonical.url,
      );
    }
    if (titleElements.length > 1) {
      return articleError(
        "parse_failed",
        true,
        "A pagina contem multiplos titulos editoriais.",
        canonical.url,
      );
    }

    let title = normalizeArticleText(titleElements.first().text());
    let titleSource: "dom" | "json_ld" | "open_graph" = "dom";
    if (!title) {
      title = normalizeMetadataText(newsArticle.headline);
      titleSource = "json_ld";
    }
    if (!title) {
      title = normalizeMetadataText(
        $("meta[property='og:title']").first().attr("content"),
      );
      titleSource = "open_graph";
    }
    if (!title) {
      return articleError(
        "required_field_missing",
        false,
        "O artigo nao contem titulo valido.",
        canonical.url,
      );
    }

    const subtitle = normalizeArticleText(titleArea.children("p").first().text());
    const subtitleSource = subtitle ? "dom" : null;

    let summary = normalizeMetadataText(newsArticle.description);
    let summarySource: "json_ld" | "open_graph" | "meta_description" | null = summary
      ? "json_ld"
      : null;
    if (!summary) {
      summary = normalizeMetadataText(
        $("meta[property='og:description']").first().attr("content"),
      );
      summarySource = summary ? "open_graph" : null;
    }
    if (!summary) {
      summary = normalizeMetadataText(
        $("meta[name='description']").first().attr("content"),
      );
      summarySource = summary ? "meta_description" : null;
    }

    const domAuthorNames = domAuthors($, titleArea);
    const jsonLdAuthorNames = jsonLdAuthors(newsArticle, jsonLdAnalysis.nodesById);
    const authorNames = combineAuthors(domAuthorNames, jsonLdAuthorNames);
    const author = authorNames.length > 0 ? authorNames.join(" & ") : null;
    const authorSource = domAuthorNames.length > 0
      ? jsonLdAuthorNames.some(
          (name) => !domAuthorNames.some(
            (domName) => domName.toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"),
          ),
        )
        ? "dom_and_json_ld"
        : "dom"
      : jsonLdAuthorNames.length > 0
        ? "json_ld"
        : null;

    const publishedAtSelection = selectPublishedAt($, titleArea, newsArticle.datePublished);
    const publishedAt = publishedAtSelection?.parsed.value ?? null;
    const publishedAtSource = publishedAtSelection?.source ?? null;
    const publishedAtPrecision = publishedAtSelection?.parsed.precision ?? null;

    let modifiedAt = parseCompleteInstant(newsArticle.dateModified);
    let modifiedAtSource: "json_ld" | "meta" | null = modifiedAt
      ? "json_ld"
      : null;
    if (!modifiedAt) {
      modifiedAt = parseCompleteInstant(
        $("meta[property='article:modified_time']").first().attr("content"),
      );
      modifiedAtSource = modifiedAt ? "meta" : null;
    }
    const dateCreated = parseCompleteInstant(newsArticle.dateCreated);

    let imageUrl = jsonLdImage(newsArticle, jsonLdAnalysis.nodesById);
    let imageSource: "json_ld" | "open_graph" | "dom" | null = imageUrl
      ? "json_ld"
      : null;
    if (!imageUrl) {
      imageUrl = safeImageUrl($("meta[property='og:image']").first().attr("content"));
      imageSource = imageUrl ? "open_graph" : null;
    }
    if (!imageUrl) {
      imageUrl = domImage($, mainArticle);
      imageSource = imageUrl ? "dom" : null;
    }

    const body = extractBodyBlocks($, bodyElements.first());
    const bodyTextLength = body.reduce((total, block) => total + block.text.length, 0);
    if (body.length === 0 || bodyTextLength < MINIMUM_BODY_TEXT_LENGTH) {
      return articleError(
        "required_field_missing",
        false,
        "O artigo nao contem corpo editorial suficiente.",
        canonical.url,
      );
    }

    const extractedWordCount = body.reduce(
      (total, block) => total + countWords(block.text),
      0,
    );
    const declaredWordCount = readPositiveInteger(newsArticle.wordCount);
    const wordCountRatio = declaredWordCount
      ? extractedWordCount / declaredWordCount
      : null;
    if (wordCountRatio !== null && wordCountRatio < MINIMUM_WORD_COUNT_RATIO) {
      return articleError(
        "unsupported_content",
        false,
        "O corpo extraido apresenta sinais de truncagem.",
        canonical.url,
      );
    }

    const externalId = externalArticleId($);
    const hasAccessibilityMetadata =
      typeof newsArticle.isAccessibleForFree === "boolean" ||
      (isJsonLdObject(newsArticle.hasPart) &&
        typeof newsArticle.hasPart.isAccessibleForFree === "boolean");

    return {
      ok: true,
      value: {
        sourceCode: RECORD_SOURCE_CODE,
        originalUrl: page.requestedUrl,
        normalizedUrl: canonical.url,
        externalId,
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
          parser: "record-article-v1",
          finalUrl: safeErrorUrl(finalPageUrl.toString()),
          loadedAt: page.loadedAt,
          statusCode: page.statusCode,
          redirectCount: page.redirectCount,
          byteLength: page.byteLength,
          canonicalSource: canonical.source,
          titleSource,
          subtitleSource,
          summarySource,
          authorSource,
          publishedAtSource,
          publishedAtPrecision,
          modifiedAtSource,
          imageSource,
          externalIdSource: externalId ? "social_share" : null,
          bodySelector: "article.main_article > #texto_styck > .text_container",
          bodyBlockCount: body.length,
          extractedWordCount,
          declaredWordCount,
          wordCountRatio: wordCountRatio === null
            ? null
            : Number(wordCountRatio.toFixed(4)),
          accessibilitySource: hasAccessibilityMetadata ? "json_ld" : null,
          dateCreated,
        },
      },
    };
  } catch {
    return articleError(
      "parse_failed",
      true,
      "Nao foi possivel analisar o artigo do Record.",
      page.finalUrl,
    );
  }
}
