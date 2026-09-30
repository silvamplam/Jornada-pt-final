import { randomUUID } from "crypto";
import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import {
  measureAdvertisingImageBytes,
  measureAdvertisingImageUrl,
  type AdvertisingImageDimensions,
} from "@/lib/advertising-image-dimensions.server";

import {
  PRIMARY_SIDE_ADVERTISING_SLOT_KEY,
  HORIZONTAL_ADVERTISING_SLOT_KEY,
  emptyAdvertisement,
  isAdvertisingSlotKey,
  isAdvertisingFormat,
  isAdvertisingUrl,
  type AdvertisingSlotKey,
} from "@/lib/site-advertising";
import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

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

  if (/image_width|image_height/i.test(detail)) return "missing-dimensions";
  if (/display_format/i.test(detail)) return "missing-format";
  if (/42703|PGRST204/i.test(detail)) return "missing-dimensions";

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
  const extension = ALLOWED_IMAGE_TYPES.get(file.type.toLowerCase());

  if (!extension) {
    throw new AdvertisingError("invalid-image-format");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AdvertisingError("image-too-large");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let dimensions: AdvertisingImageDimensions;
  try {
    dimensions = await measureAdvertisingImageBytes(bytes, file.type.toLowerCase());
  } catch {
    throw new AdvertisingError("invalid-image-format");
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
      body: bytes,
      cache: "no-store",
    },
  );

  if (!uploadResponse.ok) {
    throw new AdvertisingError("upload-failed");
  }

  return {
    imageUrl: `${config.url}/storage/v1/object/public/${encodeURIComponent(
      IMAGE_BUCKET,
    )}/${encodedPath}`,
    ...dimensions,
  };
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

    const imageFile =
      imageFileValue instanceof File && imageFileValue.size > 0
        ? imageFileValue
        : null;
    const requestedImageUrl = imageFile
      ? null
      : validUrl(clean(form.get("image_url")), "invalid-image");
    const targetUrl = validUrl(clean(form.get("target_url")), "invalid-target");

    const altText = clean(form.get("alt_text")) || name;

    const isActive = clean(form.get("is_active")) === "true";

    if (isActive && !imageFile && !requestedImageUrl) {
      throw new AdvertisingError("missing-image");
    }

    if (isActive && !targetUrl) {
      throw new AdvertisingError("missing-target");
    }

    // Reject a deployment without the migration before uploading a new asset.
    const existingRows = await fetchSupabaseAdminTable<{
      image_url: string | null;
      image_width: number | null;
      image_height: number | null;
    }>(
      `site_advertising_slots?select=image_url,image_width,image_height&slot_key=eq.${slotKey}&limit=1`,
    );

    const uploadedImage = imageFile
      ? await uploadAdvertisingImage(imageFile)
      : null;
    const imageUrl = uploadedImage?.imageUrl ?? requestedImageUrl;
    let dimensions: AdvertisingImageDimensions | null = uploadedImage;
    const existing = existingRows[0];
    const unchangedLegacyImage = Boolean(
      !imageFile &&
      imageUrl &&
      imageUrl === existing?.image_url &&
      existing.image_width === null &&
      existing.image_height === null,
    );
    // Metadata-only edits must not depend on an old external image still
    // responding. The database trigger permits this exact legacy transition.
    // A versioned /public asset may be served from a CDN and absent from a
    // serverless function's filesystem. Reuse only dimensions already measured
    // for this exact unchanged local URL; new URLs are always decoded.
    if (
      imageUrl?.startsWith("/") &&
      imageUrl === existing?.image_url &&
      Number.isSafeInteger(existing.image_width) &&
      Number.isSafeInteger(existing.image_height) &&
      (existing.image_width ?? 0) > 0 &&
      (existing.image_height ?? 0) > 0
    ) {
      dimensions = {
        imageWidth: existing.image_width!,
        imageHeight: existing.image_height!,
      };
    }
    if (imageUrl && !dimensions && !unchangedLegacyImage) {
      try {
        dimensions = await measureAdvertisingImageUrl(imageUrl);
      } catch {
        throw new AdvertisingError("image-unavailable");
      }
    }

    const body = JSON.stringify({
      slot_key: slotKey,
      ...(slotKey === HORIZONTAL_ADVERTISING_SLOT_KEY
        ? { display_format: format }
        : {}),
      name,
      image_url: imageUrl,
      image_width: dimensions?.imageWidth ?? null,
      image_height: dimensions?.imageHeight ?? null,
      target_url: targetUrl,
      alt_text: altText,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    });

    if (unchangedLegacyImage) {
      // An upsert fires INSERT triggers before its conflict UPDATE. Use PATCH
      // so the database can compare OLD and NEW for this legacy exception.
      const updated = await writeSupabaseAdminReturning<{ slot_key: string }>(
        `site_advertising_slots?slot_key=eq.${slotKey}&select=slot_key`,
        { method: "PATCH", body },
      );
      if (updated.length !== 1 || updated[0]?.slot_key !== slotKey) {
        throw new AdvertisingError("save-failed");
      }
    } else {
      await writeSupabaseAdmin("site_advertising_slots?on_conflict=slot_key", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body,
      });
    }

    return redirect(request, "saved", "1", slotKey);
  } catch (error) {
    return redirect(request, "error", codeFor(error), slotKey);
  }
}
