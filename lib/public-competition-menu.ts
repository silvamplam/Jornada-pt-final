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

export type PublicCompetitionMatchdayCandidate = Pick<
  SupabaseMatchday,
  "number" | "starts_on" | "ends_on" | "status"
>;

const COMPETITION_MENU_ORDER = [
  "liga-portugal",
  "la-liga",
  "premier-league",
  "ligue-1",
  "serie-a"
];

const LIVE_MATCHDAY_STATUSES = new Set([
  "live",
  "in_progress",
  "halftime"
]);

const COMPLETED_MATCHDAY_STATUSES = new Set([
  "finished",
  "archived",
  "completed",
  "played"
]);

function dateKey(value: string | null | undefined) {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function referenceDateKey(referenceDate: Date) {
  return referenceDate.toISOString().slice(0, 10);
}

function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function orderedMatchdays<T extends PublicCompetitionMatchdayCandidate>(
  matchdays: readonly T[]
) {
  return [...matchdays].sort((left, right) => left.number - right.number);
}

export function resolvePublicCompetitionCurrentMatchday<
  T extends PublicCompetitionMatchdayCandidate
>(
  matchdays: readonly T[],
  referenceDate = new Date()
): T | null {
  const ordered = orderedMatchdays(matchdays);

  if (!ordered.length) {
    return null;
  }

  const live = ordered.find((matchday) =>
    LIVE_MATCHDAY_STATUSES.has(normalizedStatus(matchday.status))
  );

  if (live) {
    return live;
  }

  const today = referenceDateKey(referenceDate);

  const inCalendarWindow = ordered.find((matchday) => {
    const startsOn = dateKey(matchday.starts_on);
    const endsOn = dateKey(matchday.ends_on) ?? startsOn;

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

  const nextByCalendar = ordered.find((matchday) => {
    const startsOn = dateKey(matchday.starts_on);
    return Boolean(startsOn && startsOn > today);
  });

  if (nextByCalendar) {
    return nextByCalendar;
  }

  const latestStarted = [...ordered].reverse().find((matchday) => {
    const startsOn = dateKey(matchday.starts_on);
    return Boolean(startsOn && startsOn <= today);
  });

  if (latestStarted) {
    return latestStarted;
  }

  const firstNotCompleted = ordered.find(
    (matchday) =>
      !COMPLETED_MATCHDAY_STATUSES.has(normalizedStatus(matchday.status))
  );

  return firstNotCompleted ?? ordered.at(-1) ?? ordered[0];
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

  const [competitions, seasons, matchdays] = await Promise.all([
    fetchSupabaseAdminTable<SupabaseCompetition>(
      "competitions?select=id,name,slug,logo_url,is_active&is_active=eq.true&order=name.asc&limit=100"
    ),
    fetchSupabaseAdminTable<SupabaseSeason>(
      "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc&limit=500"
    ),
    fetchSupabaseAdminTable<SupabaseMatchday>(
      "matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&order=number.asc&limit=1000"
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
      const seasonMatchdays = matchdays.filter(
        (matchday) => matchday.season_id === season.id
      );
      const currentMatchday = resolvePublicCompetitionCurrentMatchday(
        seasonMatchdays,
        referenceDate
      );
      const href = currentMatchday
        ? `/competicoes/${competition.slug}/${seasonSegment}/jornadas/${currentMatchday.number}`
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
