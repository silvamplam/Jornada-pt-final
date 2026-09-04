import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSession,
} from "@/lib/admin-session";
import {
  editorialProfile,
  type EditorialProfileZoneKey,
} from "@/lib/editorial-profiles";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

type ManagedDeskRow = Readonly<{
  matchday_id: string;
}>;

type AssignmentRow = Readonly<{
  profile_key: string;
}>;

type ManualClassificationRow = Readonly<{
  bank_item_id: string;
  classification_key: string;
  classification_source: string;
  classified_at: string;
}>;

function apiError(
  error: string,
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message,
    },
    { status },
  );
}

function databaseMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : "";

  try {
    const parsed =
      JSON.parse(raw) as {
        message?: unknown;
      };

    return typeof parsed.message === "string"
      ? parsed.message
      : raw;
  } catch {
    return raw;
  }
}

async function isManagedDesk(
  matchdayId: string,
) {
  const rows =
    await fetchSupabaseAdminTable<ManagedDeskRow>(
      `matchday_editorial_desk_control?select=matchday_id&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&is_managed=eq.true&limit=1`,
    );

  return rows.length === 1;
}

export async function POST(
  request: Request,
  {
    params,
  }: {
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
      "contextual-classification-invalid-matchday",
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
      "contextual-classification-authentication-required",
      "É necessária uma sessão administrativa válida.",
      401,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(
      "contextual-classification-invalid-json",
      "O pedido não contém JSON válido.",
      400,
    );
  }

  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
  ) {
    return apiError(
      "contextual-classification-invalid-payload",
      "O pedido tem uma estrutura inválida.",
      400,
    );
  }

  const input =
    body as Record<string, unknown>;

  if (
    Object.keys(input).sort().join(",")
      !== "bankItemId,classificationKey"
    || typeof input.bankItemId !== "string"
    || !UUID_PATTERN.test(input.bankItemId.trim())
    || typeof input.classificationKey !== "string"
    || !input.classificationKey.trim()
  ) {
    return apiError(
      "contextual-classification-invalid-payload",
      "A notícia e a classificação de destino são obrigatórias.",
      400,
    );
  }

  if (!getSupabaseServiceConfig()) {
    return apiError(
      "contextual-classification-service-unavailable",
      "A escrita administrativa não está configurada.",
      503,
    );
  }

  if (!(await isManagedDesk(matchdayId))) {
    return apiError(
      "contextual-classification-not-live",
      "Esta Jornada não é a Mesa Viva atual.",
      409,
    );
  }

  const assignmentRows =
    await fetchSupabaseAdminTable<AssignmentRow>(
      `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    );

  const profile =
    editorialProfile(
      assignmentRows[0]?.profile_key ?? "",
    );

  if (!profile) {
    return apiError(
      "contextual-classification-profile-not-supported",
      "O perfil temático atual não suporta esta correção.",
      409,
    );
  }

  const classificationKey =
    input.classificationKey
      .trim() as EditorialProfileZoneKey;

  const targetZone =
    profile.zones.find(
      (zone) =>
        zone.key === classificationKey,
    );

  if (!targetZone) {
    return apiError(
      "contextual-classification-invalid-key",
      "A classificação indicada não pertence ao perfil atual.",
      400,
    );
  }

  const bankItemId =
    input.bankItemId
      .trim()
      .toLowerCase();

  try {
    const rows =
      await writeSupabaseAdminReturning<ManualClassificationRow>(
        "rpc/apply_matchday_editorial_bank_manual_classification_v1",
        {
          method: "POST",
          body: JSON.stringify({
            p_matchday_id: matchdayId,
            p_bank_item_id: bankItemId,
            p_classification_key:
              classificationKey,
          }),
        },
      );

    const row = rows[0];

    if (!row) {
      return apiError(
        "contextual-classification-empty-result",
        "A classificação não devolveu um estado confirmado.",
        500,
      );
    }

    return NextResponse.json({
      ok: true,
      classification: {
        bankItemId:
          row.bank_item_id,
        classificationKey:
          row.classification_key,
        classificationSource:
          row.classification_source,
        classifiedAt:
          row.classified_at,
      },
      message:
        `Classificação corrigida para ${targetZone.label}. A posição editorial não foi alterada.`,
    });
  } catch (error) {
    const message =
      databaseMessage(error);

    if (
      message.includes(
        "contextual-classification-manual-invalid-key",
      )
    ) {
      return apiError(
        "contextual-classification-invalid-key",
        "A classificação indicada não é válida.",
        400,
      );
    }

    if (
      message.includes(
        "contextual-classification-manual-bank-item-not-found",
      )
    ) {
      return apiError(
        "contextual-classification-bank-item-not-found",
        "A notícia deixou de existir nesta Jornada.",
        404,
      );
    }

    if (
      message.includes(
        "contextual-classification-manual-not-live",
      )
      || message.includes(
        "contextual-classification-manual-matchday-mismatch",
      )
      || message.includes(
        "contextual-classification-manual-bank-item-inactive",
      )
      || message.includes(
        "contextual-classification-manual-profile-not-supported",
      )
    ) {
      return apiError(
        "contextual-classification-context-changed",
        "A Mesa ou a participação editorial mudou. Recarregue a página.",
        409,
      );
    }

    if (
      message.includes(
        "contextual-classification-manual-non-article",
      )
    ) {
      return apiError(
        "contextual-classification-non-article",
        "Esta correção aplica-se apenas a notícias editoriais.",
        400,
      );
    }

    console.error(
      "[admin/editorial/contextual-classification] correction failed",
      error,
    );

    return apiError(
      "contextual-classification-failed",
      "Não foi possível corrigir a classificação.",
      500,
    );
  }
}