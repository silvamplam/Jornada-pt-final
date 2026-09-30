import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const PRIMARY_SIDE_ADVERTISING_SLOT_KEY = "lateral_primary";
export const HORIZONTAL_ADVERTISING_SLOT_KEY = "horizontal_between_zones";
export type AdvertisingSlotKey =
  | typeof PRIMARY_SIDE_ADVERTISING_SLOT_KEY
  | typeof HORIZONTAL_ADVERTISING_SLOT_KEY;
export type AdvertisingFormat = "slim" | "tall";

export type SiteAdvertisingSlotRow = {
  slot_key: string;
  name: string | null;
  image_url: string | null;
  image_width?: number | null;
  image_height?: number | null;
  target_url: string | null;
  alt_text: string | null;
  is_active: boolean | null;
  display_format?: string | null;
};

export type PublicSideAdvertisementData = {
  slotKey: AdvertisingSlotKey;
  name: string;
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  targetUrl: string;
  altText: string;
  isActive: boolean;
  format: AdvertisingFormat;
};

export type PublicSideAdvertisementReadResult = {
  advertisement: PublicSideAdvertisementData | null;
  storageReady: boolean;
  dimensionsReady: boolean;
  error: string | null;
};

const ADVERTISEMENT_READ_TIMEOUT_MS = 8000;

export function isAdvertisingSlotKey(
  value: string,
): value is AdvertisingSlotKey {
  return (
    value === PRIMARY_SIDE_ADVERTISING_SLOT_KEY ||
    value === HORIZONTAL_ADVERTISING_SLOT_KEY
  );
}

export function isAdvertisingFormat(value: string): value is AdvertisingFormat {
  return value === "slim" || value === "tall";
}

export function isAdvertisingUrl(value: string) {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function emptyAdvertisement(
  slotKey: AdvertisingSlotKey,
): PublicSideAdvertisementData {
  return {
    slotKey,
    name:
      slotKey === PRIMARY_SIDE_ADVERTISING_SLOT_KEY
        ? "Publicidade lateral"
        : "Faixa horizontal",
    imageUrl: "",
    imageWidth: null,
    imageHeight: null,
    targetUrl: "",
    altText: "",
    isActive: false,
    format: "slim",
  };
}

async function withAdvertisingReadTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("advertising-read-timeout")),
          ADVERTISEMENT_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function normalizePublicSideAdvertisement(
  row: SiteAdvertisingSlotRow,
): PublicSideAdvertisementData {
  const slotKey = isAdvertisingSlotKey(row.slot_key)
    ? row.slot_key
    : PRIMARY_SIDE_ADVERTISING_SLOT_KEY;
  const name = row.name?.trim() || emptyAdvertisement(slotKey).name;
  const hasMeasuredDimensions =
    Number.isSafeInteger(row.image_width) &&
    Number.isSafeInteger(row.image_height) &&
    (row.image_width ?? 0) > 0 &&
    (row.image_height ?? 0) > 0;
  return {
    slotKey,
    name,
    imageUrl: row.image_url?.trim() ?? "",
    imageWidth: hasMeasuredDimensions ? row.image_width! : null,
    imageHeight: hasMeasuredDimensions ? row.image_height! : null,
    targetUrl: row.target_url?.trim() ?? "",
    altText: row.alt_text?.trim() || name,
    isActive: row.is_active === true,
    format:
      slotKey === HORIZONTAL_ADVERTISING_SLOT_KEY &&
      row.display_format === "tall"
        ? "tall"
        : "slim",
  };
}

export function isDisplayableSideAdvertisement(
  advertisement: PublicSideAdvertisementData | null,
): advertisement is PublicSideAdvertisementData {
  return Boolean(
    advertisement?.isActive &&
      isAdvertisingUrl(advertisement.imageUrl) &&
      isAdvertisingUrl(advertisement.targetUrl),
  );
}

export async function readAdvertisement(
  slotKey: AdvertisingSlotKey,
): Promise<PublicSideAdvertisementReadResult> {
  try {
    // Keep the lateral compatible before the horizontal migration is applied.
    const formatColumn =
      slotKey === HORIZONTAL_ADVERTISING_SLOT_KEY ? ",display_format" : "";
    const basePath = `site_advertising_slots?select=slot_key,name,image_url,target_url,alt_text,is_active${formatColumn}`;
    let dimensionsReady = true;
    let rows: SiteAdvertisingSlotRow[];
    try {
      rows = await withAdvertisingReadTimeout(
        fetchSupabaseAdminTable<SiteAdvertisingSlotRow>(
          `${basePath},image_width,image_height&slot_key=eq.${slotKey}&limit=1`,
        ),
      );
    } catch (error) {
      if (!(error instanceof Error) || !/image_width|image_height/i.test(error.message)) {
        throw error;
      }
      // A code deploy may precede the migration. Preserve the existing ad.
      dimensionsReady = false;
      rows = await withAdvertisingReadTimeout(
        fetchSupabaseAdminTable<SiteAdvertisingSlotRow>(
          `${basePath}&slot_key=eq.${slotKey}&limit=1`,
        ),
      );
    }
    return {
      advertisement:
        rows[0]?.slot_key === slotKey
          ? normalizePublicSideAdvertisement(rows[0])
          : null,
      storageReady: true,
      dimensionsReady,
      error: null,
    };
  } catch (error) {
    return {
      advertisement: null,
      storageReady: false,
      dimensionsReady: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível ler a publicidade.",
    };
  }
}

export function readPrimarySideAdvertisement() {
  return readAdvertisement(PRIMARY_SIDE_ADVERTISING_SLOT_KEY);
}

export function readHorizontalAdvertisement() {
  return readAdvertisement(HORIZONTAL_ADVERTISING_SLOT_KEY);
}
