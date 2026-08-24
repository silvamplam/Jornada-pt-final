import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const formSource = readFileSync(
  "app/admin/editorial/artigos/_articleForm.tsx",
  "utf8",
);

const importSource = readFileSync(
  "app/admin/editorial/artigos/_externalArticleImport.tsx",
  "utf8",
);

test("artigo existente usa o importador em modo update preservando a identidade", () => {
  assert.match(
    formSource,
    /<ExternalArticleImport mode=\{isEdit \? "update" : "create"\} \/>/,
  );

  assert.match(
    formSource,
    /name="action_type" value=\{isEdit \? "update_article" : "create_article"\}/,
  );

  assert.match(
    formSource,
    /name="article_id" value=\{article\?\.id \?\? ""\}/,
  );

  assert.match(
    importSource,
    /mode\?: "create" \| "update";/,
  );

  assert.match(
    importSource,
    /<strong>\{isUpdate \? "Atualizar com IA" : "Importar notícia gerada"\}<\/strong>/,
  );
});

test("modo update altera apenas antetítulo, título, pós-título e corpo", () => {
  const applyMatch = importSource.match(
    /function applyArticleToForm\([\s\S]*?\n}\n\nfunction removeImportQueryParameter/,
  );

  assert.ok(applyMatch, "applyArticleToForm não encontrado");

  const applySource = applyMatch[0];

  for (const field of ["label", "title", "subtitle", "body"]) {
    assert.match(
      applySource,
      new RegExp(
        `setFieldValue\\(formField\\(form, "${field}"\\)`,
      ),
    );
  }

  for (const field of [
    "image_url",
    "image_caption",
    "author",
    "slug",
    "published_at",
    "competition_id",
    "season_id",
    "matchday_id",
  ]) {
    assert.doesNotMatch(
      applySource,
      new RegExp(
        `setFieldValue\\(formField\\(form, "${field}"\\)`,
      ),
    );
  }

  assert.match(
    applySource,
    /if \(mode === "create"\) \{[\s\S]*?editorial_destination[\s\S]*?const slug = formField\(form, "slug"\);/,
  );
});

test("modo update nunca importa imagem do pacote", () => {
  assert.match(
    importSource,
    /if \(isUpdate\) \{\s*setStatus\("A atualização por IA mantém a imagem existente\."\);\s*return;\s*\}/,
  );

  assert.match(
    importSource,
    /\{!isUpdate && sourcePackage && imageCandidates\.length > 0 \? \(/,
  );

  assert.match(
    importSource,
    /preparedTransferHandledRef\.current = true;\s*if \(isUpdate\) \{\s*return;\s*\}\s*const url = new URL/,
  );
});