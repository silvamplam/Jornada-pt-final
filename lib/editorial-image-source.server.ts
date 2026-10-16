import { load } from "cheerio";
import { downloadEditorialResource, safeEditorialSourceUrl } from "./editorial-image-download.server";

// Explicit social rendition semantics, independent of a CDN hostname. Never
// rewrite such a URL into a supposedly clean rendition.
export function isSocialImageRendition(value: string) {
  try { return /\/(?:og|opengraph|social)(?:[/.]|$)/i.test(new URL(value).pathname); }
  catch { return false; }
}

export function articleImageReferences(html: string, pageUrl: string) {
  const $ = load(html);
  const absolute = (value: unknown) => {
    try { return typeof value === "string" ? safeEditorialSourceUrl(new URL(value, pageUrl).href).href : null; }
    catch { return null; }
  };
  const social = new Set<string>();
  $('meta[property="og:image"],meta[name^="twitter:image"],meta[property^="twitter:image"]').each((_, el) => {
    const url = absolute($(el).attr("content")); if (url) social.add(url);
  });
  const images: string[] = [];
  const addImage = (value: unknown) => {
    for (const item of Array.isArray(value) ? value : [value]) {
      const url = absolute(typeof item === "object" && item ? item.contentUrl ?? item.url : item);
      if (url && !isSocialImageRendition(url)) images.push(url);
    }
  };
  // Only the article's image, never publisher.logo, related ItemList or WebSite.
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    if (typeof value !== "object") return;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type: unknown) => typeof type === "string" && /^(?:NewsArticle|Article|ReportageNewsArticle|BlogPosting)$/.test(type))) addImage(value.image);
    visit(value["@graph"], depth + 1);
    visit(value.mainEntity, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { visit(JSON.parse($(el).text())); } catch { /* Malformed metadata is not authority. */ }
  });
  // A scoped article image is useful on publishers without structured data.
  if (!images.length) $('article [itemprop="image"],article figure img,[itemprop="articleBody"] img').each((_, el) => {
    const node = $(el);
    if (node.closest('aside,nav,footer,[aria-hidden="true"]').length) return;
    addImage(node.attr("content") ?? node.attr("data-src") ?? node.attr("src"));
  });
  return { social, article: [...new Set(images)] };
}

export async function resolveEditorialImageSource(source: string, pageUrl?: string | null,
  readPage = async (url: string) => {
    const page = await downloadEditorialResource(url, ["text/html", "application/xhtml+xml"], 2 * 1024 * 1024);
    return { html: Buffer.from(page.bytes).toString("utf8"), url: page.finalUrl };
  },
) {
  safeEditorialSourceUrl(source);
  if (!pageUrl) {
    if (isSocialImageRendition(source)) throw new Error("image-article-source-required");
    return source;
  }
  const page = await readPage(pageUrl);
  const refs = articleImageReferences(page.html, page.url);
  // Many publishers use the actual photograph unchanged for both Article and
  // og:image. Equal references are not evidence of a branded social rendition.
  if (refs.article.includes(source) && !isSocialImageRendition(source)) return source;
  if (!refs.social.has(source) && !isSocialImageRendition(source)) return source;
  const candidates = refs.article.filter(url => !refs.social.has(url));
  if (candidates.length !== 1) throw new Error("image-article-image-unresolved");
  return candidates[0];
}
