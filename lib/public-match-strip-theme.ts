export type PublicMatchStripTheme = "liga-portugal" | "premier-league" | "la-liga";

export function getPublicMatchStripTheme(competitionSlug?: string | null): PublicMatchStripTheme | null {
  const normalizedSlug = competitionSlug?.trim().toLowerCase();

  if (normalizedSlug === "liga-portugal") {
    return "liga-portugal";
  }

  if (normalizedSlug === "premier-league") {
    return "premier-league";
  }

  if (normalizedSlug === "la-liga") {
    return "la-liga";
  }

  return null;
}
