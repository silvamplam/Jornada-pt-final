import assert from "node:assert/strict";
import test from "node:test";

import {
  editorialArticleCanonicalMissingLabel,
  missingEditorialArticleCanonicalFields,
} from "@/lib/editorial-article-canonical";

const complete = {
  label: "LIGA PORTUGAL",
  title: "Título completo",
  subtitle: "Pós-título completo",
  body: "Corpo completo.",
  image_url: "https://example.test/image.jpg",
  author: "Jornalista",
  published_at: "2026-08-08T16:30:00.000Z",
};

test("o artigo canónico completo não tem lacunas", () => {
  assert.deepEqual(missingEditorialArticleCanonicalFields(complete), []);
});

test("deteta todos os dados canónicos em falta sem depender da zona", () => {
  const missing = missingEditorialArticleCanonicalFields({
    ...complete,
    label: " ",
    author: null,
    published_at: "inválida",
  });
  assert.deepEqual(missing, ["label", "author", "published_at"]);
  assert.equal(
    editorialArticleCanonicalMissingLabel(missing),
    "antetítulo, autor, data/hora",
  );
});


test("campos opcionais legacy são tratados como dados em falta, não como erro de tipo", () => {
  const missing = missingEditorialArticleCanonicalFields({
    ...complete,
    author: undefined,
  });
  assert.deepEqual(missing, ["author"]);
});
