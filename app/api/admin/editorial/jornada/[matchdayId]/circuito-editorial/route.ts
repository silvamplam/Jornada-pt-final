import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import { isEditorialProfileCompatibleWithCompetition } from "@/lib/editorial-matchday-circuit";
import { isEditorialProfileKey } from "@/lib/editorial-profiles";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdmin,
} from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MatchdayRow = Readonly<{ season_id: string }>;
type SeasonRow = Readonly<{ competition_id: string }>;
type CompetitionRow = Readonly<{ slug: string }>;
type ApiError = Readonly<{ ok: false; error: string; message: string }>;

export const dynamic = "force-dynamic";

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

function assignmentErrorResponse(error: unknown) {
  const message = databaseMessage(error);
  if (message.includes("matchday-editorial-profile-matchday-not-found")) {
    return apiError("editorial-circuit-matchday-not-found", "A Jornada indicada já não existe.", 404);
  }
  if (message.includes("matchday-editorial-profile-incompatible-competition")) {
    return apiError("editorial-circuit-incompatible-competition", "O perfil temático não é compatível com esta competição.", 409);
  }
  if (message.includes("matchday-editorial-profile-invalid-")) {
    return apiError("editorial-circuit-invalid-profile", "O circuito editorial pedido não é válido.", 400);
  }
  console.error("[admin/editorial/circuit] assignment RPC failed");
  return apiError("editorial-circuit-update-failed", "Não foi possível alterar o circuito editorial.", 500);
}

async function readCompetitionSlug(matchdayId: string): Promise<string | null> {
  const matchdayRows = await fetchSupabaseAdminTable<MatchdayRow>(
    `matchdays?select=season_id&id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
  );
  const matchday = matchdayRows[0];
  if (!matchday) {
    return null;
  }

  const seasonRows = await fetchSupabaseAdminTable<SeasonRow>(
    `seasons?select=competition_id&id=eq.${encodeURIComponent(matchday.season_id)}&limit=1`,
  );
  const season = seasonRows[0];
  if (!season) {
    return null;
  }

  const competitionRows = await fetchSupabaseAdminTable<CompetitionRow>(
    `competitions?select=slug&id=eq.${encodeURIComponent(season.competition_id)}&limit=1`,
  );
  return competitionRows[0]?.slug ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchdayId: string }> },
) {
  const [{ matchdayId }, cookieStore] = await Promise.all([params, cookies()]);
  if (!UUID_PATTERN.test(matchdayId)) {
    return apiError("editorial-circuit-invalid-matchday", "A Jornada indicada não é válida.", 400);
  }

  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!session || !(await verifyAdminSession(session))) {
    return apiError("editorial-circuit-authentication-required", "É necessária uma sessão administrativa válida.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("editorial-circuit-invalid-json", "O pedido não contém JSON válido.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return apiError("editorial-circuit-invalid-payload", "O pedido tem uma estrutura inválida.", 400);
  }
  const profileKey = (body as Record<string, unknown>).profileKey;
  if (profileKey !== null && !isEditorialProfileKey(profileKey)) {
    return apiError("editorial-circuit-invalid-profile", "O perfil editorial pedido não é suportado.", 400);
  }
  if (!getSupabaseServiceConfig()) {
    return apiError("editorial-circuit-service-unavailable", "A escrita administrativa não está configurada.", 503);
  }

  try {
    const competitionSlug = await readCompetitionSlug(matchdayId);
    if (!competitionSlug) {
      return apiError("editorial-circuit-matchday-not-found", "Não foi possível resolver a Jornada e a respetiva competição.", 404);
    }
    if (profileKey !== null && !isEditorialProfileCompatibleWithCompetition(profileKey, competitionSlug)) {
      return apiError("editorial-circuit-incompatible-competition", "O perfil temático não é compatível com esta competição.", 409);
    }

    await writeSupabaseAdmin("rpc/set_matchday_editorial_profile_assignment", {
      method: "POST",
      body: JSON.stringify({
        p_matchday_id: matchdayId,
        p_profile_key: profileKey,
      }),
    });

    return NextResponse.json({ ok: true, profileKey });
  } catch (error) {
    return assignmentErrorResponse(error);
  }
}
