import {
  LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS,
} from "@/lib/editorial-hierarchical-composition";

export type MatchdayDeskGroupKey =
  | "headline"
  | "side_block"
  | "highlights"
  | "complement"
  | "four_news"
  | "six_news"
  | "five_news_balanced"
  | "five_news_secondary"
  | "faixa";

export type MatchdayDeskDestination = MatchdayDeskGroupKey | "none";

export type MatchdayDeskSlotDefinition = {
  key: string;
  label: string;
};

export type MatchdayDeskGroupDefinition = {
  key: MatchdayDeskGroupKey;
  label: string;
  description: string;
  slots: MatchdayDeskSlotDefinition[];
};

function capitalizeDeskSlotLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("pt-PT") + trimmed.slice(1);
}

function liveSlots(group: string) {
  const positions = LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS
    .filter((position) => position.group === group);

  return positions.map((position, index) => ({
    key: position.transferSlotType,
    label: group === "four_news"
      ? `Posi\u00e7\u00e3o ${index + 1}`
      : capitalizeDeskSlotLabel(
          position.publicName.split("\u2014").at(-1) ?? position.publicName,
        ),
  }));
}
export const MATCHDAY_DESK_GROUPS: MatchdayDeskGroupDefinition[] = [
  {
    key: "headline",
    label: "Manchete",
    description: "Posição editorial principal.",
    slots: [{ key: "headline", label: "Manchete" }],
  },
  {
    key: "side_block",
    label: "Contexto",
    description: "Bloco editorial lateral.",
    slots: [{ key: "side_block", label: "Contexto" }],
  },
  {
    key: "highlights",
    label: "3 notícias",
    description: "Três notícias imediatamente abaixo da manchete.",
    slots: [1, 2, 3].map((order) => ({
      key: `highlight:${order}`,
      label: `Posi\u00e7\u00e3o ${order}`,
    })),
  },
  {
    key: "complement",
    label: "Ao lado do vídeo",
    description: "Notícia complementar junto ao vídeo.",
    slots: [{ key: "complement", label: "Ao lado do vídeo" }],
  },
  {
    key: "four_news",
    label: "4 notícias + Últimas",
    description: "Quatro notícias compactas junto da zona Últimas.",
    slots: liveSlots("four_news"),
  },
  {
    key: "six_news",
    label: "6 notícias",
    description: "Uma dominante, três secundárias e duas complementares.",
    slots: liveSlots("six_news"),
  },
  {
    key: "five_news_balanced",
    label: "5 notícias · 1D + 1S + 3C",
    description: "Uma dominante, uma secundária e três complementares.",
    slots: liveSlots("five_news_balanced"),
  },
  {
    key: "five_news_secondary",
    label: "5 notícias · 1D + 4S",
    description: "Uma dominante e quatro secundárias.",
    slots: liveSlots("five_news_secondary"),
  },
  {
    key: "faixa",
    label: "Faixa de notícias",
    description: "Sequência editorial ordenada no fundo da jornada.",
    slots: [],
  },
];

export type MatchdayDeskDesiredArticle = {
  inLatest: boolean;
  placementKey: string | null;
};

export type MatchdayDeskDesiredState = Record<string, MatchdayDeskDesiredArticle>;

export type MatchdayDeskArticle = {
  id: string;
  slug: string;
  label: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  inLatest: boolean;
  placementKey: string | null;
  placementConflictKeys: string[];
};

export type MatchdayDeskBlockedPlacement = {
  placementKey: string;
  title: string;
  reason: string;
};

export type MatchdayDeskSnapshot = {
  matchdayId: string;
  matchdayNumber: number;
  matchdayLabel: string;
  seasonLabel: string;
  competitionName: string;
  isManaged: boolean;
  faixaVisible: boolean;
  revision: number;
  stateToken: string | null;
  articles: MatchdayDeskArticle[];
  blockedPlacements: MatchdayDeskBlockedPlacement[];
};

export type MatchdayDeskApplyArticle = {
  articleId: string;
  inLatest: boolean;
  placementKey: string | null;
};

export type MatchdayDeskApplyResult = {
  revision: number;
  stateToken: string;
  appliedAt: string;
  isManaged: true;
  faixaVisible: boolean;
};

export function matchdayDeskGroup(groupKey: MatchdayDeskGroupKey) {
  return MATCHDAY_DESK_GROUPS.find((group) => group.key === groupKey) ?? null;
}

export function placementGroupForKey(placementKey?: string | null): MatchdayDeskGroupKey | null {
  if (!placementKey) return null;
  if (placementKey.startsWith("important_item:")) return "faixa";

  for (const group of MATCHDAY_DESK_GROUPS) {
    if (group.slots.some((slot) => slot.key === placementKey)) {
      return group.key;
    }
  }

  return null;
}

export function isMatchdayDeskPlacementKey(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  if (/^important_item:[1-9]\d*$/.test(value)) return true;

  return MATCHDAY_DESK_GROUPS.some((group) =>
    group.key !== "faixa" && group.slots.some((slot) => slot.key === value)
  );
}

export function buildMatchdayDeskApplyArticles(
  state: MatchdayDeskDesiredState,
): MatchdayDeskApplyArticle[] {
  return Object.entries(state).map(([articleId, article]) => ({
    articleId,
    inLatest: article.inLatest,
    placementKey: article.placementKey,
  }));
}

export function placementLabelForKey(placementKey?: string | null) {
  if (!placementKey) return "Sem coloca\u00e7\u00e3o editorial";

  if (placementKey.startsWith("important_item:")) {
    const order = Number(placementKey.split(":")[1]);
    return Number.isInteger(order) && order > 0
      ? `Faixa \u00b7 posi\u00e7\u00e3o ${order}`
      : "Faixa";
  }

  for (const group of MATCHDAY_DESK_GROUPS) {
    const slot = group.slots.find((candidate) => candidate.key === placementKey);
    if (!slot) continue;

    if (group.slots.length === 1) {
      return group.label;
    }

    if (group.key === "four_news") {
      return `4 not\u00edcias \u00b7 ${slot.label}`;
    }

    return `${group.label} \u00b7 ${slot.label}`;
  }

  return placementKey;
}
function cloneDesiredState(state: MatchdayDeskDesiredState): MatchdayDeskDesiredState {
  return Object.fromEntries(
    Object.entries(state).map(([articleId, article]) => [articleId, { ...article }]),
  );
}

function faixaOrder(placementKey?: string | null) {
  if (!placementKey?.startsWith("important_item:")) return Number.MAX_SAFE_INTEGER;
  const value = Number(placementKey.split(":")[1]);
  return Number.isInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function normalizeFaixa(state: MatchdayDeskDesiredState) {
  const orderedIds = Object.entries(state)
    .filter(([, article]) => placementGroupForKey(article.placementKey) === "faixa")
    .sort((left, right) => faixaOrder(left[1].placementKey) - faixaOrder(right[1].placementKey))
    .map(([articleId]) => articleId);

  orderedIds.forEach((articleId, index) => {
    state[articleId] = {
      ...state[articleId],
      placementKey: `important_item:${index + 1}`,
    };
  });
}

export function applyDeskPlacementSelection(
  state: MatchdayDeskDesiredState,
  selectedArticleIds: string[],
  destination: MatchdayDeskDestination,
) {
  const selected = selectedArticleIds.filter((articleId, index, ids) =>
    Boolean(state[articleId]) && ids.indexOf(articleId) === index
  );
  if (selected.length === 0) return state;

  const next = cloneDesiredState(state);

  if (destination === "none") {
    selected.forEach((articleId) => {
      next[articleId] = { ...next[articleId], placementKey: null };
    });
    normalizeFaixa(next);
    return next;
  }

  selected.forEach((articleId) => {
    next[articleId] = { ...next[articleId], placementKey: null };
  });

  if (destination === "faixa") {
    const existingFaixaIds = Object.entries(next)
      .filter(([, article]) => placementGroupForKey(article.placementKey) === "faixa")
      .sort((left, right) => faixaOrder(left[1].placementKey) - faixaOrder(right[1].placementKey))
      .map(([articleId]) => articleId);

    [...existingFaixaIds, ...selected].forEach((articleId, index) => {
      next[articleId] = {
        ...next[articleId],
        placementKey: `important_item:${index + 1}`,
      };
    });
    return next;
  }

  const group = matchdayDeskGroup(destination);
  if (!group || group.slots.length === 0) return state;
  if (selected.length > group.slots.length) {
    throw new Error(`A zona ${group.label} só tem ${group.slots.length} posições.`);
  }

  selected.forEach((articleId, index) => {
    const targetKey = group.slots[index].key;
    const displaced = Object.entries(next).find(
      ([candidateId, article]) => candidateId !== articleId && article.placementKey === targetKey,
    );
    if (displaced) {
      next[displaced[0]] = { ...next[displaced[0]], placementKey: null };
    }
    next[articleId] = { ...next[articleId], placementKey: targetKey };
  });

  normalizeFaixa(next);
  return next;
}

export function placeDeskArticleInSlot(
  state: MatchdayDeskDesiredState,
  articleId: string,
  targetPlacementKey: string,
) {
  if (!state[articleId]) return state;

  const targetGroup = placementGroupForKey(targetPlacementKey);
  if (!targetGroup || targetGroup === "faixa") {
    throw new Error("A posi\u00e7\u00e3o editorial escolhida n\u00e3o \u00e9 v\u00e1lida.");
  }

  const next = cloneDesiredState(state);
  const sourceWasFaixa = placementGroupForKey(next[articleId].placementKey) === "faixa";
  const displaced = Object.entries(next).find(
    ([candidateId, article]) =>
      candidateId !== articleId && article.placementKey === targetPlacementKey,
  );

  if (displaced) {
    next[displaced[0]] = { ...next[displaced[0]], placementKey: null };
  }

  next[articleId] = { ...next[articleId], placementKey: targetPlacementKey };

  if (sourceWasFaixa) normalizeFaixa(next);
  return next;
}
export function setDeskLatestMembership(
  state: MatchdayDeskDesiredState,
  selectedArticleIds: string[],
  inLatest: boolean,
) {
  const next = cloneDesiredState(state);
  selectedArticleIds.forEach((articleId) => {
    if (!next[articleId]) return;
    next[articleId] = { ...next[articleId], inLatest };
  });
  return next;
}

export function moveDeskArticleWithinPlacementGroup(
  state: MatchdayDeskDesiredState,
  articleId: string,
  direction: "up" | "down",
) {
  const current = state[articleId];
  if (!current?.placementKey) return state;
  const groupKey = placementGroupForKey(current.placementKey);
  if (!groupKey) return state;

  const next = cloneDesiredState(state);

  if (groupKey === "faixa") {
    const orderedIds = Object.entries(next)
      .filter(([, article]) => placementGroupForKey(article.placementKey) === "faixa")
      .sort((left, right) => faixaOrder(left[1].placementKey) - faixaOrder(right[1].placementKey))
      .map(([candidateId]) => candidateId);
    const index = orderedIds.indexOf(articleId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) return state;
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    orderedIds.forEach((candidateId, orderIndex) => {
      next[candidateId] = {
        ...next[candidateId],
        placementKey: `important_item:${orderIndex + 1}`,
      };
    });
    return next;
  }

  const group = matchdayDeskGroup(groupKey);
  if (!group) return state;
  const index = group.slots.findIndex((slot) => slot.key === current.placementKey);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= group.slots.length) return state;

  const targetKey = group.slots[targetIndex].key;
  const targetOccupant = Object.entries(next).find(
    ([candidateId, article]) => candidateId !== articleId && article.placementKey === targetKey,
  );

  next[articleId] = { ...next[articleId], placementKey: targetKey };
  if (targetOccupant) {
    next[targetOccupant[0]] = {
      ...next[targetOccupant[0]],
      placementKey: current.placementKey,
    };
  }
  return next;
}

export function swapDeskArticleToSlot(
  state: MatchdayDeskDesiredState,
  articleId: string,
  targetPlacementKey: string,
) {
  const current = state[articleId];
  if (!current?.placementKey || current.placementKey === targetPlacementKey) return state;
  const sourceGroup = placementGroupForKey(current.placementKey);
  const targetGroup = placementGroupForKey(targetPlacementKey);
  if (!sourceGroup || sourceGroup !== targetGroup) return state;

  const next = cloneDesiredState(state);
  const targetOccupant = Object.entries(next).find(
    ([candidateId, article]) =>
      candidateId !== articleId && article.placementKey === targetPlacementKey,
  );

  next[articleId] = { ...next[articleId], placementKey: targetPlacementKey };
  if (targetOccupant) {
    next[targetOccupant[0]] = {
      ...next[targetOccupant[0]],
      placementKey: current.placementKey,
    };
  }

  if (sourceGroup === "faixa") normalizeFaixa(next);
  return next;
}
