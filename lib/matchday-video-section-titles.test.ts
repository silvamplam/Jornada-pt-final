import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260924120000_matchday_video_highlight_section_titles.sql",
  "utf8",
);
const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);

test("migration cria apenas o campo dedicado que faltava", () => {
  assert.match(
    migration,
    /alter table public\.matchday_editorials[\s\S]*add column video_highlight_section_title text/,
  );
  assert.doesNotMatch(
    migration,
    /add column(?: if not exists)? roundup_video_heading/,
  );
  assert.match(
    migration,
    /video_highlight_section_title[\s\S]*distinct from complementary_label/,
  );
});

test("reader e token físicos incluem os dois títulos persistidos", () => {
  assert.match(
    migration,
    /matchday_live_layout_workspace_token_v22[\s\S]*roundup_video_heading[\s\S]*video_highlight_section_title/,
  );
  assert.match(
    migration,
    /read_matchday_live_layout_workspace_v22[\s\S]*jsonb_build_object\([\s\S]*'roundup_video_heading'[\s\S]*'video_highlight_section_title'/,
  );
});

test("Apply físico persiste títulos na mesma transação e conserva um único write HTTP", () => {
  assert.match(
    migration,
    /apply_matchday_live_layout_physical_v29[\s\S]*apply_matchday_live_layout_physical_v22[\s\S]*update public\.matchday_editorials/,
  );
  assert.match(
    migration,
    /p_presentation[\s\S]*- 'roundup_video_heading'[\s\S]*- 'video_highlight_section_title'/,
  );
  assert.match(
    migration,
    /set roundup_video_heading = nullif\(v_roundup_video_heading, ''\),[\s\S]*video_highlight_section_title/,
  );
  assert.equal(
    (route.match(/await writeSupabaseAdminReturning/g) ?? []).length,
    1,
  );
  assert.match(route, /rpc\/apply_matchday_live_layout_physical_v29/);
});

test("carryover preserva o novo título sem alterar o carryover de roundup existente", () => {
  assert.match(
    migration,
    /after insert on public\.matchday_editorial_continuity_transitions/,
  );
  assert.match(
    migration,
    /source_row\.video_highlight_section_title/,
  );
  assert.doesNotMatch(
    migration,
    /set roundup_video_heading = source_row\.roundup_video_heading/,
  );
});

test("Página e blocos projeta só zonas e a rail continua a projetar zone mais video", () => {
  assert.match(
    client,
    /pageStructureBlocks = current\.blocks\.filter\([\s\S]*block\.kind === "zone"/,
  );
  assert.match(
    client,
    /railOrderBlocks = current\.blocks\.filter\([\s\S]*block\.kind === "zone" \|\| block\.kind === "video"/,
  );
});
