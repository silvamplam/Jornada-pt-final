import { NextResponse } from "next/server";

import {
  applyMatchdayEditorialDeskState,
  MatchdayEditorialDeskApplyError,
  readMatchdayEditorialDesk,
} from "@/lib/editorial-matchday-desk";
import {
  isMatchdayDeskPlacementKey,
  type MatchdayDeskApplyArticle,
} from "@/lib/editorial-matchday-desk-model";

type RouteContext = {
  params: Promise<{ matchdayId: string }>;
};

type ApplyBody = {
  revision?: unknown;
  stateToken?: unknown;
  faixaVisible?: unknown;
  articles?: unknown;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseArticles(value: unknown): MatchdayDeskApplyArticle[] | null {
  if (!Array.isArray(value)) return null;

  const articles: MatchdayDeskApplyArticle[] = [];
  const articleIds = new Set<string>();
  const fixedPlacements = new Set<string>();
  const faixaOrders: number[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const row = candidate as Record<string, unknown>;
    const articleId = row.articleId;
    const inLatest = row.inLatest;
    const placementKey = row.placementKey;

    if (
      typeof articleId !== "string"
      || !isUuid(articleId)
      || typeof inLatest !== "boolean"
      || !isMatchdayDeskPlacementKey(placementKey)
      || articleIds.has(articleId)
    ) {
      return null;
    }

    articleIds.add(articleId);
    if (placementKey?.startsWith("important_item:")) {
      faixaOrders.push(Number(placementKey.split(":")[1]));
    } else if (placementKey) {
      if (fixedPlacements.has(placementKey)) return null;
      fixedPlacements.add(placementKey);
    }
    articles.push({ articleId, inLatest, placementKey });
  }

  faixaOrders.sort((left, right) => left - right);
  if (faixaOrders.some((order, index) => order !== index + 1)) return null;
  return articles;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("editorial-desk-conflict")
    || message.includes("editorial-desk-state-token-conflict")
  ) {
    return NextResponse.json(
      { ok: false, code: "conflict", message: "A Jornada mudou entretanto. Atualiza a página antes de aplicar novamente." },
      { status: 409 },
    );
  }
  if (
    message.includes("editorial-desk-unresolved-content")
    || message.includes("editorial-desk-draft-content")
    || message.includes("editorial-desk-incomplete-state")
  ) {
    return NextResponse.json(
      { ok: false, code: "blocked-content", message: "O estado atual contém conteúdo que a Mesa não pode substituir com segurança." },
      { status: 422 },
    );
  }
  if (error instanceof MatchdayEditorialDeskApplyError && error.code === "missing-service") {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  console.error("[editorial-desk] apply failed", error);
  return NextResponse.json(
    { ok: false, code: "apply-failed", message: "Não foi possível aplicar as alterações da Mesa." },
    { status: 500 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { matchdayId } = await context.params;
  if (!isUuid(matchdayId)) {
    return NextResponse.json({ ok: false, code: "invalid-matchday" }, { status: 400 });
  }

  let body: ApplyBody;
  try {
    body = await request.json() as ApplyBody;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json" }, { status: 400 });
  }

  const articles = parseArticles(body.articles);
  if (
    !Number.isSafeInteger(body.revision)
    || (body.revision as number) < 0
    || typeof body.stateToken !== "string"
    || body.stateToken.trim().length === 0
    || typeof body.faixaVisible !== "boolean"
    || !articles
  ) {
    return NextResponse.json({ ok: false, code: "invalid-state" }, { status: 400 });
  }

  const snapshot = await readMatchdayEditorialDesk(matchdayId);
  if (!snapshot) {
    return NextResponse.json({ ok: false, code: "matchday-not-found" }, { status: 404 });
  }
  if (!snapshot.stateToken) {
    return NextResponse.json(
      { ok: false, code: "migration-required", message: "A infraestrutura da Mesa ainda não está disponível." },
      { status: 503 },
    );
  }
  if (snapshot.blockedPlacements.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "blocked-content",
        message: "Resolve primeiro o conteúdo atual que não está associado a artigos canónicos.",
        blockedPlacements: snapshot.blockedPlacements,
      },
      { status: 422 },
    );
  }
  if (snapshot.revision !== body.revision || snapshot.stateToken !== body.stateToken) {
    return NextResponse.json(
      { ok: false, code: "conflict", message: "A Jornada mudou entretanto. Atualiza a página antes de aplicar novamente." },
      { status: 409 },
    );
  }

  const expectedArticleIds = snapshot.articles.map((article) => article.id).sort();
  const receivedArticleIds = articles.map((article) => article.articleId).sort();
  if (
    expectedArticleIds.length !== receivedArticleIds.length
    || expectedArticleIds.some((articleId, index) => articleId !== receivedArticleIds[index])
  ) {
    return NextResponse.json(
      { ok: false, code: "incomplete-state", message: "O pedido não contém o estado final completo da Jornada." },
      { status: 400 },
    );
  }

  try {
    const result = await applyMatchdayEditorialDeskState({
      matchdayId,
      expectedRevision: body.revision as number,
      expectedStateToken: body.stateToken,
      faixaVisible: body.faixaVisible,
      articles,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
