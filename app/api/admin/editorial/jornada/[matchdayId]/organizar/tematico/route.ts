import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import {
  parsePhysicalDeskApplyPayload,
  physicalDeskApplyRpcArguments,
} from "@/lib/editorial-matchday-live-layout-physical-apply";
import { readMatchdayEditorialProfileDesk } from "@/lib/editorial-matchday-profile-desk";
import { editorialProfile } from "@/lib/editorial-profiles";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export const dynamic = "force-dynamic";

type ApplyResultRow = Readonly<{
  state_token: string;
  applied_zone_count: number;
  applied_block_count: number;
  applied_placement_count: number;
  explicit_bank_item_count: number;
  displaced_bank_item_count: number;
  worked_bank_item_count: number;
}>;

type ManagedMatchdayEditorialDeskRow = Readonly<{
  matchday_id: string;
}>;

type ApiError = Readonly<{
  ok: false;
  error: string;
  message: string;
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

function mutationErrorResponse(error: unknown) {
  const message = databaseMessage(error);
  if (message.includes("matchday-live-layout-physical-v14-concurrent-write")) {
    return apiError(
      "thematic-physical-concurrent-write",
      "O workspace físico mudou. Recarregue a Mesa antes de voltar a aplicar.",
      409,
    );
  }
  if (message.includes("matchday-live-layout-physical-v14-video-required")) {
    return apiError(
      "thematic-video-required",
      "Associe pelo menos um resumo publicado antes de ativar o módulo Vídeo + Destaque.",
      409,
    );
  }
  if (message.includes("matchday-live-layout-physical-v14-highlight-required")) {
    return apiError(
      "thematic-highlight-required",
      "Defina e publique o Destaque da Jornada antes de ativar o módulo Vídeo + Destaque.",
      409,
    );
  }
  if (message.includes("matchday-live-layout-physical-v14-matchday-not-found")) {
    return apiError(
      "thematic-desk-context-not-found",
      "A Jornada já não existe.",
      404,
    );
  }
  if (
    message.includes("matchday-live-layout-physical-v14-matchday-not-live")
    || message.includes("matchday-live-layout-physical-v14-profile-mismatch")
    || message.includes("matchday-live-layout-physical-v14-cutover-profile-mismatch")
  ) {
    return apiError(
      "thematic-desk-context-changed",
      "A Mesa ou a atribuição temática mudou. Recarregue a página.",
      409,
    );
  }
  if (
    message.includes("matchday-live-layout-physical-v14-")
    || message.includes("matchday-live-layout-physical-apply-")
  ) {
    return apiError(
      "thematic-physical-invalid-state",
      "O estado físico pedido foi recusado integralmente.",
      400,
    );
  }
  console.error("[admin/editorial/thematic-desk] atomic physical apply failed", error);
  return apiError(
    "thematic-desk-apply-failed",
    "Não foi possível aplicar a composição temática.",
    500,
  );
}

async function authenticatedMatchdayId(
  params: Promise<{ matchdayId: string }>,
) {
  const [{ matchdayId }, cookieStore] = await Promise.all([params, cookies()]);
  if (!UUID_PATTERN.test(matchdayId)) {
    return {
      response: apiError(
        "thematic-desk-invalid-matchday",
        "A Jornada indicada não é válida.",
        400,
      ),
    } as const;
  }
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!session || !(await verifyAdminSession(session))) {
    return {
      response: apiError(
        "thematic-desk-authentication-required",
        "É necessária uma sessão administrativa válida.",
        401,
      ),
    } as const;
  }
  return { matchdayId: matchdayId.toLowerCase() } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchdayId: string }> },
) {
  const context = await authenticatedMatchdayId(params);
  if ("response" in context) return context.response;
  const { matchdayId } = context;

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
  const context = await authenticatedMatchdayId(params);
  if ("response" in context) return context.response;
  const { matchdayId } = context;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(
      "thematic-desk-invalid-json",
      "O pedido não contém JSON válido.",
      400,
    );
  }

  let payload;
  try {
    payload = parsePhysicalDeskApplyPayload(rawBody);
  } catch (error) {
    return mutationErrorResponse(error);
  }
  if (!editorialProfile(payload.profileKey)) {
    return apiError(
      "thematic-desk-unsupported-profile",
      "O perfil temático não é suportado.",
      400,
    );
  }
  if (!getSupabaseServiceConfig()) {
    return apiError(
      "thematic-desk-service-unavailable",
      "A escrita administrativa não está configurada.",
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

  try {
    const rows = await writeSupabaseAdminReturning<ApplyResultRow>(
      "rpc/apply_matchday_live_layout_physical_workspace_v14",
      {
        method: "POST",
        body: JSON.stringify(physicalDeskApplyRpcArguments(matchdayId, payload)),
      },
    );
    const row = rows[0];
    const counts = row ? [
      row.applied_zone_count,
      row.applied_block_count,
      row.applied_placement_count,
      row.explicit_bank_item_count,
      row.displaced_bank_item_count,
      row.worked_bank_item_count,
    ] : [];
    if (
      rows.length !== 1
      || !row
      || !STATE_TOKEN_PATTERN.test(row.state_token)
      || counts.some((count) => !Number.isInteger(count) || count < 0)
    ) {
      throw new Error("matchday-live-layout-physical-v14-invalid-result");
    }

    return NextResponse.json({
      ok: true,
      stateToken: row.state_token,
      appliedZoneCount: row.applied_zone_count,
      appliedBlockCount: row.applied_block_count,
      appliedPlacementCount: row.applied_placement_count,
      explicitBankItemCount: row.explicit_bank_item_count,
      displacedBankItemCount: row.displaced_bank_item_count,
      workedBankItemCount: row.worked_bank_item_count,
    });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
