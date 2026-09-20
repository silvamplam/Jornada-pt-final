import type { MesaIntentSelectionView, MesaIntentUiSelection } from "./newsroom-mesa-production-intents-ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function uuidList(value: unknown, maximum = 20): value is string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every(uuid)
    && new Set(value).size === value.length;
}

function plannedCount(value: unknown): value is number | null {
  return value === null || Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 30;
}

export type MesaNewOutputGroupingRequestV2 = Readonly<{
  version: 2;
  preparationKey: string;
  title: string;
  selection: Readonly<{
    sourceIds: readonly string[];
    themeIds: readonly string[];
    candidateArticleIds: readonly string[];
    reviewArticleIds: readonly string[];
  }>;
}>;

export type MesaNewOutputGroupingSource = Readonly<{
  dossierSourceId: string;
  newsroomArticleId: string;
  title: string;
  sourceLabel: string;
  imageId: string | null;
  imageUrl: string | null;
}>;

export type MesaNewOutputTheme = Readonly<{
  themeId: string;
  title: string;
  position: number;
  targetCount: number | null;
  seedSourceIds: readonly string[];
}>;

export type MesaNewOutputGroup = Readonly<{
  groupId: string;
  productionContextId: string;
  seedKind: "theme" | "selection";
  seedThemeId: string | null;
  seedSourceIds: readonly string[];
  position: number;
  outputId: string | null;
  articlePlanId: string | null;
  state: "planned" | "materialized";
}>;

export type MesaNewOutputExistingSlot = Readonly<{
  slot: string;
  kind: "existing";
  outputId: string;
  productionContextId: string;
  targetEditorialArticleId: string;
  targetSlug: string;
  targetTitle: string;
  targetMatchdayId: string | null;
}>;

export type MesaNewOutputGrouping = Readonly<{
  version: 2;
  dossierId: string;
  productionContextId: string;
  targetCount: number | null;
  revision: number;
  state: "planned" | "materialized";
  sources: readonly MesaNewOutputGroupingSource[];
  looseSourceIds: readonly string[];
  themes: readonly MesaNewOutputTheme[];
  groups: readonly MesaNewOutputGroup[];
  existingOutputs: readonly MesaNewOutputExistingSlot[];
}>;

export function buildMesaNewOutputGroupingRequestV2(
  selection: MesaIntentUiSelection,
  selectionView: MesaIntentSelectionView | null,
  reviewArticleIds: readonly string[],
  title: string,
  preparationKey: string,
): { ok: true; request: MesaNewOutputGroupingRequestV2 } | { ok: false; message: string } {
  const sourceIds = selection.sources.map((source) => source.newsroomArticleId).sort();
  const themeIds = selection.themes.map((theme) => theme.themeId).sort();
  if (!uuid(preparationKey) || !title.trim() || title.trim().length > 180 || !selectionView
    || JSON.stringify(selectionView.sourceIds) !== JSON.stringify(sourceIds)
    || JSON.stringify(selectionView.themeIds) !== JSON.stringify(themeIds)) {
    return { ok: false, message: "Não foi possível confirmar o material completo desta Produção." };
  }
  const candidateArticleIds = selectionView.articles.map((article) => article.id).sort();
  const candidates = new Set(candidateArticleIds);
  const reviews = [...new Set(reviewArticleIds)].sort();
  if (reviews.some((id) => !candidates.has(id))) {
    return { ok: false, message: "Um artigo escolhido para revisão deixou de corresponder à seleção." };
  }
  return {
    ok: true,
    request: {
      version: 2,
      preparationKey,
      title: title.trim(),
      selection: { sourceIds, themeIds, candidateArticleIds, reviewArticleIds: reviews },
    },
  };
}

export function parseMesaNewOutputGroupingRequestV2(value: unknown): MesaNewOutputGroupingRequestV2 | null {
  const request = objectValue(value);
  const selection = objectValue(request?.selection);
  if (!request || request.version !== 2 || !uuid(request.preparationKey)
    || typeof request.title !== "string" || !request.title.trim() || request.title.trim().length > 180
    || !selection || !uuidList(selection.sourceIds) || !uuidList(selection.themeIds)
    || !uuidList(selection.candidateArticleIds, 200) || !uuidList(selection.reviewArticleIds, 30)
    || selection.sourceIds.length + selection.themeIds.length < 1) return null;
  const candidateArticleIds = selection.candidateArticleIds as string[];
  const reviewArticleIds = selection.reviewArticleIds as string[];
  if (reviewArticleIds.some((id) => !candidateArticleIds.includes(id))) return null;
  return {
    version: 2,
    preparationKey: request.preparationKey,
    title: request.title.trim(),
    selection: {
      sourceIds: [...selection.sourceIds].sort(),
      themeIds: [...selection.themeIds].sort(),
      candidateArticleIds: [...candidateArticleIds].sort(),
      reviewArticleIds: [...reviewArticleIds].sort(),
    },
  } as MesaNewOutputGroupingRequestV2;
}

export function parseMesaNewOutputGrouping(value: unknown): MesaNewOutputGrouping | null {
  const grouping = objectValue(value);
  if (!grouping || grouping.version !== 2 || !uuid(grouping.dossierId)
    || !uuid(grouping.productionContextId)
    || !Number.isSafeInteger(grouping.revision) || Number(grouping.revision) < 1
    || !["planned", "materialized"].includes(String(grouping.state))
    || !plannedCount(grouping.targetCount)
    || !Array.isArray(grouping.sources) || grouping.sources.length < 1 || grouping.sources.length > 20
    || !uuidList(grouping.looseSourceIds)
    || !Array.isArray(grouping.themes) || grouping.themes.length > 20
    || !Array.isArray(grouping.groups) || grouping.groups.length > 30
    || !Array.isArray(grouping.existingOutputs) || grouping.existingOutputs.length > 30) return null;

  const sources: MesaNewOutputGroupingSource[] = [];
  for (const raw of grouping.sources) {
    const source = objectValue(raw);
    if (!source || !uuid(source.dossierSourceId) || !uuid(source.newsroomArticleId)
      || typeof source.title !== "string" || !source.title.trim()
      || typeof source.sourceLabel !== "string" || !source.sourceLabel.trim()
      || !(source.imageId === null || uuid(source.imageId))
      || !(source.imageUrl === null || typeof source.imageUrl === "string" && /^https?:\/\//.test(source.imageUrl))) return null;
    sources.push(source as MesaNewOutputGroupingSource);
  }
  if (new Set(sources.map((source) => source.newsroomArticleId)).size !== sources.length) return null;
  const sourceIds = new Set(sources.map((source) => source.newsroomArticleId));
  const looseSourceIds = grouping.looseSourceIds as string[];
  if (looseSourceIds.some((id) => !sourceIds.has(id))) return null;

  const themes: MesaNewOutputTheme[] = [];
  for (const raw of grouping.themes) {
    const theme = objectValue(raw);
    if (!theme || !uuid(theme.themeId) || typeof theme.title !== "string" || !theme.title.trim()
      || !Number.isSafeInteger(theme.position) || Number(theme.position) < 1
      || !plannedCount(theme.targetCount) || !uuidList(theme.seedSourceIds)
      || theme.seedSourceIds.length < 1 || theme.seedSourceIds.some((id) => !sourceIds.has(id))) return null;
    themes.push(theme as unknown as MesaNewOutputTheme);
  }
  if (new Set(themes.map((theme) => theme.themeId)).size !== themes.length) return null;
  const themeById = new Map(themes.map((theme) => [theme.themeId, theme]));

  const groups: MesaNewOutputGroup[] = [];
  for (const raw of grouping.groups) {
    const group = objectValue(raw);
    if (!group || !uuid(group.groupId) || group.productionContextId !== grouping.productionContextId
      || !["theme", "selection"].includes(String(group.seedKind))
      || !(group.seedThemeId === null || uuid(group.seedThemeId))
      || !uuidList(group.seedSourceIds) || group.seedSourceIds.length < 1
      || group.seedSourceIds.some((id) => !sourceIds.has(id))
      || !Number.isSafeInteger(group.position) || Number(group.position) < 1
      || !(group.outputId === null || uuid(group.outputId))
      || !(group.articlePlanId === null || uuid(group.articlePlanId))
      || group.outputId !== group.articlePlanId
      || !["planned", "materialized"].includes(String(group.state))) return null;
    if (group.seedKind === "selection") {
      if (group.seedThemeId !== null || group.seedSourceIds.some((id) => !looseSourceIds.includes(id))) return null;
    } else {
      const theme = group.seedThemeId ? themeById.get(group.seedThemeId) : null;
      if (!theme || JSON.stringify(group.seedSourceIds) !== JSON.stringify(theme.seedSourceIds)) return null;
    }
    groups.push(group as unknown as MesaNewOutputGroup);
  }
  if (new Set(groups.map((group) => group.groupId)).size !== groups.length) return null;
  const selectedSeeds = groups.filter((group) => group.seedKind === "selection").flatMap((group) => group.seedSourceIds);
  const zeroLooseOutputs = grouping.targetCount === 0 && selectedSeeds.length === 0;
  if (new Set(selectedSeeds).size !== selectedSeeds.length
    || !zeroLooseOutputs
      && JSON.stringify([...selectedSeeds].sort()) !== JSON.stringify([...looseSourceIds].sort())) return null;
  for (const theme of themes) {
    const count = groups.filter((group) => group.seedThemeId === theme.themeId).length;
    if ((theme.targetCount === null && count !== 0) || (theme.targetCount !== null && count !== theme.targetCount)) return null;
  }

  const existingOutputs: MesaNewOutputExistingSlot[] = [];
  for (const raw of grouping.existingOutputs) {
    const output = objectValue(raw);
    if (!output || output.kind !== "existing" || typeof output.slot !== "string"
      || !/^EXISTING_\d{2}$/.test(output.slot) || !uuid(output.outputId)
      || output.productionContextId !== grouping.productionContextId
      || !uuid(output.targetEditorialArticleId) || typeof output.targetSlug !== "string"
      || typeof output.targetTitle !== "string" || !output.targetTitle.trim()
      || !(output.targetMatchdayId === null || uuid(output.targetMatchdayId))) return null;
    existingOutputs.push(output as MesaNewOutputExistingSlot);
  }
  return {
    version: 2,
    dossierId: grouping.dossierId,
    productionContextId: grouping.productionContextId,
    targetCount: grouping.targetCount as number | null,
    revision: Number(grouping.revision),
    state: grouping.state as "planned" | "materialized",
    sources,
    looseSourceIds,
    themes: [...themes].sort((a, b) => a.position - b.position),
    groups: [...groups].sort((a, b) => a.position - b.position),
    existingOutputs,
  };
}

export function mesaLooseNewOutputGroups(grouping: MesaNewOutputGrouping) {
  return grouping.groups.filter((group) => group.seedKind === "selection");
}

export function mesaThemeNewOutputGroups(grouping: MesaNewOutputGrouping, themeId: string) {
  return grouping.groups.filter((group) => group.seedKind === "theme" && group.seedThemeId === themeId);
}

export function mesaNewOutputGroupingNewCount(grouping: MesaNewOutputGrouping): number {
  return grouping.groups.length;
}

export function mesaNewOutputGroupingReady(grouping: MesaNewOutputGrouping): boolean {
  const looseGroups = mesaLooseNewOutputGroups(grouping);
  return grouping.state === "planned"
    && grouping.targetCount !== null
    && looseGroups.length === grouping.targetCount
    && grouping.themes.every((theme) => theme.targetCount !== null)
    && grouping.groups.length + grouping.existingOutputs.length > 0;
}

export function mesaNewOutputGroupingGap(grouping: MesaNewOutputGrouping): number | null {
  return grouping.targetCount === null ? null : mesaLooseNewOutputGroups(grouping).length - grouping.targetCount;
}

export function setMesaNewOutputTarget(
  grouping: MesaNewOutputGrouping,
  targetCount: number,
  createGroupId: () => string,
): MesaNewOutputGrouping | null {
  if (grouping.state !== "planned" || !Number.isSafeInteger(targetCount)
    || targetCount < 0 || targetCount > Math.min(30, grouping.looseSourceIds.length)) return null;
  const themeGroups = grouping.groups.filter((group) => group.seedKind === "theme");
  const currentLooseGroups = mesaLooseNewOutputGroups(grouping);
  const looseGroups = targetCount === 0
    ? []
    : currentLooseGroups.length > 0
      ? currentLooseGroups
      : grouping.looseSourceIds.map((sourceId) => ({
          groupId: createGroupId(),
          productionContextId: grouping.productionContextId,
          seedKind: "selection" as const,
          seedThemeId: null,
          seedSourceIds: [sourceId],
          position: 0,
          outputId: null,
          articlePlanId: null,
          state: "planned" as const,
        }));
  return {
    ...grouping,
    targetCount,
    revision: grouping.revision + 1,
    groups: [...themeGroups, ...looseGroups].map((group, index) => ({ ...group, position: index + 1 })),
  };
}

export function mergeMesaNewOutputGroups(
  grouping: MesaNewOutputGrouping,
  groupIds: readonly string[],
): MesaNewOutputGrouping | null {
  if (grouping.state !== "planned" || groupIds.length < 2 || new Set(groupIds).size !== groupIds.length) return null;
  const selected = grouping.groups.filter((group) => groupIds.includes(group.groupId));
  if (selected.length !== groupIds.length || selected.some((group) => group.seedKind !== "selection")) return null;
  const keep = selected[0];
  const seedSourceIds = selected.flatMap((group) => group.seedSourceIds);
  return {
    ...grouping,
    revision: grouping.revision + 1,
    groups: grouping.groups
      .filter((group) => !groupIds.includes(group.groupId) || group.groupId === keep.groupId)
      .map((group) => group.groupId === keep.groupId ? { ...group, seedSourceIds } : group)
      .map((group, index) => ({ ...group, position: index + 1 })),
  };
}

export function splitMesaNewOutputGroup(
  grouping: MesaNewOutputGrouping,
  groupId: string,
  createGroupId: () => string,
): MesaNewOutputGrouping | null {
  if (grouping.state !== "planned") return null;
  const target = grouping.groups.find((group) => group.groupId === groupId);
  if (!target || target.seedKind !== "selection" || target.seedSourceIds.length < 2) return null;
  const replacements = target.seedSourceIds.map((sourceId, index) => ({
    ...target,
    groupId: index === 0 ? target.groupId : createGroupId(),
    seedSourceIds: [sourceId],
  }));
  return {
    ...grouping,
    revision: grouping.revision + 1,
    groups: grouping.groups.flatMap((group) => group.groupId === groupId ? replacements : [group])
      .map((group, index) => ({ ...group, position: index + 1 })),
  };
}

export function setMesaNewOutputThemeCount(
  grouping: MesaNewOutputGrouping,
  themeId: string,
  targetCount: number,
  createGroupId: () => string,
): MesaNewOutputGrouping | null {
  if (grouping.state !== "planned" || !Number.isSafeInteger(targetCount) || targetCount < 0 || targetCount > 30) return null;
  const theme = grouping.themes.find((candidate) => candidate.themeId === themeId);
  if (!theme) return null;
  const current = mesaThemeNewOutputGroups(grouping, themeId);
  const keep = current.slice(0, targetCount);
  const additions = Array.from({ length: Math.max(0, targetCount - keep.length) }, () => ({
    groupId: createGroupId(),
    productionContextId: grouping.productionContextId,
    seedKind: "theme" as const,
    seedThemeId: themeId,
    seedSourceIds: [...theme.seedSourceIds],
    position: 0,
    outputId: null,
    articlePlanId: null,
    state: "planned" as const,
  }));
  const retained = grouping.groups.filter((group) => group.seedThemeId !== themeId);
  return {
    ...grouping,
    revision: grouping.revision + 1,
    themes: grouping.themes.map((candidate) => candidate.themeId === themeId
      ? { ...candidate, targetCount }
      : candidate),
    groups: [...retained, ...keep, ...additions].map((group, index) => ({ ...group, position: index + 1 })),
  };
}
