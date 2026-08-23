import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const projectionSource = readFileSync(
  path.join(
    process.cwd(),
    "lib/editorial-matchday-latest-four-projection.ts",
  ),
  "utf8",
);

const thematicRouteSource = readFileSync(
  path.join(
    process.cwd(),
    "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  ),
  "utf8",
);

test("projeção de quatro notícias lê apenas as zonas do perfil atribuído", () => {
  assert.match(
    projectionSource,
    /matchday_editorial_profile_assignments\?select=profile_key/,
  );

  assert.match(
    projectionSource,
    /matchday_editorial_profile_zone_items\?select=source_type,source_id,zone_key/,
  );

  assert.match(
    projectionSource,
    /profile_key=eq\.\$\{encodeURIComponent\(\s*assignedProfileKey,/,
  );
});

test("artigos das zonas temáticas aplicadas tornam-se conflitos da projeção", () => {
  assert.match(
    projectionSource,
    /zone: `thematic:\$\{row\.zone_key\}`/,
  );

  assert.match(
    projectionSource,
    /article_id: row\.source_id/,
  );

  assert.match(
    projectionSource,
    /source_type\)\?\.toLowerCase\(\)\s*[\s\S]*?!== "editorial_article"/,
  );
});

test("Apply temático resincroniza Últimas + 4 depois do RPC atómico", () => {
  assert.match(
    thematicRouteSource,
    /syncLatestFourNewsProjection/,
  );

  const rpcIndex = thematicRouteSource.indexOf(
    '"rpc/apply_matchday_editorial_profile_workspace_v4"',
  );

  const syncIndex = thematicRouteSource.indexOf(
    "await syncLatestFourNewsProjection(matchdayId)",
  );

  const responseIndex = thematicRouteSource.indexOf(
    "return NextResponse.json({",
    syncIndex,
  );

  assert.ok(rpcIndex >= 0);
  assert.ok(syncIndex > rpcIndex);
  assert.ok(responseIndex > syncIndex);
});

test("perfil temático ignora a Faixa e continua a excluir zonas temáticas", () => {
  assert.match(
    projectionSource,
    /if \(!assignedProfileKey\)\s*\{\s*horizontalNews\.forEach/,
  );

  assert.match(
    projectionSource,
    /matchday_horizontal_news\?select=link_url/,
  );

  assert.match(
    projectionSource,
    /zone: `thematic:\$\{row\.zone_key\}`/,
  );

  assert.match(
    projectionSource,
    /article_id: row\.source_id/,
  );
});

test("a projeção continua a escrever apenas nos quatro slots automáticos", () => {
  assert.match(
    projectionSource,
    /matchday_live_layout_items\?on_conflict=matchday_id,slot_type/,
  );

  assert.doesNotMatch(
    projectionSource,
    /writeSupabaseAdmin\(\s*"matchday_editorial_profile_zone_items\?/,
  );
});