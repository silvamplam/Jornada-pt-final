import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("o editor audiovisual remonta o formulario ao mudar de conteudo", () => {
  const page = readFileSync("app/admin/editorial/conteudos/page.tsx", "utf8");

  assert.match(page, /<EditorialContentForm\s+key="create"\s+mode="create"/);
  assert.match(page, /<EditorialContentForm\s+key=\{selectedContent\.id\}\s+mode="edit"/);
});
