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
import { getSupabaseServiceConfig, writeSupabaseAdminReturning } from "@/lib/supabase";

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
}>;

type ApiError = Readonly<{ ok: false; error: string; message: string }>;

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

function mutationErrorResponse(error: unknown) {
  const message = databaseMessage(error);
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
    || message.includes("profile-workspace-exclusive-")
  ) {
    return apiError("thematic-desk-invalid-reconcile", "A composição temática foi recusada integralmente.", 400);
  }
  console.error("[admin/editorial/thematic-desk] atomic reconcile failed");
  return apiError("thematic-desk-apply-failed", "Não foi possível aplicar a composição temática.", 500);
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
  const input = body as Record<string, unknown>;
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

  try {
    opening =
      validateMatchdayEditorialProfileOpening(
        input.opening,
      );

    pageControls =
      validateMatchdayEditorialProfilePageControls(
        input.pageControls,
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
      "rpc/apply_matchday_editorial_profile_workspace_v2",
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
            thematic_zone_order: pageControls.thematicZoneOrder,
            thematic_zone_layouts:
              pageControls.thematicZoneLayouts,
            thematic_block_order:
              pageControls.thematicBlockOrder,
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
    });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
