export const EDITORIAL_BATCH_TRANSFER_STORAGE_KEY =
  "jornada.editorial.batch-transfer.v1";

export const EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY =
  "jornada.editorial.batch-transfer.source-package.v1";

export type EditorialBatchTransferSourcePackage = Readonly<{
  year: string;
  month: string;
  packageId: string;
  outputImages?: readonly EditorialBatchTransferOutputImage[];
}>;

export type EditorialBatchTransferOutputImage = Readonly<{
  position: number;
  imageUrl: string;
  label: string;
}>;

const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

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

    if (
      !YEAR_PATTERN.test(year)
      || !MONTH_PATTERN.test(month)
      || !UUID_PATTERN.test(packageId)
    ) {
      return null;
    }

    if (parsed.outputImages === undefined) {
      return { year, month, packageId };
    }

    if (!Array.isArray(parsed.outputImages)) {
      return null;
    }

    const positions = new Set<number>();
    const outputImages: EditorialBatchTransferOutputImage[] = [];

    for (const value of parsed.outputImages) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }

      const candidate = value as Record<string, unknown>;
      const position = Number(candidate.position);
      const imageUrl = httpUrl(candidate.imageUrl);
      const label = typeof candidate.label === "string"
        ? candidate.label.trim().slice(0, 240)
        : "";

      if (
        !Number.isInteger(position)
        || position < 1
        || position > 30
        || positions.has(position)
        || !imageUrl
        || !label
      ) {
        return null;
      }

      positions.add(position);
      outputImages.push({ position, imageUrl, label });
    }

    return { year, month, packageId, outputImages };
  } catch {
    return null;
  }
}
