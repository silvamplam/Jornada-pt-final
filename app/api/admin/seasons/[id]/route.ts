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

type UpdateSeasonContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateSeasonContext) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/epocas?error=missing-service");
  }

  const { id } = await context.params;
  const formData = await request.formData();
  const competitionId = cleanText(formData.get("competition_id"));
  const label = cleanText(formData.get("label"));

  if (!id || !competitionId || !label) {
    return redirectTo(request, "/admin/epocas?error=missing-fields");
  }

  try {
    await writeSupabaseAdmin(`seasons?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
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

  return redirectTo(request, "/admin/epocas?updated=1");
}
