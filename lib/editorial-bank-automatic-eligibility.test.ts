import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260826134553_matchday_editorial_bank_automatic_eligibility.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);

  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `${name} must have a terminated body`);

  return migration.slice(start, end);
}

const classificationPlan = functionBody(
  "matchday_editorial_profile_classification_plan",
);
const canonicalUpsert = functionBody(
  "upsert_matchday_editorial_bank_publication",
);
const bankRefresh = functionBody(
  "refresh_matchday_editorial_profile_distribution_from_bank",
);

test("A: fontes existentes e novas mantêm elegibilidade automática por omissão", () => {
  assert.match(
    migration,
    /add column automatic_eligible boolean not null default true/i,
  );
  assert.doesNotMatch(
    migration,
    /alter column automatic_eligible drop default/i,
  );
  assert.match(
    canonicalUpsert,
    /status,\s*automatic_eligible,\s*continuity_source_matchday_id,\s*continuity_source_composition_id\s*\) values \([\s\S]*?'active',\s*true,\s*null,\s*null/i,
  );
});

test("B: continuidade não elegível fica fora do plano de classificação", () => {
  const canonicalCandidatesStart = classificationPlan.indexOf(
    "canonical_candidates as (",
  );
  const canonicalCandidatesEnd = classificationPlan.indexOf(
    "normalized_candidates as (",
    canonicalCandidatesStart,
  );
  const canonicalCandidates = classificationPlan.slice(
    canonicalCandidatesStart,
    canonicalCandidatesEnd,
  );

  assert.ok(canonicalCandidatesStart >= 0 && canonicalCandidatesEnd > canonicalCandidatesStart);
  assert.match(canonicalCandidates, /bank_row\.matchday_id = p_matchday_id/i);
  assert.match(canonicalCandidates, /bank_row\.status[\s\S]*= 'active'/i);
  assert.match(canonicalCandidates, /bank_row\.source_type[\s\S]*= 'editorial_article'/i);
  assert.match(canonicalCandidates, /bank_row\.automatic_eligible = true/i);
});

test("C: inserir ou remover continuidade exclusiva não recalcula a distribuição", () => {
  assert.match(
    bankRefresh,
    /if tg_op = 'DELETE' then\s*if not old\.automatic_eligible then\s*return null;\s*end if;/i,
  );
  assert.match(
    bankRefresh,
    /elsif tg_op = 'INSERT' then\s*if not new\.automatic_eligible then\s*return null;\s*end if;/i,
  );
  assert.match(
    bankRefresh,
    /elsif not old\.automatic_eligible and not new\.automatic_eligible then\s*return null;/i,
  );
});

test("D: publicação natural promove a linha canónica sem duplicar nem perder proveniência", () => {
  assert.match(
    canonicalUpsert,
    /where bank\.matchday_id = p_matchday_id[\s\S]*bank\.source_type[\s\S]*v_source_type[\s\S]*bank\.source_id[\s\S]*v_source_id[\s\S]*limit 1;/i,
  );
  assert.match(
    canonicalUpsert,
    /if v_keep_id is not null then[\s\S]*update public\.matchday_editorial_bank_items[\s\S]*automatic_eligible = true[\s\S]*where id = v_keep_id;\s*else\s*insert into public\.matchday_editorial_bank_items/i,
  );

  const canonicalUpdateStart = canonicalUpsert.lastIndexOf(
    "update public.matchday_editorial_bank_items",
  );
  const canonicalUpdateEnd = canonicalUpsert.indexOf(
    "where id = v_keep_id;",
    canonicalUpdateStart,
  );
  const canonicalUpdate = canonicalUpsert.slice(
    canonicalUpdateStart,
    canonicalUpdateEnd,
  );

  assert.doesNotMatch(canonicalUpdate, /continuity_source_matchday_id/i);
  assert.doesNotMatch(canonicalUpdate, /continuity_source_composition_id/i);
  assert.match(canonicalUpsert, /for v_drop_id in[\s\S]*where bank\.id <> v_keep_id/i);
  assert.match(classificationPlan, /bank_row\.automatic_eligible = true/i);
});

test("E: linhas normais preservam deduplicação, arquivo e refresh entre jornadas", () => {
  assert.match(
    canonicalUpsert,
    /status = case when v_preserve_archived then 'archived' else status end/i,
  );
  assert.match(
    canonicalUpsert,
    /delete from public\.matchday_editorial_bank_items\s*where id = v_drop_id/i,
  );
  assert.match(
    bankRefresh,
    /elsif old\.matchday_id = new\.matchday_id then[\s\S]*elsif old\.matchday_id < new\.matchday_id then[\s\S]*v_second_matchday_id := new\.matchday_id[\s\S]*else[\s\S]*v_second_matchday_id := old\.matchday_id/i,
  );
  assert.match(
    bankRefresh,
    /old\.automatic_eligible and not new\.automatic_eligible[\s\S]*not old\.automatic_eligible and new\.automatic_eligible/i,
  );
});

test("F: proveniência só aceita o par completo e usa FKs próprias", () => {
  assert.match(
    migration,
    /foreign key \(continuity_source_matchday_id\)\s*references public\.matchdays\(id\)/i,
  );
  assert.match(
    migration,
    /foreign key \(continuity_source_composition_id\)\s*references public\.matchday_reference_compositions\(id\)/i,
  );
  assert.match(
    migration,
    /continuity_source_matchday_id is null\s*and continuity_source_composition_id is null[\s\S]*or \(\s*continuity_source_matchday_id is not null\s*and continuity_source_composition_id is not null/i,
  );
  assert.doesNotMatch(
    migration,
    /origin_slot_type\s*=\s*(continuity_source_matchday_id|continuity_source_composition_id)/i,
  );
  assert.doesNotMatch(
    migration,
    /(continuity_source_matchday_id|continuity_source_composition_id)\s*=\s*origin_slot_type/i,
  );
});
