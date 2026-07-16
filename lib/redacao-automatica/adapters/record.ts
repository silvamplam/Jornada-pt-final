import { load } from "cheerio";

import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import type {
  AdapterResult,
  CollectionErrorCode,
  CollectionErrorStage,
  DiscoveredArticleLink,
} from "@/lib/redacao-automatica/types";

const RECORD_SOURCE_CODE = "record";
const RECORD_HOSTNAME = "www.record.pt";
const RECORD_ARTICLE_PATHNAME = /^\/(futebol|internacional|modalidades)\/.+\/detalhe\/[^/]+\/?$/;
const RECORD_HOMEPAGE_REFERENCE = /^HP_/i;
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

function resolveUrlForInspection(href: string, baseUrl: string): URL | null {
  try {
    const url = new URL(href, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hasRecordHostname(url: URL): boolean {
  return url.hostname === RECORD_HOSTNAME;
}

function hasRecordArticlePathname(url: URL): boolean {
  return RECORD_ARTICLE_PATHNAME.test(url.pathname);
}

function removeHomepageReference(url: URL): URL {
  const normalizedUrl = new URL(url.toString());
  const reference = normalizedUrl.searchParams.get("ref");

  if (reference && RECORD_HOMEPAGE_REFERENCE.test(reference)) {
    normalizedUrl.searchParams.delete("ref");
  }

  return normalizedUrl;
}

export const recordAdapter: SourceAdapter = {
  key: RECORD_SOURCE_CODE,
  sourceCode: RECORD_SOURCE_CODE,

  getListingUrls(source) {
    const homepage = source.homepage.trim();

    if (!homepage) {
      return adapterError({
        code: "required_field_missing",
        stage: "listing",
        sourceCode: RECORD_SOURCE_CODE,
        url: null,
        recoverable: false,
        detail: "A homepage configurada para o Record não pode estar vazia.",
      });
    }

    return { ok: true, value: [homepage] };
  },

  discoverArticleLinks({ source, page }) {
    if (!isHtmlContentType(page.contentType)) {
      return adapterError({
        code: "unsupported_content",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: false,
        detail: "A página de listagem do Record não contém HTML suportado.",
      });
    }

    if (!page.body.trim()) {
      return adapterError({
        code: "parse_failed",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: true,
        detail: "A página de listagem do Record não contém HTML para analisar.",
      });
    }

    try {
      const listingUrl = new URL(page.finalUrl);
      const $ = load(page.body);
      const anchors = $("a[href]");

      if (anchors.length === 0) {
        return adapterError({
          code: "parse_failed",
          stage: "listing",
          sourceCode: source.code,
          url: page.finalUrl,
          recoverable: true,
          detail: "A página de listagem do Record não contém ligações analisáveis.",
        });
      }

      const links: DiscoveredArticleLink[] = [];

      anchors.each((_index, element) => {
        const href = $(element).attr("href")?.trim() ?? "";

        if (!href || href.startsWith("#") || IGNORED_HREF_SCHEMES.test(href)) {
          return;
        }

        const resolvedUrl = resolveUrlForInspection(href, page.finalUrl);
        if (!resolvedUrl || !hasRecordHostname(resolvedUrl) || !hasRecordArticlePathname(resolvedUrl)) {
          return;
        }

        links.push({
          originalUrl: href,
          sourceMetadata: {
            discoveryMethod: "anchor",
            listingPath: listingUrl.pathname,
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
          detail: "A página de listagem do Record não contém artigos compatíveis com as regras atuais.",
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
        detail: "Não foi possível analisar a página de listagem do Record.",
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

    const parsedUrl = resolveUrlForInspection(normalizedUrl.value, baseUrl);
    if (!parsedUrl) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL normalizada do Record não é válida.",
      });
    }

    if (!hasRecordHostname(parsedUrl)) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL não pertence ao hostname autorizado do Record.",
      });
    }

    if (!hasRecordArticlePathname(parsedUrl)) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL não corresponde a um pathname de artigo suportado do Record.",
      });
    }

    const urlWithoutHomepageReference = removeHomepageReference(parsedUrl);

    return normalizeUrl({
      url: urlWithoutHomepageReference.toString(),
      allowedDomain: source.domain,
      sourceCode: source.code,
    });
  },

  extractArticle({ page }) {
    return adapterError({
      code: "unsupported_content",
      stage: "article",
      sourceCode: RECORD_SOURCE_CODE,
      url: page.finalUrl,
      recoverable: false,
      detail: "A extração de artigos não é suportada nesta versão do adaptador.",
    });
  },
};
