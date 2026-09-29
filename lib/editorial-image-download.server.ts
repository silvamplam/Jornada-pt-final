import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import sharp from "sharp";
import { EDITORIAL_PREVIEW_MAX_BYTES, EDITORIAL_PREVIEW_MAX_PIXELS } from "./editorial-image-preview-generator.server";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
export function safeEditorialSourceUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (value.length > 8000 || /[\s\\]/.test(value) || !["http:", "https:"].includes(url.protocol)
    || url.username || url.password || url.port || url.hash || !host.includes(".")
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || isIP(host) || host.startsWith("[")) throw new Error("image-unsafe-url");
  return url;
}
export function isPublicImageAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  // Only global unicast; excludes mapped IPv4, loopback, private, link-local,
  // NAT64 and transition/documentation ranges, even if DNS returns them.
  return isIP(address) === 6 && /^[23]/.test(address)
    && !/^(2001:(?:0:|db8:|10:|20:)|2002:)/i.test(address);
}
export async function validateEditorialImageBytes(bytes: Uint8Array, contentType?: string): Promise<string> {
  if (!bytes.byteLength || bytes.byteLength > EDITORIAL_PREVIEW_MAX_BYTES) throw new Error("image-invalid-byte-size");
  const decoder = sharp(Buffer.from(bytes), { limitInputPixels: EDITORIAL_PREVIEW_MAX_PIXELS, failOn: "warning" });
  const meta = await decoder.metadata();
  const extension = meta.format === "jpeg" ? "jpg" : meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
  if (!extension || !Object.values(TYPES).includes(extension) || (meta.pages ?? 1) !== 1
    || !meta.width || !meta.height || meta.width > 12000 || meta.height > 12000
    || (contentType && TYPES[contentType] !== extension)) throw new Error("image-invalid-format");
  // Metadata alone accepts truncated bodies. Force a real, bounded decode.
  await decoder.resize({ width: 1, height: 1 }).timeout({ seconds: 8 }).raw().toBuffer();
  return extension;
}

export type EditorialImageNetwork = {
  resolve(hostname: string): Promise<{ address: string; family: number }[]>;
  request: typeof httpRequest;
};
export async function downloadFrozenEditorialImage(sourceUrl: string, network?: EditorialImageNetwork) {
  const signal = AbortSignal.timeout(15000);
  let url = safeEditorialSourceUrl(sourceUrl);
  for (let redirect = 0; redirect <= 3; redirect++) {
    signal.throwIfAborted();
    const addresses = await Promise.race([
      network ? network.resolve(url.hostname) : lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("image-download-timeout")), { once: true })),
    ]);
    if (!addresses.length || addresses.some(({ address }) => !isPublicImageAddress(address))) throw new Error("image-unsafe-address");
    const pinned = addresses[0];
    const result = await new Promise<{ location: string } | { bytes: Uint8Array; contentType: string }>((resolve, reject) => {
      const send = network?.request ?? (url.protocol === "https:" ? httpsRequest : httpRequest);
      const req = send(url, {
        signal, agent: false, family: pinned.family,
        // No second DNS lookup: the validated address is the address connected to.
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: { Accept: Object.keys(TYPES).join(","), "User-Agent": "Jornada.pt editorial image freeze" },
      }, response => {
        const status = response.statusCode ?? 0;
        if ([301,302,303,307,308].includes(status) && response.headers.location) {
          response.destroy(); resolve({ location: response.headers.location }); return;
        }
        const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (status !== 200 || !TYPES[contentType] || Number(response.headers["content-length"]) > EDITORIAL_PREVIEW_MAX_BYTES) {
          response.destroy(); reject(new Error(`image-response-invalid:${status}:${contentType}`)); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > EDITORIAL_PREVIEW_MAX_BYTES) { response.destroy(); reject(new Error("image-invalid-byte-size")); }
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ bytes: Buffer.concat(chunks), contentType }));
      });
      req.on("error", reject); req.end();
    });
    if ("location" in result) { url = safeEditorialSourceUrl(new URL(result.location, url).href); continue; }
    const extension = await validateEditorialImageBytes(result.bytes, result.contentType);
    return { sourceUrl, finalUrl: url.href, bytes: result.bytes, extension, contentType: result.contentType };
  }
  throw new Error("image-too-many-redirects");
}
