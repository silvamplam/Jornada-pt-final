import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SHORT_RPC_NAME = "newsroom_apply_generated_article";
const INVALID_LONG_RPC_NAME =
  "newsroom_apply_complete_editorial_dossier_article_plan_generation";
const TRUNCATED_LEGACY_RPC_NAME =
  "newsroom_apply_complete_editorial_dossier_article_plan_generati";

test("a geração usa uma RPC cujo nome cabe no limite do PostgreSQL", () => {
  const service = readFileSync(
    "lib/redacao-automatica/editorial-dossier-article-plan-generation-service.ts",
    "utf8",
  );
  const applySql = readFileSync(
    "supabase/steps/50-redacao-automatica-imagens-locais-escolha-manual-apply.sql",
    "utf8",
  );
  const postflightSql = readFileSync(
    "supabase/steps/51-redacao-automatica-imagens-locais-escolha-manual-postflight.sql",
    "utf8",
  );

  assert.ok(SHORT_RPC_NAME.length <= 63);
  assert.ok(INVALID_LONG_RPC_NAME.length > 63);

  assert.match(service, new RegExp(`rpc/${SHORT_RPC_NAME}`));
  assert.doesNotMatch(service, new RegExp(INVALID_LONG_RPC_NAME));

  assert.match(
    applySql,
    new RegExp(`create or replace function public\\.${SHORT_RPC_NAME}`),
  );
  assert.match(
    applySql,
    new RegExp(`drop function if exists public\\.${TRUNCATED_LEGACY_RPC_NAME}`),
  );
  assert.match(postflightSql, new RegExp(`public\\.${SHORT_RPC_NAME}`));
});
