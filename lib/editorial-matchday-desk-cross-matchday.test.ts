import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const reader = source("lib/editorial-matchday-desk.ts");
const migration = source("supabase/migrations/20260816094000_matchday_editorial_desk_cross_matchday_history.sql");

test("a Mesa inclui artigos publicados ainda referenciados na jornada mesmo após reclassificação canónica", () => {
  assert.match(reader, /const referencedSlugs = new Set<string>\(\)/);
  assert.match(reader, /latestRows\.forEach\(\(item\) => registerLinkReference\(item\.link_url\)\)/);
  assert.match(reader, /slug=in\.\(\$\{filter\}\)&status=eq\.published/);
  assert.match(reader, /currentArticles\.forEach\(\(article\) => articleMap\.set\(article\.id, article\)\)/);
  assert.match(reader, /referencedArticles\.forEach\(\(article\) => articleMap\.set\(article\.id, article\)\)/);
  assert.doesNotMatch(reader, /não associado com segurança a um artigo publicado desta jornada/);
});

test("o contrato v2 mantém o Apply indisponível até a migration adicional existir", () => {
  assert.match(reader, /matchday_editorial_desk_state_token_v2/);
  assert.match(reader, /apply_matchday_editorial_desk_state_v2/);
});

test("a migration v2 separa classificação canónica de histórico vivo", () => {
  assert.match(migration, /create or replace function public\.matchday_editorial_desk_article_ids_v2/);
  assert.match(migration, /article_row\.matchday_id = p_matchday_id[\s\S]*?union[\s\S]*?published_article\.link_url = btrim\(live_link\.link_url\)/);
  assert.match(migration, /matchday_latest_news as latest_row[\s\S]*?latest_row\.matchday_id = p_matchday_id/);
  assert.match(migration, /article_row\.status = 'published'/);
  assert.match(migration, /matchday_editorial_desk_state_token_v2/);
  assert.match(migration, /apply_matchday_editorial_desk_state_v2/);
});

test("o Apply v2 valida o conjunto histórico e nunca reclassifica o artigo canónico", () => {
  assert.match(migration, /from public\.matchday_editorial_desk_article_ids_v2\(p_matchday_id\)/);
  assert.match(migration, /left join public\.editorial_articles as article_row[\s\S]*?article_row\.status = 'published'/);
  assert.doesNotMatch(migration, /update\s+public\.editorial_articles/i);
  assert.doesNotMatch(migration, /set\s+matchday_id\s*=/i);
});

test("o histórico vivo continua isolado das composições protegidas", () => {
  assert.doesNotMatch(migration, /matchday_reference_compositions/);
  assert.doesNotMatch(migration, /matchday_hierarchical_composition_slots/);
  assert.doesNotMatch(migration, /complementary_mode\s*=/);
});
