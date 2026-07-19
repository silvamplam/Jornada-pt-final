export type PublicTeamNameInput = {
  name?: string | null;
  shortName?: string | null;
  code?: string | null;
};

export type PublicTeamNameVariant = "compact" | "full" | "badge";

const COMPACT_TEAM_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "academico de viseu": "A. de Viseu",
  "athletic club": "Athletic",
  "atletico de madrid": "A. Madrid",
  "atletico madrid": "A. Madrid",
  "brighton & hove albion": "Brighton",
  "brighton and hove albion": "Brighton",
  "celta vigo": "Celta",
  "deportivo la coruna": "Deportivo",
  "estoril praia": "Estoril",
  "estrela da amadora": "Estrela",
  "manchester city": "M. City",
  "manchester united": "M. United",
  "nottingham forest": "N. Forest",
  "racing santander": "Racing",
  "rayo vallecano": "Rayo",
  "real betis": "Betis",
  "real madrid": "R. Madrid",
  "real sociedad": "R. Sociedad",
  "tottenham hotspur": "Tottenham"
};

function cleanField(value?: string | null) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || null;
}

function normalizedTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasDistinctiveQualifier(value: string) {
  return /(?:^|[\s(\-])(?:b|ii|sub[\s-]?\d{1,2}|u[\s-]?\d{1,2}|feminina|feminino|women|junior(?:es)?|juvenil|juvenis|iniciad[oa]s?|senior(?:es)?|reservas?)(?:$|[\s)\-])/i.test(
    value
  );
}

function compactTeamName(name: string) {
  const normalizedName = normalizedTeamName(name);
  const override = COMPACT_TEAM_NAME_OVERRIDES[normalizedName];
  if (override) {
    return override;
  }

  if (name.length <= 13) {
    return name;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const compactName = `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
    if (compactName.length <= 16) {
      return compactName;
    }

    if (hasDistinctiveQualifier(normalizedName)) {
      return name;
    }

    return `${parts[0][0]}. ${parts[1]}`;
  }

  return name;
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
  const shortName = cleanField(team.shortName);
  const code = cleanField(team.code);

  if (variant === "full") {
    return name ?? shortName ?? code ?? "Equipa";
  }

  if (variant === "badge") {
    return code ?? shortName ?? initialsFromName(name) ?? "FC";
  }

  return name ? compactTeamName(name) : shortName ?? code ?? "Equipa";
}
