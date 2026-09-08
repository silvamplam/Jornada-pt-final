import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildNewsroomClassificationSeasonContext,
  type NewsroomArticleClassificationEvidence,
  type NewsroomClassificationSeasonContext,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier";
import {
  classifyNewsroomArticleDeterministicallyService,
  prepareNewsroomDeterministicClassificationsService,
  type NewsroomDeterministicClassifierDependencies,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-service-internal";
import type {
  NewsroomArticleClassification,
  NewsroomArticleClassificationMutation,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";

const SEASON_ID = "97000000-0000-4000-8000-000000000001";
const COMPETITION_ID = "97000000-0000-4000-8000-000000000002";
const BENFICA_ID = "97000000-0000-4000-8000-000000000003";
const BRAGA_ID = "97000000-0000-4000-8000-000000000004";
const SPORTING_ID = "97000000-0000-4000-8000-000000000007";
const ARTICLE_ONE_ID = "97000000-0000-4000-8000-000000000005";
const ARTICLE_TWO_ID = "97000000-0000-4000-8000-000000000006";

function seasonContext(): NewsroomClassificationSeasonContext {
  const context = buildNewsroomClassificationSeasonContext({
    seasonId: SEASON_ID,
    competitionId: COMPETITION_ID,
    participantTeamIds: [BENFICA_ID, BRAGA_ID, SPORTING_ID],
    teams: [
      {
        id: BENFICA_ID,
        name: "Sport Lisboa e Benfica",
        publicName: "Benfica",
        shortName: "Benfica",
        slug: "benfica",
        code: "SLB",
      },
      {
        id: BRAGA_ID,
        name: "Sporting Clube de Braga",
        publicName: "SC Braga",
        shortName: "Braga",
        slug: "braga",
        code: "SCB",
      },
      {
        id: SPORTING_ID,
        name: "Sporting Clube de Portugal",
        publicName: "Sporting",
        shortName: "Sporting CP",
        slug: "sporting",
        code: "SCP",
      },
    ],
    aliases: [],
  });
  assert.ok(context);
  return context;
}

function evidence(
  newsroomArticleId: string,
  title: string,
): NewsroomArticleClassificationEvidence {
  return {
    newsroomArticleId,
    title,
    subtitle: null,
    summary: null,
    body: null,
  };
}

function classification(
  newsroomArticleId: string,
  classificationKey: NewsroomArticleClassification["classificationKey"],
  classificationSource: NewsroomArticleClassification["classificationSource"],
): NewsroomArticleClassification {
  return {
    newsroomArticleId,
    classificationKey,
    classificationSource,
    classifiedAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
  };
}

function mutation(
  value: NewsroomArticleClassification,
  options: Readonly<{ applied: boolean; changed: boolean }>,
): NewsroomArticleClassificationMutation {
  return {
    newsroomArticleId: value.newsroomArticleId,
    state: { status: "classified", classification: value },
    applied: options.applied,
    changed: options.changed,
  };
}

function dependencies(options?: Readonly<{
  evidence?: readonly NewsroomArticleClassificationEvidence[];
  applyAutomatic?: NewsroomDeterministicClassifierDependencies["applyAutomatic"];
}>) {
  let contextLoads = 0;
  let evidenceLoads = 0;
  let automaticCalls = 0;
  const requestedIds: string[][] = [];
  const selectedEvidence = options?.evidence ?? [
    evidence(ARTICLE_ONE_ID, "Benfica prepara jogo"),
  ];
  const deps: NewsroomDeterministicClassifierDependencies = {
    isConfigured: () => true,
    async loadSeasonContext() {
      contextLoads += 1;
      return { ok: true, value: seasonContext() };
    },
    async loadArticleEvidence(newsroomArticleIds) {
      evidenceLoads += 1;
      requestedIds.push([...newsroomArticleIds]);
      return { ok: true, value: selectedEvidence };
    },
    async applyAutomatic(input) {
      automaticCalls += 1;
      if (options?.applyAutomatic) return options.applyAutomatic(input);
      return {
        ok: true,
        value: mutation(
          classification(
            input.newsroomArticleId,
            input.classificationKey as NewsroomArticleClassification["classificationKey"],
            "automatic",
          ),
          { applied: true, changed: true },
        ),
      };
    },
  };
  return {
    deps,
    counts: () => ({ contextLoads, evidenceLoads, automaticCalls }),
    requestedIds,
  };
}

test("preparação batch carrega contexto uma vez e evidência numa query lógica", async () => {
  const fake = dependencies({
    evidence: [
      evidence(ARTICLE_ONE_ID, "Benfica prepara jogo"),
      evidence(ARTICLE_TWO_ID, "Braga renova contrato"),
    ],
  });
  const prepare = prepareNewsroomDeterministicClassificationsService(fake.deps);
  const result = await prepare({
    seasonId: SEASON_ID,
    newsroomArticleIds: [ARTICLE_ONE_ID, ARTICLE_TWO_ID],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.seasonId, SEASON_ID);
  assert.deepEqual(
    result.value.classifications.map((item) => item.result.classificationKey),
    ["benfica", "other_liga_clubs"],
  );
  assert.deepEqual(fake.counts(), {
    contextLoads: 1,
    evidenceLoads: 1,
    automaticCalls: 0,
  });
  assert.deepEqual(fake.requestedIds, [[ARTICLE_ONE_ID, ARTICLE_TWO_ID]]);
});

test("contexto de season é obrigatório e validado antes de qualquer read", async () => {
  const fake = dependencies();
  const prepare = prepareNewsroomDeterministicClassificationsService(fake.deps);
  const result = await prepare({
    seasonId: "current",
    newsroomArticleIds: [ARTICLE_ONE_ID],
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_request");
  assert.deepEqual(fake.counts(), {
    contextLoads: 0,
    evidenceLoads: 0,
    automaticCalls: 0,
  });
});

test("resultado insuficiente não faz write nem apaga automatic anterior", async () => {
  let current = classification(ARTICLE_ONE_ID, "benfica", "automatic");
  const before = structuredClone(current);
  const fake = dependencies({
    evidence: [evidence(ARTICLE_ONE_ID, "Notícia sem sujeito identificável")],
    async applyAutomatic(input) {
      current = classification(
        input.newsroomArticleId,
        input.classificationKey as NewsroomArticleClassification["classificationKey"],
        "automatic",
      );
      return {
        ok: true,
        value: mutation(current, { applied: true, changed: true }),
      };
    },
  });
  const classify = classifyNewsroomArticleDeterministicallyService(fake.deps);
  const result = await classify({
    seasonId: SEASON_ID,
    newsroomArticleId: ARTICLE_ONE_ID,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.classification.result.classificationKey, null);
  assert.equal(result.value.persistence.status, "no_confident_replacement");
  assert.equal(result.value.persistence.mutation, null);
  assert.equal(fake.counts().automaticCalls, 0);
  assert.deepEqual(current, before);
});

test("resultado ambíguo também mantém classificação anterior", async () => {
  const fake = dependencies({
    evidence: [evidence(ARTICLE_ONE_ID, "Benfica e Sporting disputam jogador")],
  });
  const classify = classifyNewsroomArticleDeterministicallyService(fake.deps);
  const result = await classify({
    seasonId: SEASON_ID,
    newsroomArticleId: ARTICLE_ONE_ID,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.classification.result.state, "ambiguous");
  assert.equal(result.value.persistence.status, "no_confident_replacement");
  assert.equal(fake.counts().automaticCalls, 0);
});

test("manual override é preservado pelo serviço existente do Lote 2B", async () => {
  const manual = classification(ARTICLE_ONE_ID, "fc_porto", "manual");
  const fake = dependencies({
    evidence: [evidence(ARTICLE_ONE_ID, "Benfica prepara jogo")],
    async applyAutomatic() {
      return {
        ok: true,
        value: mutation(manual, { applied: false, changed: false }),
      };
    },
  });
  const classify = classifyNewsroomArticleDeterministicallyService(fake.deps);
  const result = await classify({
    seasonId: SEASON_ID,
    newsroomArticleId: ARTICLE_ONE_ID,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.classification.result.classificationKey, "benfica");
  assert.equal(result.value.persistence.status, "manual_override_preserved");
  assert.equal(
    result.value.persistence.mutation.state.classification?.classificationKey,
    "fc_porto",
  );
  assert.equal(fake.counts().automaticCalls, 1);
});

test("automatic confiante pode atualizar outro automatic através do Lote 2B", async () => {
  let current = classification(ARTICLE_ONE_ID, "sporting", "automatic");
  const fake = dependencies({
    evidence: [evidence(ARTICLE_ONE_ID, "Benfica prepara jogo")],
    async applyAutomatic(input) {
      current = classification(
        input.newsroomArticleId,
        input.classificationKey as NewsroomArticleClassification["classificationKey"],
        "automatic",
      );
      return {
        ok: true,
        value: mutation(current, { applied: true, changed: true }),
      };
    },
  });
  const classify = classifyNewsroomArticleDeterministicallyService(fake.deps);
  const result = await classify({
    seasonId: SEASON_ID,
    newsroomArticleId: ARTICLE_ONE_ID,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.persistence.status, "applied");
  assert.equal(current.classificationKey, "benfica");
  assert.equal(current.classificationSource, "automatic");
});

test("mismatch entre pedido, contexto ou evidência falha sem persistir", async () => {
  const fake = dependencies({
    evidence: [evidence(ARTICLE_TWO_ID, "Braga renova contrato")],
  });
  const prepare = prepareNewsroomDeterministicClassificationsService(fake.deps);
  const result = await prepare({
    seasonId: SEASON_ID,
    newsroomArticleIds: [ARTICLE_ONE_ID],
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "relation_invalid");
  assert.equal(fake.counts().automaticCalls, 0);
});

test("integração pública é server-only e não usa clear/manual", () => {
  const publicSource = readFileSync(
    "lib/redacao-automatica/newsroom-deterministic-classifier-service.ts",
    "utf8",
  );
  const internalSource = readFileSync(
    "lib/redacao-automatica/newsroom-deterministic-classifier-service-internal.ts",
    "utf8",
  );
  assert.match(publicSource, /^import "server-only";/);
  assert.match(publicSource, /applyAutomaticNewsroomArticleClassification/);
  assert.doesNotMatch(publicSource, /clearNewsroom|setManualNewsroom/);
  assert.doesNotMatch(internalSource, /\.clear\(|clearNewsroom|setManualNewsroom/);
});
