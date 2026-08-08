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

type UpdateSeasonTeamContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateSeasonTeamContext) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/participantes?error=missing-service");
  }

  const { id } = await context.params;
  const formData = await request.formData();

  if (!id) {
    return redirectTo(request, "/admin/participantes?error=missing-fields");
  }

  try {
    if (cleanText(formData.get("action")) === "delete") {
      await writeSupabaseAdmin(`season_teams?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE"
      });

      return redirectTo(request, "/admin/participantes?deleted=1");
    }

    const seasonId = cleanText(formData.get("season_id"));
    const teamId = cleanText(formData.get("team_id"));

    if (!seasonId || !teamId) {
      return redirectTo(request, "/admin/participantes?error=missing-fields");
    }

    const syncMetadataAvailable = cleanText(formData.get("sync_metadata_available")) === "1";
    const currentDataSource = cleanText(formData.get("current_data_source")) ?? "manual";
    const body: Record<string, string | number | boolean | null> = {
      season_id: seasonId,
      team_id: teamId,
      display_order: cleanInteger(formData.get("display_order")),
      status: cleanText(formData.get("status")) ?? "active"
    };

    if (syncMetadataAvailable) {
      body.data_source = currentDataSource === "api" || currentDataSource === "mixed" ? "mixed" : "manual";
      body.sync_status = "manual_override";
      body.manual_override = true;
    }

    await writeSupabaseAdmin(`season_teams?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  } catch {
    return redirectTo(request, "/admin/participantes?error=save");
  }

  return redirectTo(request, "/admin/participantes?updated=1");
}
