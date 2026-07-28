import { NextResponse } from "next/server";

import {
  createEditorialDossier,
  updateEditorialDossier,
  type EditorialDossierSourceSelection,
} from "@/lib/redacao-automatica/editorial-dossier-service";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
  EditorialDossierOutputMode,
  EditorialDossierSourceRole,
} from "@/lib/redacao-automatica/editorial-dossier-repository";

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

export async function POST(request: Request) {
  const formData = await request.formData();
  const action = cleanText(formData.get("action"));

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

  if (action === "update") {
    const dossierId = cleanText(formData.get("dossier_id"));
    const mode = outputMode(cleanText(formData.get("output_mode")));
    const requestedOutputCount = numberValue(formData.get("output_count"), 2);
    const canonicalOutputCount = mode === "single"
      ? 1
      : Math.min(Math.max(Math.trunc(requestedOutputCount), 2), 5);
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
    const detailPath = `/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(dossierId)}`;

    if (!result.ok) {
      return redirectTo(detailPath, { dossier_error: result.error.code });
    }

    return redirectTo(detailPath, { dossier_state: "updated" });
  }

  return redirectTo("/admin/editorial/redacao-automatica", {
    dossier_error: "input_invalid",
  });
}
