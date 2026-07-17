import { load } from "cheerio";

import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import type {
  AdapterResult,
  CollectionErrorCode,
  CollectionErrorStage,
  DiscoveredArticleLink,
} from "@/lib/redacao-automatica/types";

const MAISFUTEBOL_SOURCE_CODE = "maisfutebol";
const MAISFUTEBOL_HOSTNAME = "maisfutebol.iol.pt";
const MAISFUTEBOL_LATEST_NEWS_SELECTOR = ".titleNews .smallNewsList";
const MAISFUTEBOL_ARTICLE_EVENT_LABEL_PATTERN = /^ultimas_artigo_\d+$/i;
const MAISFUTEBOL_EVENT_LABEL_VALUE_PATTERN =
  /["']?eventLabel["']?\s*:\s*["']([^"']+)["']/i;
const MAISFUTEBOL_ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i;
const IGNORED_HREF_SCHEMES = /^(?:javascript|mailto|tel|data):/i;

const MAISFUTEBOL_RESERVED_FIRST_SEGMENTS = new Set([
  "fotogaleria",
  "fotogalerias",
  "videos",
  "jogo",
  "resultadoseclassificacoes",
  "jogador",
  "estatisticas",
  "tag",
  "ultimas",
  "opiniao",
  "cronologia",
  "pesquisa",
  "branded-content",
  "subscrever-newsletter",
  "sondagens",
  "estatutoeditorial",
  "chrome",
  "euromilhoes",
]);

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

function extractEventLabel(onclick: string | undefined): string | null {
  const eventLabel = MAISFUTEBOL_EVENT_LABEL_VALUE_PATTERN.exec(onclick ?? "")?.[1]?.trim();

  if (!eventLabel || !MAISFUTEBOL_ARTICLE_EVENT_LABEL_PATTERN.test(eventLabel)) {
    return null;
  }

  return eventLabel;
}

function hasMaisfutebolHostname(url: URL): boolean {
  return url.hostname === MAISFUTEBOL_HOSTNAME;
}

function hasMaisfutebolArticlePathname(pathname: string): boolean {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (segments.length !== 3) {
    return false;
  }

  const [firstSegment, secondSegment, thirdSegment] = segments;

  if (MAISFUTEBOL_RESERVED_FIRST_SEGMENTS.has(firstSegment)) {
    return false;
  }

  if (secondSegment === "jogos" || secondSegment === "falar-de-bola") {
    return false;
  }

  if (thirdSegment === "clubes" || /^\d+$/.test(thirdSegment) || thirdSegment.includes(".")) {
    return false;
  }

  return MAISFUTEBOL_ARTICLE_SLUG_PATTERN.test(thirdSegment);
}

function getListingPath(value: string): string | null {
  const listingUrl = resolveHttpUrl(value);

  if (!listingUrl || !hasMaisfutebolHostname(listingUrl)) {
    return null;
  }

  return listingUrl.pathname;
}

export const maisfutebolAdapter: SourceAdapter = {
  key: MAISFUTEBOL_SOURCE_CODE,
  sourceCode: MAISFUTEBOL_SOURCE_CODE,

  getListingUrls(source) {
    const homepage = source.homepage.trim();

    if (!homepage) {
      return adapterError({
        code: "required_field_missing",
        stage: "listing",
        sourceCode: source.code,
        url: null,
        recoverable: false,
        detail: "A homepage configurada para o Maisfutebol não pode estar vazia.",
      });
    }

    const parsedHomepage = resolveHttpUrl(homepage);
    if (!parsedHomepage || !hasMaisfutebolHostname(parsedHomepage)) {
      return adapterError({
        code: "invalid_url",
        stage: "listing",
        sourceCode: source.code,
        url: homepage || null,
        recoverable: false,
        detail: "A homepage configurada para o Maisfutebol não é válida ou não pertence ao hostname autorizado.",
      });
    }

    return { ok: true, value: [parsedHomepage.toString()] };
  },

  discoverArticleLinks({ source, page }) {
    if (!isHtmlContentType(page.contentType)) {
      return adapterError({
        code: "unsupported_content",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: false,
        detail: "A página de listagem do Maisfutebol não contém HTML suportado.",
      });
    }

    if (!page.body.trim()) {
      return adapterError({
        code: "parse_failed",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl,
        recoverable: true,
        detail: "A página de listagem do Maisfutebol não contém HTML para analisar.",
      });
    }

    const listingPath = getListingPath(page.finalUrl);
    if (!listingPath) {
      return adapterError({
        code: "invalid_url",
        stage: "listing",
        sourceCode: source.code,
        url: page.finalUrl || null,
        recoverable: false,
        detail: "A URL final da listagem do Maisfutebol não é válida ou não pertence ao hostname autorizado.",
      });
    }

    try {
      const $ = load(page.body);
      const latestNewsZones = $(MAISFUTEBOL_LATEST_NEWS_SELECTOR);

      if (latestNewsZones.length === 0) {
        return adapterError({
          code: "parse_failed",
          stage: "listing",
          sourceCode: source.code,
          url: page.finalUrl,
          recoverable: true,
          detail: "A página do Maisfutebol não contém zonas de últimas notícias compatíveis com a estrutura esperada.",
        });
      }

      const anchors = latestNewsZones.find("a[href]");
      if (anchors.length === 0) {
        return adapterError({
          code: "parse_failed",
          stage: "listing",
          sourceCode: source.code,
          url: page.finalUrl,
          recoverable: true,
          detail: "As zonas de últimas notícias do Maisfutebol não contêm ligações analisáveis.",
        });
      }

      const links: DiscoveredArticleLink[] = [];

      anchors.each((_index, element) => {
        const href = $(element).attr("href")?.trim() ?? "";

        if (isIgnoredHref(href)) {
          return;
        }

        const eventLabel = extractEventLabel($(element).attr("onclick"));
        if (!eventLabel) {
          return;
        }

        const resolvedUrl = resolveHttpUrl(href, page.finalUrl);
        if (
          !resolvedUrl ||
          !hasMaisfutebolHostname(resolvedUrl) ||
          !hasMaisfutebolArticlePathname(resolvedUrl.pathname)
        ) {
          return;
        }

        links.push({
          originalUrl: href,
          sourceMetadata: {
            discoveryMethod: "anchor",
            listingPath,
            eventLabel,
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
          detail: "As zonas de últimas notícias do Maisfutebol não contêm artigos compatíveis com as regras atuais.",
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
        detail: "Não foi possível analisar a página de listagem do Maisfutebol.",
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
        detail: "A URL normalizada do Maisfutebol não é válida.",
      });
    }

    if (!hasMaisfutebolHostname(parsedUrl)) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL não pertence ao hostname autorizado do Maisfutebol.",
      });
    }

    if (!hasMaisfutebolArticlePathname(parsedUrl.pathname)) {
      return adapterError({
        code: "invalid_url",
        stage: "normalization",
        sourceCode: source.code,
        url: normalizedUrl.value,
        recoverable: false,
        detail: "A URL não corresponde a um pathname de artigo suportado do Maisfutebol.",
      });
    }

    return normalizedUrl;
  },
};
