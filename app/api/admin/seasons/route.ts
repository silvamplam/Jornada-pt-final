import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanDate(value: FormDataEntryValue | null): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/epocas?error=missing-service");
  }

  const formData = await request.formData();
  const competitionId = cleanText(formData.get("competition_id"));
  const label = cleanText(formData.get("label"));

  if (!competitionId || !label) {
    return redirectTo(request, "/admin/epocas?error=missing-fields");
  }

  try {
    await writeSupabaseAdmin("seasons", {
      method: "POST",
      body: JSON.stringify({
        competition_id: competitionId,
        label,
        starts_on: cleanDate(formData.get("starts_on")),
        ends_on: cleanDate(formData.get("ends_on")),
        is_current: cleanText(formData.get("is_current")) === "true"
      })
    });
  } catch {
    return redirectTo(request, "/admin/epocas?error=save");
  }

  return redirectTo(request, "/admin/epocas?created=1");
}
