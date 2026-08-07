import { NextResponse } from "next/server";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const BUCKET = "matchday-editorials";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function redirectTo(_request: Request, returnTo: string | null, key: "created" | "error", value: string) {
  const fallback = new URL("http://jornada.local/admin/editorial/home");
  let target = fallback;

  if (returnTo) {
    try {
      const parsed = new URL(returnTo, fallback);

      if (parsed.pathname.startsWith("/admin/editorial/home")) {
        target = parsed;
      }
    } catch {
      target = fallback;
    }
  }

  target.searchParams.delete("created");
  target.searchParams.delete("error");
  target.searchParams.set(key, value);

  const location = `${target.pathname}${target.search}${target.hash}`;

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location
    }
  });
}

function publicStorageUrl(baseUrl: string, bucket: string, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

async function uploadToStorage(file: File, path: string) {
  const config = getSupabaseServiceConfig();

  if (!config) {
    throw new Error("missing-service");
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${config.url.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": file.type,
      "x-upsert": "false"
    },
    body: file
  });

  if (!response.ok) {
    throw new Error("editorial-image-upload");
  }

  return publicStorageUrl(config.url, BUCKET, path);
}

async function getHomeEditorialId() {
  const rows = await fetchSupabaseAdminTable<{ id: string }>(
    "site_editorials?select=id&slug=eq.home&limit=1"
  );

  if (rows[0]) {
    return rows[0].id;
  }

  throw new Error("home-editorial-not-found");
}

async function saveHeadlineImageUrl(siteEditorialId: string, imageUrl: string) {
  await writeSupabaseAdmin(`site_editorials?id=eq.${encodeURIComponent(siteEditorialId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      headline_image_url: imageUrl
    })
  });
}

async function saveHighlightImageUrl(siteEditorialId: string, sortOrder: number, imageUrl: string) {
  const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
    `site_editorial_highlights?select=id&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&sort_order=eq.${sortOrder}&limit=1`
  );

  if (existingRows[0]) {
    await writeSupabaseAdmin(`site_editorial_highlights?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        image_url: imageUrl
      })
    });
    return;
  }

  await writeSupabaseAdmin("site_editorial_highlights", {
    method: "POST",
    body: JSON.stringify({
      site_editorial_id: siteEditorialId,
      image_url: imageUrl,
      sort_order: sortOrder,
      status: "draft"
    })
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = cleanText(formData.get("return_to"));
  const target = cleanText(formData.get("target")) ?? "headline";
  const sortOrder = Number.parseInt(cleanText(formData.get("sort_order")) ?? "", 10);
  const file = formData.get("image");

  try {
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("missing-fields");
    }

    const extension = ALLOWED_IMAGE_TYPES.get(file.type);
    if (!extension) {
      throw new Error("editorial-image-type");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error("editorial-image-size");
    }

    if (target === "highlight" && (sortOrder < 1 || sortOrder > 6)) {
      throw new Error("missing-fields");
    }

    const siteEditorialId = await getHomeEditorialId();
    const storagePath =
      target === "highlight"
        ? `home/highlights/highlight-${sortOrder}-${Date.now()}-${crypto.randomUUID()}.${extension}`
        : `home/headline/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const imageUrl = await uploadToStorage(file, storagePath);

    if (target === "highlight") {
      await saveHighlightImageUrl(siteEditorialId, sortOrder, imageUrl);
    } else {
      await saveHeadlineImageUrl(siteEditorialId, imageUrl);
    }

    return redirectTo(request, returnTo, "created", target === "highlight" ? "upload_home_highlight_image" : "upload_home_headline_image");
  } catch (error) {
    const message = error instanceof Error ? error.message : "editorial-image-upload";
    const knownErrors = new Set([
      "missing-service",
      "missing-fields",
      "home-editorial-not-found",
      "editorial-image-type",
      "editorial-image-size",
      "editorial-image-upload"
    ]);

    return redirectTo(request, returnTo, "error", knownErrors.has(message) ? message : "editorial-image-upload");
  }
}
