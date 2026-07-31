import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatProvenancePublishedAt } from "@/app/admin/editorial/artigos/_articleProvenance";
import { formatShortDate } from "@/app/admin/editorial/artigos/_articleForm";

import {
  buildEditorialArticleProvenance,
  type ProvenanceDossierSourceRow,
  type ProvenanceSnapshotRow,
} from "./editorial-article-provenance-internal";

const ARTICLE_ID = "20000000-0000-4000-8000-000000000001";
const PLAN_ID = "20000000-0000-4000-8000-000000000002";
const DOSSIER_ID = "20000000-0000-4000-8000-000000000003";
const PROFILE_ID = "20000000-0000-4000-8000-000000000011";
const PROFILE_VERSION_ID = "20000000-0000-4000-8000-000000000012";
const SOURCE_ONE_ID = "20000000-0000-4000-8000-000000000004";
const SOURCE_TWO_ID = "20000000-0000-4000-8000-000000000005";
const NEWSROOM_ONE_ID = "20000000-0000-4000-8000-000000000006";
const NEWSROOM_TWO_ID = "20000000-0000-4000-8000-000000000007";
const FROZEN_ONE_ID = "20000000-0000-4000-8000-000000000008";
const FROZEN_TWO_ID = "20000000-0000-4000-8000-000000000009";

function source(
  overrides: Partial<ProvenanceDossierSourceRow> = {},
): ProvenanceDossierSourceRow {
  return {
    id: SOURCE_ONE_ID,
    newsroom_article_id: NEWSROOM_ONE_ID,
    newsroom_snapshot_id: FROZEN_ONE_ID,
    source_role: "primary",
    sort_order: 10,
    editorial_note: "Synthetic note",
    title_snapshot: "Frozen synthetic title",
    published_at_snapshot: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<ProvenanceSnapshotRow> = {},
): ProvenanceSnapshotRow {
  return {
    id: FROZEN_ONE_ID,
    article_id: NEWSROOM_ONE_ID,
    content_hash: "a".repeat(64),
    source_metadata: {
      sourceCode: "record",
      originalUrl: "https://example.invalid/frozen-original",
      normalizedUrl: "https://example.invalid/frozen-normalized",
      publishedAtPrecision: "instant",
    },
    extracted_at: "2026-07-29T10:01:00.000Z",
    ...overrides,
  };
}

function build(
  overrides: Partial<Parameters<typeof buildEditorialArticleProvenance>[0]> = {},
) {
  return buildEditorialArticleProvenance({
    editorialArticleId: ARTICLE_ID,
    editorialArticleStatus: "draft",
    plan: {
      id: PLAN_ID,
      dossier_id: DOSSIER_ID,
      editorial_article_id: ARTICLE_ID,
      working_title: "Synthetic working title",
      article_kind: "news",
      length_mode: "standard",
      status: "ready",
      editorial_instructions: "Synthetic persisted instructions",
      created_at: "2026-07-30T09:00:00.000Z",
      editorial_profile_id: PROFILE_ID,
      editorial_profile_version_id: PROFILE_VERSION_ID,
      editorial_profile_pinned_at: "2026-07-30T09:01:00.000Z",
    },
    dossier: {
      id: DOSSIER_ID,
      title: "Synthetic dossier",
      status: "draft",
      output_language: "pt-PT",
    },
    assignments: [{ dossier_source_id: SOURCE_ONE_ID, sort_order: 1 }],
    dossierSources: [source()],
    newsroomArticles: [{
      id: NEWSROOM_ONE_ID,
      source_code: "changed-current-source",
      title: "Changed current title",
      original_url: "https://example.invalid/current-original",
      normalized_url: "https://example.invalid/current-normalized",
      published_at: "2026-07-30T12:00:00.000Z",
    }],
    snapshots: [snapshot()],
    generation: {
      provider: "synthetic-provider",
      model: "synthetic-model",
      prompt_version: "synthetic-v1",
      provider_response_id: "synthetic-response",
      input_hash: "b".repeat(64),
      input_tokens: 10,
      output_tokens: 20,
      editorial_profile_id: PROFILE_ID,
      editorial_profile_version_id: PROFILE_VERSION_ID,
      editorial_profile_version_number: 1,
      editorial_profile_content_hash: "c".repeat(64),
      editorial_profile_state_at_generation: "active",
      editorial_profile_version_created_at: "2026-07-30T08:00:00.000Z",
      editorial_profile_pinned_at: "2026-07-30T09:01:00.000Z",
      generated_body_hash: "d".repeat(64),
      created_at: "2026-07-30T09:05:00.000Z",
    },
    editorialProfile: {
      id: PROFILE_ID,
      code: "jornada-pt",
      name: "Linha editorial da Jornada.pt",
    },
    ...overrides,
  });
}

test("a proveniência usa o snapshot exato e os valores congelados, nunca o mais recente", () => {
  const newerSnapshot = snapshot({
    id: "20000000-0000-4000-8000-000000000010",
    content_hash: "f".repeat(64),
    extracted_at: "2026-07-30T12:01:00.000Z",
  });
  const provenance = build({ snapshots: [newerSnapshot, snapshot()] });
  const frozen = provenance.sources[0];

  assert.equal(frozen.newsroomSnapshotId, FROZEN_ONE_ID);
  assert.equal(frozen.contentHash, "a".repeat(64));
  assert.equal(frozen.extractedAt, "2026-07-29T10:01:00.000Z");
  assert.equal(frozen.title, "Frozen synthetic title");
  assert.equal(frozen.publishedAt, "2026-07-29T10:00:00.000Z");
  assert.equal(frozen.publishedAtPrecision, "instant");
  assert.equal(frozen.sourceCode, "record");
  assert.equal(frozen.originalUrl, "https://example.invalid/frozen-original");
  assert.equal(frozen.titleOrigin, "frozen");
  assert.equal(frozen.publishedAtOrigin, "frozen");
});

test("a proveniência fixa a versão editorial e o hash da primeira versão", () => {
  const generation = build().generation;

  assert.ok(generation);
  assert.equal(generation?.generatedBodyHash, "d".repeat(64));
  assert.deepEqual(generation?.editorialProfile, {
    profileId: PROFILE_ID,
    profileCode: "jornada-pt",
    profileName: "Linha editorial da Jornada.pt",
    versionId: PROFILE_VERSION_ID,
    versionNumber: 1,
    contentHash: "c".repeat(64),
    stateAtGeneration: "active",
    versionCreatedAt: "2026-07-30T08:00:00.000Z",
    pinnedAt: "2026-07-30T09:01:00.000Z",
  });
});

test("uma geração legacy permanece legível sem inventar versão editorial", () => {
  const legacy = build({
    generation: {
      provider: "synthetic-provider",
      model: "synthetic-model",
      prompt_version: "dossier-article-plan-body-v1",
      provider_response_id: null,
      input_hash: "e".repeat(64),
      input_tokens: null,
      output_tokens: null,
      created_at: "2026-07-30T09:05:00.000Z",
    },
    editorialProfile: null,
  }).generation;

  assert.ok(legacy);
  assert.equal(legacy?.editorialProfile, null);
  assert.equal(legacy?.generatedBodyHash, null);
});

test("a precisao publicada vem apenas dos metadados do snapshot congelado", () => {
  const frozenDateMetadata = {
    sourceCode: "record",
    originalUrl: "https://example.invalid/frozen-original",
    normalizedUrl: "https://example.invalid/frozen-normalized",
    publishedAtPrecision: "date",
  };
  const dateOnly = build({
    dossierSources: [source({
      published_at_snapshot: "2026-07-29T00:00:00.000Z",
    })],
    snapshots: [snapshot({ source_metadata: frozenDateMetadata })],
  }).sources[0];
  const instant = build({
    snapshots: [snapshot({
      source_metadata: {
        ...frozenDateMetadata,
        publishedAtPrecision: "instant",
      },
    })],
  }).sources[0];
  const missing = build({
    dossierSources: [source({
      published_at_snapshot: "2026-07-29T00:00:00.000Z",
    })],
    snapshots: [snapshot({
      source_metadata: {
        ...frozenDateMetadata,
        publishedAtPrecision: undefined,
      },
    })],
  }).sources[0];
  const unknown = build({
    snapshots: [snapshot({
      source_metadata: {
        ...frozenDateMetadata,
        publishedAtPrecision: "estimated",
      },
    })],
  }).sources[0];
  const newerSnapshot = snapshot({
    id: "20000000-0000-4000-8000-000000000010",
    source_metadata: {
      ...frozenDateMetadata,
      publishedAtPrecision: "instant",
    },
  });
  const frozenWins = build({
    snapshots: [
      newerSnapshot,
      snapshot({ source_metadata: frozenDateMetadata }),
    ],
  }).sources[0];

  assert.equal(dateOnly.publishedAtPrecision, "date");
  assert.equal(instant.publishedAtPrecision, "instant");
  assert.equal(missing.publishedAtPrecision, null);
  assert.equal(unknown.publishedAtPrecision, null);
  assert.equal(frozenWins.newsroomSnapshotId, FROZEN_ONE_ID);
  assert.equal(frozenWins.publishedAtPrecision, "date");
  assert.equal(dateOnly.publishedAt, "2026-07-29T00:00:00.000Z");
  assert.equal(missing.publishedAtPrecision, null);
});

test("a data publicada respeita date, instant e fallback legacy", () => {
  const dateOnly = formatProvenancePublishedAt(
    "2026-07-29T00:00:00.000Z",
    "date",
  );
  const instant = formatProvenancePublishedAt(
    "2026-07-29T21:34:00.000Z",
    "instant",
  );
  const legacyValue = "2026-07-29T00:00:00.000Z";
  const legacy = formatProvenancePublishedAt(legacyValue, null);

  assert.equal(dateOnly, "29/07/2026");
  assert.doesNotMatch(dateOnly, /00:00|01:00|as|às/i);
  assert.match(instant, /^29\/07\/2026, \d{2}:34$/);
  assert.equal(legacy, formatShortDate(legacyValue));
  assert.match(legacy, /\d{2}:\d{2}/);
  assert.equal(
    formatProvenancePublishedAt("data-invalida", "date"),
    "data-invalida",
  );
});

test("fontes seguem a ordem persistida e preservam função, prioridade e relação", () => {
  const provenance = build({
    assignments: [
      { dossier_source_id: SOURCE_TWO_ID, sort_order: 2 },
      { dossier_source_id: SOURCE_ONE_ID, sort_order: 7 },
    ],
    dossierSources: [
      source(),
      source({
        id: SOURCE_TWO_ID,
        newsroom_article_id: NEWSROOM_TWO_ID,
        newsroom_snapshot_id: FROZEN_TWO_ID,
        source_role: "context",
        sort_order: 20,
        editorial_note: null,
      }),
    ],
    newsroomArticles: [],
    snapshots: [
      snapshot(),
      snapshot({
        id: FROZEN_TWO_ID,
        article_id: NEWSROOM_TWO_ID,
        content_hash: "c".repeat(64),
      }),
    ],
  });

  assert.deepEqual(
    provenance.sources.map((item) => [item.dossierSourceId, item.sourceRole, item.priority]),
    [
      [SOURCE_TWO_ID, "context", 2],
      [SOURCE_ONE_ID, "primary", 7],
    ],
  );
  assert.equal(provenance.article.planId, PLAN_ID);
  assert.equal(provenance.dossier.id, DOSSIER_ID);
});

test("dados legacy em falta têm fallback explícito e identidade incompatível não é inventada", () => {
  const legacy = build({
    dossierSources: [source({
      title_snapshot: null,
      published_at_snapshot: null,
    })],
    snapshots: [snapshot({ source_metadata: {} })],
    generation: null,
  }).sources[0];
  assert.equal(legacy.title, "Changed current title");
  assert.equal(legacy.titleOrigin, "legacy_current_article");
  assert.equal(legacy.publishedAtOrigin, "legacy_current_article");
  assert.equal(legacy.originalUrlOrigin, "legacy_current_article");

  const mismatch = build({
    snapshots: [snapshot({ article_id: NEWSROOM_TWO_ID })],
  }).sources[0];
  assert.equal(mismatch.snapshotMatchesArticle, false);
  assert.equal(mismatch.contentHash, null);
  assert.equal(mismatch.extractedAt, null);
});

test("repository e painel são read-only, não carregam corpo de snapshots nem expõem segredos", () => {
  const repository = readFileSync(
    "lib/redacao-automatica/editorial-article-provenance-repository.ts",
    "utf8",
  );
  const internal = readFileSync(
    "lib/redacao-automatica/editorial-article-provenance-internal.ts",
    "utf8",
  );
  const panel = readFileSync(
    "app/admin/editorial/artigos/_articleProvenance.tsx",
    "utf8",
  );
  assert.match(repository, /newsroom_snapshot_id/);
  assert.match(repository, /&id=in\.\(\$\{uuidList\(snapshotIds\)\}\)/);
  assert.match(repository, /if \(!plan\) \{\s*return \{ ok: true, value: null \};/);
  assert.doesNotMatch(repository, /order=extracted_at\.desc/);
  assert.doesNotMatch(
    repository,
    /newsroom_article_snapshots\?select=[^"\n]*\bbody\b/,
  );
  assert.doesNotMatch(repository, /writeSupabase/);
  assert.match(
    internal,
    /publishedAtPrecisionFromSourceMetadata\(snapshot\?\.source_metadata\)/,
  );
  assert.doesNotMatch(
    internal,
    /publishedAtPrecision[\s\S]{0,120}(published_at_snapshot|article\?\.published_at)/,
  );
  assert.match(panel, /Proveniência da Redação Automática/);
  assert.match(panel, /primeira versão/);
  assert.match(
    panel,
    /formatProvenancePublishedAt\(source\.publishedAt, source\.publishedAtPrecision\)/,
  );
  assert.match(panel, /formatShortDate\(source\.extractedAt\)/);
  assert.match(panel, /formatShortDate\(provenance\.generation\.generatedAt\)/);
  assert.match(panel, /Linha editorial usada/);
  assert.match(panel, /generatedBodyHash/);
  assert.match(panel, /Geração legacy/);
  assert.doesNotMatch(panel, /api[_-]?key|authorization|cookie|headers/i);
  assert.doesNotMatch(panel, /Publicar artigo/);
});

test("a revisão regressa ao mesmo artigo sem expor a proveniência técnica", () => {
  const page = readFileSync("app/admin/editorial/artigos/page.tsx", "utf8");
  const route = readFileSync("app/api/admin/editorial/artigos/route.ts", "utf8");
  const repository = readFileSync(
    "lib/redacao-automatica/editorial-article-provenance-repository.ts",
    "utf8",
  );

  assert.doesNotMatch(page, /getEditorialArticleProvenance|ArticleProvenancePanel/);
  assert.match(
    page,
    /returnTo=\{[\s\S]*`\/admin\/editorial\/artigos\?articleId=\$\{encodeURIComponent\(selectedArticle\.id\)\}`/,
  );
  assert.match(repository, /generated_body_hash/);
  assert.doesNotMatch(
    route,
    /newsroom_editorial_dossier_article_plan_generations|generated_body_hash|generated_body/,
  );
  assert.match(route, /editorialAction === "publish"/);
});
