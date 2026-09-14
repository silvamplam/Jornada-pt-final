import { NextResponse } from "next/server";

import {
  prepareThemeContinuity,
  readThemeContinuity,
} from "@/lib/redacao-automatica/newsroom-theme-continuity";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function GET(request: Request) {
  const themeId = new URL(request.url).searchParams.get("themeId")?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(themeId)) {
    return NextResponse.json({ ok: false, code: "input_invalid", message: "O Tema não é válido." }, { status: 400 });
  }
  try {
    const continuity = await readThemeContinuity(themeId);
    if (!continuity) {
      return NextResponse.json({ ok: false, code: "not_found", message: "O Tema já não existe." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, continuity });
  } catch {
    return NextResponse.json({
      ok: false,
      code: "read_unavailable",
      message: "Não foi possível preparar a leitura de continuidade deste Tema.",
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = record(await request.json());
  } catch {
    // Handled by the shared input guard below.
  }
  const preparationKey = typeof payload?.preparationKey === "string"
    ? payload.preparationKey.trim().toLowerCase()
    : "";
  const themeId = typeof payload?.themeId === "string"
    ? payload.themeId.trim().toLowerCase()
    : "";
  const authorityFingerprint = typeof payload?.authorityFingerprint === "string"
    ? payload.authorityFingerprint.trim()
    : "";
  const newArticleCount = payload?.newArticleCount;
  if (
    !UUID_PATTERN.test(preparationKey)
    || !UUID_PATTERN.test(themeId)
    || !Number.isSafeInteger(newArticleCount)
    || Number(newArticleCount) < 0
    || Number(newArticleCount) > 30
    || !/^[0-9a-f]{32}$/.test(authorityFingerprint)
  ) {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "Revê o número de artigos novos antes de preparar a Produção.",
    }, { status: 400 });
  }

  try {
    const result = await prepareThemeContinuity({
      preparationKey,
      themeId,
      newArticleCount: Number(newArticleCount),
      expectedAuthorityFingerprint: authorityFingerprint,
    });
    return NextResponse.json({
      ok: true,
      dossierId: result.dossier_id,
      sourceCount: result.source_count,
      publishedArticleCount: result.published_article_count,
      newArticleCount: result.new_article_count,
      outputCount: result.output_count,
      preparationAction: result.preparation_action,
      workspaceUrl: `/admin/editorial/redacao-automatica/mesa/producao/${result.dossier_id}`,
    }, { status: result.preparation_action === "created" ? 201 : 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const conflict = /stale|conflict|unavailable|unusable|limit/.test(detail);
    return NextResponse.json({
      ok: false,
      code: conflict ? "preparation_conflict" : "prepare_failed",
      message: detail.includes("source-limit")
        ? "Este Tema ultrapassa o máximo de 20 Sources. Nenhuma Source foi truncada."
        : detail.includes("source-snapshot-unusable")
          ? "Uma Source atual do Tema não tem texto editorial utilizável no snapshot mais recente. Atualiza essa Source antes de preparar a Produção."
          : detail.includes("output-limit")
            ? "A soma dos artigos existentes e novos ultrapassa o máximo de 30 outputs."
            : conflict
              ? "O Tema mudou desde esta leitura. Revê a captura atual antes de preparar."
              : "Não foi possível preparar a continuidade do Tema.",
    }, { status: conflict ? 409 : 502 });
  }
}
