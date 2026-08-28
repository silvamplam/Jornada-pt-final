import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of [
  "components/public/PublicHierarchicalComposition.tsx",
  "components/admin/HierarchicalCompositionInterpretivePreview.tsx",
]) {
  test(`${file}: slot 3/1 mantém cover e favorece o topo da fotografia`, () => {
    const source = readFileSync(file, "utf8");
    assert.match(source, /other-featured \.composition-interpretive-media \{[\s\S]*aspect-ratio: 3 \/ 1;/u);
    assert.match(source, /other-featured \.composition-interpretive-media img \{[\s\S]*object-position: center 30%;/u);
    assert.match(source, /composition-interpretive-media img,[\s\S]*object-fit: cover;/u);
  });
}
