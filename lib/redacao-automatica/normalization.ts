import type {
  CollectionError,
  OperationResult,
} from "@/lib/redacao-automatica/types";

const TRACKING_PARAMETER_NAMES = new Set(["fbclid", "gclid"]);

export function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}

export type NormalizeUrlInput = Readonly<{
  url: string;
  baseUrl?: string | null;
  allowedDomain?: string | null;
  sourceCode?: string | null;
}>;

function invalidUrlError(
  input: NormalizeUrlInput,
  detail: string,
): OperationResult<never, CollectionError> {
  return {
    ok: false,
    error: {
      code: "invalid_url",
      stage: "normalization",
      sourceCode: input.sourceCode ?? null,
      url: normalizeText(input.url),
      recoverable: false,
      detail,
    },
  };
}

function normalizedDomain(value: string): string | null {
  const domain = normalizeText(value)?.toLowerCase().replace(/^\.+|\.+$/g, "");
  return domain || null;
}

function isAllowedHostname(hostname: string, allowedDomain: string) {
  return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);
}

function removeTrackingParameters(url: URL) {
  for (const key of Array.from(url.searchParams.keys())) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || TRACKING_PARAMETER_NAMES.has(normalizedKey)) {
      url.searchParams.delete(key);
    }
  }
}

export function normalizeUrl(
  input: NormalizeUrlInput,
): OperationResult<string, CollectionError> {
  const rawUrl = normalizeText(input.url);
  if (!rawUrl) {
    return invalidUrlError(input, "A URL não pode estar vazia.");
  }

  try {
    const url = input.baseUrl ? new URL(rawUrl, input.baseUrl) : new URL(rawUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return invalidUrlError(input, "A URL deve usar o protocolo http ou https.");
    }

    if (url.username || url.password) {
      return invalidUrlError(input, "A URL não pode conter credenciais.");
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    url.hostname = hostname;

    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }

    if (input.allowedDomain !== undefined && input.allowedDomain !== null) {
      const allowedDomain = normalizedDomain(input.allowedDomain);
      if (!allowedDomain || !isAllowedHostname(hostname, allowedDomain)) {
        return invalidUrlError(input, "A URL não pertence ao domínio autorizado.");
      }
    }

    url.hash = "";
    removeTrackingParameters(url);

    return { ok: true, value: url.toString() };
  } catch {
    return invalidUrlError(input, "A URL fornecida não é válida.");
  }
}
