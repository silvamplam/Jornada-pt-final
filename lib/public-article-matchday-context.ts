import {
  fetchSupabaseAdminTable,
  type SupabaseBroadcastChannel,
  type SupabaseCompetition,
  type SupabaseMatch,
  type SupabaseMatchday,
  type SupabaseSeason,
  type SupabaseTeam,
} from "./supabase";

type ArticleContextIds = {
  matchday_id?: string | null;
  season_id?: string | null;
  competition_id?: string | null;
};
type ArticleCompetition = Pick<SupabaseCompetition, "id" | "name" | "slug" | "logo_url" | "is_active">;
type ArticleSeason = Pick<SupabaseSeason, "id" | "competition_id" | "label">;
type ArticleMatchday = Pick<SupabaseMatchday, "id" | "season_id" | "number" | "label" | "starts_on" | "ends_on">;
type ArticleTeam = Pick<SupabaseTeam, "id" | "name" | "public_name" | "short_name" | "code" | "slug" | "logo_url">;
type ArticleBroadcastChannel = Pick<SupabaseBroadcastChannel, "id" | "name" | "logo_url">;
type ArticleMatchRow = Pick<SupabaseMatch,
  "id" | "home_team_id" | "away_team_id" | "broadcast_channel_id" | "scheduled_date" | "kickoff_at"
  | "status" | "minute" | "home_score" | "away_score"
> & {
  live_started_at: string | null;
  live_base_minute: number | null;
  is_clock_running: boolean | null;
};

export type PublicArticleMatch = ArticleMatchRow & {
  matchday: Pick<ArticleMatchday, "id" | "number">;
  homeTeam: ArticleTeam | null;
  awayTeam: ArticleTeam | null;
  broadcastChannel: ArticleBroadcastChannel | null;
};

// This is deliberately not a PublicMatchdayContext: no editorial or classification data.
export type PublicArticleMatchdayContext = {
  competition: ArticleCompetition;
  season: ArticleSeason;
  seasons: Pick<ArticleSeason, "id" | "label">[];
  matchday: ArticleMatchday;
  matchdays: Pick<ArticleMatchday, "id" | "number">[];
  activeParticipantCount: number;
  matchesForMatchday: PublicArticleMatch[];
};

function uniqueIds(ids: (string | null | undefined)[]) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

export async function readPublicArticleMatchdayContext(
  article: ArticleContextIds,
): Promise<PublicArticleMatchdayContext | null> {
  if (!article.matchday_id) return null;

  try {
    const [matchday] = await fetchSupabaseAdminTable<ArticleMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on&id=eq.${encodeURIComponent(article.matchday_id)}&limit=1`,
    );
    const seasonId = matchday?.season_id ?? article.season_id;
    if (!matchday || !seasonId || !Number.isInteger(matchday.number) || matchday.number < 1) return null;

    const [season] = await fetchSupabaseAdminTable<ArticleSeason>(
      `seasons?select=id,competition_id,label&id=eq.${encodeURIComponent(seasonId)}&limit=1`,
    );
    const competitionId = season?.competition_id ?? article.competition_id;
    if (!season || !competitionId) return null;

    const [competition] = await fetchSupabaseAdminTable<ArticleCompetition>(
      `competitions?select=id,name,slug,logo_url,is_active&id=eq.${encodeURIComponent(competitionId)}&limit=1`,
    );
    if (!competition?.slug || competition.is_active === false) return null;

    const [seasons, matchdays, participants, matches] = await Promise.all([
      fetchSupabaseAdminTable<PublicArticleMatchdayContext["seasons"][number]>(
        `seasons?select=id,label&competition_id=eq.${encodeURIComponent(competition.id)}&order=label.desc&limit=100`,
      ),
      fetchSupabaseAdminTable<PublicArticleMatchdayContext["matchdays"][number]>(
        `matchdays?select=id,number&season_id=eq.${encodeURIComponent(season.id)}&order=number.asc&limit=100`,
      ),
      // Keep the existing status !== inactive semantics (including null) and bound.
      // Only status is transferred, not participant/team/sync objects.
      fetchSupabaseAdminTable<{ status: string | null }>(
        `season_teams?select=status&season_id=eq.${encodeURIComponent(season.id)}&order=display_order.asc&limit=1000`,
      ),
      fetchSupabaseAdminTable<ArticleMatchRow>(
        `matches?select=id,home_team_id,away_team_id,broadcast_channel_id,scheduled_date,kickoff_at,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score&season_id=eq.${encodeURIComponent(season.id)}&matchday_id=eq.${encodeURIComponent(matchday.id)}&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=1000`,
      ),
    ]);

    // Do not invent a relationship from an article fallback or switch identity via labels.
    if (!seasons.some((item) => item.id === season.id) || !matchdays.some((item) => item.id === matchday.id)) return null;

    const teamIds = uniqueIds(matches.flatMap((match) => [match.home_team_id, match.away_team_id]));
    const channelIds = uniqueIds(matches.map((match) => match.broadcast_channel_id));
    const [teams, channels] = await Promise.all([
      teamIds.length ? fetchSupabaseAdminTable<ArticleTeam>(
        `teams?select=id,name,public_name,short_name,code,slug,logo_url&id=in.(${teamIds.map(encodeURIComponent).join(",")})&limit=1000`,
      ) : Promise.resolve([]),
      channelIds.length ? fetchSupabaseAdminTable<ArticleBroadcastChannel>(
        `broadcast_channels?select=id,name,logo_url&id=in.(${channelIds.map(encodeURIComponent).join(",")})&limit=500`,
      ) : Promise.resolve([]),
    ]);
    const teamsById = new Map(teams.map((team) => [team.id, team]));
    const channelsById = new Map(channels.map((channel) => [channel.id, channel]));

    return {
      competition, season, seasons, matchday, matchdays,
      activeParticipantCount: participants.filter((participant) => participant.status !== "inactive").length,
      matchesForMatchday: matches.map((match) => ({
        ...match,
        matchday: { id: matchday.id, number: matchday.number },
        homeTeam: teamsById.get(match.home_team_id) ?? null,
        awayTeam: teamsById.get(match.away_team_id) ?? null,
        broadcastChannel: match.broadcast_channel_id ? channelsById.get(match.broadcast_channel_id) ?? null : null,
      })),
    };
  } catch {
    return null; // Same degradable context as the article page; the article remains available.
  }
}
