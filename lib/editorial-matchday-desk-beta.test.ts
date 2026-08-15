import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const clientSource = source("app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialDeskClient.tsx");
const pageSource = source("app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx");
const editorialSource = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const readerSource = source("lib/editorial-matchday-desk.ts");

test("a primeira Mesa Beta é deliberadamente não destrutiva", () => {
  assert.ok(pageSource.includes("Ensaio não destrutivo"));
  assert.ok(clientSource.includes("Modo de ensaio"));
  assert.equal(clientSource.includes("fetch("), false);
  assert.equal(clientSource.includes("/api/admin/"), false);
});

test("o Editorial atual apenas ganha uma porta para a Mesa Beta", () => {
  assert.ok(editorialSource.includes(`/organizar`));
  assert.ok(editorialSource.includes("Organizar Jornada — Beta"));
});

test("a Mesa lê artigos publicados da jornada e todas as zonas vivas sem escrever", () => {
  assert.ok(readerSource.includes("editorial_articles?select="));
  assert.ok(readerSource.includes("matchday_latest_news?select="));
  assert.ok(readerSource.includes("matchday_horizontal_news?select="));
  assert.ok(readerSource.includes("matchday_live_layout_items?select="));
  assert.ok(readerSource.includes("matchday_highlights?select="));
  assert.equal(readerSource.includes("writeSupabaseAdmin"), false);
});

test("a interface inclui seleção em bloco, Últimas independente, ordenação e Sem colocação", () => {
  assert.ok(clientSource.includes("+ Últimas"));
  assert.ok(clientSource.includes("− Últimas"));
  assert.ok(clientSource.includes("Sem colocação total"));
  assert.ok(clientSource.includes("draggable"));
  assert.ok(clientSource.includes("Aplicar alterações · ensaio"));
  assert.ok(clientSource.includes("Faixa de notícias"));
  assert.ok(clientSource.includes("● Pública"));
  assert.ok(clientSource.includes("○ Oculta"));
});