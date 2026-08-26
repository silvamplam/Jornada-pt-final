import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import {
  editorialProfile,
  editorialProfileWithZoneLayouts,
} from "@/lib/editorial-profiles";
import { readMatchdayEditorialProfileDesk } from "@/lib/editorial-matchday-profile-desk";
import { validateMatchdayEditorialProfileManualOverrides } from "@/lib/editorial-matchday-profile-desk-operations";
import {
  reconcileMatchdayEditorialProfileWorkspace,
  validateMatchdayEditorialProfileOpening,
  validateMatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCKING_DIAGNOSTICS = new Set([
  "missing_classification",
  "unresolved_faixa",
  "ambiguous_faixa",
  "inactive_faixa",
  "duplicate_faixa_identity",
  "unresolved_opening",
  "invalid_applied_snapshot",
  "missing_article",
  "unknown_zone",
]);

export const dynamic = "force-dynamic";

type ApplyResultRow = Readonly<{
  revision: number;
  state_token: string;
  applied_override_count: number;
  applied_zone_item_count: number;
  applied_faixa_count: number;
  applied_opening_count: number;
  applied_selection_count: number;
}>;

type ApiError =
  Readonly<{
    ok: false;
    error: string;
    message: string;
  }>;

type EditorialSelectionBankRow =
  Readonly<{
    id: string;
    source_type: string | null;
    source_id: string | null;
    label: string | null;
    title: string;
    subtitle: string | null;
    image_url: string | null;
    link_url: string | null;
  }>;

type EditorialSelectionLiveRow =
  Readonly<{
    id: string;
    slot_type: string;
    source_type: string | null;
    source_id: string | null;
    label: string | null;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    link_url: string | null;
  }>;

type VideoModuleInput = Readonly<{
  active: boolean;
  highlightAction: "preserve" | "remove" | "replace";
  highlightBankItemId: string | null;
}>;

function apiError(error: string, message: string, status: number) {
  return NextResponse.json<ApiError>({ ok: false, error, message }, { status });
}

function databaseMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(rawMessage) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : rawMessage;
  } catch {
    return rawMessage;
  }
}

function validateVideoModuleInput(value: unknown): VideoModuleInput {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error("profile-workspace-v6-invalid-video-module");
  }

  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort().join(",");

  if (
    keys !== "active,highlightAction,highlightBankItemId"
    || typeof input.active !== "boolean"
    || (
      input.highlightAction !== "preserve"
      && input.highlightAction !== "remove"
      && input.highlightAction !== "replace"
    )
    || (
      input.highlightBankItemId !== null
      && (
        typeof input.highlightBankItemId !== "string"
        || !UUID_PATTERN.test(input.highlightBankItemId.trim())
      )
    )
    || (
      input.highlightAction === "replace"
      ? input.highlightBankItemId === null
      : input.highlightBankItemId !== null
    )
  ) {
    throw new Error("profile-workspace-v6-invalid-video-module");
  }

  return {
    active: input.active,
    highlightAction: input.highlightAction,
    highlightBankItemId:
      typeof input.highlightBankItemId === "string"
        ? input.highlightBankItemId.trim().toLowerCase()
        : null,
  };
}

function mutationErrorResponse(error: unknown) {
  const message = databaseMessage(error);
  if (message.includes("profile-workspace-v6-video-required")) {
    return apiError("thematic-video-required", "Associe pelo menos um resumo publicado antes de ativar o módulo Vídeo + Destaque.", 409);
  }
  if (message.includes("profile-workspace-v6-highlight-required")) {
    return apiError("thematic-highlight-required", "Defina e publique o Destaque da Jornada antes de ativar o módulo Vídeo + Destaque.", 409);
  }
  if (message.includes("profile-workspace-v6-highlight-source-not-found")) {
    return apiError("thematic-highlight-source-changed", "A fonte escolhida para o Destaque deixou de estar disponível. Recarregue a Mesa.", 409);
  }
  if (message.endsWith("matchday-not-found") || message.endsWith("assignment-not-found")) {
    return apiError("thematic-desk-context-not-found", "A Jornada ou a atribuição temática já não existe.", 404);
  }
  if (
    message.endsWith("assignment-mismatch")
    || message.endsWith("incompatible-competition")
    || message.endsWith("revision-conflict")
    || message.endsWith("state-token-conflict")
  ) {
    return apiError("thematic-desk-context-changed", "A Mesa ou a atribuição temática mudou. Recarregue a página.", 409);
  }
  if (
    message.includes("profile-workspace-headline-draft-content")
    || message.includes("profile-workspace-context-draft-content")
    || message.includes("profile-workspace-highlight-draft-content")
  ) {
    return apiError("thematic-desk-draft-content", "Existe conteúdo em edição na Abertura que seria substituído. Reveja-o antes de aplicar.", 409);
  }
  if (
    message.includes("profile-workspace-duplicate-highlight-slot")
    || message.includes("profile-workspace-reconcile-control-not-found")
  ) {
    return apiError("thematic-desk-context-changed", "O estado editorial da Jornada deixou de ser unívoco. Recarregue a Mesa.", 409);
  }
  if (
    message.includes("manual-overrides-")
    || message.includes("profile-reconcile-")
    || message.includes("profile-opening-")
    || message.includes("profile-page-controls-")
    || message.includes("profile-workspace-invalid-")
    || message.includes("profile-workspace-v2-invalid-")
    || message.includes("profile-workspace-v2-manual-")
    || message.includes("profile-workspace-v2-zone-")
    || message.includes("profile-workspace-v3-")
    || message.includes("profile-workspace-v4-")
    || message.includes("profile-workspace-v5-")
    || message.includes("profile-workspace-v6-")
    || message.includes("profile-workspace-v7-")
    || message.includes("profile-workspace-exclusive-")
  ) {
    return apiError("thematic-desk-invalid-reconcile", "A composição temática foi recusada integralmente.", 400);
  }
  console.error("[admin/editorial/thematic-desk] atomic reconcile failed");
  return apiError("thematic-desk-apply-failed", "Não foi possível aplicar a composição temática.", 500);
}

export async function GET(
  _request: Request,
  { params }: {
    params: Promise<{
      matchdayId: string;
    }>;
  },
) {
  const [
    { matchdayId },
    cookieStore,
  ] = await Promise.all([
    params,
    cookies(),
  ]);

  if (!UUID_PATTERN.test(matchdayId)) {
    return apiError(
      "thematic-desk-invalid-matchday",
      "A Jornada indicada não é válida.",
      400,
    );
  }

  const session =
    cookieStore.get(
      ADMIN_SESSION_COOKIE,
    )?.value;

  if (
    !session
    || !(await verifyAdminSession(session))
  ) {
    return apiError(
      "thematic-desk-authentication-required",
      "É necessária uma sessão administrativa válida.",
      401,
    );
  }

  if (!getSupabaseServiceConfig()) {
    return apiError(
      "thematic-desk-service-unavailable",
      "A leitura administrativa não está configurada.",
      503,
    );
  }

  const [
    candidates,
    liveItems,
  ] = await Promise.all([
    fetchSupabaseAdminTable<EditorialSelectionBankRow>(
      `matchday_editorial_bank_items?select=id,source_type,source_id,label,title,subtitle,image_url,link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.active&source_type=in.(editorial_article,editorial_content)&order=updated_at.desc`,
    ),
    fetchSupabaseAdminTable<EditorialSelectionLiveRow>(
      `matchday_live_layout_items?select=id,slot_type,source_type,source_id,label,title,subtitle,image_url,link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&slot_type=in.(live_four_news:1,live_four_news:2,live_four_news:3,live_four_news:4)`,
    ),
  ]);

  const bankByIdentity =
    new Map(
      candidates.flatMap(
        (item) => {
          const sourceType =
            item.source_type?.trim()
              .toLowerCase();

          const sourceId =
            item.source_id?.trim();

          return (
            sourceType
            && sourceId
          )
            ? [[
                `${sourceType}:${sourceId}`,
                item,
              ] as const]
            : [];
        },
      ),
    );

  const items =
    liveItems
      .flatMap((item) => {
        const match =
          /^live_four_news:([1-4])$/
            .exec(item.slot_type);

        if (!match) {
          return [];
        }

        const sourceType =
          item.source_type?.trim()
            .toLowerCase()
          ?? null;

        const sourceId =
          item.source_id?.trim()
          ?? null;

        const bank =
          sourceType && sourceId
            ? bankByIdentity.get(
                `${sourceType}:${sourceId}`,
              )
              ?? null
            : null;

        return [{
          position:
            Number(match[1]),
          liveItemId:
            item.id,
          bankItemId:
            bank?.id ?? null,
          sourceType,
          sourceId,
          label:
            item.label,
          title:
            item.title,
          subtitle:
            item.subtitle,
          imageUrl:
            item.image_url,
          linkUrl:
            item.link_url,
        }];
      })
      .sort(
        (left, right) =>
          left.position
          - right.position,
      );

  return NextResponse.json({
    ok: true,
    candidates:
      candidates.map((item) => ({
        bankItemId:
          item.id,
        sourceType:
          item.source_type,
        sourceId:
          item.source_id,
        label:
          item.label,
        title:
          item.title,
        subtitle:
          item.subtitle,
        imageUrl:
          item.image_url,
        linkUrl:
          item.link_url,
      })),
    items,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchdayId: string }> },
) {
  const [{ matchdayId }, cookieStore] = await Promise.all([params, cookies()]);
  if (!UUID_PATTERN.test(matchdayId)) {
    return apiError("thematic-desk-invalid-matchday", "A Jornada indicada não é válida.", 400);
  }

  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!session || !(await verifyAdminSession(session))) {
    return apiError("thematic-desk-authentication-required", "É necessária uma sessão administrativa válida.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("thematic-desk-invalid-json", "O pedido não contém JSON válido.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return apiError("thematic-desk-invalid-payload", "O pedido tem uma estrutura inválida.", 400);
  }
  const input =
    body as Record<string, unknown>;

  if (
    typeof input.profileKey !== "string"
    || !Array.isArray(input.overrides)
    || typeof input.opening !== "object"
    || input.opening === null
    || typeof input.pageControls !== "object"
    || input.pageControls === null
    || !Number.isInteger(input.expectedRevision)
    || (input.expectedRevision as number) < 0
    || typeof input.expectedStateToken !== "string"
    || !input.expectedStateToken.trim()
    || !Array.isArray(input.selectionBankItemIds)
    || input.selectionBankItemIds.length !== 4
    || input.selectionBankItemIds.some(
      (value) =>
        value !== null
        && (
          typeof value !== "string"
          || !UUID_PATTERN.test(value.trim())
        ),
    )
    || typeof input.videoModule !== "object"
    || input.videoModule === null
  ) {
    return apiError("thematic-desk-invalid-payload", "Perfil, revisão, token e overrides completos são obrigatórios.", 400);
  }

  const profile = editorialProfile(input.profileKey);
  if (!profile) {
    return apiError("thematic-desk-unsupported-profile", "O perfil temático não é suportado.", 400);
  }

  let overrides;
  let opening;
  let pageControls;
  let videoModule: VideoModuleInput;

  try {
    opening =
      validateMatchdayEditorialProfileOpening(
        input.opening,
      );

    pageControls =
      validateMatchdayEditorialProfilePageControls(
        input.pageControls,
      );

    videoModule =
      validateVideoModuleInput(
        input.videoModule,
      );

    const effectiveProfile =
      editorialProfileWithZoneLayouts(
        profile,
        pageControls.thematicZoneLayouts,
      );

    overrides =
      validateMatchdayEditorialProfileManualOverrides(
        effectiveProfile,
        input.overrides,
      );

    if (
      overrides.some(
        (override) =>
          override.placementTarget === "zone"
          && override.sortOrder === null,
      )
    ) {
      return apiError(
        "thematic-desk-zone-position-required",
        "Uma deslocação manual para uma zona exige uma posição fixa. Retire a decisão manual para voltar ao critério automático de atualidade.",
        400,
      );
    }
  } catch (error) {
    return mutationErrorResponse(error);
  }

  const effectiveProfile =
    editorialProfileWithZoneLayouts(
      profile,
      pageControls.thematicZoneLayouts,
    );

  if (!getSupabaseServiceConfig()) {
    return apiError("thematic-desk-service-unavailable", "A escrita administrativa não está configurada.", 503);
  }

  try {
    const desk = await readMatchdayEditorialProfileDesk(matchdayId);
    if (!desk || desk.kind !== "thematic" || desk.profileKey !== input.profileKey) {
      return apiError("thematic-desk-context-changed", "A atribuição temática mudou. Recarregue a Mesa.", 409);
    }
    if (desk.reconcileRevision !== input.expectedRevision || desk.reconcileStateToken !== input.expectedStateToken) {
      return apiError("thematic-desk-state-conflict", "A Mesa ou a Faixa mudou. Recarregue antes de aplicar.", 409);
    }
    if (desk.diagnostics.some((diagnostic) => BLOCKING_DIAGNOSTICS.has(diagnostic.code))) {
      return apiError("thematic-desk-blocked-diagnostics", "Existem diagnósticos bloqueantes na classificação, snapshot ou Faixa.", 409);
    }

    const reconcile = reconcileMatchdayEditorialProfileWorkspace(
      effectiveProfile,
      desk.automaticDistribution.activeItems,
      overrides,
      opening,
      desk.appliedZoneItems,
      desk.hasAppliedSnapshot,
      desk.currentFaixa,
    );
    const rows = await writeSupabaseAdminReturning<ApplyResultRow>(
      "rpc/apply_matchday_editorial_profile_workspace_v7",
      {
        method: "POST",
        body: JSON.stringify({
          p_matchday_id: matchdayId,
          p_profile_key: input.profileKey,
          p_expected_revision: input.expectedRevision,
          p_expected_state_token: input.expectedStateToken,
          p_overrides: overrides.map((override) => ({
            source_type: override.sourceType,
            source_id: override.sourceId,
            placement_target: override.placementTarget,
            zone_key: override.zoneKey,
            sort_order: override.sortOrder,
          })),
          p_zone_items: reconcile.zonesAfter.flatMap((zone) => zone.items.map((item) => ({
            source_type: item.sourceType,
            source_id: item.sourceId,
            zone_key: zone.key,
            sort_order: item.sortOrder,
          }))),
          p_faixa_source_ids: reconcile.faixaAfter.map((item) => item.sourceId),
          p_opening: opening,
          p_page_controls: {
            headline_title_color:
              pageControls.headlineTitleColor,
            latest_zone_placement:
              pageControls.latestZonePlacement,
            latest_zone_title:
              pageControls.latestZoneTitle,
            thematic_zone_order: pageControls.thematicZoneOrder,
            thematic_zone_layouts:
              pageControls.thematicZoneLayouts,
            thematic_block_order:
              pageControls.thematicBlockOrder,
            thematic_zone_titles:
              pageControls.thematicZoneTitles,
          },
          p_selection_bank_item_ids:
            input.selectionBankItemIds,
          p_video_module: {
            active: videoModule.active,
            highlight_action:
              videoModule.highlightAction,
            highlight_bank_item_id:
              videoModule.highlightBankItemId,
          },
        }),
      },
    );
    const row = rows[0];
    if (
      rows.length !== 1
      || !row
      || !Number.isInteger(row.revision)
      || typeof row.state_token !== "string"
      || !Number.isInteger(row.applied_override_count)
      || !Number.isInteger(row.applied_zone_item_count)
      || !Number.isInteger(row.applied_faixa_count)
      || !Number.isInteger(row.applied_opening_count)
      || !Number.isInteger(row.applied_selection_count)
    ) {
      throw new Error("matchday-editorial-profile-reconcile-invalid-result");
    }


    return NextResponse.json({
      ok: true,
      revision: row.revision,
      stateToken: row.state_token,
      appliedOverrideCount: row.applied_override_count,
      appliedZoneItemCount: row.applied_zone_item_count,
      appliedFaixaCount: row.applied_faixa_count,
      appliedOpeningCount: row.applied_opening_count,
      appliedSelectionCount:
        row.applied_selection_count,
    });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
