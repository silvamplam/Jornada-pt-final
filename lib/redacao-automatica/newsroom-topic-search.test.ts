import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NEWSROOM_TOPIC_ARCHIVE_OUTCOMES,
  classifyNewsroomTopicArchiveCandidate,
  classifyNewsroomTopicSearchResultOrigins,
  hasNewsroomTopicSearchTerms,
  isNewsroomTopicPublishedAtEligible,
  newsroomTopicPeriod,
  newsroomTopicPeriodDays,
  newsroomTopicSearchTerms,
  normalizeNewsroomTopicText,
  scoreNewsroomTopicCandidate,
} from "@/lib/redacao-automatica/newsroom-topic-search";

test("normaliza acentos e elimina palavras funcionais da pesquisa", () => {
  assert.equal(
    normalizeNewsroomTopicText("Vitória de Guimarães — pré-época"),
    "vitoria de guimaraes pre epoca",
  );
  assert.deepEqual(
    newsroomTopicSearchTerms("Vitória de Guimarães — pré-época"),
    ["vitoria", "guimaraes", "pre", "epoca"],
  );
  assert.equal(hasNewsroomTopicSearchTerms("de e para"), false);
});

test("corresponde por palavras completas e não por substrings", () => {
  assert.equal(
    scoreNewsroomTopicCandidate({ title: "UFC prepara evento em Lisboa" }, "FC"),
    0,
  );
  assert.equal(
    scoreNewsroomTopicCandidate({ title: "Presidente comenta a época" }, "pre"),
    0,
  );
  assert.ok(
    scoreNewsroomTopicCandidate({ title: "FC Porto prepara a época" }, "FC") > 0,
  );
});

test("FC Porto é uma entidade composta obrigatória no mesmo campo", () => {
  assert.ok(scoreNewsroomTopicCandidate({
    title: "FC Porto inicia a preparação para a nova época",
  }, "FC Porto pré-época") > 0);
  assert.equal(scoreNewsroomTopicCandidate({
    title: "FC prepara a época",
    summary: "O Porto recebe um amigável.",
  }, "FC Porto pré-época"), 0);
  assert.equal(scoreNewsroomTopicCandidate({
    title: "UFC anuncia combate",
    summary: "Blatter falou sobre o Vitória.",
  }, "FC Porto pré-época"), 0);
});

test("Vitória de Guimarães é uma entidade composta sem as stop words", () => {
  assert.ok(scoreNewsroomTopicCandidate({
    title: "Vitória de Guimarães regressa aos treinos",
  }, "Vitória de Guimarães") > 0);
  assert.equal(scoreNewsroomTopicCandidate({
    title: "Vitória importante no campeonato",
    summary: "A equipa viaja para Guimarães.",
  }, "Vitória de Guimarães"), 0);
  assert.equal(scoreNewsroomTopicCandidate({
    title: "Blatter visitou Guimarães",
  }, "Vitória de Guimarães"), 0);
});

test("os pesos respeitam título acima de resumo e resumo acima de corpo", () => {
  const titleScore = scoreNewsroomTopicCandidate({
    title: "FC Porto prepara nova época",
  }, "FC Porto");
  const summaryScore = scoreNewsroomTopicCandidate({
    title: "Preparação prossegue",
    summary: "FC Porto prepara nova época.",
  }, "FC Porto");
  const bodyScore = scoreNewsroomTopicCandidate({
    title: "Preparação prossegue",
    body: "O FC Porto prepara a nova época.",
  }, "FC Porto");

  assert.ok(titleScore > summaryScore);
  assert.ok(summaryScore > bodyScore);
});

test("uma entidade apenas no corpo exige contexto quando a pesquisa o inclui", () => {
  assert.equal(scoreNewsroomTopicCandidate({
    title: "Mercado de transferências",
    body: "O FC Porto confirmou a informação.",
  }, "FC Porto pré-época"), 0);
  assert.ok(scoreNewsroomTopicCandidate({
    title: "Mercado de transferências",
    body: "O FC Porto iniciou a preparação.",
  }, "FC Porto pré-época") > 0);
});

test("aplica sinónimos controlados ao conceito de pré-época", () => {
  for (const context of [
    "preparação",
    "estágio",
    "treino",
    "amigável",
    "nova época",
  ]) {
    assert.ok(
      scoreNewsroomTopicCandidate({
        title: `FC Porto inicia ${context}`,
      }, "FC Porto pré-época") > 0,
      context,
    );
  }
});

test("o período usa exclusivamente published_at válido e nunca datas futuras", () => {
  const now = new Date("2026-07-29T20:00:00.000Z");

  assert.equal(
    isNewsroomTopicPublishedAtEligible("2026-07-23T20:00:00.000Z", 7, now),
    true,
  );
  assert.equal(
    isNewsroomTopicPublishedAtEligible("2026-07-21T20:00:00.000Z", 7, now),
    false,
  );
  assert.equal(isNewsroomTopicPublishedAtEligible(null, 7, now), false);
  assert.equal(
    isNewsroomTopicPublishedAtEligible("2026-07-30T20:00:00.000Z", null, now),
    false,
  );
  assert.equal(
    isNewsroomTopicPublishedAtEligible("2025-01-01T12:00:00.000Z", null, now),
    true,
  );
});

test("une arquivo e recolha atual e conta a origem apenas pelos IDs persistidos elegíveis", () => {
  const origins = classifyNewsroomTopicSearchResultOrigins({
    initialArticleIds: ["available-1", "updated-1"],
    finalArticleIds: ["available-1", "updated-1", "created-eligible", "created-eligible"],
    persistedArticles: [
      { id: "updated-1", action: "updated" },
      { id: "available-1", action: "reused" },
      { id: "created-eligible", action: "created" },
      { id: "created-outside-period", action: "created" },
    ],
  });

  assert.deepEqual(origins, {
    relatedCount: 3,
    availableCount: 2,
    collectedCount: 1,
    collectedIds: ["created-eligible"],
  });
});

test("normaliza o período de pesquisa", () => {
  assert.equal(newsroomTopicPeriod("1"), "1");
  assert.equal(newsroomTopicPeriod("30"), "30");
  assert.equal(newsroomTopicPeriod("invalid"), "7");
  assert.equal(newsroomTopicPeriodDays("7"), 7);
  assert.equal(newsroomTopicPeriodDays("all"), null);
});

test("classifica cada artigo por uma única razão principal, na ordem definida", () => {
  const now = new Date("2026-07-29T20:00:00.000Z");
  const base = {
    processingStatus: "detected",
    publishedAt: "2026-07-28T20:00:00.000Z",
    periodDays: 30,
    now,
    snapshotPresent: true,
    snapshotUsable: true,
    candidate: { title: "FC Porto inicia a preparação" },
    query: "FC Porto pré-época",
  };
  const cases = [
    [{ ...base, processingStatus: "failed", publishedAt: null }, "state_ineligible"],
    [{ ...base, publishedAt: null }, "published_at_missing"],
    [{ ...base, publishedAt: "data-inválida" }, "published_at_invalid"],
    [{ ...base, publishedAt: "2026-07-30T20:00:00.000Z" }, "published_at_future"],
    [{ ...base, publishedAt: "2026-06-01T20:00:00.000Z" }, "outside_period"],
    [{ ...base, snapshotPresent: false, snapshotUsable: false }, "snapshot_missing"],
    [{ ...base, snapshotUsable: false }, "snapshot_unusable"],
    [{ ...base, candidate: { title: "UFC anuncia evento" } }, "entity_missing"],
    [{
      ...base,
      candidate: {
        title: "Mercado de transferências",
        body: "O FC Porto confirmou a informação.",
      },
    }, "body_context_missing"],
    [{ ...base, query: "de e para" }, "relevance_insufficient"],
    [{ ...base, canonicalDuplicate: true }, "canonical_duplicate"],
    [base, "eligible"],
  ] as const;

  const counts = Object.fromEntries(
    NEWSROOM_TOPIC_ARCHIVE_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<(typeof NEWSROOM_TOPIC_ARCHIVE_OUTCOMES)[number], number>;
  for (const [input, expected] of cases) {
    const classification = classifyNewsroomTopicArchiveCandidate(input);
    assert.equal(classification.outcome, expected);
    counts[classification.outcome] += 1;
  }

  assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), cases.length);
  assert.deepEqual(Object.values(counts), NEWSROOM_TOPIC_ARCHIVE_OUTCOMES.map(() => 1));
});

test("o repositório pesquisa todo o arquivo elegível por páginas e identidade canónica", () => {
  const repository = readFileSync(
    "lib/redacao-automatica/newsroom-article-repository.ts",
    "utf8",
  );

  assert.match(repository, /TOPIC_SEARCH_PAGE_SIZE/);
  assert.match(repository, /offset=\$\{offset\}&limit=\$\{TOPIC_SEARCH_PAGE_SIZE\}/);
  assert.match(repository, /classifyNewsroomTopicArchiveMetadata/);
  assert.match(repository, /classifyNewsroomTopicArchiveCandidate/);
  assert.match(repository, /topicDiagnostics: diagnostics/);
  assert.match(repository, /recordTopicOutcome\(diagnostics/);
  assert.match(repository, /function canonicalArticleIdentity/);
  assert.match(repository, /isManualNewsroomSource\(row\.source_code\)/);
  assert.match(repository, /row\.normalized_url\?\.trim\(\) \|\| row\.original_url\?\.trim\(\) \|\| row\.id/);
  assert.match(repository, /published_at=is\.null/);
  assert.match(repository, /last_detected_at=lte\./);
  assert.match(repository, /cooldownHours/);
  assert.match(repository, /scoreNewsroomTopicCandidate/);
  assert.match(repository, /validRecoveryUrl/);
  assert.match(repository, /\.slice\(0, limit\)/);
  assert.match(
    repository,
    /publishedAtPrecision:\s*publishedAtPrecisionFromSourceMetadata\(\s*snapshotRow\?\.source_metadata,\s*\)/,
  );
  assert.doesNotMatch(repository, /published_at\s*\?\?\s*(row\.)?(detected_at|last_detected_at|created_at)/);
  assert.doesNotMatch(
    repository,
    /publishedAtPrecision:\s*publishedAtPrecisionFromSourceMetadata\(\s*row\.published_at/,
  );
  assert.doesNotMatch(repository, /TOPIC_SEARCH_CANDIDATE_LIMIT|TOPIC_SEARCH_RESULT_LIMIT/);
});
