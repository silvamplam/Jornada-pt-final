import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync(
  "supabase/migrations/20260907224500_matchday_roundup_context_boundary_v28.sql",
  "utf8",
);

test("roundup deixa definitivamente de fazer carryover N para N+1", () => {
  assert.match(sql, /v_roundup_count := 0/u);
  assert.match(
    sql,
    /source_row\.matchday_id = p_source_matchday_id[\s\S]*and false/u,
  );
  assert.match(
    sql,
    /roundup_row\.matchday_id = p_target_matchday_id[\s\S]*and false/u,
  );
});

test("roundup fica protegido por contexto real de jogo e candidato", () => {
  assert.match(sql, /matchday-roundup-match-context-mismatch/u);
  assert.match(sql, /match_row\.matchday_id = new\.matchday_id/u);
  assert.match(sql, /matchday-roundup-candidate-context-mismatch/u);
  assert.match(sql, /candidate_row\.matchday_id = new\.matchday_id/u);
  assert.match(sql, /create trigger matchday_roundup_context_v28/u);
});

test("V28 saneia apenas rela??es contextualmente imposs?veis", () => {
  assert.match(sql, /delete from public\.matchday_roundup_items/u);
  assert.match(sql, /not exists[\s\S]*public\.matches/u);
  assert.match(sql, /not exists[\s\S]*public\.match_video_summary_candidates/u);
  assert.match(sql, /set inherited_roundup_count = 0/u);
});
