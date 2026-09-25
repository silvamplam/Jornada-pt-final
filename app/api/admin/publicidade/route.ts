import { randomUUID } from "crypto";
import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";

import {
  PRIMARY_SIDE_ADVERTISING_SLOT_KEY,
  HORIZONTAL_ADVERTISING_SLOT_KEY,
  emptyAdvertisement,
  isAdvertisingSlotKey,
  isAdvertisingFormat,
  isAdvertisingUrl,
  type AdvertisingSlotKey,
} from "@/lib/site-advertising";
import { writeSupabaseAdmin } from "@/lib/supabase";

const IMAGE_BUCKET = "editorial-images";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

class AdvertisingError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function validUrl(value: string, code: string) {
  if (!value) return null;
  if (isAdvertisingUrl(value)) return value;
  throw new AdvertisingError(code);
}

function redirect(
  _request: Request,
  key: string,
  value: string,
  slotKey: AdvertisingSlotKey,
) {
  const params = new URLSearchParams();
  params.set(key, value);
  params.set("slot", slotKey);

  return adminRelativeRedirect(`/admin/publicidade?${params.toString()}`);
}

function codeFor(error: unknown) {
  if (error instanceof AdvertisingError) {
    return error.code;
  }

  const detail = error instanceof Error ? error.message : "";

  if (/display_format|42703|PGRST204/i.test(detail)) return "missing-format";

  if (/site_advertising_slots|PGRST205|42P01/i.test(detail)) {
    return "missing-table";
  }

  return "save-failed";
}

function storageConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new AdvertisingError("upload-failed");
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceRoleKey,
  };
}

function safeBaseName(filename: string) {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "publicidade"
  );
}

async function uploadAdvertisingImage(file: File) {
  if (!file.size) {
    return null;
  }

  const extension = ALLOWED_IMAGE_TYPES.get(file.type.toLowerCase());

  if (!extension) {
    throw new AdvertisingError("invalid-image-format");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AdvertisingError("image-too-large");
  }

  const config = storageConfig();
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  const filename = `${Date.now()}-${randomUUID()}-${safeBaseName(
    file.name,
  )}.${extension}`;

  const path = `publicidade/${year}/${month}/${filename}`;

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const uploadResponse = await fetch(
    `${config.url}/storage/v1/object/${IMAGE_BUCKET}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": file.type,
        "Cache-Control": "31536000",
        "x-upsert": "false",
      },
      body: Buffer.from(await file.arrayBuffer()),
      cache: "no-store",
    },
  );

  if (!uploadResponse.ok) {
    throw new AdvertisingError("upload-failed");
  }

  return `${config.url}/storage/v1/object/public/${encodeURIComponent(
    IMAGE_BUCKET,
  )}/${encodedPath}`;
}

export async function POST(request: Request) {
  let slotKey: AdvertisingSlotKey = PRIMARY_SIDE_ADVERTISING_SLOT_KEY;
  try {
    const form = await request.formData();

    const requestedSlot =
      clean(form.get("slot_key")) || PRIMARY_SIDE_ADVERTISING_SLOT_KEY;
    if (!isAdvertisingSlotKey(requestedSlot))
      throw new AdvertisingError("invalid-slot");
    slotKey = requestedSlot;
    const format = clean(form.get("display_format")) || "slim";
    if (
      slotKey === HORIZONTAL_ADVERTISING_SLOT_KEY &&
      !isAdvertisingFormat(format)
    ) {
      throw new AdvertisingError("invalid-format");
    }
    const name = clean(form.get("name")) || emptyAdvertisement(slotKey).name;

    const imageFileValue = form.get("image_file");

    const uploadedImageUrl =
      imageFileValue instanceof File && imageFileValue.size > 0
        ? await uploadAdvertisingImage(imageFileValue)
        : null;

    const imageUrl = uploadedImageUrl
      ? uploadedImageUrl
      : validUrl(clean(form.get("image_url")), "invalid-image");

    const targetUrl = validUrl(clean(form.get("target_url")), "invalid-target");

    const altText = clean(form.get("alt_text")) || name;

    const isActive = clean(form.get("is_active")) === "true";

    if (isActive && !imageUrl) {
      throw new AdvertisingError("missing-image");
    }

    if (isActive && !targetUrl) {
      throw new AdvertisingError("missing-target");
    }

    await writeSupabaseAdmin("site_advertising_slots?on_conflict=slot_key", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        slot_key: slotKey,
        ...(slotKey === HORIZONTAL_ADVERTISING_SLOT_KEY
          ? { display_format: format }
          : {}),
        name,
        image_url: imageUrl,
        target_url: targetUrl,
        alt_text: altText,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }),
    });

    return redirect(request, "saved", "1", slotKey);
  } catch (error) {
    return redirect(request, "error", codeFor(error), slotKey);
  }
}
