import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import {
  editorialProfile,
  editorialProfileWithZoneLayouts,
} from "@/lib/editorial-profiles";
import { readMatchdayEditorialProfileDesk } from "@/lib/editorial-matchday-profile-desk";
import {
  returnMatchdayEditorialItemsToAutomatic,
  thematicEditorialIdentity,
  validateMatchdayEditorialProfileManualOverrides,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  validateMatchdayEditorialProfileApplyState,
} from "@/lib/editorial-matchday-profile-apply-guard";
import {
  reconcileMatchdayEditorialProfileWorkspace,
  validateMatchdayEditorialProfileOpening,
  validateMatchdayEditorialProfilePageControls,
  withoutMatchdayEditorialProfileOpeningOverrides,
} from "@/lib/editorial-matchday-profile-workspace";
import { matchdayEditorialProfileSelectionIdentities } from "@/lib/editorial-matchday-profile-selection";
import type { MatchdayEditorialVacantZoneSlot } from "@/lib/editorial-matchday-movement-preview";
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

type ManagedMatchdayEditorialDeskRow = Readonly<{
  matchday_id: string;
}>;

type ApiError =
  Readonly<{
    ok: false;
    error: string;
    message: string;
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

async function isManagedMatchdayEditorialDesk(matchdayId: string) {
  const rows = await fetchSupabaseAdminTable<ManagedMatchdayEditorialDeskRow>(
    `matchday_editorial_desk_control?select=matchday_id&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&is_managed=eq.true&limit=1`,
  );

  return rows.length === 1;
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
    || message.includes("profile-workspace-v8-")
    || message.includes("profile-workspace-v9-")
    || message.includes("profile-workspace-v11-")
    || message.includes("profile-workspace-v12-")
    || message.includes("matchday-editorial-profile-vacant-")
    || message.includes("matchday-editorial-profile-displaced-")
    || message.includes("profile-workspace-exclusive-")
    || message.includes("profile-selection-")
  ) {
    return apiError("thematic-desk-invalid-reconcile", "A composição temática foi recusada integralmente.", 400);
  }
  console.error("[admin/editorial/thematic-desk] atomic reconcile failed", error);
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

  if (!(await isManagedMatchdayEditorialDesk(matchdayId))) {
    return apiError(
      "thematic-desk-not-live",
      "Esta Jornada não é a Mesa Viva atual.",
      409,
    );
  }

  const desk = await readMatchdayEditorialProfileDesk(matchdayId);
  if (!desk || desk.kind !== "thematic") {
    return apiError(
      "thematic-desk-context-not-found",
      "A Mesa temática já não está disponível.",
      404,
    );
  }

  return NextResponse.json({
    ok: true,
    candidates: desk.selectionCandidates,
    items: desk.editorialSelection,
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
    || !Array.isArray(input.workedSourceIds)
    || input.workedSourceIds.some(
      (value) => typeof value !== "string" || !UUID_PATTERN.test(value.trim()),
    )
    || !Array.isArray(input.displacedBankItemIds)
    || input.displacedBankItemIds.some(
      (value) => typeof value !== "string" || !UUID_PATTERN.test(value.trim()),
    )
    || !Array.isArray(input.faixaArrivalBankItemIds)
    || input.faixaArrivalBankItemIds.some(
      (value) => typeof value !== "string" || !UUID_PATTERN.test(value.trim()),
    )
    || !Array.isArray(input.displacedArrivalBankItemIds)
    || input.displacedArrivalBankItemIds.some(
      (value) => typeof value !== "string" || !UUID_PATTERN.test(value.trim()),
    )
    || !Array.isArray(input.vacantZoneSlots)
    || !Array.isArray(input.vacantFaixaSlots)
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

  } catch (error) {
    return mutationErrorResponse(error);
  }

  const effectiveProfile =
    editorialProfileWithZoneLayouts(
      profile,
      pageControls.thematicZoneLayouts,
    );
  const displacedBankItemIds = Array.from(new Set(
    (input.displacedBankItemIds as string[]).map(
      (value) => value.trim().toLowerCase(),
    ),
  ));
  if (displacedBankItemIds.length !== input.displacedBankItemIds.length) {
    return apiError(
      "thematic-desk-invalid-displacement",
      "A lista de notícias desalojadas contém identidades repetidas.",
      400,
    );
  }
  const faixaArrivalBankItemIds = Array.from(new Set(
    (input.faixaArrivalBankItemIds as string[]).map(
      (value) => value.trim().toLowerCase(),
    ),
  ));
  const displacedArrivalBankItemIds = Array.from(new Set(
    (input.displacedArrivalBankItemIds as string[]).map(
      (value) => value.trim().toLowerCase(),
    ),
  ));
  if (
    faixaArrivalBankItemIds.length
      !== input.faixaArrivalBankItemIds.length
    || displacedArrivalBankItemIds.length
      !== input.displacedArrivalBankItemIds.length
  ) {
    return apiError(
      "thematic-desk-invalid-movement-events",
      "Os eventos editoriais de movimento contêm identidades repetidas.",
      400,
    );
  }
  if (displacedArrivalBankItemIds.some(
    (bankItemId) => !displacedBankItemIds.includes(bankItemId),
  )) {
    return apiError(
      "thematic-desk-invalid-movement-events",
      "Uma chegada a Desalojadas não pertence ao estado desalojado final.",
      400,
    );
  }
  let vacantZoneSlots: readonly MatchdayEditorialVacantZoneSlot[];
  let vacantFaixaSlots: readonly number[];
  try {
    const seen = new Set<string>();
    vacantZoneSlots = (input.vacantZoneSlots as unknown[]).map((value) => {
      if (
        typeof value !== "object"
        || value === null
        || Array.isArray(value)
      ) {
        throw new Error("matchday-editorial-profile-vacant-zone-slot-invalid");
      }
      const slot = value as Record<string, unknown>;
      if (Object.keys(slot).sort().join(",") !== "slotPosition,zoneKey") {
        throw new Error("matchday-editorial-profile-vacant-zone-slot-invalid");
      }
      const zone = effectiveProfile.zones.find(
        (candidate) => candidate.key === slot.zoneKey,
      );
      const slotPosition = slot.slotPosition;
      const key = `${String(slot.zoneKey)}:${String(slotPosition)}`;
      if (
        !zone
        || !Number.isInteger(slotPosition)
        || (slotPosition as number) <= 0
        || (slotPosition as number) > zone.capacity
        || seen.has(key)
      ) {
        throw new Error("matchday-editorial-profile-vacant-zone-slot-invalid");
      }
      seen.add(key);
      return {
        zoneKey: zone.key,
        slotPosition: slotPosition as number,
      };
    });
    vacantFaixaSlots = (input.vacantFaixaSlots as unknown[]).map((value) => {
      if (!Number.isInteger(value) || (value as number) <= 0) {
        throw new Error("matchday-editorial-profile-vacant-faixa-slot-invalid");
      }
      return value as number;
    });
    if (new Set(vacantFaixaSlots).size !== vacantFaixaSlots.length) {
      throw new Error("matchday-editorial-profile-vacant-faixa-slot-invalid");
    }
  } catch (error) {
    return mutationErrorResponse(error);
  }

  if (!getSupabaseServiceConfig()) {
    return apiError("thematic-desk-service-unavailable", "A escrita administrativa não está configurada.", 503);
  }

  if (!(await isManagedMatchdayEditorialDesk(matchdayId))) {
    return apiError(
      "thematic-desk-not-live",
      "Esta Jornada não é a Mesa Viva atual.",
      409,
    );
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

    const selectionBankItemIds = (input.selectionBankItemIds as (string | null)[])
      .flatMap((value) => value ? [value.trim().toLowerCase()] : []);
    const selectionBankItemIdSet = new Set(selectionBankItemIds);
    const selectionRows = desk.selectionCandidates.filter((row) => (
      selectionBankItemIdSet.has(row.bankItemId.trim().toLowerCase())
    ));

    if (
      selectionRows.length !== selectionBankItemIdSet.size
      || selectionRows.some((row) => !selectionBankItemIdSet.has(row.bankItemId.trim().toLowerCase()))
    ) {
      throw new Error("matchday-editorial-profile-selection-source-not-active");
    }

    const selectionIdentities = matchdayEditorialProfileSelectionIdentities(
      input.selectionBankItemIds as (string | null)[],
      selectionRows,
    );
    if (selectionIdentities.length !== selectionRows.length) {
      throw new Error("matchday-editorial-profile-selection-duplicate-source");
    }
    const replacementVideoRows = videoModule.highlightAction === "replace"
      && videoModule.highlightBankItemId
      ? desk.selectionCandidates.filter((row) => (
          row.bankItemId.trim().toLowerCase() === videoModule.highlightBankItemId
        ))
      : [];
    let independentPlacementIdentity: string | null = null;
    if (videoModule.highlightAction === "preserve") {
      const placement = desk.videoModule.highlight.placement;
      if (placement?.sourceType === "editorial_article") {
        independentPlacementIdentity = thematicEditorialIdentity(
          placement.sourceType,
          placement.sourceId,
        );
      }
    } else if (videoModule.highlightAction === "replace") {
      const replacement = replacementVideoRows[0];
      const sourceType = replacement?.sourceType?.trim().toLowerCase();
      const sourceId = replacement?.sourceId?.trim().toLowerCase();
      if (sourceType === "editorial_article" && sourceId) {
        independentPlacementIdentity = thematicEditorialIdentity(
          sourceType,
          sourceId,
        );
      }
    }
    const independentPlacementIdentities = independentPlacementIdentity
      ? [independentPlacementIdentity]
      : [];
    const displacedBankItemIdSet = new Set(displacedBankItemIds);
    const displacedRows = desk.selectionCandidates.filter((row) => (
      displacedBankItemIdSet.has(row.bankItemId.trim().toLowerCase())
    ));
    if (displacedRows.length !== displacedBankItemIds.length) {
      throw new Error(
        "matchday-editorial-profile-displaced-source-not-active",
      );
    }
    const displacedIdentities = displacedRows.map((row) => {
      const sourceType = row.sourceType?.trim().toLowerCase();
      const sourceId = row.sourceId?.trim().toLowerCase();
      if (sourceType !== "editorial_article" || !sourceId) {
        throw new Error(
          "matchday-editorial-profile-displaced-source-not-active",
        );
      }
      return thematicEditorialIdentity(sourceType, sourceId);
    });

    const circuitOverrides = withoutMatchdayEditorialProfileOpeningOverrides(
      effectiveProfile,
      returnMatchdayEditorialItemsToAutomatic(
        effectiveProfile,
        overrides,
        selectionIdentities,
      ),
      opening,
    );
    const workedIdentities = (input.workedSourceIds as string[]).map(
      (sourceId) => thematicEditorialIdentity("editorial_article", sourceId),
    );

    const reconcile = reconcileMatchdayEditorialProfileWorkspace(
      effectiveProfile,
      desk.automaticDistribution.activeItems,
      circuitOverrides,
      opening,
      desk.appliedZoneItems,
      desk.hasAppliedSnapshot,
      desk.currentFaixa,
      {
        selectionIdentities,
        workedIdentities,
        independentPlacementIdentities,
        displacedIdentities,
        vacantZoneSlots,
        vacantFaixaSlots,
        allowAutomaticPlacement: false,
      },
    );
    const compatibilityReconcile = reconcileMatchdayEditorialProfileWorkspace(
      effectiveProfile,
      desk.automaticDistribution.activeItems,
      circuitOverrides,
      opening,
      desk.appliedZoneItems,
      desk.hasAppliedSnapshot,
      desk.currentFaixa,
      {
        selectionIdentities,
        workedIdentities,
        independentPlacementIdentities,
      },
    );
    const applyIssues =
      validateMatchdayEditorialProfileApplyState(
        reconcile,
        input.selectionBankItemIds,
        { vacantZoneSlots },
      );

    const zoneIssue = applyIssues.find(
      (issue) =>
        issue.code === "incomplete-zone"
        || issue.code === "invalid-zone-positions",
    );

    if (zoneIssue) {
      const zone = reconcile.zonesAfter.find(
        (candidate) => candidate.key === zoneIssue.zoneKey,
      );

      return apiError(
        "thematic-desk-incomplete-zone",
        `${zoneIssue.zoneLabel} está incompleta (${zone?.items.length ?? 0}/${zone?.capacity ?? 0}). Complete a zona antes de aplicar.`,
        409,
      );
    }


    if (
      applyIssues.some(
        (issue) => issue.code === "duplicate-selection",
      )
    ) {
      return apiError(
        "thematic-desk-invalid-selection",
        "As quatro ao lado das Últimas não podem conter a mesma notícia em mais de uma posição.",
        409,
      );
    }
    // V12 extends the previous rpc/apply_matchday_editorial_profile_workspace_v11 contract.
    const rows = await writeSupabaseAdminReturning<ApplyResultRow>(
      "rpc/apply_matchday_editorial_profile_workspace_v12",
      {
        method: "POST",
        body: JSON.stringify({
          p_matchday_id: matchdayId,
          p_profile_key: input.profileKey,
          p_expected_revision: input.expectedRevision,
          p_expected_state_token: input.expectedStateToken,
          p_overrides: circuitOverrides.map((override) => ({
            source_type: override.sourceType,
            source_id: override.sourceId,
            placement_target: override.placementTarget,
            zone_key: override.zoneKey,
            sort_order: override.sortOrder,
          })),
          p_zone_items: compatibilityReconcile.zonesAfter.flatMap((zone) => zone.items.map((item) => ({
            source_type: item.sourceType,
            source_id: item.sourceId,
            zone_key: zone.key,
            sort_order: item.sortOrder,
          }))),
          p_faixa_source_ids: compatibilityReconcile.faixaAfter.map((item) => item.sourceId),
          p_authoritative_zone_items: reconcile.zonesAfter.flatMap((zone) => zone.items.map((item) => ({
            source_type: item.sourceType,
            source_id: item.sourceId,
            zone_key: zone.key,
            sort_order: item.sortOrder,
          }))),
          p_authoritative_faixa_items: reconcile.faixaAfter.map((item) => ({
            source_type: item.sourceType,
            source_id: item.sourceId,
            sort_order: item.sortOrder,
          })),
          p_displaced_bank_item_ids: displacedBankItemIds,
          p_faixa_arrival_bank_item_ids: faixaArrivalBankItemIds,
          p_displaced_arrival_bank_item_ids:
            displacedArrivalBankItemIds,
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
          p_worked_source_ids:
            Array.from(new Set((input.workedSourceIds as string[]).map((value) => value.trim().toLowerCase()))),
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
