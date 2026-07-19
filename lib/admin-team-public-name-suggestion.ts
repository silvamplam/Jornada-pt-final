export type AdminTeamPublicNameSuggestion = {
  value: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type AdminTeamPublicNameSuggestionInput = {
  name?: string | null;
};

const COMPACT_NAME_MAX_CHARACTERS = 13;
const DISTINCTIVE_QUALIFIER_PATTERN =
  /(?:^|[\s-])(?:b|ii|sub[\s-]?\d{2}|u\d{2}|feminin[oa]|women|reserves?|juniores?|juvenis?|iniciados?)(?=$|[\s-])/iu;

function cleanName(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/gu, " ");
  return cleaned ? cleaned : null;
}

function firstInitial(value: string): string {
  return Array.from(value)[0]?.toLocaleUpperCase("pt-PT") ?? "";
}

export function suggestAdminTeamPublicName(
  team: AdminTeamPublicNameSuggestionInput
): AdminTeamPublicNameSuggestion {
  const name = cleanName(team.name);

  if (!name) {
    return {
      value: null,
      confidence: "low",
      reason: "Sem nome canónico suficiente para gerar uma sugestão."
    };
  }

  if (DISTINCTIVE_QUALIFIER_PATTERN.test(name)) {
    return {
      value: name,
      confidence: "high",
      reason: "Mantém o qualificador que distingue esta equipa."
    };
  }

  const withoutAfc = name.match(/^AFC\s+(.+)$/iu)?.[1] ?? null;
  if (withoutAfc) {
    return {
      value: withoutAfc,
      confidence: "medium",
      reason: "Remove apenas o prefixo organizacional AFC."
    };
  }

  if (/\sHotspur$/iu.test(name)) {
    return {
      value: null,
      confidence: "low",
      reason: "O nome não tem uma redução determinística suficientemente segura."
    };
  }

  if (Array.from(name).length <= COMPACT_NAME_MAX_CHARACTERS) {
    return {
      value: name,
      confidence: "high",
      reason: "O nome canónico já é suficientemente compacto."
    };
  }

  const connectorName = name.match(/^(\S+)\s+(?:da|do|das|dos)\s+(.+)$/iu);
  if (connectorName) {
    return {
      value: `${firstInitial(connectorName[1])}. ${connectorName[2]}`,
      confidence: "medium",
      reason: "Abrevia o primeiro elemento e preserva o elemento geográfico distintivo."
    };
  }

  const twoPartName = name.match(/^(\S+)\s+(\S+)$/u);
  if (twoPartName && Array.from(twoPartName[1]).length >= 4) {
    return {
      value: `${firstInitial(twoPartName[1])}. ${twoPartName[2]}`,
      confidence: "medium",
      reason: "Abrevia apenas o primeiro elemento de um nome com duas partes."
    };
  }

  return {
    value: null,
    confidence: "low",
    reason: "Sem sugestão conservadora para este nome."
  };
}
