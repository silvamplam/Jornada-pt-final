import { adminRelativeRedirect, adminRelativeUrl } from "@/lib/admin-relative-redirect";
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
  const fallback = adminRelativeUrl("/admin/gestor");
  let target = fallback;

  if (returnTo) {
    try {
      const parsed = adminRelativeUrl(returnTo);
      if (parsed.origin === fallback.origin) {
        target = parsed;
      }
    } catch {
      target = fallback;
    }
  }

  target.searchParams.delete("created");
  target.searchParams.delete("error");
  target.searchParams.set("section", "linha-editorial");
  target.searchParams.set(key, value);

  return adminRelativeRedirect(target);
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
    const detail = await response.text();
    console.error("Erro ao carregar imagem editorial:", detail || response.statusText);
    throw new Error("editorial-image-upload");
  }

  return publicStorageUrl(config.url, BUCKET, path);
}

async function saveImageUrl(matchdayId: string, imageUrl: string) {
  const existing = await fetchSupabaseAdminTable<{ id: string }>(
    `matchday_editorials?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
  );

  if (existing.length > 0) {
    await writeSupabaseAdmin(`matchday_editorials?matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      })
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      image_url: imageUrl,
      status: "draft",
      updated_at: new Date().toISOString()
    })
  });
}

async function saveHighlightImageUrl(matchdayId: string, sortOrder: number, imageUrl: string) {
  const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
    `matchday_highlights?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
  );

  if (existingRows[0]) {
    await writeSupabaseAdmin(`matchday_highlights?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      })
    });
    return;
  }

  await writeSupabaseAdmin("matchday_highlights", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      image_url: imageUrl,
      sort_order: sortOrder,
      status: "draft",
      updated_at: new Date().toISOString()
    })
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = cleanText(formData.get("return_to"));
  const matchdayId = cleanText(formData.get("matchday_id"));
  const target = cleanText(formData.get("target")) ?? "editorial";
  const sortOrder = Number.parseInt(cleanText(formData.get("sort_order")) ?? "", 10);
  const file = formData.get("image");

  try {
    if (!matchdayId || !(file instanceof File) || file.size === 0) {
      throw new Error("missing-fields");
    }

    const extension = ALLOWED_IMAGE_TYPES.get(file.type);
    if (!extension) {
      throw new Error("editorial-image-type");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error("editorial-image-size");
    }

    const matchdayExists = await fetchSupabaseAdminTable<{ id: string }>(
      `matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}&limit=1`
    );

    if (matchdayExists.length === 0) {
      throw new Error("matchday-invalid");
    }

    if (target === "highlight" && (![1, 2, 3].includes(sortOrder))) {
      throw new Error("missing-fields");
    }

    const storagePath =
      target === "highlight"
        ? `highlights/${matchdayId}/highlight-${sortOrder}-${Date.now()}-${crypto.randomUUID()}.${extension}`
        : `${matchdayId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const imageUrl = await uploadToStorage(file, storagePath);
    if (target === "highlight") {
      await saveHighlightImageUrl(matchdayId, sortOrder, imageUrl);
    } else {
      await saveImageUrl(matchdayId, imageUrl);
    }

    return redirectTo(request, returnTo, "created", target === "highlight" ? "upload_matchday_highlight_image" : "upload_matchday_editorial_image");
  } catch (error) {
    const message = error instanceof Error ? error.message : "editorial-image-upload";
    const knownErrors = new Set([
      "missing-service",
      "missing-fields",
      "matchday-invalid",
      "editorial-image-type",
      "editorial-image-size",
      "editorial-image-upload"
    ]);

    return redirectTo(request, returnTo, "error", knownErrors.has(message) ? message : "editorial-image-upload");
  }
}
