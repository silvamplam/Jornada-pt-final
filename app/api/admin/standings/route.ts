import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { seedStandingRowsFromSeason } from "@/lib/standing-seeding";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdminReturning } from "@/lib/supabase";

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

type CreatedStanding = {
  id: string;
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

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/classificacoes?error=missing-service");
  }

  const formData = await request.formData();
  let standingId: string | null = null;
  let createdRows = 0;
  let updatedRows = 0;
  let syncMetadataAvailable = false;
  let context: StandingContext | null = null;
  const momentLabel = cleanText(formData.get("moment_label"));

  try {
    context = await resolveFormContext(formData);

    if (!context) {
      return redirectTo(request, "/admin/classificacoes?error=invalid-context");
    }

    syncMetadataAvailable = cleanText(formData.get("sync_metadata_available")) === "1";
    const body: Record<string, string | boolean | null> = {
      competition_id: context.competitionId,
      season_id: context.seasonId,
      matchday_id: context.matchdayId,
      moment_label: momentLabel
    };

    if (syncMetadataAvailable) {
      body.data_source = "manual";
      body.sync_status = "manual";
      body.manual_override = false;
      body.external_provider = null;
      body.external_id = null;
      body.last_synced_at = null;
    }

    const createdStandings = await writeSupabaseAdminReturning<CreatedStanding>("standings?select=id", {
      method: "POST",
      body: JSON.stringify(body)
    });
    standingId = createdStandings[0]?.id ?? null;
  } catch {
    return redirectTo(request, "/admin/classificacoes?error=save");
  }

  if (standingId && context) {
    try {
      const result = await seedStandingRowsFromSeason({
        standingId,
        competitionId: context.competitionId,
        seasonId: context.seasonId,
        matchdayId: context.matchdayId,
        momentLabel,
        syncMetadataAvailable
      });
      createdRows = result.created;
      updatedRows = result.updated;
    } catch {
      return redirectTo(request, "/admin/classificacoes?created=1&error=seed-rows");
    }
  }

  return redirectTo(request, `/admin/classificacoes?created=1&rowsSeeded=${createdRows}&rowsUpdated=${updatedRows}`);
}
