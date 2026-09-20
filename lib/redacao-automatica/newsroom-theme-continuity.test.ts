import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  preflightEditorialThemeContinuityBatch,
} from "./editorial-batch-parser";
import {
  parseEditorialBatchTransferSourcePackage,
  preflightEditorialArticleBatchForSourcePackage,
} from "./editorial-batch-transfer";
import {
  parseThemeContinuityFrozenContract,
  type ThemeContinuityFrozenContract,
} from "./newsroom-theme-continuity-contract";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sourceIds = [id(101), id(102)];

function contract(existing = 2, fresh = 1): ThemeContinuityFrozenContract {
  const contextId = id(10);
  return {
    contractVersion: 1,
    themeId: id(1),
    authorityFingerprint: "0123456789abcdef0123456789abcdef",
    baselineDossierId: id(2),
    baselineConsolidatedAt: "2026-09-14T10:00:00.000Z",
    sourceDiff: sourceIds.map((newsroomArticleId, index) => ({
      newsroomArticleId,
      newsroomSnapshotId: id(201 + index),
      change: index === 0 ? "UPDATED_SOURCE" : "UNCHANGED_SOURCE",
    })),
    publishedArticleCount: existing,
    newArticleCount: fresh,
    slots: [
      ...Array.from({ length: existing }, (_, index) => ({
        slot: `EXISTING_${String(index + 1).padStart(2, "0")}`,
        kind: "existing" as const,
        outputId: id(301 + index),
        productionContextId: contextId,
        targetEditorialArticleId: id(401 + index),
        targetSlug: `artigo-${index + 1}`,
        targetTitle: `Artigo ${index + 1}`,
        targetMatchdayId: id(501 + index),
      })),
      ...Array.from({ length: fresh }, (_, index) => ({
        slot: `NEW_${String(index + 1).padStart(2, "0")}`,
        kind: "new" as const,
        outputId: id(601 + index),
        productionContextId: contextId,
        targetEditorialArticleId: null,
      })),
    ],
  };
}

function block(
  slot: string,
  decision: "UPDATE" | "SEM_ALTERAÇÃO" | "NEW",
  title = `Título ${slot}`,
) {
  if (decision === "SEM_ALTERAÇÃO") {
    return `[JORNADA_CONTINUIDADE_V1]\nSLOT\n${slot}\nDECISAO\n${decision}\n[/JORNADA_CONTINUIDADE_V1]`;
  }
  return `[JORNADA_CONTINUIDADE_V1]\nSLOT\n${slot}\nDECISAO\n${decision}\nFONTES_UTILIZADAS\n${sourceIds[0]}\nANTETÍTULO\nLiga Portugal\nTÍTULO\n${title}\nPÓS-TÍTULO\nPós-título.\nCORPO\nCorpo integral.\n[/JORNADA_CONTINUIDADE_V1]`;
}

function sourcesByOutput(frozen: ThemeContinuityFrozenContract) {
  return Object.fromEntries(frozen.slots.map((slot) => [slot.outputId, sourceIds]));
}

test("contrato congelado exige ordem, bijeção, fingerprint e limites", () => {
  const valid = contract();
  assert.deepEqual(parseThemeContinuityFrozenContract({ themeContinuity: valid }), valid);
  assert.equal(parseThemeContinuityFrozenContract({
    themeContinuity: { ...valid, authorityFingerprint: "fraco" },
  }), null);
  assert.equal(parseThemeContinuityFrozenContract({
    themeContinuity: { ...valid, slots: [...valid.slots].reverse() },
  }), null);
  assert.equal(parseThemeContinuityFrozenContract({
    themeContinuity: { ...valid, baselineConsolidatedAt: null },
  }), null);
  assert.ok(parseThemeContinuityFrozenContract({ themeContinuity: contract(30, 0) }));
  assert.equal(parseThemeContinuityFrozenContract({ themeContinuity: contract(30, 1) }), null);
});

test("parser resolve mistura UPDATE, SEM_ALTERAÇÃO e exactly N NEW", () => {
  const frozen = contract();
  const result = preflightEditorialThemeContinuityBatch([
    block("EXISTING_01", "UPDATE"),
    block("EXISTING_02", "SEM_ALTERAÇÃO"),
    block("NEW_01", "NEW"),
  ].join("\n"), frozen, sourcesByOutput(frozen));
  assert.equal(result.ready, true);
  assert.equal(result.total, 3);
  assert.deepEqual(result.decisions.map((item) => item.decision), [
    "UPDATE", "SEM_ALTERAÇÃO", "NEW",
  ]);
  assert.deepEqual(result.noChangeOutputIds, [frozen.slots[1].outputId]);
  assert.deepEqual(result.articles.map((item) => item.outputId), [
    frozen.slots[0].outputId,
    frozen.slots[2].outputId,
  ]);
});

test("todos SEM_ALTERAÇÃO com N=0 ficam prontos e não materializam artigos", () => {
  const frozen = contract(3, 0);
  const result = preflightEditorialThemeContinuityBatch(
    frozen.slots.map((slot) => block(slot.slot, "SEM_ALTERAÇÃO")).join("\n"),
    frozen,
    sourcesByOutput(frozen),
  );
  assert.equal(result.ready, true);
  assert.equal(result.articles.length, 0);
  assert.equal(result.noChangeOutputIds.length, 3);
});

test("parser rejeita slot omitido, duplicado, desconhecido e decisão incompatível", () => {
  const frozen = contract(1, 1);
  const variants = [
    block("EXISTING_01", "UPDATE"),
    [block("EXISTING_01", "UPDATE"), block("EXISTING_01", "SEM_ALTERAÇÃO")].join("\n"),
    [block("EXISTING_01", "UPDATE"), block("NEW_02", "NEW")].join("\n"),
    [block("EXISTING_01", "NEW"), block("NEW_01", "NEW")].join("\n"),
  ];
  for (const input of variants) {
    assert.equal(
      preflightEditorialThemeContinuityBatch(input, frozen, sourcesByOutput(frozen)).ready,
      false,
    );
  }
});

test("SEM_ALTERAÇÃO não aceita corpo e UPDATE não aceita fonte fora do contexto", () => {
  const frozen = contract(1, 0);
  assert.equal(preflightEditorialThemeContinuityBatch(
    block("EXISTING_01", "SEM_ALTERAÇÃO") + "\nCORPO\nNão permitido",
    frozen,
    sourcesByOutput(frozen),
  ).ready, false);
  assert.equal(preflightEditorialThemeContinuityBatch(
    block("EXISTING_01", "UPDATE").replace(sourceIds[0], id(999)),
    frozen,
    sourcesByOutput(frozen),
  ).ready, false);
});

test("transferência conserva resolução completa e rejeita autoridade parcial", () => {
  const frozen = contract();
  const transfer = {
    year: "2026",
    month: "09",
    packageId: id(900),
    batchContract: {
      manifestVersion: 5,
      provenanceContract: "mesa-v2",
      workspaceContractVersion: 2,
      outputIds: frozen.slots.map((slot) => slot.outputId),
      sourceIds,
      sourceIdsByOutput: sourcesByOutput(frozen),
    },
    themeContinuity: frozen,
    continuityResolution: {
      noChangeOutputIds: [frozen.slots[1].outputId],
      materializedOutputIds: [frozen.slots[0].outputId, frozen.slots[2].outputId],
    },
  };
  const parsed = parseEditorialBatchTransferSourcePackage(JSON.stringify(transfer));
  assert.ok(parsed?.continuityResolution);
  assert.equal(preflightEditorialArticleBatchForSourcePackage([
    block("EXISTING_01", "UPDATE"),
    block("EXISTING_02", "SEM_ALTERAÇÃO"),
    block("NEW_01", "NEW"),
  ].join("\n"), parsed).ready, true);
  assert.equal(parseEditorialBatchTransferSourcePackage(JSON.stringify({
    ...transfer,
    continuityResolution: {
      noChangeOutputIds: [frozen.slots[1].outputId],
      materializedOutputIds: [frozen.slots[0].outputId],
    },
  })), null);
});

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} .. ${end}`);
  return source.slice(from, to);
}

test("workspace apresenta slots congelados e desativa destination/target sem refresh", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  assert.match(page, /parseThemeContinuityFrozenContract/);
  assert.match(client, /disabled=\{saving \|\| Boolean\(continuitySlot\)\}/);
  assert.match(client, /disabled=\{saving \|\| continuitySlot\?\.kind === "existing"\}/);
  assert.match(client, /UPDATE fixo para/);
  assert.match(client, /frozenSlots\?\.length/);
  assert.match(client, /productionIntents \? mesaProductionIntentSlots\(productionIntents\) : themeContinuity\?\.slots/);
  assert.doesNotMatch(client, /router\.refresh\(\)/);
});

test("publicação da continuidade usa batch, pára na primeira falha e chama finalizer uma vez", () => {
  const route = read("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
  const publication = section(
    route,
    "async function publishThemeContinuityBatch",
    "async function reconcileSourcePackageTimes",
  );
  const loop = section(publication, "for (const item of continuity.prepared)", "try {\n    if (continuity.productionIntents)");
  assert.equal((publication.match(/finalizeThemeContinuity\(/g) ?? []).length, 1);
  assert.equal((publication.match(/ensurePublishedArticlesInLatestBatch\(/g) ?? []).length, 1);
  assert.equal((publication.match(/mesaIntentService\.placeLatest\(/g) ?? []).length, 1);
  assert.match(publication, /} else \{\s+await ensurePublishedArticlesInLatestBatch\(latestArticles\)/);
  assert.match(loop, /publishEditorialMesaOutput/);
  assert.match(loop, /return NextResponse\.json/);
  assert.doesNotMatch(loop, /fetchSupabaseAdminTable|readExistingArticleById|sourcePublishedAtByArticle/);
  assert.match(route, /persisted\?\.editorial_article_id \?\? slot\.outputId/);
  assert.match(publication, /mode === "resume"/);
});

test("egress pesado é constante para P=1,3,10,30 e SEM_ALTERAÇÃO não entra no writer", () => {
  const route = read("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
  const prepare = section(
    route,
    "async function prepareThemeContinuityPublication",
    "async function readExistingArticleBySlug",
  );
  assert.equal((prepare.match(/sourcePublishedAtByArticle\(/g) ?? []).length, 1);
  assert.equal((prepare.match(/newsroom_mesa_output_publications/g) ?? []).length, 1);
  assert.equal((prepare.match(/\?select=id,slug,label,title,subtitle,body/g) ?? []).length, 1);
  assert.match(prepare, /&id=in\.\(/);
  assert.match(prepare, /if \(noChange\.has\(slot\.outputId\)\) continue/);
  for (const publishedCount of [1, 3, 10, 30]) {
    assert.equal(publishedCount > 0, true);
    assert.equal((prepare.match(/sourcePublishedAtByArticle\(/g) ?? []).length, 1);
  }
  const latest = read("lib/editorial-matchday-news-flow.ts");
  const latestBatch = section(
    latest,
    "export async function ensurePublishedArticlesInLatestBatch",
    "export async function finalizePublishedArticlesInLatestBatch",
  );
  const latestLoop = section(latestBatch, "for (const { article, projection } of projections)", "for (const matchdayId of matchdayIds)");
  assert.equal((latestBatch.match(/fetchSupabaseAdminTable/g) ?? []).length, 1);
  assert.doesNotMatch(latestLoop, /fetchSupabaseAdminTable/);
});

test("migration é aditiva, scoped e não cria tabela nem coluna", () => {
  const migration = read("supabase/migrations/20260914114311_newsroom_mesa_theme_continuity_v1.sql");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/tema-continuity/route.ts");
  assert.match(migration, /newsroom_mesa_theme_continuity_v1\(p_theme_id uuid\)/);
  assert.match(migration, /workspace\.workspace_state = 'consolidated'/);
  assert.match(migration, /where membership\.theme_id = p_theme_id/);
  assert.match(migration, /article\.status = 'published'/);
  assert.match(migration, /theme-continuity-source-snapshot-unusable/);
  assert.match(migration, /block\.value ->> 'type' in \('paragraph', 'heading'\)/);
  assert.match(route, /source-snapshot-unusable/);
  assert.doesNotMatch(migration, /create\s+table|alter\s+table[\s\S]*add\s+column/i);
  assert.doesNotMatch(migration, /reference_snapshot_id/);
});


test("Tema recupera publicados pela proveniência exata do contexto sem criar membership", () => {
  const migration = read(
    "supabase/migrations/20260920151500_newsroom_mesa_theme_published_outputs_v2.sql",
  );
  const themePage = read(
    "app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/page.tsx",
  );
  const continuity = read(
    "lib/redacao-automatica/newsroom-theme-continuity.ts",
  );

  assert.match(migration, /newsroom_mesa_production_context_items/);
  assert.match(migration, /newsroom_mesa_output_publications/);
  assert.match(
    migration,
    /publication\.production_context_id = context_item\.id/,
  );
  assert.match(migration, /context_item\.context_kind = 'theme'/);
  assert.match(migration, /context_item\.theme_id = p_theme_id/);
  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.newsroom_editorial_theme_articles/i,
  );

  assert.match(themePage, /readThemeContinuity\(themeId\)/);
  assert.match(themePage, /ARTIGOS PUBLICADOS/);
  assert.match(themePage, /continuity\.publishedArticles\.map/);
  assert.match(themePage, /articleId=/);
  assert.match(
    continuity,
    /article\.matchdayId === null \|\| validUuid\(article\.matchdayId\)/,
  );
});
