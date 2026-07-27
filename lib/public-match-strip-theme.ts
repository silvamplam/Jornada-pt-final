export type PublicMatchStripTheme = "liga-portugal" | "premier-league";

export function getPublicMatchStripTheme(competitionSlug?: string | null): PublicMatchStripTheme | null {
  const normalizedSlug = competitionSlug?.trim().toLowerCase();

  if (normalizedSlug === "liga-portugal") {
    return "liga-portugal";
  }

  if (normalizedSlug === "premier-league") {
    return "premier-league";
  }

  return null;
}
