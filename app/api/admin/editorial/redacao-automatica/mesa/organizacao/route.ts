import { NextResponse } from "next/server";
import { isArticleClassificationKey } from "@/lib/editorial-classifications";
import { isMesaUuid, mesaOrganizationCommand, readSourceComparison } from "@/lib/redacao-automatica/newsroom-mesa-organization";

import { isMesaMaterialRef } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known = [
    ["material-version-conflict", "Há versões incompatíveis da mesma fonte. A seleção foi preservada, sem dividir Dossiês."],
    ["material-stale", "O Dossiê mudou desde a seleção. Revê a versão; nenhuma produção preparada foi alterada."],
    ["material-already-linked", "Este Tema conserva outra versão do Dossiê. A associação existente não foi substituída."],
    ["request-conflict", "Este pedido já foi usado com outra seleção. A seleção atual foi preservada."],
    ["dossier-already-linked", "Este Dossiê já pertence a outro Tema. Não foi deslocado."],
    ["source-in-dossier", "Esta fonte pertence a um Dossiê deste Tema. A memória da produção foi preservada."],
    ["theme-unavailable", "O Tema não existe ou está arquivado. A seleção foi preservada."],
    ["snapshot-unavailable", "Uma das versões já não está disponível para comparação."],
    ["snapshot-mismatch", "A versão indicada não pertence a esta fonte."],
  ] as const;
  const found = known.find(([key]) => message.includes(key));
  return NextResponse.json({ ok: false, message: found?.[1]
    ?? "Não foi possível guardar a organização. Nenhuma seleção foi eliminada; confirma a migration da Mesa e tenta novamente." },
  { status: found ? 409 : 502 });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ids = [params.get("source"), params.get("before"), params.get("after")];
  if (!ids.every(isMesaUuid)) return NextResponse.json({ ok: false, message: "Comparação inválida." }, { status: 400 });
  try {
    const result = await readSourceComparison(ids[0]!, ids[1]!, ids[2]!);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ ok: false, message: "Pedido inválido." }, { status: 400 }); }
  const action = text(body.action);
  const themeId = text(body.themeId) || null;
  const badRequest = () => NextResponse.json({ ok: false, message: "Revê os dados da organização. A seleção foi preservada." }, { status: 400 });
  try {
    if (action === "organize_sources") {
      const requestId = text(body.requestId);
      const title = text(body.title);
      const classification = text(body.classificationKey);
      const ids = body.sourceIds;
      if (body.materials !== undefined) {
        const materials = body.materials;
        if (!isMesaUuid(requestId) || (themeId !== null && !isMesaUuid(themeId))
          || !Array.isArray(ids) || ids.length > 200 || !ids.every(isMesaUuid)
          || !Array.isArray(materials) || materials.length > 50 || !materials.every(isMesaMaterialRef)
          || ids.length + materials.length < 1 || new Set(ids).size !== ids.length
          || new Set(materials.map((ref) => ref.key)).size !== materials.length
          || (!themeId && (!title || title.length > 180 || !isArticleClassificationKey(classification)))) return badRequest();
        const rows = await mesaOrganizationCommand("newsroom_organize_theme_materials_v2", {
          p_request_id: requestId, p_theme_id: themeId, p_title: title,
          p_classification_key: classification || null, p_source_ids: ids, p_material_refs: materials,
        });
        const row = rows[0];
        if (!isMesaUuid(row?.theme_id) || !Number.isSafeInteger(row.added_count) || Number(row.added_count) < 0 || typeof row.reused !== "boolean") throw new Error("organization-result-invalid");
        return NextResponse.json({ ok: true, themeId: row.theme_id, addedCount: row.added_count, reused: row.reused });
      }
      if (!isMesaUuid(requestId) || (themeId !== null && !isMesaUuid(themeId))
        || !Array.isArray(ids) || ids.length < 1 || ids.length > 200
        || !ids.every(isMesaUuid) || new Set(ids).size !== ids.length
        || (!themeId && (!title || title.length > 180 || !isArticleClassificationKey(classification)))) return badRequest();
      const rows = await mesaOrganizationCommand("newsroom_organize_theme_sources_v1", {
        p_request_id: requestId, p_theme_id: themeId, p_title: title,
        p_classification_key: classification || null, p_source_ids: ids,
      });
      const row = rows[0];
      if (!isMesaUuid(row?.theme_id) || !Number.isSafeInteger(row.added_count) || Number(row.added_count) < 0 || typeof row.reused !== "boolean") throw new Error("organization-result-invalid");
      return NextResponse.json({ ok: true, themeId: row.theme_id, addedCount: row.added_count, reused: row.reused });
    }
    if (!isMesaUuid(themeId)) return badRequest();
    if (action === "attach_dossier") {
      if (!isMesaUuid(body.dossierId)) return badRequest();
      await mesaOrganizationCommand("newsroom_attach_dossier_to_theme_v1", { p_dossier_id: body.dossierId, p_theme_id: themeId });
    } else if (action === "remove_source") {
      if (!isMesaUuid(body.sourceId)) return badRequest();
      await mesaOrganizationCommand("newsroom_remove_theme_source_v1", { p_theme_id: themeId, p_source_id: body.sourceId });
    } else if (action === "acknowledge_source") {
      if (!isMesaUuid(body.sourceId) || !isMesaUuid(body.snapshotId)) return badRequest();
      await mesaOrganizationCommand("newsroom_acknowledge_theme_source_v1", {
        p_theme_id: themeId, p_source_id: body.sourceId, p_snapshot_id: body.snapshotId,
      });
    } else return badRequest();
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
