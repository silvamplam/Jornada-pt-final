import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const root = "app/admin/editorial/redacao-automatica/mesa";
const page = read(`${root}/page.tsx`);
const pageReader = read("lib/redacao-automatica/newsroom-mesa-page-read-model.ts");
const pageReaderInternal = read("lib/redacao-automatica/newsroom-mesa-page-read-model-internal.ts");
const organization = read("lib/redacao-automatica/newsroom-mesa-organization.ts");
const themePage = read(`${root}/temas/[themeId]/page.tsx`);
const dossierPage = read(`${root}/dossies/page.tsx`);
const selectionClient = read(`${root}/_mesa-selection-client.tsx`);
const organizationClient = read(`${root}/_mesa-organization-client.tsx`);
const sourceChanges = read(`${root}/_mesa-source-changes.tsx`);
const organizationRoute = read("app/api/admin/editorial/redacao-automatica/mesa/organizacao/route.ts");
const migrationPath = "supabase/migrations/20260914074012_newsroom_mesa_scoped_read_model_v1.sql";
const migration = read(migrationPath);

test("Mesa page reads counts + page identities before hydrating at most the visible IDs", () => {
  assert.match(page, /loadMesaPageReadModel\(mesaPageReadModelInput\(query\)\)/);
  assert.match(page, /loadMesaOrganizationSummary\(\)/);
  assert.doesNotMatch(page, /loadOperationalDeskReadModel|loadMesaOrganization\(/);
  assert.match(pageReader, /rpc\/newsroom_mesa_source_counts_v1/);
  assert.match(pageReader, /rpc\/newsroom_mesa_page_identities_v1/);
  assert.match(pageReader, /loadOperationalDeskReadModel\(\{ sourceIds: articleIds \}\)/);
  assert.doesNotMatch(pageReader, /readAllPages/);
  assert.match(pageReaderInternal, /Promise\.all\(\[/);
  assert.match(pageReaderInternal, /identityWindow\.slice\(0, input\.pagination\.limit\)/);
  assert.match(pageReaderInternal, /hydrateSources\(visibleIds\)/);
  assert.match(pageReaderInternal, /hasNextPage: identityWindow\.length > input\.pagination\.limit/);
});

test("main organization is summary-only and Theme/Dossier readers are scoped", () => {
  const summary = organization.slice(
    organization.indexOf("export async function loadMesaOrganizationSummary"),
    organization.indexOf("export async function readMesaThemeSummary"),
  );
  assert.match(summary, /readMesaThemeSummaries\(\)/);
  assert.doesNotMatch(summary, /source_packages|loadOperationalDeskReadModel|material_versions/);
  assert.match(themePage, /loadMesaThemeOrganization\(themeId\)/);
  assert.doesNotMatch(themePage, /loadMesaOrganization\(|loadOperationalDeskReadModel/);
  assert.match(dossierPage, /loadMesaDossierOrganization\(key, requestedVersion\)/);
  assert.doesNotMatch(dossierPage, /loadMesaOrganization\(|loadOperationalDeskReadModel/);
  assert.match(organization, /theme_id=eq\.\$\{themeId\}/);
  assert.match(organization, /material_key=eq\.\$\{encodedKey\}/);
  assert.doesNotMatch(organization, /newsroom_editorial_source_packages\?select=id,manifest&order=id\.asc/);
  assert.match(organization, /newsroom_editorial_source_packages\?select=id,manifest[\s\S]*?id=eq\.\$\{packageId\}/);
});

test("simple Mesa mutations consume the affected authoritative summary without a global refresh", () => {
  assert.doesNotMatch(selectionClient, /router\.refresh\(\)/);
  assert.doesNotMatch(organizationClient, /router\.refresh\(\)/);
  assert.doesNotMatch(sourceChanges, /router\.refresh\(\)/);
  assert.match(selectionClient, /updateClassification\(newsroomArticleId, lifecycle, previous, nextClassificationKey\)/);
  assert.match(selectionClient, /upsertTheme\(result\.theme\)/);
  assert.match(selectionClient, /\?theme=\$\{encodeURIComponent\(theme\.id\)\}/);
  assert.match(organizationRoute, /readMesaThemeSummary\(themeId\)/);
  assert.match(organizationRoute, /readMesaThemeCurrentSourceRefs\(themeId\)/);
  assert.match(organizationRoute, /Cache-Control": "private, no-store/);
});

test("read-only migration is additive, bounded and keeps read RPCs service-role only", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /\b(?:insert into|update|delete from|truncate|alter table)\b/i);
  assert.doesNotMatch(migration, /newsroom_organize_theme_sources_v1|newsroom_organize_theme_materials_v2/);
  const createdFunctions = [...migration.matchAll(/create function public\.([a-z0-9_]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(createdFunctions, [
    "newsroom_mesa_timestamp_text_valid_v1",
    "newsroom_mesa_source_candidates_v1",
    "newsroom_mesa_source_counts_v1",
    "newsroom_mesa_page_identities_v1",
    "newsroom_mesa_theme_summaries_v1",
  ]);
  assert.equal((migration.match(/security invoker/g) ?? []).length, createdFunctions.length);
  assert.match(migration, /p_limit < 1 or p_limit > 200/);
  assert.match(migration, /limit \(p_limit \+ 1\)/);
  assert.match(migration, /order by candidate\.last_detected_at desc, candidate\.newsroom_article_id desc/);
  assert.match(migration, /not candidate\.is_published[\s\S]*?not candidate\.has_visible_theme[\s\S]*?candidate\.has_visible_dossier or not candidate\.dismissed_current/);
  assert.match(migration, /candidate\.is_published[\s\S]*?not candidate\.has_visible_theme[\s\S]*?candidate\.has_visible_dossier or not candidate\.dismissed_current/);
  assert.match(migration, /manifest @> pg_catalog\.jsonb_build_object/);
  assert.match(migration, /using gin \(manifest jsonb_path_ops\)/);
  assert.ok((migration.match(/theme_id = any\(p_theme_ids\)/g) ?? []).length >= 6);
  for (const functionName of createdFunctions) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}`));
  }
});

test("paired PostgreSQL 17 preflight and postflight contracts are present", () => {
  const preflight = "supabase/sql/validate-newsroom-mesa-scoped-read-model-v1-preflight-pg17.sql";
  const postflight = "supabase/sql/validate-newsroom-mesa-scoped-read-model-v1-postflight-pg17.sql";
  assert.equal(existsSync(preflight), true);
  assert.equal(existsSync(postflight), true);
  assert.match(read(preflight), /preflight-ok/);
  assert.match(read(postflight), /row_count > 25/);
  assert.match(read(postflight), /count\(distinct newsroom_article_id\)/);
  assert.match(read(postflight), /sqlstate '22023'/);
  assert.match(read(postflight), /postflight-ok/);
});
