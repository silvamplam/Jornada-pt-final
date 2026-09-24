import {
  parseArticlePlanClassificationDecision,
  resolveArticlePlanClassification,
  type ArticlePlanClassificationDecision,
  type ArticlePlanClassificationSource,
} from "@/lib/redacao-automatica/article-plan-classification";

type ClassificationCard = Readonly<{
  key: string;
  plan: Readonly<{
    classificationKey: ArticlePlanClassificationDecision["classificationKey"];
    classificationMode?: ArticlePlanClassificationDecision["classificationMode"];
  }> | null;
  assignedClassificationSourceIds: readonly string[];
}>;

export function productionClassificationNeedsSave(
  cards: readonly ClassificationCard[],
  sources: readonly ArticlePlanClassificationSource[],
  confirmed: Readonly<Record<string, ArticlePlanClassificationDecision>>,
): boolean {
  return cards.some((card) => {
    const persisted = confirmed[card.key] ?? card.plan;
    const current = resolveArticlePlanClassification(persisted, card.assignedClassificationSourceIds, sources);
    const stored = parseArticlePlanClassificationDecision(persisted?.classificationKey, persisted?.classificationMode);
    return current.classificationKey !== stored?.classificationKey
      || current.classificationMode !== stored?.classificationMode;
  });
}

export function confirmedProductionClassifications(
  requested: readonly Readonly<{ clientKey: string; classificationKey: unknown; classificationMode: unknown }>[],
  saved: readonly Readonly<{ clientKey: string; articlePlanId: string; materialized?: boolean }>[] | undefined,
): Record<string, ArticlePlanClassificationDecision> | null {
  if (!saved || saved.length !== requested.length) return null;
  const savedByKey = new Map(saved.map((output) => [output.clientKey, output]));
  const savedKeys = new Set(savedByKey.keys());
  if (savedKeys.size !== requested.length
    || new Set(requested.map((output) => output.clientKey)).size !== requested.length
    || saved.some((output) => !output.articlePlanId)) return null;
  const confirmed: Record<string, ArticlePlanClassificationDecision> = {};
  for (const output of requested) {
    if (!savedKeys.has(output.clientKey)) return null;
    if (savedByKey.get(output.clientKey)?.materialized) continue;
    const decision = parseArticlePlanClassificationDecision(output.classificationKey, output.classificationMode);
    if (!decision) return null;
    confirmed[output.clientKey] = decision;
  }
  return confirmed;
}

export function productionPackageDisabled(input: Readonly<{
  saving: boolean;
  dirty: boolean;
  classificationNeedsSave: boolean;
  allPlansPersisted: boolean;
  persistedOutputCount: number;
  outputCount: number;
}>): boolean {
  return input.saving || input.dirty || input.classificationNeedsSave
    || !input.allPlansPersisted || input.persistedOutputCount !== input.outputCount;
}