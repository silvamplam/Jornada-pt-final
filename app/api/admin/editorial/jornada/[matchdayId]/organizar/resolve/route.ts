import { NextResponse } from "next/server";

import { readMatchdayEditorialDesk } from "@/lib/editorial-matchday-desk";
import {
  resolveMatchdayEditorialDeskInactivePlacement,
} from "@/lib/editorial-matchday-desk-resolution";

type RouteContext = {
  params: Promise<{ matchdayId: string }>;
};

type ResolveBody = {
  placementKey?: unknown;
  action?: unknown;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: RouteContext) {
  const { matchdayId } = await context.params;

  if (!isUuid(matchdayId)) {
    return NextResponse.json(
      { ok: false, code: "invalid-matchday" },
      { status: 400 },
    );
  }

  let body: ResolveBody;
  try {
    body = await request.json() as ResolveBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-json" },
      { status: 400 },
    );
  }

  if (
    typeof body.placementKey !== "string"
    || (body.action !== "activate" && body.action !== "remove")
  ) {
    return NextResponse.json(
      { ok: false, code: "invalid-resolution" },
      { status: 400 },
    );
  }

  const snapshot = await readMatchdayEditorialDesk(matchdayId);

  if (!snapshot) {
    return NextResponse.json(
      { ok: false, code: "matchday-not-found" },
      { status: 404 },
    );
  }

  const blocked = snapshot.blockedPlacements.find(
    (candidate) => candidate.placementKey === body.placementKey,
  );

  if (!blocked) {
    return NextResponse.json(
      {
        ok: false,
        code: "resolution-stale",
        message: "Esta situação já mudou. Atualiza a Mesa antes de continuar.",
      },
      { status: 409 },
    );
  }

  if (blocked.kind !== "inactive") {
    return NextResponse.json(
      {
        ok: false,
        code: "resolution-not-supported",
        message: "Este tipo de conflito ainda exige resolução da identidade canónica.",
      },
      { status: 422 },
    );
  }

  if (body.action === "activate" && !blocked.canActivate) {
    return NextResponse.json(
      {
        ok: false,
        code: "activation-not-safe",
        message: "Não é seguro ativar esta posição sem um artigo canónico identificado.",
      },
      { status: 422 },
    );
  }

  if (body.action === "remove" && !blocked.canRemove) {
    return NextResponse.json(
      {
        ok: false,
        code: "removal-not-safe",
        message: "Esta posição não pode ser retirada automaticamente.",
      },
      { status: 422 },
    );
  }

  try {
    await resolveMatchdayEditorialDeskInactivePlacement({
      matchdayId,
      placementKey: blocked.placementKey,
      action: body.action,
    });
  } catch (error) {
    console.error("[editorial-desk] resolve blocked placement failed", error);

    return NextResponse.json(
      {
        ok: false,
        code: "resolution-failed",
        message: "Não foi possível resolver esta situação da Mesa.",
      },
      { status: 500 },
    );
  }

  const refreshed = await readMatchdayEditorialDesk(matchdayId);
  const remaining = refreshed?.blockedPlacements.find(
    (candidate) => candidate.placementKey === blocked.placementKey,
  );

  if (remaining) {
    return NextResponse.json(
      {
        ok: false,
        code: "still-blocked",
        message: remaining.reason,
        blockedPlacement: remaining,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true });
}