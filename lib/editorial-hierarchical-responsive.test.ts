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

test("desktop público usa a arquitetura interpretativa promovida do preview", () => {
  const desktop = compositionStyles.slice(0, compositionStyles.indexOf("@media (max-width: 980px)"));

  assert.match(desktop, /composition-interpretive-dominant[\s\S]*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 4fr\)/);
  assert.match(desktop, /composition-interpretive-chronicles[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(desktop, /composition-interpretive-analysis-main[\s\S]*grid-column: span 4/);
  assert.match(desktop, /composition-interpretive-analysis-center[\s\S]*grid-column: span 5/);
  assert.match(desktop, /composition-interpretive-analysis-side[\s\S]*grid-column: span 3/);
  assert.match(desktop, /composition-interpretive-other-left[\s\S]*grid-column: span 7/);
  assert.match(desktop, /composition-interpretive-other-compact-column[\s\S]*grid-column: span 5/);
  assert.match(desktop, /composition-interpretive-news \{[\s\S]*grid-column: span 9/);
  assert.match(desktop, /composition-interpretive-editorial \{[\s\S]*grid-column: span 3/);
  assert.match(compositionStyles, /composition-interpretive-news-full \{\s*grid-column: 1 \/ -1;/);
});

test("tablet reorganiza os blocos interpretativos sem alterar a ordem editorial", () => {
  const tablet = mediaBlock(compositionStyles, 980, 720);

  assert.match(tablet, /composition-interpretive-opening \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(tablet, /composition-interpretive-analysis-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(
    tablet,
    /composition-interpretive-analysis-main,[\s\S]*composition-interpretive-analysis-center,[\s\S]*composition-interpretive-analysis-side \{[\s\S]*grid-column: 1;/,
  );
  assert.match(tablet, /composition-interpretive-other-games-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});

test("mobile empilha os subblocos que ainda tinham duas ou três colunas", () => {
  const mobile = mediaBlock(compositionStyles, 720);

  assert.match(
    mobile,
    /composition-interpretive-dominant,[\s\S]*composition-interpretive-chronicles,[\s\S]*composition-interpretive-analysis-medium,[\s\S]*composition-interpretive-other-second-featured,[\s\S]*composition-interpretive-other-compact \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
  );
});

test("momentos posteriores conservam o ritmo responsivo já validado", () => {
  assert.match(posteriorStyles, /gap: 34px/);
  assert.match(posteriorStyles, /@media \(max-width: 840px\)[\s\S]*gap: 28px[\s\S]*padding-top: 20px/);
  assert.match(posteriorStyles, /@media \(max-width: 680px\)[\s\S]*gap: 24px[\s\S]*padding-top: 18px/);
});
