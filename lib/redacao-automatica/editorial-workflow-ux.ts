import type { PublishedAtPrecision } from "@/lib/redacao-automatica/types";

export const editorialWorkflowSteps = [
  { id: "sources", label: "Fontes" },
  { id: "planning", label: "Planeamento" },
  { id: "draft", label: "Primeira versão" },
  { id: "review", label: "Revisão" },
  { id: "publication", label: "Publicação" },
] as const;

export type EditorialWorkflowStepId = typeof editorialWorkflowSteps[number]["id"];

export type EditorialWorkflowPlanState = Readonly<{
  status: string;
  sortOrder: number;
  editorialArticleId: string | null;
  editorialArticleStatus: string | null;
  editorialArticleHasBody: boolean;
}>;

export function formatNewsroomPublishedAt(
  value: string,
  precision: PublishedAtPrecision | null,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "data inválida";
  }

  const publishedDate = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  }).format(date);

  if (precision === "date") {
    return publishedDate;
  }

  const publishedTime = new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(date);

  return `${publishedDate}, às ${publishedTime}`;
}

export function editorialWorkflowStepIndex(step: EditorialWorkflowStepId): number {
  return editorialWorkflowSteps.findIndex((item) => item.id === step);
}

export function dossierEditorialWorkflowStep(input: {
  includedSourceCount: number;
  plans: readonly EditorialWorkflowPlanState[];
}): EditorialWorkflowStepId {
  if (input.includedSourceCount < 1) {
    return "sources";
  }

  const activePlans = input.plans
    .filter((plan) => plan.status !== "cancelled")
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (activePlans.length === 0) {
    return "planning";
  }

  const pendingPlan = activePlans.find((plan) => plan.editorialArticleStatus !== "published");
  if (!pendingPlan) {
    return "publication";
  }

  if (!pendingPlan.editorialArticleId) {
    return "planning";
  }

  if (!pendingPlan.editorialArticleHasBody) {
    return "draft";
  }

  return "review";
}

export function articlePlanEditorialWorkflowStep(
  plan: EditorialWorkflowPlanState,
): EditorialWorkflowStepId {
  if (plan.editorialArticleStatus === "published") {
    return "publication";
  }

  if (!plan.editorialArticleId) {
    return "planning";
  }

  if (!plan.editorialArticleHasBody) {
    return "draft";
  }

  return "review";
}

export function articleEditorialWorkflowStep(input: {
  status: string | null;
  body: string | null;
}): EditorialWorkflowStepId {
  if (input.status === "published") {
    return "publication";
  }

  if (input.body?.trim()) {
    return "review";
  }

  return "draft";
}

export function editorialWorkflowStepState(
  currentStep: EditorialWorkflowStepId,
  step: EditorialWorkflowStepId,
): "complete" | "current" | "upcoming" {
  const currentIndex = editorialWorkflowStepIndex(currentStep);
  const stepIndex = editorialWorkflowStepIndex(step);

  if (stepIndex < currentIndex) {
    return "complete";
  }

  if (stepIndex === currentIndex) {
    return "current";
  }

  return "upcoming";
}
