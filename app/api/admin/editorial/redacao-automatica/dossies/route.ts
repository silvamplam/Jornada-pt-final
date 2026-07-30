import { NextResponse } from "next/server";

import {
  addEditorialDossierSources,
  createEditorialDossier,
  manageEditorialDossierSources,
  updateEditorialDossier,
  type EditorialDossierSourceAddition,
  type EditorialDossierSourceEdit,
  type EditorialDossierSourceSelection,
} from "@/lib/redacao-automatica/editorial-dossier-service";
import {
  saveEditorialDossierArticlePlan,
  type EditorialDossierArticlePlanSourceSelection,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service";
import { createEditorialDossierArticlePlanDraft } from "@/lib/redacao-automatica/editorial-dossier-article-plan-draft-service";
import { generateEditorialDossierArticlePlanDraftBody } from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
  EditorialDossierOutputMode,
  EditorialDossierSourceRole,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import {
  getEditorialDossierById,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import type { EditorialDossierArticlePlanStatus } from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sourceRole(value: string): EditorialDossierSourceRole {
  return ["primary", "corroboration", "context", "complementary"].includes(value)
    ? value as EditorialDossierSourceRole
    : "complementary";
}

function outputMode(value: string): EditorialDossierOutputMode {
  return value === "multiple" ? "multiple" : "single";
}

function lengthMode(value: string): EditorialDossierLengthMode {
  return ["brief", "standard", "developed"].includes(value)
    ? value as EditorialDossierLengthMode
    : "standard";
}

function articleKind(value: string): EditorialDossierArticleKind {
  return ["news", "analysis", "preview", "summary"].includes(value)
    ? value as EditorialDossierArticleKind
    : "news";
}

function articlePlanStatus(value: string): EditorialDossierArticlePlanStatus {
  return ["planned", "ready", "cancelled"].includes(value)
    ? value as EditorialDossierArticlePlanStatus
    : "planned";
}

function redirectTo(path: string, params: Record<string, string>) {
  const url = new URL(path, "https://jornada.local");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `${url.pathname}${url.search}` },
  });
}

function createSelections(formData: FormData): readonly EditorialDossierSourceSelection[] {
  return formData.getAll("newsroom_article_id").flatMap((value): EditorialDossierSourceSelection[] => {
    const newsroomArticleId = cleanText(value);
    if (!newsroomArticleId) {
      return [];
    }

    return [{
      newsroomArticleId,
      priority: numberValue(formData.get(`source_priority_${newsroomArticleId}`), 999),
      sourceRole: sourceRole(cleanText(formData.get(`source_role_${newsroomArticleId}`))),
    }];
  });
}

function sourceEdits(formData: FormData): readonly EditorialDossierSourceEdit[] {
  return formData.getAll("dossier_source_id").flatMap((value): EditorialDossierSourceEdit[] => {
    const sourceId = cleanText(value);
    if (!sourceId) {
      return [];
    }

    return [{
      sourceId,
      priority: numberValue(formData.get(`source_priority_${sourceId}`), 999),
      sourceRole: sourceRole(cleanText(formData.get(`source_role_${sourceId}`))),
      editorialNote: cleanText(formData.get(`source_note_${sourceId}`)),
      included: formData.has(`source_included_${sourceId}`),
    }];
  });
}

function sourceAdditions(formData: FormData): readonly EditorialDossierSourceAddition[] {
  return formData.getAll("newsroom_article_id").flatMap((value): EditorialDossierSourceAddition[] => {
    const newsroomArticleId = cleanText(value);
    if (!newsroomArticleId) {
      return [];
    }

    return [{
      newsroomArticleId,
      sourceRole: sourceRole(cleanText(formData.get(`source_add_role_${newsroomArticleId}`))),
    }];
  });
}

function articlePlanSourceSelections(
  formData: FormData,
): readonly EditorialDossierArticlePlanSourceSelection[] {
  return formData.getAll("article_plan_source_id").flatMap((value): EditorialDossierArticlePlanSourceSelection[] => {
    const dossierSourceId = cleanText(value);
    if (!dossierSourceId) {
      return [];
    }

    return [{
      dossierSourceId,
      priority: numberValue(formData.get(`article_plan_source_priority_${dossierSourceId}`), 999),
    }];
  });
}


function compositionInstructions(formData: FormData): string {
  const combine = cleanText(formData.get("combine_instructions"));
  const highlights = cleanText(formData.get("highlight_instructions"));
  const avoid = cleanText(formData.get("avoid_instructions"));

  return [
    combine ? `Como combinar as fontes:\n${combine}` : "",
    highlights ? `Assuntos a destacar e tratamento pretendido:\n${highlights}` : "",
    avoid ? `Informação a evitar:\n${avoid}` : "",
  ].filter(Boolean).join("\n\n");
}

function compositionErrorRedirect(
  code: string,
  dossierId?: string,
) {
  return redirectTo("/admin/editorial/redacao-automatica", {
    composition_error: code,
    ...(dossierId ? { composition_dossier_id: dossierId } : {}),
  });
}

function dossierDetailPath(dossierId: string): string {
  return `/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(dossierId)}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const action = cleanText(formData.get("action"));


  if (action === "compose") {
    const workingTitle = cleanText(formData.get("working_title"));
    const combineInstructions = cleanText(formData.get("combine_instructions"));
    const highlightInstructions = cleanText(formData.get("highlight_instructions"));
    const instructions = compositionInstructions(formData);
    const selections = createSelections(formData);

    if (
      !workingTitle
      || !combineInstructions
      || !highlightInstructions
      || selections.length < 1
    ) {
      return compositionErrorRedirect("input_invalid");
    }

    const dossierResult = await createEditorialDossier({
      title: workingTitle,
      editorialInstructions: instructions,
      contextInstructions: cleanText(formData.get("context_instructions")),
      sources: selections,
    });

    if (!dossierResult.ok) {
      return compositionErrorRedirect(dossierResult.error.code);
    }

    const dossierId = dossierResult.value.dossier.id;
    const dossierReadResult = await getEditorialDossierById(dossierId);

    if (!dossierReadResult.ok || !dossierReadResult.value) {
      return compositionErrorRedirect("composition_state_unavailable", dossierId);
    }

    const planSources = dossierReadResult.value.sources
      .filter((source) => source.included)
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((source, index) => ({
        dossierSourceId: source.id,
        priority: index + 1,
      }));

    const planResult = await saveEditorialDossierArticlePlan({
      dossierId,
      articlePlanId: null,
      workingTitle,
      status: "ready",
      priority: 1,
      articleKind: articleKind(cleanText(formData.get("article_kind"))),
      lengthMode: lengthMode(cleanText(formData.get("length_mode"))),
      editorialInstructions: instructions,
      sources: planSources,
    });

    if (!planResult.ok) {
      return compositionErrorRedirect(planResult.error.code, dossierId);
    }

    const draftResult = await createEditorialDossierArticlePlanDraft(
      dossierId,
      planResult.value.articlePlanId,
    );

    if (!draftResult.ok) {
      return compositionErrorRedirect(draftResult.error.code, dossierId);
    }

    const generationResult = await generateEditorialDossierArticlePlanDraftBody(
      dossierId,
      planResult.value.articlePlanId,
    );

    if (!generationResult.ok) {
      return compositionErrorRedirect(generationResult.error.code, dossierId);
    }

    return redirectTo("/admin/editorial/artigos", {
      articleId: generationResult.value.editorialArticleId,
      dossier_plan_generation: generationResult.value.action,
    });
  }

  if (action === "create") {
    const result = await createEditorialDossier({
      title: cleanText(formData.get("title")),
      editorialInstructions: cleanText(formData.get("editorial_instructions")),
      contextInstructions: cleanText(formData.get("context_instructions")),
      sources: createSelections(formData),
    });

    if (!result.ok) {
      return redirectTo("/admin/editorial/redacao-automatica", {
        dossier_error: result.error.code,
      });
    }

    return redirectTo(
      `/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(result.value.dossier.id)}`,
      { dossier_state: "created" },
    );
  }

  if (action === "manage_sources") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const result = await manageEditorialDossierSources({
      dossierId,
      sources: sourceEdits(formData),
    });
    const detailPath = dossierDetailPath(dossierId);

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    return redirectTo(detailPath, { dossier_state: "sources_updated" });
  }

  if (action === "add_sources") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const result = await addEditorialDossierSources({
      dossierId,
      sources: sourceAdditions(formData),
    });
    const detailPath = dossierDetailPath(dossierId);

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    return redirectTo(detailPath, {
      dossier_state: "sources_added",
      added_count: String(result.value.addedCount),
    });
  }

  if (action === "create_article_plan_draft") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const articlePlanId = cleanText(formData.get("article_plan_id"));
    const result = await createEditorialDossierArticlePlanDraft(
      dossierId,
      articlePlanId,
    );
    const detailPath = dossierDetailPath(dossierId);

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    return redirectTo("/admin/editorial/artigos", {
      articleId: result.value.editorialArticleId,
      dossier_plan_draft: result.value.action,
    });
  }

  if (action === "generate_article_plan_draft_body") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const articlePlanId = cleanText(formData.get("article_plan_id"));
    const result = await generateEditorialDossierArticlePlanDraftBody(
      dossierId,
      articlePlanId,
    );
    const detailPath = dossierDetailPath(dossierId);

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    return redirectTo("/admin/editorial/artigos", {
      articleId: result.value.editorialArticleId,
      dossier_plan_generation: result.value.action,
    });
  }

  if (action === "save_article_plan") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const result = await saveEditorialDossierArticlePlan({
      dossierId,
      articlePlanId: cleanText(formData.get("article_plan_id")) || null,
      workingTitle: cleanText(formData.get("working_title")),
      status: articlePlanStatus(cleanText(formData.get("article_plan_status"))),
      priority: numberValue(formData.get("article_plan_priority"), 999),
      articleKind: articleKind(cleanText(formData.get("article_kind"))),
      lengthMode: lengthMode(cleanText(formData.get("length_mode"))),
      editorialInstructions: cleanText(formData.get("editorial_instructions")),
      sources: articlePlanSourceSelections(formData),
    });
    const detailPath = dossierDetailPath(dossierId);

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    const state = result.value.created
      ? "article_plan_created"
      : result.value.status === "cancelled"
        ? "article_plan_cancelled"
        : result.value.previousStatus === "cancelled"
          ? "article_plan_reactivated"
          : "article_plan_updated";

    return redirectTo(detailPath, {
      dossier_state: state,
      article_plan_id: result.value.articlePlanId,
    });
  }

  if (action === "update") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const mode = outputMode(cleanText(formData.get("output_mode")));
    const requestedOutputCount = numberValue(formData.get("output_count"), 2);
    const canonicalOutputCount = mode === "single"
      ? 1
      : Math.min(Math.max(Math.trunc(requestedOutputCount), 2), 4);
    const result = await updateEditorialDossier({
      dossierId,
      title: cleanText(formData.get("title")),
      editorialInstructions: cleanText(formData.get("editorial_instructions")),
      contextInstructions: cleanText(formData.get("context_instructions")),
      outputMode: mode,
      outputCount: canonicalOutputCount,
      lengthMode: lengthMode(cleanText(formData.get("length_mode"))),
      articleKind: articleKind(cleanText(formData.get("article_kind"))),
    });
    const detailPath = dossierDetailPath(dossierId);

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    return redirectTo(detailPath, { dossier_state: "updated" });
  }

  return redirectTo("/admin/editorial/redacao-automatica", {
    dossier_error: "input_invalid",
  });
}
