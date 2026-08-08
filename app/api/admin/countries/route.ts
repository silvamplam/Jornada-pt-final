import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
    return redirectTo(request, "/admin/paises?error=missing-service");
  }

  const formData = await request.formData();
  const name = cleanText(formData.get("name"));
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);

  if (!name || !slug) {
    return redirectTo(request, "/admin/paises?error=missing-fields");
  }

  try {
    await writeSupabaseAdmin("countries", {
      method: "POST",
      body: JSON.stringify({
        name,
        slug,
        iso2: cleanText(formData.get("iso2"))?.toUpperCase() ?? null,
        flag_emoji: cleanText(formData.get("flag_emoji")),
        is_active: cleanText(formData.get("is_active")) !== "false",
        data_source: "manual",
        sync_status: "manual",
        manual_override: true
      })
    });
  } catch {
    return redirectTo(request, "/admin/paises?error=save");
  }

  return redirectTo(request, "/admin/paises?created=1");
}
