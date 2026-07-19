export type PublicTeamNameInput = {
  name?: string | null;
  publicName?: string | null;
  shortName?: string | null;
  code?: string | null;
};

export type PublicTeamNameVariant = "compact" | "full" | "badge";

function cleanField(value?: string | null) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || null;
}

function initialsFromName(name?: string | null) {
  if (!name) {
    return null;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return initials || null;
}

export function getPublicTeamName(team: PublicTeamNameInput, variant: PublicTeamNameVariant): string {
  const name = cleanField(team.name);
  const publicName = cleanField(team.publicName);
  const shortName = cleanField(team.shortName);
  const code = cleanField(team.code);

  if (variant === "full") {
    return name ?? publicName ?? shortName ?? code ?? "Equipa";
  }

  if (variant === "badge") {
    return code ?? shortName ?? initialsFromName(name) ?? "FC";
  }

  return publicName ?? name ?? shortName ?? code ?? "Equipa";
}
