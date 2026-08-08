import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

type SeasonContext = {
  id: string;
  competition_id: string;
};

type MatchdayContext = {
  id: string;
  season_id: string;
};

type StandingContext = {
  competitionId: string;
  seasonId: string;
  matchdayId: string | null;
};

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

async function resolveSeasonContext(seasonId: string): Promise<StandingContext | null> {
  const seasons = await fetchSupabaseAdminTable<SeasonContext>(
    `seasons?select=id,competition_id&id=eq.${encodeURIComponent(seasonId)}&limit=1`
  );
  const season = seasons[0];

  return season
    ? {
        competitionId: season.competition_id,
        seasonId: season.id,
        matchdayId: null
      }
    : null;
}

async function resolveMatchdayContext(matchdayId: string): Promise<StandingContext | null> {
  const matchdays = await fetchSupabaseAdminTable<MatchdayContext>(
    `matchdays?select=id,season_id&id=eq.${encodeURIComponent(matchdayId)}&limit=1`
  );
  const matchday = matchdays[0];

  if (!matchday) {
    return null;
  }

  const seasonContext = await resolveSeasonContext(matchday.season_id);

  return seasonContext ? { ...seasonContext, matchdayId: matchday.id } : null;
}

async function resolveFormContext(formData: FormData): Promise<StandingContext | null> {
  const contextRef = cleanText(formData.get("context_ref"));

  if (contextRef?.startsWith("matchday:")) {
    return resolveMatchdayContext(contextRef.replace("matchday:", ""));
  }

  if (contextRef?.startsWith("season:")) {
    return resolveSeasonContext(contextRef.replace("season:", ""));
  }

  const seasonId = cleanText(formData.get("season_id"));

  if (!seasonId) {
    return null;
  }

  const seasonContext = await resolveSeasonContext(seasonId);
  const matchdayId = cleanText(formData.get("matchday_id"));

  if (!seasonContext || !matchdayId) {
    return seasonContext;
  }

  const matchdayContext = await resolveMatchdayContext(matchdayId);

  return matchdayContext?.seasonId === seasonContext.seasonId ? matchdayContext : null;
}

type UpdateStandingContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateStandingContext) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/classificacoes?error=missing-service");
  }

  const { id } = await context.params;
  const formData = await request.formData();

  if (!id) {
    return redirectTo(request, "/admin/classificacoes?error=missing-fields");
  }

  try {
    const resolvedContext = await resolveFormContext(formData);

    if (!resolvedContext) {
      return redirectTo(request, "/admin/classificacoes?error=invalid-context");
    }

    const syncMetadataAvailable = cleanText(formData.get("sync_metadata_available")) === "1";
    const currentDataSource = cleanText(formData.get("current_data_source")) ?? "manual";
    const body: Record<string, string | boolean | null> = {
      competition_id: resolvedContext.competitionId,
      season_id: resolvedContext.seasonId,
      matchday_id: resolvedContext.matchdayId,
      moment_label: cleanText(formData.get("moment_label"))
    };

    if (syncMetadataAvailable) {
      body.data_source = currentDataSource === "api" || currentDataSource === "mixed" ? "mixed" : "manual";
      body.sync_status = "manual_override";
      body.manual_override = true;
    }

    await writeSupabaseAdmin(`standings?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  } catch {
    return redirectTo(request, "/admin/classificacoes?error=save");
  }

  return redirectTo(request, "/admin/classificacoes?updated=1");
}
