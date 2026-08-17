import { NextResponse } from "next/server";

import {
  confirmMatchVideoSummaryCandidate,
  MatchVideoSummarySyncError,
  readMatchVideoSummaryState,
  rejectMatchVideoSummaryCandidate,
  syncMatchVideoSummaries,
} from "@/lib/match-video-summary-sync.server";

type RouteContext = {
  params: Promise<{ matchdayId: string }>;
};

type ActionBody = {
  action?: "sync" | "confirm" | "reject";
  candidateId?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function errorResponse(error: unknown) {
  if (error instanceof MatchVideoSummarySyncError) {
    const status = error.code === "matchday-not-found" || error.code === "candidate-not-found" ? 404 : 400;
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status });
  }
  console.error("match-video-summary-sync", error instanceof Error ? error.message : "unknown-error");
  return NextResponse.json(
    { ok: false, code: "video-summary-sync-failed", message: "Não foi possível sincronizar os resumos da jornada." },
    { status: 500 },
  );
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { matchdayId } = await params;
    if (!isUuid(matchdayId)) {
      return NextResponse.json({ ok: false, code: "matchday-invalid", message: "Jornada inválida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, state: await readMatchVideoSummaryState(matchdayId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { matchdayId } = await params;
    if (!isUuid(matchdayId)) {
      return NextResponse.json({ ok: false, code: "matchday-invalid", message: "Jornada inválida." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as ActionBody;
    if (body.action === "sync") {
      return NextResponse.json({ ok: true, state: await syncMatchVideoSummaries(matchdayId) });
    }

    if ((body.action === "confirm" || body.action === "reject") && body.candidateId && isUuid(body.candidateId)) {
      const state = body.action === "confirm"
        ? await confirmMatchVideoSummaryCandidate(matchdayId, body.candidateId)
        : await rejectMatchVideoSummaryCandidate(matchdayId, body.candidateId);
      return NextResponse.json({ ok: true, state });
    }

    return NextResponse.json({ ok: false, code: "action-invalid", message: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
