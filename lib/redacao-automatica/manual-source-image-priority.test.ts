import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("favorito principal prefere imagem real do artigo antes de og:image", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/redacao-automatica/manual-source-bookmarklets.ts"),
    "utf8",
  );

  const start = source.indexOf("function extractedImage(root: Element | null)");
  const end = source.indexOf("function dateOnly", start);
  const block = source.slice(start, end);

  assert.match(block, /var articleImage = root \? imageFrom\(root\) : "";/);
  assert.match(block, /if \(articleImage\) return articleImage;/);
  assert.match(block, /meta\[property='og:image'\]/);
  assert.ok(
    block.indexOf("if (articleImage) return articleImage;") < block.indexOf("og:image"),
    "a imagem do corpo do artigo tem de ter prioridade sobre og:image",
  );
});
