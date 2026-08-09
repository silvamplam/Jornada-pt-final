import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("a Home edita, grava e publica as cores dos antetítulos", () => {
  const admin = read("app/admin/editorial/home/page.tsx");
  const route = read("app/api/admin/editorial/home/route.ts");
  const page = read("app/page.tsx");
  const layout = read("components/public/PublicEditorialLayout.tsx");

  assert.match(admin, /name="side_block_label_color"/);
  assert.match(admin, /final_news_\$\{row\.key\}_time_label_color/);
  assert.match(route, /"side_block_label_color"/);
  assert.match(route, /time_label_color: cleanColor/);
  assert.match(page, /side_block_label_color/);
  assert.match(page, /timeLabelColor: cleanText\(item\.time_label_color\)/);
  assert.match(layout, /labelColor\?: string \| null/);
  assert.match(layout, /timeLabelColor\?: string \| null/);
});

test("as jornadas editam, gravam e publicam as cores dos antetítulos", () => {
  const admin = read("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  const route = read("app/api/admin/gestor/route.ts");
  const publicPage = read("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
  const publicData = read("lib/public-matchday.ts");
  const types = read("lib/supabase.ts");

  assert.match(admin, /name="side_block_label_color"/);
  assert.match(admin, /name="latest_news_time_label_color"/);
  assert.match(route, /side_block_label_color: sideBlockLabelColor/);
  assert.match(route, /time_label_color: timeLabelColor/);
  assert.match(publicPage, /sideBlockLabelColor/);
  assert.match(publicPage, /timeLabelColor/);
  assert.match(publicData, /side_block_label_color/);
  assert.match(publicData, /time_label_color/);
  assert.match(types, /side_block_label_color\?: string \| null/);
  assert.match(types, /time_label_color\?: string \| null/);
});

test("o SQL acrescenta e valida apenas as quatro colunas previstas", () => {
  const apply = read("supabase/steps/57-editorial-antetitulos-cores-apply.sql");
  const postflight = read("supabase/steps/58-editorial-antetitulos-cores-postflight.sql");
  const smoke = read("supabase/steps/59-editorial-antetitulos-cores-smoke-rollback.sql");

  assert.match(apply, /site_editorials[\s\S]*side_block_label_color text/);
  assert.match(apply, /site_editorial_latest_news[\s\S]*time_label_color text/);
  assert.match(apply, /matchday_editorials[\s\S]*side_block_label_color text/);
  assert.match(apply, /matchday_latest_news[\s\S]*time_label_color text/);
  assert.match(postflight, /valid_columns <> 4/);
  assert.match(smoke, /where false/);
  assert.match(smoke, /rollback;/);
});

test("a jornada permite editar, gravar e publicar a cor do titulo da zona complementar", () => {
  const admin = read("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  const route = read("app/api/admin/gestor/route.ts");
  const publicPage = read("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
  const publicData = read("lib/public-matchday.ts");
  const layout = read("components/public/PublicEditorialLayout.tsx");
  const sync = read("lib/editorial-current-reference-composition-sync.ts");
  const types = read("lib/supabase.ts");
  const schema = read("supabase/sql/fase-editorial-g-bloco-complementar.sql");

  assert.match(admin, /name="complementary_text_color"/);
  assert.match(route, /complementaryLabelColor = cleanHexColor\(formData\.get\("complementary_text_color"\)\)/);
  assert.match(route, /complementary_text_color: complementaryLabelColor/);
  assert.match(publicData, /complementary_text_color/);
  assert.match(publicPage, /const complementaryLabelColor = usePublishedReferenceComposition/);
  assert.match(publicPage, /referenceComplement\?\.label_color_snapshot/);
  assert.match(publicPage, /editorial\?\.complementary_text_color\?\.trim\(\) \|\| null/);
  assert.match(publicPage, /labelColor: complementaryLabelColor/);
  assert.match(sync, /complementary_text_color: string \| null/);
  assert.match(sync, /complementary_label,complementary_text_color,complementary_title/);
  assert.match(sync, /label_color_snapshot: cleanText\(editorial\.complementary_text_color\)/);
  assert.match(layout, /labelColor\?: string \| null/);
  assert.match(layout, /style=\{data\.labelColor \? \{ color: data\.labelColor \} : undefined\}/);
  assert.match(types, /complementary_text_color\?: string \| null/);
  assert.match(schema, /add column if not exists complementary_text_color text/);
});
