import { NextResponse } from "next/server";

import { PRIMARY_SIDE_ADVERTISING_SLOT_KEY } from "@/lib/site-advertising";
import { writeSupabaseAdmin } from "@/lib/supabase";

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
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return value;
    }
  } catch {}

  throw new AdvertisingError(code);
}

function redirect(request: Request, key: string, value: string) {
  const url = new URL("/admin/publicidade", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function codeFor(error: unknown) {
  if (error instanceof AdvertisingError) return error.code;

  const detail = error instanceof Error ? error.message : "";

  if (/site_advertising_slots|PGRST205|42P01/i.test(detail)) {
    return "missing-table";
  }

  return "save-failed";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const name = clean(form.get("name")) || "Publicidade lateral";
    const imageUrl = validUrl(
      clean(form.get("image_url")),
      "invalid-image",
    );
    const targetUrl = validUrl(
      clean(form.get("target_url")),
      "invalid-target",
    );
    const altText = clean(form.get("alt_text")) || name;
    const isActive = clean(form.get("is_active")) === "true";

    if (isActive && !imageUrl) {
      throw new AdvertisingError("missing-image");
    }

    if (isActive && !targetUrl) {
      throw new AdvertisingError("missing-target");
    }

    await writeSupabaseAdmin(
      "site_advertising_slots?on_conflict=slot_key",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          slot_key: PRIMARY_SIDE_ADVERTISING_SLOT_KEY,
          name,
          image_url: imageUrl,
          target_url: targetUrl,
          alt_text: altText,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    return redirect(request, "saved", "1");
  } catch (error) {
    return redirect(request, "error", codeFor(error));
  }
}