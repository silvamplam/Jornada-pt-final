import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanUuid(value: FormDataEntryValue | null): string | null {
  const text = cleanText(value);
  return text && text !== "none" ? text : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/competicoes?error=missing-service");
  }

  const formData = await request.formData();
  const name = cleanText(formData.get("name"));
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);

  if (!name || !slug) {
    return redirectTo(request, "/admin/competicoes?error=missing-fields");
  }

  const payload = {
    name,
    slug,
    country_id: cleanUuid(formData.get("country_id")),
    country: cleanText(formData.get("country")),
    logo_url: cleanText(formData.get("logo_url")),
    accent_color: cleanText(formData.get("accent_color")),
    is_active: cleanText(formData.get("is_active")) !== "false"
  };

  try {
    await writeSupabaseAdmin("competitions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch {
    return redirectTo(request, "/admin/competicoes?error=save");
  }

  return redirectTo(request, "/admin/competicoes?created=1");
}
