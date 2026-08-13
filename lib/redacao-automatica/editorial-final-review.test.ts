import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("a geração prepara título, pós-título e corpo e deixa a imagem para escolha manual", () => {
  const generation = read(
    "lib/redacao-automatica/editorial-dossier-article-plan-generation-service.ts",
  );
  const internal = read(
    "lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal.ts",
  );

  assert.match(internal, /generatedTitle: string/);
  assert.match(internal, /generatedPostTitle: string/);
  assert.match(internal, /generatedBody: string/);
  assert.match(internal, /sourceImages: readonly/);
  assert.match(internal, /normalizeGeneratedEditorialDraft/);
  assert.match(generation, /archiveEditorialSourceImagesLocally/);
  assert.match(generation, /newsroom_apply_generated_article/);
  assert.match(generation, /p_generated_title: input\.generatedTitle/);
  assert.match(generation, /p_generated_post_title: input\.generatedPostTitle/);
  assert.match(generation, /p_image_url: null/);
  assert.doesNotMatch(generation, /prepareEditorialArticleImage/);
});

test("as imagens das fontes ficam apenas na pasta local para escolha manual", () => {
  const image = read("lib/redacao-automatica/editorial-source-image.ts");

  assert.match(image, /archiveEditorialSourceImagesLocally/);
  assert.match(image, /process\.platform === "win32"/);
  assert.match(image, /"Pictures", "Jornada\.pt", "Editorial"/);
  assert.match(image, /JORNADA_EDITORIAL_LOCAL_IMAGE_DIR/);
  assert.match(image, /MAX_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.doesNotMatch(image, /storage\/v1\/object/);
  assert.doesNotMatch(image, /FALLBACK_IMAGE_URL/);
});
test("a revisão mostra apenas a data Jornada.pt e a publicação grava o instante real", () => {
  const form = read("app/admin/editorial/artigos/_articleForm.tsx");
  const service = read("lib/editorial-article-service-internal.ts");
  const publicService = read("lib/editorial-article-service.ts");
  const page = read("app/admin/editorial/artigos/page.tsx");

  assert.match(form, />Pós-título</);
  assert.match(form, />Data Jornada\.pt</);
  assert.match(form, /"Por publicar"/);
  assert.match(form, /type="hidden" name="published_at"/);
  assert.doesNotMatch(form, /type="datetime-local"/);
  assert.match(service, /targetStatus === "published" && !publishedAt/);
  assert.match(service, /publishedAt = transport\.now\(\)/);
  assert.match(publicService, /return new Date\(\)\.toISOString\(\)/);
  assert.match(service, /missing-post-title/);
  assert.match(service, /missing-image/);
  assert.match(page, /article\.status === "published"[\s\S]*: "Por publicar"/);
});


test("a aplicação completa é transacional e exclusiva do service_role", () => {
  const service = read(
    "lib/redacao-automatica/editorial-dossier-article-plan-generation-service.ts",
  );
  const apply = read(
    "supabase/steps/50-redacao-automatica-imagens-locais-escolha-manual-apply.sql",
  );
  const postflight = read(
    "supabase/steps/51-redacao-automatica-imagens-locais-escolha-manual-postflight.sql",
  );

  assert.doesNotMatch(service, /editorial_articles[\s\S]*method: "PATCH"/);
  assert.match(apply, /newsroom_apply_editorial_dossier_article_plan_generation/);
  assert.match(apply, /set title = v_title/);
  assert.match(apply, /subtitle = v_post_title/);
  assert.doesNotMatch(apply, /image_url = v_image_url/);
  assert.match(apply, /p_image_url is not null/);
  assert.match(apply, /raise exception 'editorial_generation_complete_article_conflict'/);
  assert.match(apply, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(apply, /grant execute[\s\S]*to service_role/);
  assert.match(postflight, /short_generation_rpc_must_be_security_invoker/);
});

test("a remoção bloqueada mostra as zonas e permite desvincular", () => {
  const page = read("app/admin/editorial/artigos/page.tsx");

  assert.match(page, /Remover artigo bloqueado/);
  assert.match(page, /Este artigo está ligado em:/);
  assert.match(page, /selectedLinkData\.placements\.map/);
  assert.match(page, /placement\.area/);
  assert.match(page, /placement\.position/);
  assert.match(page, /name="action_type" value="remove_article_link"/);
  assert.match(page, />\s*Desvincular\s*</);
});
