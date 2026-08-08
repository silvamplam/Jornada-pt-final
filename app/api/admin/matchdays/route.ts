import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanInteger(value: FormDataEntryValue | null): number | null {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function cleanStatus(value: FormDataEntryValue | null): string {
  const status = cleanText(value);
  const allowed = new Set(["scheduled", "live", "finished", "archived"]);

  return status && allowed.has(status) ? status : "scheduled";
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/jornadas?error=missing-service");
  }

  const formData = await request.formData();
  const seasonId = cleanText(formData.get("season_id"));
  const number = cleanInteger(formData.get("number"));
  const label = cleanText(formData.get("label"));

  if (!seasonId || number === null || !label) {
    return redirectTo(request, "/admin/jornadas?error=missing-fields");
  }

  try {
    const editorialFieldsAvailable = cleanText(formData.get("editorial_fields_available")) === "1";
    const syncMetadataAvailable = cleanText(formData.get("sync_metadata_available")) === "1";
    const body: Record<string, string | number | boolean | null> = {
      season_id: seasonId,
      number,
      label,
      starts_on: cleanText(formData.get("starts_on")),
      ends_on: cleanText(formData.get("ends_on")),
      status: cleanStatus(formData.get("status")),
      context_summary: cleanText(formData.get("context_summary"))
    };

    if (editorialFieldsAvailable) {
      body.editorial_title = cleanText(formData.get("editorial_title"));
      body.editorial_summary = cleanText(formData.get("editorial_summary"));
      body.hero_image_url = cleanText(formData.get("hero_image_url"));
      body.video_url = cleanText(formData.get("video_url"));
      body.display_order = cleanInteger(formData.get("display_order"));
      body.is_featured = cleanText(formData.get("is_featured")) === "1";
      body.memory_note = cleanText(formData.get("memory_note"));
      body.seo_title = cleanText(formData.get("seo_title"));
      body.seo_description = cleanText(formData.get("seo_description"));
    }

    if (syncMetadataAvailable) {
      body.data_source = "manual";
      body.sync_status = "manual";
      body.manual_override = false;
      body.external_provider = null;
      body.external_id = null;
      body.last_synced_at = null;
    }

    await writeSupabaseAdmin("matchdays", {
      method: "POST",
      body: JSON.stringify(body)
    });
  } catch {
    return redirectTo(request, "/admin/jornadas?error=save");
  }

  return redirectTo(request, "/admin/jornadas?created=1");
}
