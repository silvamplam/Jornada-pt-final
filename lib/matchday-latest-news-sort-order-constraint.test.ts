import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const historicalSchema = source("supabase/sql/fase-editorial-h-matchday-latest-news.sql");
const preflight = source("supabase/steps/100-jornada-ultimas-sort-order-sem-teto-preflight.sql");
const apply = source("supabase/steps/101-jornada-ultimas-sort-order-sem-teto-apply.sql");
const postflight = source("supabase/steps/102-jornada-ultimas-sort-order-sem-teto-postflight.sql");
const smoke = source("supabase/steps/103-jornada-ultimas-sort-order-sem-teto-smoke-rollback.sql");
const newsFlow = source("lib/editorial-matchday-news-flow.ts");

test("a migration documenta o teto historico e le a constraint real sem escrever", () => {
  assert.match(historicalSchema, /matchday_latest_news_sort_order_check check \(sort_order between 1 and 20\)/);
  assert.match(preflight, /set local transaction_read_only = on/);
  assert.match(preflight, /pg_get_constraintdef\(c\.oid\)/);
  assert.match(preflight, /where sort_order < 1/);
  assert.match(preflight, /false as writes_performed/);
  assert.match(preflight, /rollback;/);
});

test("o apply remove apenas o teto e conserva sort_order positivo", () => {
  assert.match(apply, /drop constraint if exists matchday_latest_news_sort_order_check/);
  assert.match(apply, /check \(sort_order >= 1\) not valid/);
  assert.match(apply, /validate constraint matchday_latest_news_sort_order_check/);
  assert.doesNotMatch(apply, /between|sort_order\s*<=|sort_order\s*</i);
  assert.doesNotMatch(apply, /\b(update|delete from|truncate)\b/i);
  assert.doesNotMatch(apply, /editorial_articles/);
});

test("o postflight exige exatamente o minimo sem qualquer maximo", () => {
  assert.match(postflight, /v_normalized_expression <> 'sort_order>=1'/);
  assert.match(postflight, /if not v_constraint_validated/);
  assert.match(postflight, /where sort_order < 1/);
  assert.match(postflight, /set local transaction_read_only = on/);
  assert.match(postflight, /rollback;/);
});

test("o smoke ultrapassa inequivocamente 10 e faz rollback", () => {
  assert.match(smoke, /sort_order_10__', 10/);
  assert.match(smoke, /sort_order_11__', 11/);
  assert.match(smoke, /sort_order_25__', 25/);
  assert.match(smoke, /sort_order_0__', 0/);
  assert.match(smoke, /when check_violation then/);
  assert.match(smoke, /rollback;/);
  assert.doesNotMatch(smoke, /editorial_articles/);
});

test("a transferencia acrescenta a entrada antes de limpar a origem e nao desaloja Ultimas", () => {
  const ensureStart = newsFlow.indexOf("export async function ensurePublishedArticleInLatest");
  const ensureEnd = newsFlow.indexOf("export async function placePublishedArticleInitially", ensureStart);
  const ensureBlock = newsFlow.slice(ensureStart, ensureEnd);
  const transferStart = newsFlow.indexOf("export async function transferPublishedArticleBetweenMatchdayZones");
  const transferEnd = newsFlow.indexOf("export function editorialNewsFlowTransferTargets", transferStart);
  const transferBlock = newsFlow.slice(transferStart, transferEnd);

  assert.match(ensureBlock, /sort_order: rows\.length \+ 1/);
  assert.doesNotMatch(ensureBlock, /MAX_ITEMS|latest-full|\.slice\(/);
  assert.match(
    transferBlock,
    /await writeArticleToTargetZone\([\s\S]*?await clearArticleFromSourceZone\(input\.matchdayId, input\.sourceSlotType, input\.sourceId\)/,
  );
  assert.doesNotMatch(ensureBlock, /latest_zone_placement/);
  assert.doesNotMatch(newsFlow, /writeSupabaseAdmin\(["`]editorial_articles/);
});
