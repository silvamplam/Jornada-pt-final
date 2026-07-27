export type PublicMatchStripTheme = "liga-portugal";

export function getPublicMatchStripTheme(competitionSlug?: string | null): PublicMatchStripTheme | null {
  const normalizedSlug = competitionSlug?.trim().toLowerCase();

  if (normalizedSlug === "liga-portugal") {
    return "liga-portugal";
  }

  return null;
}
