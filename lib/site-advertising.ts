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
  target_url: string | null;
  alt_text: string | null;
  is_active: boolean | null;
  display_format?: string | null;
};

export type PublicSideAdvertisementData = {
  slotKey: AdvertisingSlotKey;
  name: string;
  imageUrl: string;
  targetUrl: string;
  altText: string;
  isActive: boolean;
  format: AdvertisingFormat;
};

export type PublicSideAdvertisementReadResult = {
  advertisement: PublicSideAdvertisementData | null;
  storageReady: boolean;
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
  return {
    slotKey,
    name,
    imageUrl: row.image_url?.trim() ?? "",
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
    const rows = await withAdvertisingReadTimeout(
      fetchSupabaseAdminTable<SiteAdvertisingSlotRow>(
        `site_advertising_slots?select=slot_key,name,image_url,target_url,alt_text,is_active${formatColumn}&slot_key=eq.${slotKey}&limit=1`,
      ),
    );
    return {
      advertisement:
        rows[0]?.slot_key === slotKey
          ? normalizePublicSideAdvertisement(rows[0])
          : null,
      storageReady: true,
      error: null,
    };
  } catch (error) {
    return {
      advertisement: null,
      storageReady: false,
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
