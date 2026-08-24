import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  "app/admin/editorial/artigos/page.tsx",
  "utf8",
);

const routeSource = readFileSync(
  "app/api/admin/editorial/artigos/route.ts",
  "utf8",
);

const migrationSource = readFileSync(
  "supabase/migrations/20260824150020_editorial_article_canonical_delete_cleanup.sql",
  "utf8",
);

test("Seleção editorial entra em Ligado em e bloqueia eliminação", () => {
  assert.match(
    pageSource,
    /matchday_live_layout_items\?select=id,matchday_id,slot_type,source_type,source_id,title,link_url/,
  );
  assert.match(
    pageSource,
    /"Seleção editorial"/,
  );
  assert.match(
    routeSource,
    /matchday_live_layout_items\?select=id&source_type=eq\.editorial_article&source_id=eq\.\$\{encodeURIComponent\(articleId\)\}/,
  );
});

test("Desvincular Seleção elimina o slot e valida a identidade do artigo", () => {
  assert.match(
    routeSource,
    /target\.table === "matchday_live_layout_items"/,
  );
  assert.match(
    routeSource,
    /row\.source_id\?\.trim\(\)\.toLowerCase\(\) !== article\.id\.toLowerCase\(\)/,
  );
  assert.match(
    routeSource,
    /matchday_live_layout_items\?id=eq\.\$\{encodeURIComponent\(targetId\)\}/,
  );
  assert.match(
    routeSource,
    /\{ method: "DELETE" \}/,
  );
});

test("DELETE canónico limpa toda a identidade temática interna", () => {
  for (const table of [
    "matchday_live_layout_items",
    "matchday_editorial_profile_manual_overrides",
    "matchday_editorial_profile_zone_items",
    "matchday_editorial_profile_state_items",
    "matchday_reference_composition_items",
    "matchday_editorial_bank_items",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`delete from public\\.${table}`),
      `falta limpeza de ${table}`,
    );
  }

  assert.match(
    migrationSource,
    /v_source_id := lower\(old\.id::text\);/,
  );
});

test("Desvincular Últimas elimina a linha inteira", () => {
  assert.match(
    routeSource,
    /target\.table === "matchday_latest_news"/,
  );

  assert.match(
    routeSource,
    /matchday_latest_news\?id=eq\.\$\{encodeURIComponent\(targetId\)\}/,
  );

  assert.match(
    routeSource,
    /\{ method: "DELETE" \}/,
  );
});

test("DELETE direto também limpa Últimas pela URL canónica", () => {
  const latestMigrationSource = readFileSync(
    "supabase/migrations/20260824151907_editorial_article_canonical_delete_latest_cleanup.sql",
    "utf8",
  );

  assert.match(
    latestMigrationSource,
    /delete from public\.matchday_latest_news/,
  );

  assert.match(
    latestMigrationSource,
    /'\/noticias\/' \|\| old\.slug/,
  );
});