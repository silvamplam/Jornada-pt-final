import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const compositionRoute = fs.readFileSync(path.join(root, "app/api/admin/editorial/composicao/route.ts"), "utf8");
const applySql = fs.readFileSync(
  path.join(root, "supabase/steps/117-composicao-banco-identidade-canonica-apply.sql"),
  "utf8",
);
const postflightSql = fs.readFileSync(
  path.join(root, "supabase/steps/118-composicao-banco-identidade-canonica-postflight.sql"),
  "utf8",
);

test("o banco resolve links de zonas para a publicação canónica e usa os campos do artigo", () => {
  assert.match(compositionRoute, /function canonicalBankPublicationLink/);
  assert.match(compositionRoute, /path\.startsWith\(articlePrefix\)/);
  assert.match(compositionRoute, /path\.startsWith\(contentPrefix\)/);
  assert.match(compositionRoute, /!sourceMatchdayId \|\| sourceMatchdayId === matchdayId/);
  assert.match(compositionRoute, /sourceType: "editorial_article"/);
  assert.match(compositionRoute, /sourceId: article\.id/);
  assert.match(compositionRoute, /imageUrl: article\.image_url/);
  assert.match(compositionRoute, /sourceType: "editorial_content"/);
  assert.match(compositionRoute, /imageUrl: content\.thumbnail_url \|\| content\.image_url/);
  assert.match(compositionRoute, /resolveBankCandidateCanonicalPublication\(matchdayId, candidate\)/);
});

test("links internos sem publicação canónica deixam de criar candidatos órfãos no banco", () => {
  assert.match(
    compositionRoute,
    /if \(!article \|\| !canonicalBankPublicationEligibleForMatchday\(article\.matchday_id, matchdayId\)\) \{\s*return null;/,
  );
  assert.match(
    compositionRoute,
    /if \(!content \|\| !canonicalBankPublicationEligibleForMatchday\(content\.matchday_id, matchdayId\)\) \{\s*return null;/,
  );
  assert.match(compositionRoute, /resolvedCandidates\.filter\(\(item\): item is MatchdayEditorialBankCandidate => Boolean\(item\)\)/);
});

test("a identidade canónica do banco é por jornada e não por linha mutável de zona", () => {
  assert.match(
    applySql,
    /where bank\.matchday_id = p_matchday_id[\s\S]*lower\(btrim\(coalesce\(bank\.source_type, ''\)\)\) = v_source_type[\s\S]*bank\.source_id/,
  );
  assert.match(
    applySql,
    /create unique index matchday_editorial_bank_items_automatic_source_unique_idx[\s\S]*matchday_id,[\s\S]*lower\(btrim\(source_type\)\),[\s\S]*lower\(btrim\(source_id\)\)/i,
  );
  assert.match(applySql, /create or replace function public\.sync_matchday_zone_publication_to_bank/);
  assert.match(applySql, /article\.matchday_id is null or article\.matchday_id = p_matchday_id/);
  assert.match(applySql, /content\.matchday_id is null or content\.matchday_id = p_matchday_id/);
});

test("todas as zonas vivas sincronizam o banco pela ligação canónica e o apply reconcilia legado", () => {
  assert.match(applySql, /sync_matchday_latest_news_to_bank/);
  assert.match(applySql, /sync_matchday_highlights_to_bank/);
  assert.match(applySql, /sync_matchday_horizontal_news_to_bank/);
  assert.match(applySql, /sync_matchday_editorials_to_bank/);
  assert.match(
    applySql,
    /select bank\.matchday_id, bank\.link_url[\s\S]*from public\.matchday_editorial_bank_items bank[\s\S]*sync_matchday_zone_publication_to_bank\(item\.matchday_id, item\.link_url\)/,
  );
  assert.match(postflightSql, /legacy article bank identities remain/);
  assert.match(postflightSql, /legacy content bank identities remain/);
});
