import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createManualNewsroomSourcePersistence,
  createManualNewsroomSourceWorkflow,
  deriveManualSourceTechnicalTitle,
  MANUAL_NEWSROOM_BODY_MAX_LENGTH,
  normalizeManualNewsroomSource,
  normalizeManualSourceHttpUrl,
  type ManualNewsroomSourceRpcArguments,
} from "@/lib/redacao-automatica/manual-newsroom-source-internal";

const SUBMISSION_ID = "51000000-0000-4000-8000-000000000001";
const ARTICLE_ID = "51000000-0000-4000-8000-000000000002";
const SNAPSHOT_ID = "51000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-09-20T10:00:00.000Z");

function validInput(overrides: Partial<{
  submissionId: string;
  body: string;
  imageUrl: string;
  publishedDate: string | null;
  sourceUrl: string | null;
  sourcePageTitle: string | null;
  sourceHost: string | null;
}> = {}) {
  return {
    submissionId: SUBMISSION_ID,
    body: "Primeira frase significativa da fonte. Continuação do primeiro parágrafo.\r\n\r\nSegundo parágrafo integral.",
    imageUrl: "https://media.example.test/noticia/imagem.webp",
    publishedDate: null,
    sourceUrl: null,
    sourcePageTitle: null,
    sourceHost: null,
    ...overrides,
  };
}

test("fonte manual exige apenas Corpo e Imagem e deriva o título técnico", () => {
  const result = normalizeManualNewsroomSource(validInput(), { now: NOW });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.technicalTitle, "Primeira frase significativa da fonte.");
  assert.equal(result.value.publishedDate, null);
  assert.equal(result.value.sourceUrl, null);
  assert.deepEqual(result.value.bodyBlocks, [
    { type: "paragraph", text: "Primeira frase significativa da fonte. Continuação do primeiro parágrafo." },
    { type: "paragraph", text: "Segundo parágrafo integral." },
  ]);
  assert.equal(Object.hasOwn(result.value, "author"), false);
  assert.match(result.value.requestFingerprint, /^[0-9a-f]{64}$/);
  assert.match(result.value.contentHash, /^[0-9a-f]{64}$/);
});

test("título técnico é determinístico e respeita o limite existente", () => {
  const long = `  ${"Palavra ".repeat(40)}\n\nOutro parágrafo.`;
  const first = deriveManualSourceTechnicalTitle(long);
  const second = deriveManualSourceTechnicalTitle(long);
  assert.equal(first, second);
  assert.equal(first.length, 180);
  assert.equal(first, first.trimEnd());
});

test("valida Corpo, Imagem e Data opcional sem inventar publicação", () => {
  for (const [input, code] of [
    [validInput({ body: "" }), "body_invalid"],
    [validInput({ body: "x".repeat(MANUAL_NEWSROOM_BODY_MAX_LENGTH + 1) }), "body_invalid"],
    [validInput({ imageUrl: "" }), "image_invalid"],
    [validInput({ imageUrl: "data:image/png;base64,abc" }), "image_invalid"],
    [validInput({ imageUrl: "https://user:pass@media.example.test/image.jpg" }), "image_invalid"],
    [validInput({ publishedDate: "2026-02-30" }), "published_date_invalid"],
    [validInput({ publishedDate: "2026-09-21" }), "published_date_future"],
  ] as const) {
    const result = normalizeManualNewsroomSource(input, { now: NOW });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, code);
  }

  const dated = normalizeManualNewsroomSource(validInput({
    publishedDate: "2026-09-19",
  }), { now: NOW });
  assert.equal(dated.ok, true);
  if (dated.ok) assert.equal(dated.value.publishedDate, "2026-09-19");
});

test("URLs técnicas aceitam só http/https sem credentials", () => {
  assert.equal(
    normalizeManualSourceHttpUrl("https://media.example.test/a.jpg"),
    "https://media.example.test/a.jpg",
  );
  for (const invalid of [
    "data:image/png;base64,abc",
    "blob:https://example.test/id",
    "javascript:alert(1)",
    "https://user:pass@example.test/a.jpg",
    "",
  ]) assert.equal(normalizeManualSourceHttpUrl(invalid), undefined);

  const source = normalizeManualNewsroomSource(validInput({
    sourceUrl: "https://Example.test/noticia#comentarios",
    sourcePageTitle: "  Título   da página  ",
    sourceHost: "valor-não-confiável.test",
  }), { now: NOW });
  assert.equal(source.ok, true);
  if (!source.ok) return;
  assert.equal(source.value.sourceUrl, "https://example.test/noticia");
  assert.equal(source.value.sourcePageTitle, "Título da página");
  assert.equal(source.value.sourceHost, "example.test");
});

test("mesma submission é idempotente e payload diferente falha explicitamente", async () => {
  const requests = new Map<string, { fingerprint: string; args: ManualNewsroomSourceRpcArguments }>();
  let createCount = 0;
  const rpcCalls: ManualNewsroomSourceRpcArguments[] = [];
  const persist = createManualNewsroomSourcePersistence({
    isConfigured: () => true,
    async executeRpc(_name, args) {
      rpcCalls.push(args);
      const existing = requests.get(args.p_submission_id);
      if (existing && existing.fingerprint !== args.p_request_fingerprint) {
        throw new Error("manual_source_payload_conflict");
      }
      if (!existing) {
        createCount += 1;
        requests.set(args.p_submission_id, { fingerprint: args.p_request_fingerprint, args });
      }
      return [{
        submission_id: args.p_submission_id,
        request_fingerprint: args.p_request_fingerprint,
        newsroom_article_id: ARTICLE_ID,
        newsroom_snapshot_id: SNAPSHOT_ID,
        entry_action: existing ? "reused" : "created",
      }];
    },
  });

  const first = await persist(validInput(), { now: NOW });
  const repeated = await persist(validInput(), { now: NOW });
  const conflict = await persist(validInput({ body: "Corpo diferente e válido." }), { now: NOW });
  assert.equal(first.ok && first.value.action, "created");
  assert.equal(repeated.ok && repeated.value.action, "reused");
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "submission_payload_conflict");
  assert.equal(createCount, 1);
  const lastArgs = rpcCalls.at(-1);
  assert.ok(lastArgs);
  assert.equal(lastArgs && Object.hasOwn(lastArgs, "p_author"), false);
  assert.equal(lastArgs.p_published_date, null);
});

test("uma fonte manual nova permanece sem classificação automática", async () => {
  const persisted = await createManualNewsroomSourcePersistence({
    isConfigured: () => true,
    async executeRpc(_name, args) {
      return [{
        submission_id: args.p_submission_id,
        request_fingerprint: args.p_request_fingerprint,
        newsroom_article_id: ARTICLE_ID,
        newsroom_snapshot_id: SNAPSHOT_ID,
        entry_action: "created",
      }];
    },
  })(validInput(), { now: NOW });
  assert.equal(persisted.ok, true);

  const workflow = createManualNewsroomSourceWorkflow({
    persist: async () => persisted,
  });
  const result = await workflow(validInput());
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.newsroomArticleId, ARTICLE_ID);
});

test("migration persiste uma fonte compatível com NOVAS e sem autor inventado", () => {
  const migration = readFileSync(path.join(
    process.cwd(),
    "supabase/migrations/20260920115213_manual_newsroom_source_v1.sql",
  ), "utf8");
  const readModel = readFileSync(path.join(
    process.cwd(),
    "supabase/migrations/20260914074012_newsroom_mesa_scoped_read_model_v1.sql",
  ), "utf8");
  assert.match(migration, /'manual_entry', p_source_url, p_source_url, null/);
  assert.match(migration, /null, null, null, v_published_at/);
  assert.match(migration, /'ready_for_review'/);
  assert.match(migration, /'publishedAtPrecision', case when v_published_at is null then null else 'date' end/);
  assert.match(migration, /p_body,\s*v_source_metadata/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(readModel, /case when candidate\.is_published then 'published' else 'new' end/);
  assert.match(readModel, /article\.first_detected_at >= p_cycle_started_at/);
  assert.doesNotMatch(readModel, /article\.source_code\s*<>\s*'manual_entry'/);
});
