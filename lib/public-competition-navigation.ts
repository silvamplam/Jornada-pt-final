import type { PublicCompetitionMenuItem } from "@/lib/public-competition-menu";

// Navigation-only overrides, keyed by the public canonical slug. Keeping these
// here avoids changing competitions.logo_url, which is consumed elsewhere.

export type PublicCompetitionNavigationLogoVariant =
  | "fallback"
  | "liga-portugal-horizontal"
  | "laliga-horizontal"
  | "premier-league-lockup";

export type PublicCompetitionNavigationLogoPresentation = {
  logoUrl: string;
  variant: PublicCompetitionNavigationLogoVariant;
  intrinsicWidth: number;
  intrinsicHeight: number;
};

const OFFICIAL_COMPETITION_NAVIGATION_LOGOS: Readonly<
  Record<string, PublicCompetitionNavigationLogoPresentation>
> = {
  // Official Liga Portugal asset; transparent exterior margin trimmed only.
  // https://www.ligaportugal.pt/backoffice/assets/Minimal_LP_Betclic_1ae88370f2.png
  "liga-portugal": {
    logoUrl:
      "/brand/competitions/navigation/liga-portugal-betclic-horizontal.png",
    variant: "liga-portugal-horizontal",
    intrinsicWidth: 200,
    intrinsicHeight: 38
  },
  // Official LALIGA pressroom wordmark; transparent exterior margin trimmed only.
  // https://assets.laliga.com/assets/logos/LALIGA_RGB_h_color/LALIGA_RGB_h_color.png
  "la-liga": {
    logoUrl: "/brand/competitions/navigation/laliga-horizontal.png",
    variant: "laliga-horizontal",
    intrinsicWidth: 2881,
    intrinsicHeight: 688
  },
  // Exact local copy from the Premier League official logo host.
  // https://logo.premierleague.com/img/lion-dark.svg
  "premier-league": {
    logoUrl: "/brand/competitions/navigation/premier-league-lockup.svg",
    variant: "premier-league-lockup",
    intrinsicWidth: 400,
    intrinsicHeight: 167
  }
};

export function resolveActivePublicCompetition(
  competitions: PublicCompetitionMenuItem[],
  activeCompetitionSlug?: string | null
) {
  if (!activeCompetitionSlug) {
    return null;
  }

  return (
    competitions.find((competition) => competition.slug === activeCompetitionSlug) ??
    null
  );
}

export function resolvePublicCompetitionLogoUrl(
  competition: PublicCompetitionMenuItem | null
) {
  return resolvePublicCompetitionLogoPresentation(competition)?.logoUrl ?? null;
}

export function resolvePublicCompetitionLogoPresentation(
  competition: PublicCompetitionMenuItem | null
): PublicCompetitionNavigationLogoPresentation | null {
  if (!competition) {
    return null;
  }

  const officialPresentation =
    OFFICIAL_COMPETITION_NAVIGATION_LOGOS[competition.slug];

  if (officialPresentation) {
    return officialPresentation;
  }

  const fallbackLogoUrl = competition.logoUrl?.trim();

  return fallbackLogoUrl
    ? {
        logoUrl: fallbackLogoUrl,
        variant: "fallback",
        intrinsicWidth: 115,
        intrinsicHeight: 36
      }
    : null;
}
