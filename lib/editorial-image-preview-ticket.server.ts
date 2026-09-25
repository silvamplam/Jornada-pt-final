import { createHmac, timingSafeEqual } from "node:crypto";
import { isEditorialPreviewOriginalPath } from "./editorial-image-preview";

const LIFETIME_MS = 2 * 60 * 60 * 1000;
function signature(path: string, expiry: string, secret: string) {
  return createHmac("sha256", secret).update(`editorial-preview:v1:${path}:${expiry}`).digest("hex");
}
export function issueEditorialPreviewTicket(path: string, secret: string, now = Date.now()) {
  if (!isEditorialPreviewOriginalPath(path) || !secret) throw new Error("preview-invalid-ticket-input");
  const expiry = String(now + LIFETIME_MS);
  return expiry + "." + signature(path, expiry, secret);
}
export function verifyEditorialPreviewTicket(path: string, ticket: unknown, secret: string, now = Date.now()) {
  if (!isEditorialPreviewOriginalPath(path) || typeof ticket !== "string" || !secret) return false;
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(ticket);
  if (!match || Number(match[1]) < now || Number(match[1]) > now + LIFETIME_MS) return false;
  return timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(signature(path, match[1], secret), "hex"));
}
