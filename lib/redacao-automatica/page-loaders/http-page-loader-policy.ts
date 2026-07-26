import type { PageLoadPurpose } from "@/lib/redacao-automatica/page-loader";

export type HttpPageLoaderPolicy = Readonly<{
  sourceCode: string;
  allowedHostnames: readonly string[];
  allowedProtocols: readonly string[];
  allowedPurposes: readonly PageLoadPurpose[];
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  allowedContentTypes: readonly string[];
  acceptedStatusCodes: readonly number[];
  userAgent: string;
  acceptLanguage: string;
}>;

const CONTROLLED_USER_AGENT =
  "Jornada.pt-Newsroom/1.0 (+https://www.jornada.pt/)";
const CONTROLLED_ACCEPT_LANGUAGE = "pt-PT,pt;q=0.9,en;q=0.5";
const FORBIDDEN_HTTP_SOURCE_CODES = Object.freeze(["ojogo"]);

const policiesBySourceCode = new Map<string, HttpPageLoaderPolicy>([
  [
    "record",
    Object.freeze({
      sourceCode: "record",
      allowedHostnames: Object.freeze(["www.record.pt"]),
      allowedProtocols: Object.freeze(["https:"]),
      allowedPurposes: Object.freeze(["listing", "article"] as const),
      timeoutMs: 10_000,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 3,
      allowedContentTypes: Object.freeze(["text/html"]),
      acceptedStatusCodes: Object.freeze([200]),
      userAgent: CONTROLLED_USER_AGENT,
      acceptLanguage: CONTROLLED_ACCEPT_LANGUAGE,
    }),
  ],
  [
    "abola",
    Object.freeze({
      sourceCode: "abola",
      allowedHostnames: Object.freeze(["www.abola.pt"]),
      allowedProtocols: Object.freeze(["https:"]),
      allowedPurposes: Object.freeze(["listing", "article"] as const),
      timeoutMs: 10_000,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 3,
      allowedContentTypes: Object.freeze(["text/html"]),
      acceptedStatusCodes: Object.freeze([200]),
      userAgent: CONTROLLED_USER_AGENT,
      acceptLanguage: CONTROLLED_ACCEPT_LANGUAGE,
    }),
  ],
  [
    "maisfutebol",
    Object.freeze({
      sourceCode: "maisfutebol",
      allowedHostnames: Object.freeze(["maisfutebol.iol.pt"]),
      allowedProtocols: Object.freeze(["https:"]),
      allowedPurposes: Object.freeze(["listing"] as const),
      timeoutMs: 10_000,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 3,
      allowedContentTypes: Object.freeze(["text/html"]),
      acceptedStatusCodes: Object.freeze([200]),
      userAgent: CONTROLLED_USER_AGENT,
      acceptLanguage: CONTROLLED_ACCEPT_LANGUAGE,
    }),
  ],
]);

export function isHttpSourceForbidden(sourceCode: string): boolean {
  return FORBIDDEN_HTTP_SOURCE_CODES.includes(sourceCode.trim());
}

export function resolveHttpPageLoaderPolicy(
  sourceCode: string,
): HttpPageLoaderPolicy | null {
  return policiesBySourceCode.get(sourceCode.trim()) ?? null;
}
