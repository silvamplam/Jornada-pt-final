import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(
    process.cwd(),
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  ),
  "utf8",
);

test("bulk operation appears as contextual toolbar only after marking items", () => {
  assert.match(source, /selected\.size > 0 \? \(/);
  assert.match(source, /className="thematic-bulk-context"/);
  assert.match(source, /position: sticky;[^}]*top: 44px/);
  assert.doesNotMatch(source, /<details className="thematic-panel thematic-bulk">/);
});

test("bulk toolbar is placed before page structure and active workspace", () => {
  const toolbar = source.indexOf('className="thematic-bulk-context"');
  const structure = source.indexOf('aria-label="Página e blocos"');
  assert.ok(toolbar >= 0);
  assert.ok(structure > toolbar);
});

test("bulk actions are grouped by clear destinations", () => {
  for (const label of [
    "Zona de destino",
    "Mover para zona",
    "Posicao na Faixa",
    "Mover para Faixa",
    "Mover para Banco",
  ]) {
    const normalized = source
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    assert.equal(normalized.includes(label), true, label);
  }

  const normalized = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const toolbar = normalized.slice(
    normalized.indexOf('className="thematic-bulk-context"'),
    normalized.indexOf('className="thematic-global-tools"'),
  );
  assert.equal(toolbar.includes("Posicao na zona"), true);
  assert.equal(toolbar.includes("Fixar posicao"), false);
  assert.equal(toolbar.includes("Fixar na Faixa"), false);
  assert.equal(toolbar.includes("Automatico"), false);
});

test("a barra superior contém apenas as cinco ferramentas administrativas", () => {
  const globalToolsStart = source.indexOf('className="thematic-global-tools"');
  const workspaceStart = source.indexOf('className={`thematic-desk-grid', globalToolsStart);
  const toolbar = source.slice(globalToolsStart, workspaceStart);
  const labels = [
    "Página e blocos",
    "Vídeos",
    "Agenda e TV",
    "Corrigir classificação",
    "A acontecer agora",
  ];
  const summaries = Array.from(
    toolbar.matchAll(/<summary>([^<]+)<\/summary>/gu),
    (match) => match[1],
  );

  assert.ok(globalToolsStart >= 0 && workspaceStart > globalToolsStart);
  assert.deepEqual(summaries, labels);
  assert.doesNotMatch(toolbar, /Selecionar candidatas/u);
  assert.doesNotMatch(toolbar, /Limpar marcação/u);
  assert.doesNotMatch(toolbar, /notícias? selecionadas?/u);
  assert.doesNotMatch(toolbar, /Controlos de seleção/u);
  assert.doesNotMatch(source, /thematic-selection-controls/u);
  assert.match(source, /\.thematic-global-tools \{[^}]*grid-template-columns: repeat\(4, max-content\)/u);
  assert.doesNotMatch(source, /\.thematic-global-tools \{[^}]*minmax\(0,\s*1fr\)/u);
  assert.match(source, /\.thematic-global-actions \{[^}]*justify-content: flex-start/u);
  assert.doesNotMatch(source, /\.thematic-global-actions \{[^}]*justify-content: flex-end/u);
  assert.doesNotMatch(source, /\.thematic-global-actions \{[^}]*flex: 1 1 100%/u);
  assert.doesNotMatch(source, /\.thematic-global-actions \{[^}]*min-width: 100%/u);
});

test("a seleção fica no painel direito e mantém a autoridade existente", () => {
  const candidatesStart = source.indexOf("function renderCandidates()");
  const candidatesEnd = source.indexOf("function isZoneWorkspaceKey", candidatesStart);
  const candidates = source.slice(candidatesStart, candidatesEnd);

  assert.ok(candidatesStart >= 0 && candidatesEnd > candidatesStart);
  assert.match(candidates, /selected\.size > 0 \? "Limpar" : "Selecionar visíveis"/u);
  assert.match(candidates, /visibleCandidateEntries\.map\(\(entry\) => entry\.bankItemId\)/u);
  assert.match(source, /checked=\{selected\}/u);
  assert.match(source, /onChange=\{\(\) => onToggle\(bankItemId\)\}/u);
  assert.match(source, /onToggle=\{toggleSelection\}/u);
});

test("Agenda e TV usa o endpoint autónomo sem entrar no estado editorial", () => {
  const panelStart = source.indexOf("function MatchdayAgendaTvSyncPanel");
  const deskStart = source.indexOf("export default function MatchdayEditorialThematicDeskClient", panelStart);
  const panel = source.slice(panelStart, deskStart);

  assert.ok(panelStart >= 0 && deskStart > panelStart);
  assert.match(panel, /JSON\.stringify\(\{ action \}\)/u);
  assert.match(panel, /runAgendaTvAction\("preview"\)/u);
  assert.match(panel, /runAgendaTvAction\("apply"\)/u);
  assert.match(panel, /Procurar atualizações/u);
  assert.match(panel, /Confirmar alterações/u);
  assert.match(panel, /const router = useRouter\(\)/u);
  assert.equal((panel.match(/router\.refresh\(\)/g) ?? []).length, 1);
  assert.match(panel, /action === "apply"[\s\S]*router\.refresh\(\)/u);
  assert.match(panel, /row\.status !== "unchanged"/u);
  assert.match(panel, /<span>Atual<\/span>/u);
  assert.match(panel, /<span>Proposto<\/span>/u);
  assert.match(panel, /result\.code === "source-unavailable"/u);
  assert.match(panel, /setPanelState\("unavailable"\)/u);
  assert.match(panel, /Origem externa temporariamente indisponível/u);
  assert.doesNotMatch(panel, /useEffect/u);
  assert.doesNotMatch(panel, /commitDraft|currentDraft|applyChanges|setEditorState|pending/u);
});
