import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanInteger(value: FormDataEntryValue | null): number {
  const text = cleanText(value);

  if (!text) {
    return 0;
  }

  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/participantes?error=missing-service");
  }

  const formData = await request.formData();
  const seasonId = cleanText(formData.get("season_id"));
  const teamId = cleanText(formData.get("team_id"));

  if (!seasonId || !teamId) {
    return redirectTo(request, "/admin/participantes?error=missing-fields");
  }

  try {
    const syncMetadataAvailable = cleanText(formData.get("sync_metadata_available")) === "1";
    const body: Record<string, string | number | boolean | null> = {
      season_id: seasonId,
      team_id: teamId,
      display_order: cleanInteger(formData.get("display_order")),
      status: cleanText(formData.get("status")) ?? "active"
    };

    if (syncMetadataAvailable) {
      body.data_source = "manual";
      body.sync_status = "manual";
      body.manual_override = false;
      body.external_provider = null;
      body.external_id = null;
      body.last_synced_at = null;
    }

    await writeSupabaseAdmin("season_teams?on_conflict=season_id,team_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(body)
    });
  } catch {
    return redirectTo(request, "/admin/participantes?error=save");
  }

  return redirectTo(request, "/admin/participantes?created=1");
}
