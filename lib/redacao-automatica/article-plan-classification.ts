import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";

export type ArticlePlanClassificationMode = "suggested" | "manual" | "cleared";

export type ArticlePlanClassificationDecision = Readonly<{
  classificationKey: ArticleClassificationKey | null;
  classificationMode: ArticlePlanClassificationMode | null;
}>;

/** Missing mode is the old contract: a stored key was an editor's choice. */
export function parseArticlePlanClassificationDecision(
  key: unknown,
  mode: unknown,
): ArticlePlanClassificationDecision | null {
  const classificationKey = key === undefined || key === null || key === "" ? null : key;
  if (classificationKey !== null && !isArticleClassificationKey(classificationKey)) return null;
  const classificationMode = mode === undefined || mode === null || mode === ""
    ? classificationKey === null ? null : "manual"
    : mode;
  if (classificationMode === null && classificationKey === null) {
    return { classificationKey, classificationMode };
  }
  if (classificationMode === "cleared" && classificationKey === null) {
    return { classificationKey, classificationMode };
  }
  if ((classificationMode === "manual" || classificationMode === "suggested") && classificationKey !== null) {
    return { classificationKey, classificationMode };
  }
  return null;
}

export type ArticlePlanClassificationSource = Readonly<{
  sourceId: string;
  classificationKey: ArticleClassificationKey | null;
  classificationSource: "automatic" | "manual" | null;
}>;

export function articleOutputClassificationDefault(
  usedSourceIds: readonly string[],
  sources: readonly ArticlePlanClassificationSource[],
): ArticleClassificationKey | null {
  if (usedSourceIds.length === 0) return null;

  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const usedSources: ArticlePlanClassificationSource[] = [];
  for (const sourceId of usedSourceIds) {
    const source = sourceById.get(sourceId);
    if (
      !source
      || source.classificationSource !== "manual"
      || !isArticleClassificationKey(source.classificationKey)
    ) return null;
    usedSources.push(source);
  }

  const [first] = usedSources;
  return usedSources.every(
    (source) => source.classificationKey === first.classificationKey,
  )
    ? first.classificationKey
    : null;
}

/** IDs are newsroom article IDs, never positions, visual seeds or context-wide sources. */
export function articlePlanAssignedClassificationSourceIds(input: Readonly<{
  plan: Readonly<{
    id: string;
  }> | null;
  groups?: readonly Readonly<{
    articlePlanId: string | null;
    outputId: string | null;
    seedSourceIds: readonly string[];
  }>[];
  outputs?: readonly Readonly<{ outputId: string; focusSourceIds?: readonly string[] }>[];
}>): readonly string[] {
  if (!input.plan) return [];
  const groups = input.groups?.filter((group) => (
    group.articlePlanId === input.plan!.id || group.outputId === input.plan!.id
  )) ?? [];
  if (groups.length > 0) {
    const [group] = groups;
    return groups.length === 1 && group.articlePlanId === input.plan.id && group.outputId === input.plan.id
      ? group.seedSourceIds
      : [];
  }
  const output = input.outputs?.find((candidate) => candidate.outputId === input.plan!.id);
  if (output) return output.focusSourceIds ?? [];
  // plan.sources is also filled with the technical context pool by the workspace
  // writer. Without an explicit group/focus it cannot prove article membership.
  return [];
}

/** Only human decisions are sticky. Untouched suggestions follow the assigned group. */
export function resolveArticlePlanClassification(
  persisted: Readonly<{
    classificationKey?: ArticleClassificationKey | null;
    classificationMode?: ArticlePlanClassificationMode | null;
  }> | null,
  assignedSourceIds: readonly string[],
  sources: readonly ArticlePlanClassificationSource[],
  editorDecision: ArticlePlanClassificationDecision | null = null,
): ArticlePlanClassificationDecision {
  const decision = editorDecision ?? parseArticlePlanClassificationDecision(
    persisted?.classificationKey, persisted?.classificationMode,
  );
  if (decision?.classificationMode === "manual" || decision?.classificationMode === "cleared") return decision;
  const classificationKey = articleOutputClassificationDefault(assignedSourceIds, sources);
  return { classificationKey, classificationMode: classificationKey ? "suggested" : null };
}

/** A planned suggestion is recalculated from validated FONTES_UTILIZADAS after production. */
export function articlePublicationClassificationDefault(
  planned: Readonly<{
    classificationKey?: ArticleClassificationKey | null;
    classificationMode?: ArticlePlanClassificationMode | null;
  }> | null,
  usedSourcesDefault: ArticleClassificationKey | null,
): ArticleClassificationKey | null {
  const decision = parseArticlePlanClassificationDecision(planned?.classificationKey, planned?.classificationMode);
  if (decision?.classificationMode === "cleared") return null;
  return decision?.classificationMode === "manual" ? decision.classificationKey : usedSourcesDefault;
}

export function articleOutputClassificationsComplete(
  requiredArticleKeys: readonly string[],
  choices: Readonly<Record<string, ArticleClassificationKey>>,
): boolean {
  return requiredArticleKeys.every((key) => isArticleClassificationKey(choices[key]));
}

/** Keep decisions attached to the frozen output ID, including during partial text edits. */
export function reconcileArticleOutputClassifications(input: Readonly<{
  outputIds: readonly string[];
  choices: Readonly<Record<string, ArticleClassificationKey>>;
  touched: ReadonlySet<string>;
  frozen?: Readonly<Record<string, ArticleClassificationKey>>;
  plannedKeys?: Readonly<Record<string, ArticleClassificationKey>>;
  plannedModes?: Readonly<Record<string, ArticlePlanClassificationMode>>;
  prepared: readonly Readonly<{
    outputId?: string;
    classificationDefault: ArticleClassificationKey | null;
    frozenClassificationKey: ArticleClassificationKey | null;
  }>[];
}>): Record<string, ArticleClassificationKey> {
  const preparedById = new Map(input.prepared.map((item) => [item.outputId, item]));
  const next: Record<string, ArticleClassificationKey> = {};
  for (const outputId of input.outputIds) {
    const prepared = preparedById.get(outputId);
    const choice = prepared?.frozenClassificationKey
      ?? input.frozen?.[outputId]
      ?? (input.touched.has(outputId)
        ? input.choices[outputId] ?? null
        : prepared
          ? prepared.classificationDefault
          : parseArticlePlanClassificationDecision(
            input.plannedKeys?.[outputId], input.plannedModes?.[outputId],
          )?.classificationKey ?? null);
    if (choice) next[outputId] = choice;
  }
  return next;
}
