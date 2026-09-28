/** Null preserves the current design colour. Reject, rather than repair, invalid input. */
export function normalizeEditorialZoneTitleColor(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error("editorial-zone-title-color-invalid");
  }
  return value.toUpperCase();
}
