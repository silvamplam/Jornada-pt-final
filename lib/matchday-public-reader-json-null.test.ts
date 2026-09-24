import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

const migration = source(
  "supabase/migrations/20260924193000_matchday_public_reader_json_null_hotfix.sql",
);
const physicalReader = source("lib/public-matchday-physical.ts");
const authority = source("lib/public-matchday-editorial.ts");

test("v22 preserva ausência física representada por SQL NULL ou JSONB null", () => {
  assert.match(
    migration,
    /when base_row\.workspace_settings is null\s+or pg_catalog\.jsonb_typeof\(base_row\.workspace_settings\) = 'null'\s+then 'null'::jsonb/u,
  );
  assert.doesNotMatch(
    migration,
    /when base_row\.workspace_settings is null then null\s+else/u,
  );
});

test("v22 só enriquece settings físicas reais com os títulos atuais", () => {
  assert.match(
    migration,
    /else base_row\.workspace_settings \|\| pg_catalog\.jsonb_build_object\([\s\S]*'faixa_public_title'[\s\S]*'roundup_video_heading'[\s\S]*'video_highlight_section_title'/u,
  );
  assert.match(
    migration,
    /from public\.read_matchday_live_layout_workspace_v13\(/u,
  );
});

test("hotfix não altera dados, cutover, Apply ou autoridade pública", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:insert into|update|delete from|alter table|drop table|create table)\b/iu,
  );
  assert.doesNotMatch(
    migration,
    /apply_matchday_live_layout_physical/u,
  );
  assert.match(
    physicalReader,
    /if \(row\.workspace_settings !== null\) return true;/u,
  );
  assert.match(
    physicalReader,
    /physical-evidence-without-authority/u,
  );
  assert.match(
    authority,
    /published_reference_composition/u,
  );
  assert.doesNotMatch(
    migration,
    /matchday_reference_compositions|resolvePublicMatchdayEditorialAuthority/u,
  );
});

test("hotfix mantém ACL do reader e recarrega schema PostgREST", () => {
  assert.match(
    migration,
    /revoke all on function\s+public\.read_matchday_live_layout_workspace_v22\(uuid, text\)/u,
  );
  assert.match(
    migration,
    /grant execute on function\s+public\.read_matchday_live_layout_workspace_v22\(uuid, text\)\s+to service_role/u,
  );
  assert.match(migration, /notify pgrst, 'reload schema'/u);
});
