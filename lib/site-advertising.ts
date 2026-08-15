import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const PRIMARY_SIDE_ADVERTISING_SLOT_KEY = "lateral_primary";

export type SiteAdvertisingSlotRow = {
  slot_key: string;
  name: string | null;
  image_url: string | null;
  target_url: string | null;
  alt_text: string | null;
  is_active: boolean | null;
};

export type PublicSideAdvertisementData = {
  slotKey: string;
  name: string;
  imageUrl: string;
  targetUrl: string;
  altText: string;
  isActive: boolean;
};

export type PublicSideAdvertisementReadResult = {
  advertisement: PublicSideAdvertisementData;
  source: "database" | "fallback";
  storageReady: boolean;
  error: string | null;
};

export const DEFAULT_PUBLIC_SIDE_ADVERTISEMENT: PublicSideAdvertisementData = {
  slotKey: PRIMARY_SIDE_ADVERTISING_SLOT_KEY,
  name: "Startup Madeira NOW",
  imageUrl: "/ads/startup-madeira-now-sidebar.png",
  targetUrl: "https://now.startupmadeira.eu/",
  altText: "Startup Madeira NOW",
  isActive: true,
};

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function normalizePublicSideAdvertisement(
  row: SiteAdvertisingSlotRow,
): PublicSideAdvertisementData {
  const name = text(row.name) || "Publicidade lateral";

  return {
    slotKey: text(row.slot_key) || PRIMARY_SIDE_ADVERTISING_SLOT_KEY,
    name,
    imageUrl: text(row.image_url),
    targetUrl: text(row.target_url),
    altText: text(row.alt_text) || name,
    isActive: row.is_active === true,
  };
}

export function isDisplayableSideAdvertisement(
  advertisement: PublicSideAdvertisementData,
) {
  return Boolean(
    advertisement.isActive &&
      advertisement.imageUrl.trim() &&
      advertisement.targetUrl.trim(),
  );
}

export async function readPrimarySideAdvertisement(): Promise<PublicSideAdvertisementReadResult> {
  try {
    const rows = await fetchSupabaseAdminTable<SiteAdvertisingSlotRow>(
      `site_advertising_slots?select=slot_key,name,image_url,target_url,alt_text,is_active&slot_key=eq.${PRIMARY_SIDE_ADVERTISING_SLOT_KEY}&limit=1`,
    );

    if (!rows[0]) {
      return {
        advertisement: DEFAULT_PUBLIC_SIDE_ADVERTISEMENT,
        source: "fallback",
        storageReady: true,
        error: null,
      };
    }

    return {
      advertisement: normalizePublicSideAdvertisement(rows[0]),
      source: "database",
      storageReady: true,
      error: null,
    };
  } catch (error) {
    return {
      advertisement: DEFAULT_PUBLIC_SIDE_ADVERTISEMENT,
      source: "fallback",
      storageReady: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível ler a publicidade.",
    };
  }
}