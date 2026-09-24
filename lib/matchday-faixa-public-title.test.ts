import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PublicHorizontalNewsStrip from "@/components/public/PublicHorizontalNewsStrip";

(globalThis as typeof globalThis & {
  React: typeof React;
}).React = React;

function source(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

const migration = source(
  "supabase/migrations/20260924163000_matchday_faixa_public_title.sql",
);
const client = source(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
);
const route = source(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
);
const publicPage = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
);
const horizontalStrip = source(
  "components/public/PublicHorizontalNewsStrip.tsx",
);
const frame = source(
  "components/public/PublicMatchdayEditorialSectionFrame.tsx",
);
const home = source("app/page.tsx");

const item = {
  id: "article-1",
  label: null,
  labelColor: null,
  title: "Notícia da Faixa",
  subtitle: null,
  imageUrl: null,
  linkUrl: null,
  sortOrder: 1,
};

test("migration acrescenta apenas o título opcional às settings físicas", () => {
  assert.match(
    migration,
    /alter table public\.matchday_live_layout_workspace_settings[\s\S]*add column faixa_public_title text/,
  );
  assert.doesNotMatch(migration, /faixa_public_title text not null/i);
  assert.doesNotMatch(migration, /default\s+["']?Faixa/i);
  assert.equal((migration.match(/\badd column\b/gi) ?? []).length, 1);
  assert.doesNotMatch(migration, /drop\s+(?:column|table)|rename\s+column/i);
});

test("reader, OCC e Apply usam a mesma autoridade física", () => {
  assert.match(
    migration,
    /matchday_live_layout_workspace_token_v22[\s\S]*\|faixa_public_title=[\s\S]*settings_row\.faixa_public_title/,
  );
  assert.match(
    migration,
    /read_matchday_live_layout_workspace_v22[\s\S]*'faixa_public_title'[\s\S]*settings_row\.faixa_public_title/,
  );
  assert.match(
    migration,
    /apply_matchday_live_layout_physical_v29[\s\S]*p_presentation[\s\S]*'faixa_public_title'[\s\S]*update public\.matchday_live_layout_workspace_settings/,
  );
  assert.match(
    migration,
    /p_presentation[\s\S]*- 'faixa_public_title'[\s\S]*- 'roundup_video_heading'/,
  );
  assert.equal((route.match(/await writeSupabaseAdminReturning/g) ?? []).length, 1);
  assert.match(route, /rpc\/apply_matchday_live_layout_physical_v29/);
});

test("continuidade copia o título no handoff físico sem criar backfill", () => {
  assert.match(
    migration,
    /carry_matchday_faixa_public_title_v31[\s\S]*source_row\.faixa_public_title[\s\S]*target_row\.faixa_public_title/,
  );
  assert.match(
    migration,
    /after insert on public\.matchday_editorial_continuity_transitions/,
  );
  assert.doesNotMatch(migration, /update public\.matchday_live_layout_workspace_settings\s+set faixa_public_title = ['"]Faixa/i);
});

test("a Mesa edita o título apenas no draft de Página e blocos", () => {
  assert.match(client, /aria-label="Editar Faixa"/);
  assert.match(client, /aria-label="Título público da Faixa"/);
  assert.match(
    client,
    /changePhysicalDeskPresentation\(state, \{[\s\S]*?faixaPublicTitle: value/,
  );
  const editorStart = client.indexOf("{activeStructureEditorIsFaixa ? (");
  const editorEnd = client.indexOf(") : activeZone ? (", editorStart);
  const editor = client.slice(editorStart, editorEnd);
  assert.doesNotMatch(editor, /fetch\(|Guardar/);

  const workspaceStart = client.indexOf("function renderFaixaWorkspace()");
  const workspaceEnd = client.indexOf(
    "function renderHighlightWorkspace()",
    workspaceStart,
  );
  const workspace = client.slice(workspaceStart, workspaceEnd);
  assert.doesNotMatch(workspace, /faixaPublicTitle|Título público/);
});

test("título preenchido aparece antes dos artigos e vazio não cria heading", () => {
  const titled = renderToStaticMarkup(PublicHorizontalNewsStrip({
    items: [item],
    ownsSectionBoundary: false,
    scope: "matchday",
    title: "Destaques",
  }));
  const empty = renderToStaticMarkup(PublicHorizontalNewsStrip({
    items: [item],
    ownsSectionBoundary: false,
    scope: "matchday",
    title: "",
  }));

  assert.match(titled, /<h2 class="public-horizontal-news-heading">Destaques<\/h2>/);
  assert.ok(
    titled.indexOf("public-horizontal-news-heading")
      < titled.indexOf("public-horizontal-news-stack"),
  );
  assert.doesNotMatch(empty, /<h2 class="public-horizontal-news-heading">/);
  assert.doesNotMatch(empty, />Faixa<\/h2>/);
});

test("Faixa reutiliza o frame comum sem fronteira ou espaçamento duplicados", () => {
  assert.match(frame, /kind: "zone" \| "latest" \| "video" \| "faixa"/);
  assert.match(
    publicPage,
    /<PublicMatchdayEditorialSectionFrame kind="faixa">[\s\S]*?<PublicHorizontalNewsStrip[\s\S]*?ownsSectionBoundary=\{false\}[\s\S]*?title=\{faixaPublicTitle\}/,
  );
  assert.match(
    horizontalStrip,
    /data-owns-section-boundary="false"[\s\S]*?margin-top: 0;[\s\S]*?padding-top: 0;[\s\S]*?border-top: 0/,
  );
  assert.equal(
    (publicPage.match(/<PublicMatchdayEditorialSectionFrame kind="faixa">/g) ?? []).length,
    1,
  );
});

test("heading da Faixa segue a tipografia das zonas apenas na Jornada", () => {
  assert.match(
    horizontalStrip,
    /data-editorial-scope="matchday"\] \.public-horizontal-news-heading[\s\S]*?color: #526174;[\s\S]*?font-family: "Segoe UI", Arial, Helvetica, sans-serif;[\s\S]*?font-size: 18px;[\s\S]*?font-weight: 850;[\s\S]*?text-transform: uppercase/,
  );
  assert.match(
    horizontalStrip,
    /@media \(max-width: 680px\)[\s\S]*?public-horizontal-news-heading[\s\S]*?font-size: 16px/,
  );
});

test("Home conserva a chamada e a fronteira próprias do strip", () => {
  assert.match(
    home,
    /<PublicHorizontalNewsStrip[\s\S]*?items=\{publicHorizontalNews\}[\s\S]*?ariaLabel="Temas a acompanhar"/,
  );
  assert.doesNotMatch(home, /ownsSectionBoundary=\{false\}/);
  assert.match(horizontalStrip, /ownsSectionBoundary = true/);
  assert.match(
    horizontalStrip,
    /\.public-horizontal-news \{[\s\S]*?padding: 22px 0 18px;[\s\S]*?border-top: 1px solid #dbe4ee/,
  );
});
