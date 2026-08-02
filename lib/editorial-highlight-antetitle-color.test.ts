import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("a Home edita, grava e publica a cor do antetítulo de cada destaque", () => {
  const admin = read("app/admin/editorial/home/page.tsx");
  const route = read("app/api/admin/editorial/home/route.ts");
  const page = read("app/page.tsx");
  const layout = read("components/public/PublicEditorialLayout.tsx");

  assert.match(admin, /highlight_\$\{row\.key\}_label_color/);
  assert.match(route, /label_color: cleanColor\(cleanText\(formData\.get\(`/);
  assert.match(page, /site_editorial_highlights\?select=id,label,label_color/);
  assert.match(page, /labelColor: cleanText\(item\.label_color\)/);
  assert.match(layout, /labelColor\?: string \| null/);
  assert.match(layout, /item\.labelColor \? \{ color: item\.labelColor \}/);
});

test("as jornadas editam, gravam e publicam a cor dos três destaques", () => {
  const admin = read("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  const route = read("app/api/admin/gestor/route.ts");
  const publicPage = read("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
  const publicData = read("lib/public-matchday.ts");
  const types = read("lib/supabase.ts");

  assert.match(admin, /name="highlight_label_color"/);
  assert.match(route, /label_color: labelColor/);
  assert.match(publicData, /label,label_color,title/);
  assert.match(types, /label_color\?: string \| null/);
  assert.match(publicPage, /highlightColorById/);
  assert.match(publicPage, /item\.source_type === "matchday_highlight"/);
  assert.match(publicPage, /labelColor: highlight\.label_color/);
});

test("o SQL acrescenta e valida apenas as duas colunas previstas", () => {
  const apply = read("supabase/steps/61-editorial-destaques-antetitulos-cores-apply.sql");
  const postflight = read("supabase/steps/62-editorial-destaques-antetitulos-cores-postflight.sql");
  const smoke = read("supabase/steps/63-editorial-destaques-antetitulos-cores-smoke-rollback.sql");

  assert.match(apply, /site_editorial_highlights[\s\S]*label_color text/);
  assert.match(apply, /matchday_highlights[\s\S]*label_color text/);
  assert.match(postflight, /valid_columns <> 2/);
  assert.match(smoke, /where false/);
  assert.match(smoke, /rollback;/);
});
