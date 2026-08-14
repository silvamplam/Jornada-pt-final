export const EDITORIAL_BATCH_TRANSFER_STORAGE_KEY =
  "jornada.editorial.batch-transfer.v1";

export const EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY =
  "jornada.editorial.batch-transfer.source-package.v1";

export type EditorialBatchTransferSourcePackage = Readonly<{
  year: string;
  month: string;
  packageId: string;
}>;

const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseEditorialBatchTransferSourcePackage(
  value: string | null | undefined,
): EditorialBatchTransferSourcePackage | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<EditorialBatchTransferSourcePackage>;
    const year = typeof parsed.year === "string" ? parsed.year.trim() : "";
    const month = typeof parsed.month === "string" ? parsed.month.trim() : "";
    const packageId = typeof parsed.packageId === "string"
      ? parsed.packageId.trim().toLowerCase()
      : "";

    return YEAR_PATTERN.test(year)
      && MONTH_PATTERN.test(month)
      && UUID_PATTERN.test(packageId)
      ? { year, month, packageId }
      : null;
  } catch {
    return null;
  }
}
