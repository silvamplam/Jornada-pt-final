export type HttpPageLoaderPolicy = Readonly<{
  sourceCode: string;
  allowedHostnames: readonly string[];
  allowedProtocols: readonly string[];
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  allowedContentTypes: readonly string[];
}>;

const COMMON_ALLOWED_PROTOCOLS = Object.freeze(["https:"]);
const COMMON_ALLOWED_CONTENT_TYPES = Object.freeze(["text/html"]);
const COMMON_TIMEOUT_MS = 10_000;
const COMMON_MAX_BYTES = 5 * 1024 * 1024;
const COMMON_MAX_REDIRECTS = 3;

function createPolicy(
  sourceCode: string,
  allowedHostnames: readonly string[],
): HttpPageLoaderPolicy {
  return Object.freeze({
    sourceCode,
    allowedHostnames: Object.freeze([...allowedHostnames]),
    allowedProtocols: COMMON_ALLOWED_PROTOCOLS,
    timeoutMs: COMMON_TIMEOUT_MS,
    maxBytes: COMMON_MAX_BYTES,
    maxRedirects: COMMON_MAX_REDIRECTS,
    allowedContentTypes: COMMON_ALLOWED_CONTENT_TYPES,
  });
}

const policiesBySourceCode = new Map<string, HttpPageLoaderPolicy>([
  ["record", createPolicy("record", ["www.record.pt"])],
  ["abola", createPolicy("abola", ["www.abola.pt"])],
  ["maisfutebol", createPolicy("maisfutebol", ["maisfutebol.iol.pt"])],
]);

export function resolveHttpPageLoaderPolicy(
  sourceCode: string,
): HttpPageLoaderPolicy | null {
  return policiesBySourceCode.get(sourceCode.trim()) ?? null;
}
