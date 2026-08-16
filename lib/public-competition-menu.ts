import {
  fetchSupabaseAdminTable,
  type SupabaseCompetition,
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

function dateKey(value: string | null | undefined) {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function referenceDateKey(referenceDate: Date) {
  return referenceDate.toISOString().slice(0, 10);
}

function preferredSeasonForCompetition(
  seasons: SupabaseSeason[],
  referenceDate = new Date()
) {
  const current = seasons.find((season) => season.is_current);

  if (current) {
    return current;
  }

  const today = referenceDateKey(referenceDate);
  const ordered = [...seasons].sort((left, right) =>
    right.label.localeCompare(left.label, "pt")
  );

  const inCalendarWindow = ordered.find((season) => {
    const startsOn = dateKey(season.starts_on);
    const endsOn = dateKey(season.ends_on) ?? startsOn;

    return Boolean(
      startsOn &&
      endsOn &&
      startsOn <= today &&
      today <= endsOn
    );
  });

  if (inCalendarWindow) {
    return inCalendarWindow;
  }

  const nextSeason = [...ordered]
    .filter((season) => {
      const startsOn = dateKey(season.starts_on);
      return Boolean(startsOn && startsOn > today);
    })
    .sort((left, right) =>
      (dateKey(left.starts_on) ?? "").localeCompare(
        dateKey(right.starts_on) ?? ""
      )
    )[0];

  if (nextSeason) {
    return nextSeason;
  }

  return ordered[0] ?? null;
}

function menuSort(a: PublicCompetitionMenuItem, b: PublicCompetitionMenuItem) {
  const aIndex = COMPETITION_MENU_ORDER.indexOf(a.slug);
  const bIndex = COMPETITION_MENU_ORDER.indexOf(b.slug);

  if (aIndex !== -1 || bIndex !== -1) {
    return (
      (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
      (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
    );
  }

  return a.label.localeCompare(b.label, "pt");
}

export async function getPublicCompetitionMenu(): Promise<
  PublicCompetitionMenuItem[]
> {
  const referenceDate = new Date();

  const [competitions, seasons] = await Promise.all([
    fetchSupabaseAdminTable<SupabaseCompetition>(
      "competitions?select=id,name,slug,logo_url,is_active&is_active=eq.true&order=name.asc&limit=100"
    ),
    fetchSupabaseAdminTable<SupabaseSeason>(
      "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc&limit=500"
    )
  ]);

  return competitions
    .map((competition) => {
      const competitionSeasons = seasons.filter(
        (season) => season.competition_id === competition.id
      );
      const season = preferredSeasonForCompetition(
        competitionSeasons,
        referenceDate
      );

      if (!season) {
        return null;
      }

      const seasonSegment = seasonLabelToUrlSegment(season.label);
      const href = `/competicoes/${competition.slug}/${seasonSegment}`;

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
