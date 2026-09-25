// Frozen article reader from d4baf251 (B1 base), for transport comparison only.
import { fetchSupabaseAdminTable, type SupabaseMatchday, type SupabaseSeason, type SupabaseCompetition } from '../../supabase';
import { getPublicMatchdayDiagnostic, seasonLabelToUrlSegment } from '../../public-matchday';
type EditorialArticle = { matchday_id?: string | null; season_id?: string | null; competition_id?: string | null };

export async function readArticleMatchdayContext(article: EditorialArticle) {
  if (!article.matchday_id) {
    return null;
  }

  try {
    const matchdays = await fetchSupabaseAdminTable<SupabaseMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&id=eq.${encodeURIComponent(
        article.matchday_id
      )}&limit=1`
    );
    const matchday = matchdays[0] ?? null;
    const seasonId = matchday?.season_id ?? article.season_id;

    if (!matchday || !seasonId) {
      return null;
    }

    const seasons = await fetchSupabaseAdminTable<SupabaseSeason>(
      `seasons?select=id,competition_id,label,starts_on,ends_on,is_current&id=eq.${encodeURIComponent(seasonId)}&limit=1`
    );
    const season = seasons[0] ?? null;
    const competitionId = season?.competition_id ?? article.competition_id;

    if (!season || !competitionId) {
      return null;
    }

    const competitions = await fetchSupabaseAdminTable<SupabaseCompetition>(
      `competitions?select=id,name,slug,country_id,country,logo_url,accent_color,is_active&id=eq.${encodeURIComponent(
        competitionId
      )}&limit=1`
    );
    const competition = competitions[0] ?? null;

    if (!competition?.slug || !matchday.number) {
      return null;
    }

    const { context } = await getPublicMatchdayDiagnostic({
      competitionSlug: competition.slug,
      seasonLabel: seasonLabelToUrlSegment(season.label),
      matchdayNumber: matchday.number
    });

    return context;
  } catch {
    return null;
  }
}
