import { NextResponse } from "next/server";

import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import type { EditorialDossierArticlePlanStatus } from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import {
  addEditorialDossierUploadImage,
  type EditorialDossierArticlePlanImageChoice,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service";
import {
  saveEditorialDossierWorkspaceArticlePlan,
  type SaveEditorialDossierWorkspaceArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-editor-service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value.trim() : undefined;
}

function uuid(value: unknown): string | null {
  const candidate = textValue(value).toLowerCase();
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

function uuidArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(uuid);
  return ids.every((id): id is string => Boolean(id)) ? ids : null;
}

function planStatus(value: unknown): EditorialDossierArticlePlanStatus | null {
  const candidate = textValue(value);
  return ["planned", "ready", "cancelled"].includes(candidate)
    ? candidate as EditorialDossierArticlePlanStatus
    : null;
}

function articleKind(value: unknown): EditorialDossierArticleKind | null {
  const candidate = textValue(value);
  return ["news", "analysis", "preview", "summary"].includes(candidate)
    ? candidate as EditorialDossierArticleKind
    : null;
}

function lengthMode(value: unknown): EditorialDossierLengthMode | null {
  const candidate = textValue(value);
  return ["brief", "standard", "developed"].includes(candidate)
    ? candidate as EditorialDossierLengthMode
    : null;
}

function imageChoice(value: unknown): EditorialDossierArticlePlanImageChoice | null {
  const candidate = objectValue(value);
  const mode = textValue(candidate?.mode);
  if (mode === "unselected") return { mode };
  if (mode === "preserve_published") return { mode };
  if (mode === "dossier_image") {
    const dossierImageId = uuid(candidate?.dossierImageId);
    return dossierImageId ? { mode, dossierImageId } : null;
  }
  return null;
}

function savePlanInput(value: unknown): SaveEditorialDossierWorkspaceArticlePlanInput | null {
  const payload = objectValue(value);
  if (!payload) return null;
  const dossierId = uuid(payload.dossierId);
  const rawPlanId = nullableText(payload.articlePlanId);
  const articlePlanId = rawPlanId === null ? null : uuid(rawPlanId);
  const status = planStatus(payload.status);
  const kind = articleKind(payload.articleKind);
  const length = lengthMode(payload.lengthMode);
  const destination = textValue(payload.destination);
  const rawTarget = nullableText(payload.updateTargetEditorialArticleId);
  const target = rawTarget === null ? null : uuid(rawTarget);
  const contexts = uuidArray(payload.dossierPublishedContextIds);
  const selectedImage = imageChoice(payload.imageChoice);
  const priority = typeof payload.priority === "number" ? payload.priority : NaN;

  if (
    !dossierId
    || rawPlanId === undefined
    || (rawPlanId !== null && !articlePlanId)
    || !status
    || !kind
    || !length
    || !contexts
    || !selectedImage
    || !Number.isInteger(priority)
    || (destination !== "new" && destination !== "update")
    || (destination === "new" && rawTarget !== null)
    || (destination === "update" && !target)
    || (destination === "new" && selectedImage.mode === "preserve_published")
  ) return null;

  if (!Array.isArray(payload.sources)) return null;
  const sources = payload.sources.map((candidate) => {
    const source = objectValue(candidate);
    return {
      dossierSourceId: uuid(source?.dossierSourceId),
      priority: typeof source?.priority === "number" ? source.priority : NaN,
    };
  });
  if (sources.some((source) => !source.dossierSourceId || !Number.isInteger(source.priority))) {
    return null;
  }

  return {
    plan: {
      dossierId,
      articlePlanId,
      workingTitle: textValue(payload.workingTitle),
      status,
      priority,
      articleKind: kind,
      lengthMode: length,
      editorialInstructions: textValue(payload.editorialInstructions),
      sources: sources.map((source) => ({
        dossierSourceId: source.dossierSourceId!,
        priority: source.priority,
      })),
    },
    production: {
      destination,
      updateTargetEditorialArticleId: target,
      dossierPublishedContextIds: contexts,
      imageChoice: selectedImage,
    },
  };
}

function commandErrorStatus(code: string, partialPersistence = false): number {
  if (partialPersistence) return 409;
  if (code === "input_invalid") return 400;
  if (code === "service_unavailable") return 503;
  if (code.includes("not_found")) return 404;
  if (code.includes("limit") || code.includes("already_converted")) return 409;
  return 502;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "O comando do workspace não é válido.",
    }, { status: 400 });
  }

  const payload = objectValue(body);
  const action = textValue(payload?.action);

  if (action === "save_article_plan") {
    const input = savePlanInput(payload);
    if (!input) {
      return NextResponse.json({
        ok: false,
        code: "input_invalid",
        message: "Revê os dados do Article Plan antes de guardar.",
        partialPersistence: false,
      }, { status: 400 });
    }

    const result = await saveEditorialDossierWorkspaceArticlePlan(input);
    if (!result.ok) {
      const partialMessage = result.error.partialPersistence
        ? `${result.error.message} O planeamento base foi guardado; recarrega para ver exatamente o estado persistido.`
        : result.error.message;
      return NextResponse.json({
        ok: false,
        code: result.error.code,
        stage: result.error.stage,
        message: partialMessage,
        partialPersistence: result.error.partialPersistence,
        articlePlanId: result.error.articlePlanId,
      }, {
        status: commandErrorStatus(
          result.error.code,
          result.error.partialPersistence,
        ),
      });
    }

    return NextResponse.json({
      ok: true,
      articlePlanId: result.value.articlePlanId,
      created: result.value.created,
      planStatus: result.value.planStatus,
      productionState: result.value.productionState,
    }, { status: result.value.created ? 201 : 200 });
  }

  if (action === "register_upload_image") {
    const result = await addEditorialDossierUploadImage({
      dossierId: textValue(payload?.dossierId),
      frozenUrl: textValue(payload?.publicUrl),
      storageBucket: textValue(payload?.bucket),
      storagePath: textValue(payload?.path),
      fileName: textValue(payload?.fileName),
    });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        code: result.error.code,
        message: result.error.message,
      }, { status: commandErrorStatus(result.error.code) });
    }

    return NextResponse.json({
      ok: true,
      dossierImageId: result.value.dossierImageId,
      imageAction: result.value.imageAction,
      frozenUrl: result.value.frozenUrl,
    }, { status: result.value.imageAction === "created" ? 201 : 200 });
  }

  return NextResponse.json({
    ok: false,
    code: "input_invalid",
    message: "O comando do workspace não é válido.",
  }, { status: 400 });
}
