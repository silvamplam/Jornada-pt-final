import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EDITORIAL_CONTEXT_DESTINATION,
  EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
  EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS,
  EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE,
  normalizeEditorialContextDestination,
} from "./editorial-context-post-title";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

test("o Contexto mantém um perfil próprio e só é reconhecido quando indicado explicitamente", () => {
  assert.equal(EDITORIAL_CONTEXT_DESTINATION, "context");
  assert.equal(normalizeEditorialContextDestination("CONTEXTO"), "context");
  assert.equal(normalizeEditorialContextDestination(" contexto "), "context");
  assert.equal(normalizeEditorialContextDestination("Faixa"), null);
  assert.equal(EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS, 420);
  assert.equal(EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS, 500);
  assert.match(EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE, /Só quando o editor indicar explicitamente/i);
  assert.match(EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE, /aproxima-te do limite superior/i);
  assert.match(EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE, /limite visual da página continua soberano/i);
  assert.match(EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE, /Esta regra não se aplica aos restantes artigos/i);
});

test("o limite de Contexto não é imposto globalmente aos artigos novos", () => {
  const articleForm = source("app/admin/editorial/artigos/_articleForm.tsx");
  const articleRoute = source("app/api/admin/editorial/artigos/route.ts");
  const articlePage = source("app/admin/editorial/artigos/page.tsx");
  const articleImporter = source("app/admin/editorial/artigos/_externalArticleImport.tsx");

  assert.match(articleForm, /name="editorial_destination"/);
  assert.match(articleForm, /data-article-editorial-destination/);
  assert.match(articleForm, /<option value=\{EDITORIAL_CONTEXT_DESTINATION\}>Contexto<\/option>/);
  assert.doesNotMatch(
    articleForm,
    /<textarea[\s\S]*?name="subtitle"[\s\S]*?maxLength=\{isEdit \? undefined : EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS\}/,
  );
  assert.match(articleImporter, /article\.editorialDestination \?\? ""/);
  assert.match(articleImporter, /postTitleField\.maxLength = EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS/);
  assert.match(articleImporter, /postTitleField\.removeAttribute\("maxlength"\)/);
  assert.match(articleRoute, /editorialDestination === EDITORIAL_CONTEXT_DESTINATION/);
  assert.match(articleRoute, /context-post-title-too-long/);
  assert.doesNotMatch(articleRoute, /!currentArticleId && subtitle && subtitle\.length/);
  assert.match(articlePage, /pós-título destinado a Contexto não pode ultrapassar 500 caracteres/i);
});

test("a criação genérica e a redação automática genérica recuperam os limites próprios", () => {
  const manualContract = source("lib/redacao-automatica/manual-newsroom-entry-contract.ts");
  const manualForm = source("app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx");
  const dossierGenerator = source("lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal.ts");

  assert.match(manualContract, /MANUAL_NEWSROOM_POST_TITLE_MAX_LENGTH = 600/);
  assert.doesNotMatch(manualForm, /Para Contexto, procurar/);
  assert.match(dossierGenerator, /MAX_GENERATED_POST_TITLE_CHARS = 600/);
  assert.doesNotMatch(dossierGenerator, /EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE/);
});

test("a edição direta da zona Contexto continua a validar o seu próprio máximo", () => {
  const gestorRoute = source("app/api/admin/gestor/route.ts");
  const matchdayPage = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");

  assert.match(gestorRoute, /cleanContextPostTitle/);
  assert.match(gestorRoute, /context-post-title-too-long/);
  assert.equal(
    gestorRoute.split('cleanContextPostTitle(formData.get("side_block_text"))').length - 1,
    2,
  );
  assert.match(matchdayPage, /maxLength=\{EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS\}/);
  assert.match(matchdayPage, /Procurar \{EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS\}–\{EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS\} caracteres/);
});
