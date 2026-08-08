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

function cleanStat(value: FormDataEntryValue | null): number {
  return cleanInteger(value) ?? 0;
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

type UpdateStandingRowContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateStandingRowContext) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/classificacoes?error=missing-service");
  }

  const { id } = await context.params;
  const formData = await request.formData();
  const teamId = cleanText(formData.get("team_id"));
  const position = cleanInteger(formData.get("position"));

  if (!id || !teamId || position === null) {
    return redirectTo(request, "/admin/classificacoes?error=missing-row-fields");
  }

  try {
    const syncMetadataAvailable = cleanText(formData.get("sync_metadata_available")) === "1";
    const currentDataSource = cleanText(formData.get("current_data_source")) ?? "manual";
    const body: Record<string, string | number | boolean | null> = {
      team_id: teamId,
      position,
      played: cleanStat(formData.get("played")),
      wins: cleanStat(formData.get("wins")),
      draws: cleanStat(formData.get("draws")),
      losses: cleanStat(formData.get("losses")),
      goals_for: cleanStat(formData.get("goals_for")),
      goals_against: cleanStat(formData.get("goals_against")),
      goal_difference: cleanInteger(formData.get("goal_difference")) ?? 0,
      points: cleanStat(formData.get("points")),
      home_played: cleanStat(formData.get("home_played")),
      home_wins: cleanStat(formData.get("home_wins")),
      home_draws: cleanStat(formData.get("home_draws")),
      home_losses: cleanStat(formData.get("home_losses")),
      away_played: cleanStat(formData.get("away_played")),
      away_wins: cleanStat(formData.get("away_wins")),
      away_draws: cleanStat(formData.get("away_draws")),
      away_losses: cleanStat(formData.get("away_losses"))
    };

    if (syncMetadataAvailable) {
      body.data_source = currentDataSource === "api" || currentDataSource === "mixed" ? "mixed" : "manual";
      body.sync_status = "manual_override";
      body.manual_override = true;
    }

    await writeSupabaseAdmin(`standing_rows?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  } catch {
    return redirectTo(request, "/admin/classificacoes?error=save-row");
  }

  return redirectTo(request, "/admin/classificacoes?rowUpdated=1");
}
