import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type {
  PageLoader,
  PageLoadRequest,
} from "@/lib/redacao-automatica/page-loader";
import {
  isHttpSourceForbidden,
  resolveHttpPageLoaderPolicy,
  type HttpPageLoaderPolicy,
} from "@/lib/redacao-automatica/page-loaders/http-page-loader-policy";
import type {
  CollectionError,
  CollectionErrorCode,
  LoadedPage,
  OperationResult,
} from "@/lib/redacao-automatica/types";

type ResolvedHostnameAddress = Readonly<{
  address: string;
  family: number;
}>;

type ResolveHostname = (
  hostname: string,
) => Promise<readonly ResolvedHostnameAddress[]>;

type ResolvePolicy = (
  sourceCode: string,
) => HttpPageLoaderPolicy | null;

export type HttpPageLoaderOptions = Readonly<{
  fetchImpl?: typeof globalThis.fetch;
  resolveHostname?: ResolveHostname;
  clock?: () => Date;
  resolvePolicy?: ResolvePolicy;
}>;

type ValidatedBody = Readonly<{
  body: string;
  byteLength: number;
}>;

const REQUEST_HEADERS = Object.freeze({
  "User-Agent": "Jornada.pt-Newsroom/1.0 (+https://www.jornada.pt/)",
  Accept: "text/html",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.5",
  "Accept-Encoding": "identity",
});

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const TIMEOUT_SIGNAL = Symbol("http-page-loader-timeout");

const BLOCKED_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
] as const;

function stageForRequest(request: PageLoadRequest): "listing" | "article" {
  return request.purpose === "listing" ? "listing" : "article";
}

function sourceCodeForError(request: PageLoadRequest): string | null {
  const sourceCode = request.sourceCode.trim();
  return sourceCode || null;
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

function collectionError(
  request: PageLoadRequest,
  code: CollectionErrorCode,
  recoverable: boolean,
  detail: string,
  url: unknown = request.url,
): CollectionError {
  return {
    code,
    stage: stageForRequest(request),
    sourceCode: sourceCodeForError(request),
    url: safeErrorUrl(url),
    recoverable,
    detail,
  };
}

function errorResult<T>(
  request: PageLoadRequest,
  code: CollectionErrorCode,
  recoverable: boolean,
  detail: string,
  url: unknown = request.url,
): OperationResult<T, CollectionError> {
  return {
    ok: false,
    error: collectionError(request, code, recoverable, detail, url),
  };
}

function normalizeIpLiteralHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }

  return hostname;
}

function parseIpv4Bytes(address: string): readonly number[] | null {
  if (isIP(address) !== 4) {
    return null;
  }

  const bytes = address.split(".").map((part) => Number(part));
  if (
    bytes.length !== 4 ||
    bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    return null;
  }

  return bytes;
}

function ipv4BytesToNumber(bytes: readonly number[]): number {
  return (
    ((bytes[0] << 24) >>> 0) +
    (bytes[1] << 16) +
    (bytes[2] << 8) +
    bytes[3]
  ) >>> 0;
}

function matchesIpv4Prefix(
  addressBytes: readonly number[],
  networkAddress: string,
  prefixLength: number,
): boolean {
  const networkBytes = parseIpv4Bytes(networkAddress);
  if (!networkBytes) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (
    (ipv4BytesToNumber(addressBytes) & mask) >>> 0
  ) === ((ipv4BytesToNumber(networkBytes) & mask) >>> 0);
}

function isBlockedIpv4Bytes(bytes: readonly number[]): boolean {
  if (bytes.length !== 4) {
    return true;
  }

  return BLOCKED_IPV4_RANGES.some(([networkAddress, prefixLength]) =>
    matchesIpv4Prefix(bytes, networkAddress, prefixLength),
  );
}

function isBlockedIpv4(address: string): boolean {
  const bytes = parseIpv4Bytes(address);
  return !bytes || isBlockedIpv4Bytes(bytes);
}

function parseIpv6Bytes(address: string): Uint8Array | null {
  const normalizedAddress = normalizeIpLiteralHostname(address).toLowerCase();
  if (isIP(normalizedAddress) !== 6 || normalizedAddress.includes("%")) {
    return null;
  }

  let hexadecimalAddress = normalizedAddress;
  if (hexadecimalAddress.includes(".")) {
    const lastColonIndex = hexadecimalAddress.lastIndexOf(":");
    const ipv4Address = hexadecimalAddress.slice(lastColonIndex + 1);
    const ipv4Bytes = parseIpv4Bytes(ipv4Address);
    if (!ipv4Bytes) {
      return null;
    }

    const firstGroup = ((ipv4Bytes[0] << 8) | ipv4Bytes[1]).toString(16);
    const secondGroup = ((ipv4Bytes[2] << 8) | ipv4Bytes[3]).toString(16);
    hexadecimalAddress = `${hexadecimalAddress.slice(0, lastColonIndex)}:${firstGroup}:${secondGroup}`;
  }

  const halves = hexadecimalAddress.split("::");
  if (halves.length > 2) {
    return null;
  }

  const leftGroups = halves[0] ? halves[0].split(":") : [];
  const rightGroups = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const omittedGroupCount = 8 - leftGroups.length - rightGroups.length;

  if (
    (halves.length === 1 && omittedGroupCount !== 0) ||
    (halves.length === 2 && omittedGroupCount < 1)
  ) {
    return null;
  }

  const groups = [
    ...leftGroups,
    ...Array.from({ length: omittedGroupCount }, () => "0"),
    ...rightGroups,
  ];

  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }

  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >>> 8;
    bytes[index * 2 + 1] = value & 0xff;
  });

  return bytes;
}

function matchesIpv6Prefix(
  address: Uint8Array,
  network: readonly number[],
  prefixLength: number,
): boolean {
  const completeBytes = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;

  for (let index = 0; index < completeBytes; index += 1) {
    if (address[index] !== (network[index] ?? 0)) {
      return false;
    }
  }

  if (remainingBits === 0) {
    return true;
  }

  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (address[completeBytes] & mask) === ((network[completeBytes] ?? 0) & mask);
}

function isBlockedIpv6(address: string): boolean {
  const bytes = parseIpv6Bytes(address);
  if (!bytes) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [], 128)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 128)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96)) {
    const embeddedIpv4 = Array.from(bytes.slice(12));
    if (isBlockedIpv4Bytes(embeddedIpv4)) {
      return true;
    }

    return true;
  }

  if (matchesIpv6Prefix(bytes, [0x00, 0x64, 0xff, 0x9b], 96)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0x01, 0x00], 64)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0xfc], 7)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0xfe, 0x80], 10)) {
    return true;
  }

  if (matchesIpv6Prefix(bytes, [0xff], 8)) {
    return true;
  }

  return !matchesIpv6Prefix(bytes, [0x20], 3);
}

function isBlockedIpAddress(address: string): boolean {
  const normalizedAddress = normalizeIpLiteralHostname(address);
  const version = isIP(normalizedAddress);

  if (version === 4) {
    return isBlockedIpv4(normalizedAddress);
  }

  if (version === 6) {
    return isBlockedIpv6(normalizedAddress);
  }

  return true;
}

function validateUrl(
  request: PageLoadRequest,
  policy: HttpPageLoaderPolicy,
  value: unknown,
): OperationResult<URL, CollectionError> {
  if (typeof value !== "string" || !value.trim()) {
    return errorResult(request, "invalid_url", false, "A URL não pode estar vazia.", value);
  }

  const rawUrl = value.trim();
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl)) {
    return errorResult(request, "invalid_url", false, "A URL deve ser absoluta.", rawUrl);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return errorResult(request, "invalid_url", false, "A URL fornecida não é válida.", rawUrl);
  }

  if (!policy.allowedProtocols.includes(url.protocol)) {
    return errorResult(request, "domain_not_allowed", false, "O protocolo não é autorizado pela policy HTTP.", url.toString());
  }

  if (url.username || url.password) {
    return errorResult(request, "invalid_url", false, "A URL não pode conter credenciais.", url.toString());
  }

  if (url.hash) {
    return errorResult(request, "invalid_url", false, "A URL não pode conter fragmento.", url.toString());
  }

  if (url.port) {
    return errorResult(request, "invalid_url", false, "A URL não pode usar uma porta não padrão.", url.toString());
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname.endsWith(".")) {
    return errorResult(request, "invalid_url", false, "O hostname não pode terminar em ponto.", url.toString());
  }

  const ipLiteral = normalizeIpLiteralHostname(hostname);
  if (isIP(ipLiteral) !== 0) {
    const code = isBlockedIpAddress(ipLiteral)
      ? "private_network_blocked"
      : "domain_not_allowed";
    return errorResult(request, code, false, "Endereços IP literais não são autorizados.", url.toString());
  }

  if (hostname === "localhost" || !hostname.includes(".")) {
    return errorResult(request, "invalid_url", false, "O hostname não é válido para carregamento HTTP.", url.toString());
  }

  if (!policy.allowedHostnames.includes(hostname)) {
    return errorResult(request, "domain_not_allowed", false, "O hostname não é autorizado pela policy HTTP.", url.toString());
  }

  return { ok: true, value: url };
}

function throwIfTimedOut(signal: AbortSignal): void {
  if (signal.aborted) {
    throw TIMEOUT_SIGNAL;
  }
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(TIMEOUT_SIGNAL);
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      reject(TIMEOUT_SIGNAL);
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
}

async function defaultResolveHostname(
  hostname: string,
): Promise<readonly ResolvedHostnameAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family }));
}

async function validateDnsResolution(
  request: PageLoadRequest,
  url: URL,
  resolveHostname: ResolveHostname,
  signal: AbortSignal,
): Promise<OperationResult<true, CollectionError>> {
  let addresses: readonly ResolvedHostnameAddress[];

  try {
    // Node 20 lookup has no AbortSignal; this race can time out while the underlying lookup settles later.
    addresses = await withAbort(
      Promise.resolve().then(() => resolveHostname(url.hostname)),
      signal,
    );
  } catch (error) {
    if (error === TIMEOUT_SIGNAL || signal.aborted) {
      throw TIMEOUT_SIGNAL;
    }

    return errorResult(
      request,
      "dns_resolution_failed",
      true,
      "Não foi possível resolver o hostname autorizado.",
      url.toString(),
    );
  }

  throwIfTimedOut(signal);

  if (addresses.length === 0) {
    return errorResult(
      request,
      "dns_resolution_failed",
      true,
      "A resolução DNS não devolveu endereços.",
      url.toString(),
    );
  }

  for (const resolvedAddress of addresses) {
    const version = isIP(normalizeIpLiteralHostname(resolvedAddress.address));
    if (
      version === 0 ||
      resolvedAddress.family !== version ||
      isBlockedIpAddress(resolvedAddress.address)
    ) {
      return errorResult(
        request,
        "private_network_blocked",
        false,
        "A resolução DNS devolveu um endereço não globalmente roteável.",
        url.toString(),
      );
    }
  }

  // This preflight reduces risk, but native fetch may resolve again; strong protection requires controlled transport or egress.
  return { ok: true, value: true };
}

async function cancelResponseBody(
  response: Response,
  signal: AbortSignal,
): Promise<void> {
  if (!response.body) {
    return;
  }

  try {
    await withAbort(response.body.cancel(), signal);
  } catch (error) {
    if (error === TIMEOUT_SIGNAL || signal.aborted) {
      throw TIMEOUT_SIGNAL;
    }
  }
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  try {
    await withAbort(reader.cancel(), signal);
  } catch (error) {
    if (error === TIMEOUT_SIGNAL || signal.aborted) {
      throw TIMEOUT_SIGNAL;
    }
  }
}

function parseContentType(
  request: PageLoadRequest,
  policy: HttpPageLoaderPolicy,
  contentType: string | null,
  url: URL,
): OperationResult<true, CollectionError> {
  if (!contentType) {
    return errorResult(
      request,
      "unsupported_content",
      false,
      "A resposta não contém Content-Type.",
      url.toString(),
    );
  }

  const parts = contentType.split(";");
  const mediaType = parts.shift()?.trim().toLowerCase() ?? "";
  if (!policy.allowedContentTypes.includes(mediaType)) {
    return errorResult(
      request,
      "unsupported_content",
      false,
      "O Content-Type da resposta não é suportado.",
      url.toString(),
    );
  }

  for (const parameter of parts) {
    const trimmedParameter = parameter.trim();
    if (!trimmedParameter) {
      continue;
    }

    const separatorIndex = trimmedParameter.indexOf("=");
    const name = (
      separatorIndex >= 0
        ? trimmedParameter.slice(0, separatorIndex)
        : trimmedParameter
    ).trim().toLowerCase();

    if (name !== "charset") {
      continue;
    }

    if (separatorIndex < 0) {
      return errorResult(
        request,
        "unsupported_content",
        false,
        "O charset declarado não é suportado.",
        url.toString(),
      );
    }

    let charset = trimmedParameter.slice(separatorIndex + 1).trim().toLowerCase();
    if (
      charset.length >= 2 &&
      ((charset.startsWith('"') && charset.endsWith('"')) ||
        (charset.startsWith("'") && charset.endsWith("'")))
    ) {
      charset = charset.slice(1, -1).trim();
    }

    if (charset !== "utf-8" && charset !== "utf8") {
      return errorResult(
        request,
        "unsupported_content",
        false,
        "O charset declarado não é suportado.",
        url.toString(),
      );
    }
  }

  return { ok: true, value: true };
}

function contentLengthExceedsLimit(
  contentLength: string | null,
  maxBytes: number,
): boolean {
  const normalizedLength = contentLength?.trim() ?? "";
  if (!/^\d+$/.test(normalizedLength)) {
    return false;
  }

  try {
    return BigInt(normalizedLength) > BigInt(maxBytes);
  } catch {
    return false;
  }
}

async function readValidatedBody(
  request: PageLoadRequest,
  response: Response,
  url: URL,
  policy: HttpPageLoaderPolicy,
  signal: AbortSignal,
): Promise<OperationResult<ValidatedBody, CollectionError>> {
  if (!response.body) {
    return errorResult(
      request,
      "load_failed",
      false,
      "A resposta HTTP 200 não contém body.",
      url.toString(),
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      throwIfTimedOut(signal);
      const chunk = await withAbort(reader.read(), signal);
      if (chunk.done) {
        break;
      }

      if (!chunk.value) {
        continue;
      }

      if (byteLength + chunk.value.byteLength > policy.maxBytes) {
        await cancelReader(reader, signal);
        return errorResult(
          request,
          "response_too_large",
          false,
          "O body excede o limite máximo permitido.",
          url.toString(),
        );
      }

      byteLength += chunk.value.byteLength;
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error === TIMEOUT_SIGNAL || signal.aborted) {
      await cancelReader(reader, signal);
      throw TIMEOUT_SIGNAL;
    }

    await cancelReader(reader, signal);
    return errorResult(
      request,
      "load_failed",
      true,
      "A leitura do body foi interrompida.",
      url.toString(),
    );
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be cancelled or errored.
    }
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return errorResult(
      request,
      "unsupported_content",
      false,
      "O body não contém UTF-8 válido.",
      url.toString(),
    );
  }

  if (!body.trim()) {
    return errorResult(
      request,
      "load_failed",
      false,
      "O body HTML está vazio.",
      url.toString(),
    );
  }

  return { ok: true, value: { body, byteLength } };
}

function isRecoverableHttpStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}

export function createHttpPageLoader(
  options: HttpPageLoaderOptions = {},
): PageLoader {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;
  const clock = options.clock ?? (() => new Date());
  const resolvePolicy = options.resolvePolicy ?? resolveHttpPageLoaderPolicy;

  return {
    async load(request): Promise<OperationResult<LoadedPage, CollectionError>> {
      const normalizedSourceCode = request.sourceCode.trim();

      if (isHttpSourceForbidden(normalizedSourceCode)) {
        return errorResult(
          request,
          "source_forbidden",
          false,
          "A fonte não está autorizada para carregamento HTTP externo.",
        );
      }

      let policy: HttpPageLoaderPolicy | null;

      try {
        policy = resolvePolicy(normalizedSourceCode);
      } catch {
        return errorResult(
          request,
          "load_failed",
          true,
          "Não foi possível resolver a policy HTTP.",
        );
      }

      if (!policy || policy.sourceCode !== normalizedSourceCode) {
        return errorResult(
          request,
          "domain_not_allowed",
          false,
          "A fonte não possui policy HTTP autorizada.",
        );
      }

      const initialUrlResult = validateUrl(request, policy, request.url);
      if (!initialUrlResult.ok) {
        return initialUrlResult;
      }

      const requestedUrl = initialUrlResult.value.toString();
      let currentUrl = initialUrlResult.value;
      let redirectCount = 0;
      const visitedUrls = new Set([requestedUrl]);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort(TIMEOUT_SIGNAL);
      }, policy.timeoutMs);

      try {
        while (true) {
          throwIfTimedOut(controller.signal);

          const dnsResult = await validateDnsResolution(
            request,
            currentUrl,
            resolveHostname,
            controller.signal,
          );
          if (!dnsResult.ok) {
            return dnsResult;
          }

          let response: Response;
          try {
            response = await withAbort(
              fetchImpl(currentUrl.toString(), {
                method: "GET",
                headers: REQUEST_HEADERS,
                redirect: "manual",
                credentials: "omit",
                referrerPolicy: "no-referrer",
                cache: "no-store",
                signal: controller.signal,
              }),
              controller.signal,
            );
          } catch (error) {
            if (error === TIMEOUT_SIGNAL || controller.signal.aborted) {
              throw TIMEOUT_SIGNAL;
            }

            return errorResult(
              request,
              "load_failed",
              true,
              "O pedido HTTP falhou.",
              currentUrl.toString(),
            );
          }

          if (REDIRECT_STATUS_CODES.has(response.status)) {
            const location = response.headers.get("location")?.trim() ?? "";
            await cancelResponseBody(response, controller.signal);

            if (!location) {
              return errorResult(
                request,
                "redirect_blocked",
                false,
                "O redirect não contém Location válido.",
                currentUrl.toString(),
              );
            }

            if (redirectCount >= policy.maxRedirects) {
              return errorResult(
                request,
                "redirect_blocked",
                false,
                "Foi excedido o número máximo de redirects.",
                currentUrl.toString(),
              );
            }

            let redirectUrl: string;
            try {
              redirectUrl = new URL(location, currentUrl).toString();
            } catch {
              return errorResult(
                request,
                "redirect_blocked",
                false,
                "O destino do redirect não é uma URL válida.",
                currentUrl.toString(),
              );
            }

            const redirectUrlResult = validateUrl(request, policy, redirectUrl);
            if (!redirectUrlResult.ok) {
              return errorResult(
                request,
                "redirect_blocked",
                false,
                "O destino do redirect não cumpre a policy HTTP.",
                redirectUrl,
              );
            }

            const canonicalRedirectUrl = redirectUrlResult.value.toString();
            if (visitedUrls.has(canonicalRedirectUrl)) {
              return errorResult(
                request,
                "redirect_blocked",
                false,
                "Foi detetado um loop de redirects.",
                canonicalRedirectUrl,
              );
            }

            visitedUrls.add(canonicalRedirectUrl);
            redirectCount += 1;
            currentUrl = redirectUrlResult.value;
            continue;
          }

          if (response.status >= 300 && response.status <= 399) {
            await cancelResponseBody(response, controller.signal);
            return errorResult(
              request,
              "redirect_blocked",
              false,
              "A resposta contém um status de redirect não suportado.",
              currentUrl.toString(),
            );
          }

          if (response.status !== 200) {
            await cancelResponseBody(response, controller.signal);
            return errorResult(
              request,
              "http_error",
              isRecoverableHttpStatus(response.status),
              `A resposta devolveu o status HTTP ${response.status}.`,
              currentUrl.toString(),
            );
          }

          const contentType = response.headers.get("content-type");
          const contentTypeResult = parseContentType(
            request,
            policy,
            contentType,
            currentUrl,
          );
          if (!contentTypeResult.ok) {
            await cancelResponseBody(response, controller.signal);
            return contentTypeResult;
          }

          if (
            contentLengthExceedsLimit(
              response.headers.get("content-length"),
              policy.maxBytes,
            )
          ) {
            await cancelResponseBody(response, controller.signal);
            return errorResult(
              request,
              "response_too_large",
              false,
              "O Content-Length excede o limite máximo permitido.",
              currentUrl.toString(),
            );
          }

          const bodyResult = await readValidatedBody(
            request,
            response,
            currentUrl,
            policy,
            controller.signal,
          );
          if (!bodyResult.ok) {
            return bodyResult;
          }

          return {
            ok: true,
            value: {
              requestedUrl,
              finalUrl: currentUrl.toString(),
              statusCode: 200,
              contentType,
              body: bodyResult.value.body,
              loadedAt: clock().toISOString(),
              redirectCount,
              byteLength: bodyResult.value.byteLength,
            },
          };
        }
      } catch (error) {
        if (error === TIMEOUT_SIGNAL || controller.signal.aborted) {
          return errorResult(
            request,
            "timeout",
            true,
            "O carregamento excedeu o timeout total.",
            currentUrl.toString(),
          );
        }

        return errorResult(
          request,
          "load_failed",
          true,
          "O carregamento HTTP falhou.",
          currentUrl.toString(),
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
