import { load } from "cheerio";

import { parseAbolaArticle } from "@/lib/redacao-automatica/adapters/abola-article-parser";
import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import type {
  AdapterResult,
  CollectionErrorCode,
  CollectionErrorStage,
  DiscoveredArticleLink,
} from "@/lib/redacao-automatica/types";

const ABOLA_SOURCE_CODE = "abola";
const ABOLA_HOSTNAME = "www.abola.pt";
const ABOLA_LISTING_PATH = "/ultimas-noticias/";
const ABOLA_ARTICLE_PATH_PATTERN = /^\/noticias\/[^/]+-(\d{19})\/?$/;
const IGNORED_HREF_SCHEMES = /^(?:javascript|mailto|tel|data):/i;

function adapterError<T>({
  code,
  stage,
  sourceCode,
  url,
  recoverable,
  detail,
}: Readonly<{
  code: CollectionErrorCode;
  stage: CollectionErrorStage;
  sourceCode: string;
  url: string | null;
  recoverable: boolean;
  detail: string;
}>): AdapterResult<T> {
  return {
    ok: false,
    error: {
      code,
      stage,
      sourceCode,
      url,
      recoverable,
      detail,
    },
  };
}

function isHtmlContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes("text/html") ?? false;
}

function isIgnoredHref(href: string): boolean {
  return !href || href.startsWith("#") || IGNORED_HREF_SCHEMES.test(href);
}

function resolveHttpUrl(value: string, baseUrl?: string): URL | null {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hasAbolaHostname(url: URL): boolean {
  return url.hostname === ABOLA_HOSTNAME;
}

function getAbolaArticleId(url: URL): string | null {
  return ABOLA_ARTICLE_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
}

export const abolaAdapter: SourceAdapter = {
  key: ABOLA_SOURCE_CODE,
  sourceCode: ABOLA_SOURCE_CODE,

  getListingUrls(source) {
    const homepage = source.homepage.trim();

    if (!homepage) {
      return adapterError({
        code: "required_field_missing",
        stage: "listing",
        sourceCode: source.code,
        url: null,
        recoverable: false,
        detail: "A homepage configurada para A Bola não pode estar vazia.",
      });
    }

    try {
      const listingUrl = new URL(ABOLA_LISTING_PATH, homepage);
      return { ok: true, value: [listingUrl.toString()] };
    } catch {
      return adapterError({
        code: "invalid_url",
        stage: "listing",
        sourceCode: source.code,
        url: homepage || null,
        recoverable: false,
        detail: "Não foi possível construir a URL de últimas notícias de A Bola.",
      });
    }
  },

  discoverArticleLinks({ source, page }) {
    if (!isHtmlContentType(page.contentType)) {
      return adapterError({
        code: "unsupported_content",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: false,
        detail: "A página de listagem de A Bola não contém HTML suportado.",
      });
    }

    if (!page.body.trim()) {
      return adapterError({
        code: "parse_failed",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: true,
        detail: "A página de listagem de A Bola não contém HTML para analisar.",
      });
    }

    const listingUrl = resolveHttpUrl(page.finalUrl);
    if (!listingUrl) {
      return adapterError({
        code: "invalid_url",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl || null,
        recoverable: false,
        detail: "A URL final da listagem de A Bola não é válida.",
      });
    }

    try {
      const $ = load(page.body);
      const anchors = $("a[href]");

      if (anchors.length === 0) {
        return adapterError({
          code: "parse_failed",
          stage: "listing",
          sourceCode: source.code,
          url: page.finalUrl,
          recoverable: true,
          detail: "A página de listagem de A Bola não contém ligações analisáveis.",
        });
      }

      const listingPath = listingUrl.pathname;
      const links: DiscoveredArticleLink[] = [];

      anchors.each((_index, element) => {
        const href = $(element).attr("href")?.trim() ?? "";

        if (isIgnoredHref(href)) {
          return;
        }

        const resolvedUrl = resolveHttpUrl(href, page.finalUrl);
        if (!resolvedUrl || !hasAbolaHostname(resolvedUrl)) {
          return;
        }

        const articleId = getAbolaArticleId(resolvedUrl);
        if (!articleId) {
          return;
        }

        links.push({
          originalUrl: href,
          sourceMetadata: {
            discoveryMethod: "anchor",
            listingPath,
            articleId,
          },
        });
      });

      if (links.length === 0) {
        return adapterError({
          code: "parse_failed",
          stage: "listing",
          sourceCode: source.code,
          url: page.finalUrl,
          recoverable: true,
          detail: "A página de listagem de A Bola não contém artigos compatíveis com as regras atuais.",
        });
      }

      return { ok: true, value: links };
    } catch {
      return adapterError({
        code: "parse_failed",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: true,
        detail: "Não foi possível analisar a página de listagem de A Bola.",
      });
    }
  },

  normalizeArticleUrl({ source, url, baseUrl }) {
    const normalizedUrl = normalizeUrl({
      url,
      baseUrl,
      allowedDomain: source.domain,
      sourceCode: source.code,
    });

    if (!normalizedUrl.ok) {
      return normalizedUrl;
    }

    const parsedUrl = resolveHttpUrl(normalizedUrl.value);
    if (!parsedUrl) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL normalizada de A Bola não é válida.",
      });
    }

    if (!hasAbolaHostname(parsedUrl)) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL não pertence ao hostname autorizado de A Bola.",
      });
    }

    if (!getAbolaArticleId(parsedUrl)) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL não corresponde a um pathname de artigo suportado de A Bola.",
      });
    }

    return normalizedUrl;
  },

  extractArticle(input) {
    return parseAbolaArticle(input);
  },
};
