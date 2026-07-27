import {
  fetchSupabaseAdminTable,
  type SupabaseCompetition,
  type SupabaseMatchday,
  type SupabaseSeason
} from "@/lib/supabase";
import { seasonLabelToUrlSegment } from "@/lib/public-matchday";

export type PublicCompetitionMenuItem = {
  label: string;
  slug: string;
  href: string;
  logoUrl: string | null;
};

const COMPETITION_MENU_ORDER = [
  "liga-portugal",
  "la-liga",
  "premier-league",
  "ligue-1",
  "serie-a"
];

function preferredSeasonForCompetition(seasons: SupabaseSeason[]) {
  return seasons.find((season) => season.is_current) ?? seasons[0] ?? null;
}

function menuSort(a: PublicCompetitionMenuItem, b: PublicCompetitionMenuItem) {
  const aIndex = COMPETITION_MENU_ORDER.indexOf(a.slug);
  const bIndex = COMPETITION_MENU_ORDER.indexOf(b.slug);

  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  }

  return a.label.localeCompare(b.label, "pt");
}

export async function getPublicCompetitionMenu(): Promise<PublicCompetitionMenuItem[]> {
  const [competitions, seasons, matchdays] = await Promise.all([
    fetchSupabaseAdminTable<SupabaseCompetition>(
      "competitions?select=id,name,slug,logo_url,is_active&is_active=eq.true&order=name.asc&limit=100"
    ),
    fetchSupabaseAdminTable<SupabaseSeason>(
      "seasons?select=id,competition_id,label,is_current&order=label.desc&limit=500"
    ),
    fetchSupabaseAdminTable<SupabaseMatchday>(
      "matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&order=number.asc&limit=1000"
    )
  ]);

  return competitions
    .map((competition) => {
      const competitionSeasons = seasons.filter((season) => season.competition_id === competition.id);
      const season = preferredSeasonForCompetition(competitionSeasons);

      if (!season) {
        return null;
      }

      const seasonSegment = seasonLabelToUrlSegment(season.label);
      const firstMatchday = matchdays.find((matchday) => matchday.season_id === season.id);
      const href = firstMatchday
        ? `/competicoes/${competition.slug}/${seasonSegment}/jornadas/${firstMatchday.number}`
        : `/competicoes/${competition.slug}/${seasonSegment}`;

      return {
        label: competition.name,
        slug: competition.slug,
        href,
        logoUrl: competition.logo_url
      };
    })
    .filter((item): item is PublicCompetitionMenuItem => Boolean(item))
    .sort(menuSort);
}

export const readPublicCompetitionMenu = getPublicCompetitionMenu;
