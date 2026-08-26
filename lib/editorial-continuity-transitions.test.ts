import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260826135535_matchday_editorial_continuity_transitions.sql",
  ),
  "utf8",
);

const sql = migration.replace(/\s+/g, " ").trim();

test("1: a primeira transição válida source→target é admissível", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/i);
  assert.match(
    sql,
    /create table public\.matchday_editorial_continuity_transitions \(/i,
  );
  assert.match(
    sql,
    /source_matchday_id uuid primary key references public\.matchdays\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /target_matchday_id uuid not null unique references public\.matchdays\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /source_composition_id uuid not null references public\.matchday_reference_compositions\(id\) on delete restrict/i,
  );
  assert.match(sql, /continuity_version integer not null/i);
  assert.match(sql, /initialized_at timestamptz not null default now\(\)/i);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/i);
});

test("2: uma segunda transição da mesma source é rejeitada pela chave primária", () => {
  assert.match(sql, /source_matchday_id uuid primary key/i);
  assert.doesNotMatch(sql, /primary key\s*\(\s*source_composition_id\s*\)/i);
});

test("3: uma segunda transição para a mesma target é rejeitada pela unicidade", () => {
  assert.match(sql, /target_matchday_id uuid not null unique/i);
});

test("4: mudar source_composition_id não contorna a idempotência por source e target", () => {
  assert.doesNotMatch(
    sql,
    /source_composition_id uuid not null (?:primary key|unique)/i,
  );
  assert.doesNotMatch(
    sql,
    /(?:primary key|unique)\s*\(\s*source_composition_id\s*\)/i,
  );
  assert.match(sql, /source_matchday_id uuid primary key/i);
  assert.match(sql, /target_matchday_id uuid not null unique/i);
});

test("5: source e target iguais são rejeitadas", () => {
  assert.match(
    sql,
    /check \(source_matchday_id <> target_matchday_id\)/i,
  );
});

test("6: versões anteriores à continuidade v3 são rejeitadas", () => {
  assert.match(sql, /check \(continuity_version >= 3\)/i);
});

test("7: a migration não inicializa automaticamente nenhuma transição", () => {
  assert.doesNotMatch(sql, /\binsert\s+into\b/i);
  assert.doesNotMatch(sql, /\bcreate\s+(?:or\s+replace\s+)?function\b/i);
  assert.doesNotMatch(sql, /\bcreate\s+trigger\b/i);
  assert.doesNotMatch(sql, /carryover_source_composition_id|carryover_snapshot/i);
});

test("a tabela interna fica fechada por RLS e disponível apenas para leitura do service_role", () => {
  assert.match(
    sql,
    /alter table public\.matchday_editorial_continuity_transitions enable row level security/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.matchday_editorial_continuity_transitions from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant select on table public\.matchday_editorial_continuity_transitions to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant (?:insert|update|delete|all) on table public\.matchday_editorial_continuity_transitions/i,
  );
});
