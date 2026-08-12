import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync("components/public/PublicHierarchicalComposition.tsx", "utf8");
const compositionStyles = renderer.match(/const hierarchicalCompositionStyles = `([\s\S]*?)`;/)?.[1] ?? "";
const posteriorStyles = renderer.match(/const hierarchicalPosteriorMomentsStyles = `([\s\S]*?)`;/)?.[1] ?? "";

function mediaBlock(source: string, maxWidth: number, nextMaxWidth?: number) {
  const start = source.indexOf(`@media (max-width: ${maxWidth}px)`);
  assert.ok(start >= 0, `breakpoint ${maxWidth}px em falta`);
  const end = nextMaxWidth ? source.indexOf(`@media (max-width: ${nextMaxWidth}px)`, start + 1) : source.length;
  assert.ok(end > start, `fim do breakpoint ${maxWidth}px em falta`);
  return source.slice(start, end);
}

test("desktop mantém a hierarquia V13 aprovada", () => {
  const desktop = compositionStyles.slice(0, compositionStyles.indexOf("@media (max-width: 1180px)"));

  assert.match(desktop, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(desktop, /data-slot="dominant_main"\][\s\S]*grid-column: span 8/);
  assert.match(desktop, /data-slot="dominant_side_top"[\s\S]*grid-column: span 4/);
  assert.match(desktop, /data-moment="strong"[\s\S]*grid-column: span 6/);
  assert.match(desktop, /data-moment="secondary"[\s\S]*grid-column: span 3/);
  assert.match(desktop, /data-moment="closing"[\s\S]*grid-column: span 4/);
});

test("tablet mantém a hierarquia sem deixar terceiros cartões órfãos", () => {
  const tablet = mediaBlock(compositionStyles, 840, 680);

  assert.match(tablet, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(tablet, /data-slot="dominant_main"[\s\S]*grid-column: 1 \/ -1/);
  assert.match(tablet, /data-slot="dominant_side_top"[\s\S]*data-slot="dominant_side_bottom"[\s\S]*data-moment="strong"[\s\S]*data-moment="secondary"[\s\S]*grid-column: span 3/);
  assert.match(tablet, /data-moment="other-chronicles"[\s\S]*data-moment="closing"[\s\S]*grid-column: span 2/);
  assert.doesNotMatch(tablet, /repeat\(2, minmax\(0, 1fr\)\)/);
});

test("mobile passa a uma coluna e deixa a imagem dominante proporcional", () => {
  const mobile = mediaBlock(compositionStyles, 680);

  assert.match(mobile, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(mobile, /grid-column: 1;[\s\S]*grid-row: auto/);
  assert.match(mobile, /data-moment="dominant"[\s\S]*card-media[\s\S]*height: auto;[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.doesNotMatch(mobile, /height: 220px/);
  assert.match(mobile, /data-slot="dominant_main"[\s\S]*font-size: 26px/);
  assert.match(mobile, /data-moment="secondary"[\s\S]*font-size: 18px/);
  assert.match(mobile, /data-moment="closing"[\s\S]*font-size: 20px/);
});

test("momentos posteriores reduzem apenas o ritmo vertical nos mesmos breakpoints", () => {
  assert.match(posteriorStyles, /gap: 34px/);
  assert.match(posteriorStyles, /@media \(max-width: 840px\)[\s\S]*gap: 28px[\s\S]*padding-top: 20px/);
  assert.match(posteriorStyles, /@media \(max-width: 680px\)[\s\S]*gap: 24px[\s\S]*padding-top: 18px/);
});
