import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/canais-tv?error=missing-service");
  }

  const formData = await request.formData();
  const name = cleanText(formData.get("name"));

  if (!name) {
    return redirectTo(request, "/admin/canais-tv?error=missing-fields");
  }

  try {
    await writeSupabaseAdmin("broadcast_channels", {
      method: "POST",
      body: JSON.stringify({
        name,
        platform: cleanText(formData.get("platform")),
        country: cleanText(formData.get("country")),
        logo_url: cleanText(formData.get("logo_url"))
      })
    });
  } catch {
    return redirectTo(request, "/admin/canais-tv?error=save");
  }

  return redirectTo(request, "/admin/canais-tv?created=1");
}
