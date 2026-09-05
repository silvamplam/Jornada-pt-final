import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/editorial-article-live-snapshot-sync.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql",
  "utf8",
);

function sqlSection(start: string, end: string) {
  const startAt = migration.indexOf(start);
  assert.ok(startAt >= 0, `missing SQL section: ${start}`);
  const endAt = migration.indexOf(end, startAt + start.length);
  assert.ok(endAt > startAt, `missing SQL section end: ${end}`);
  return migration.slice(startAt, endAt);
}

const snapshotRpc = sqlSection(
  "create function public.sync_editorial_article_live_snapshots_v15(",
  "revoke all on function public.sync_editorial_article_live_snapshots_v15(",
);

test("snapshot de artigo tem um unico entrypoint runtime transacional", () => {
  assert.match(source, /rpc\/sync_editorial_article_live_snapshots_v15/);
  assert.equal((source.match(/writeSupabaseAdminReturning/g) ?? []).length, 2);
  assert.doesNotMatch(
    source,
    /fetchSupabaseAdminTable|writeSupabaseAdmin\(|Promise\.all|method:\s*"PATCH"/,
  );
  assert.doesNotMatch(source, /createEditorialArticleLiveSnapshotSync/);
});

test("RPC atualiza Bank e compatibility sem alterar placement ou classificacao", () => {
  assert.match(snapshotRpc, /update public\.matchday_editorial_bank_items/);
  assert.match(snapshotRpc, /begin_matchday_live_layout_downstream_v14/);
  assert.match(snapshotRpc, /refresh_matchday_live_layout_legacy/);
  assert.doesNotMatch(
    snapshotRpc,
    /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.matchday_live_layout_placements/i,
  );
  assert.doesNotMatch(
    snapshotRpc,
    /classification_(?:key|source)\s*=|classified_at\s*=/,
  );
});

test("RPC inclui Bank sem placement e snapshots de artigo colocado", () => {
  assert.match(snapshotRpc, /source_type[\s\S]*'editorial_article'/);
  assert.match(snapshotRpc, /source_id[\s\S]*p_article_id::text/);
  for (const table of [
    "matchday_editorials",
    "matchday_highlights",
    "matchday_latest_news",
    "matchday_horizontal_news",
    "matchday_live_layout_items",
  ]) {
    assert.match(snapshotRpc, new RegExp(`public\\.${table}`));
  }
});
