import type { PublicCompetitionMenuItem } from "./public-competition-menu";
import { resolvePublicCompetitionMastheadLogoPresentation } from "./public-competition-navigation";
import { buildPublicMatchdayLegNavigation } from "./public-matchday-leg-navigation";
import { seasonLabelToUrlSegment, type PublicMatchdayContext, type PublicSeasonMatch } from "./public-matchday";

export type PublicMatchdayHeaderContext = {
  competition: Pick<PublicMatchdayContext["competition"], "slug" | "name" | "logo_url">;
  season: Pick<PublicMatchdayContext["season"], "label">;
  seasons: Array<Pick<PublicMatchdayContext["season"], "id" | "label">>;
  matchday: Pick<PublicMatchdayContext["matchday"], "id" | "number" | "starts_on" | "ends_on">;
  matchdays: Array<Pick<PublicMatchdayContext["matchday"], "id" | "number">>;
  activeParticipantCount: number;
  matchesForMatchday: Array<Pick<PublicSeasonMatch, "scheduled_date">>;
};

function publicCompetitionBarColor(competitionSlug: string) {
  if (competitionSlug === "liga-portugal") return "#00235a";
  if (competitionSlug === "premier-league") return "#3d195b";
  if (competitionSlug === "la-liga") return "#1d2230";
  return "#262626";
}

const civilMonthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

function parseCivilDate(value: string | null | undefined) {
  const cleanValue = value ?? "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanValue);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year, key: cleanValue };
}

function formatCivilDateRange(firstDate: NonNullable<ReturnType<typeof parseCivilDate>>, lastDate: NonNullable<ReturnType<typeof parseCivilDate>>) {
  if (firstDate.key === lastDate.key) return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} de ${firstDate.year}`;
  if (firstDate.year === lastDate.year && firstDate.month === lastDate.month) {
    return `${firstDate.day}–${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
  }
  if (firstDate.year === lastDate.year) {
    return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} – ${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
  }
  return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} de ${firstDate.year} – ${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
}

function formatPreferredMatchdayDateContext(matches: PublicMatchdayHeaderContext["matchesForMatchday"], startsOn: string | null, endsOn: string | null) {
  const startsDate = parseCivilDate(startsOn);
  const endsDate = parseCivilDate(endsOn);
  if (startsDate && endsDate) return formatCivilDateRange(startsDate, endsDate);

  const scheduledDates = matches
    .map((match) => parseCivilDate(match.scheduled_date))
    .filter((date): date is NonNullable<typeof date> => date !== null)
    .sort((firstDate, secondDate) => firstDate.key.localeCompare(secondDate.key));
  if (scheduledDates.length === 0) return "Data por definir";
  return formatCivilDateRange(scheduledDates[0], scheduledDates[scheduledDates.length - 1]);
}


/** The same published competition/season/matchday context drives both public headers. */
export function buildPublicMatchdayHeaderModel(
  context: PublicMatchdayHeaderContext,
  competitions: PublicCompetitionMenuItem[],
) {
  const seasonSegment = seasonLabelToUrlSegment(context.season.label);
  const matchdayHref = (number: number) => `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/${number}`;
  const currentSeasonHref = matchdayHref(1);
  const currentCompetitionMenuItem = {
    label: context.competition.name,
    slug: context.competition.slug,
    href: matchdayHref(context.matchday.number),
    logoUrl: context.competition.logo_url,
  };
  const publicCompetitionMenu = competitions.map(item =>
    item.slug === currentCompetitionMenuItem.slug ? currentCompetitionMenuItem : item
  );
  if (!publicCompetitionMenu.some(item => item.slug === currentCompetitionMenuItem.slug)) {
    publicCompetitionMenu.unshift(currentCompetitionMenuItem);
  }
  const competitionLogo = resolvePublicCompetitionMastheadLogoPresentation(currentCompetitionMenuItem);
  const seasonOptions = context.seasons.map(season => ({
    id: season.id,
    label: season.label,
    href: `/competicoes/${context.competition.slug}/${seasonLabelToUrlSegment(season.label)}/jornadas/1`,
  }));
  const navigation = buildPublicMatchdayLegNavigation(context.matchdays, context.activeParticipantCount, context.matchday.id);
  return {
    competitionBarColor: publicCompetitionBarColor(context.competition.slug),
    currentCompetitionMenuItem, competitionLogo, publicCompetitionMenu, seasonOptions,
    currentSeasonHref, matchdayHref,
    shouldSplitMatchdayNav: navigation.applies,
    activeMatchdayLeg: navigation.activeLeg,
    visibleMatchdays: navigation.visibleMatchdays,
    firstLegHref: navigation.firstLegTarget ? matchdayHref(navigation.firstLegTarget.number) : currentSeasonHref,
    secondLegHref: navigation.secondLegTarget ? matchdayHref(navigation.secondLegTarget.number) : currentSeasonHref,
    selectedMatchdayDateContext: formatPreferredMatchdayDateContext(context.matchesForMatchday, context.matchday.starts_on, context.matchday.ends_on),
  };
}
