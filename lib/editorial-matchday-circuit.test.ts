import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  activeMatchdayEditorialCircuit,
  isEditorialProfileCompatibleWithCompetition,
  matchdayEditorialCircuitAssignment,
  matchdayEditorialCircuitOptions,
} from "@/lib/editorial-matchday-circuit";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const PAGE_PATH = "app/admin/editorial/jornada/[matchdayId]/page.tsx";

const ROUTE_PATH = "app/api/admin/editorial/jornada/[matchdayId]/circuito-editorial/route.ts";
const ASSIGNMENT_MIGRATION_PATH = "supabase/migrations/20260822154500_matchday_editorial_profile_assignment.sql";

const pageSource = readFileSync(PAGE_PATH, "utf8");

const routeSource = readFileSync(ROUTE_PATH, "utf8");
const assignmentMigration = readFileSync(ASSIGNMENT_MIGRATION_PATH, "utf8");

test("sem assignment o circuito ativo é Atual / Legacy", () => {
  assert.equal(activeMatchdayEditorialCircuit(null), "legacy");
  assert.deepEqual(matchdayEditorialCircuitOptions("outra-competicao"), [{
    circuit: "legacy",
    label: "Atual / Legacy",
    profileKey: null,
  }]);
});

test("Liga Portugal oferece ativação temática derivada do registry", () => {
  const profile = EDITORIAL_PROFILES.liga_portugal_v1;
  const options = matchdayEditorialCircuitOptions(profile.competitionSlug);

  assert.deepEqual(options, [
    { circuit: "legacy", label: "Atual / Legacy", profileKey: null },
    { circuit: "thematic", label: profile.displayName, profileKey: "liga_portugal_v1" },
  ]);
  assert.equal(matchdayEditorialCircuitAssignment("thematic", profile.competitionSlug), "liga_portugal_v1");
  assert.equal(activeMatchdayEditorialCircuit("liga_portugal_v1"), "thematic");
});

test("retorno a Legacy e reativação temática são reversíveis", () => {
  const slug = EDITORIAL_PROFILES.liga_portugal_v1.competitionSlug;

  assert.equal(matchdayEditorialCircuitAssignment("thematic", slug), "liga_portugal_v1");
  assert.equal(matchdayEditorialCircuitAssignment("legacy", slug), null);
  assert.equal(matchdayEditorialCircuitAssignment("thematic", slug), "liga_portugal_v1");
});

test("competição incompatível não oferece nem aceita liga_portugal_v1", () => {
  assert.equal(isEditorialProfileCompatibleWithCompetition("liga_portugal_v1", "outra-liga"), false);
  assert.equal(matchdayEditorialCircuitOptions("outra-liga").some((option) => option.circuit === "thematic"), false);
  assert.throws(
    () => matchdayEditorialCircuitAssignment("thematic", "outra-liga"),
    /matchday-editorial-circuit-incompatible-competition/,
  );
  assert.match(routeSource, /isEditorialProfileCompatibleWithCompetition\(profileKey, competitionSlug\)/);
});

test("a página Legacy lê a assignment e encaminha Jornadas temáticas para a Mesa", () => {
  assert.match(
    pageSource,
    /matchday_editorial_profile_assignments\?select=profile_key/,
  );
  assert.match(
    pageSource,
    /if \(editorialProfileAssignment\) \{[\s\S]*?redirect\([\s\S]*?\/organizar/,
  );
  assert.doesNotMatch(pageSource, /<EditorialCircuitSelector/);
});

test("a rota usa apenas a RPC de assignment existente para mudar o circuito", () => {
  assert.match(routeSource, /rpc\/set_matchday_editorial_profile_assignment/);
  assert.match(routeSource, /p_profile_key: profileKey/);
  assert.equal((routeSource.match(/writeSupabaseAdmin\(/g) ?? []).length, 1);
  assert.match(routeSource, /writeSupabaseAdmin\("rpc\/set_matchday_editorial_profile_assignment"/);
  assert.doesNotMatch(routeSource, /matchday_editorial_profile_(?:state_items|manual_overrides|zone_items)/);
  assert.doesNotMatch(routeSource, /matchday_horizontal_news|matchday_editorial_bank_items|editorial_articles/);
  assert.doesNotMatch(routeSource, /writeSupabaseAdmin\("(?:matchday|editorial|seasons|competitions)/);
});

test("desativar assignment não apaga estado, overrides ou snapshot temáticos", () => {
  const nullBranch = assignmentMigration.slice(
    assignmentMigration.indexOf("if p_profile_key is null then"),
    assignmentMigration.indexOf("if p_profile_key is distinct from"),
  );

  assert.match(nullBranch, /delete from public\.matchday_editorial_profile_assignments/);
  assert.doesNotMatch(nullBranch, /matchday_editorial_profile_state_items/);
  assert.doesNotMatch(nullBranch, /matchday_editorial_profile_manual_overrides/);
  assert.doesNotMatch(nullBranch, /matchday_editorial_profile_zone_items/);
  assert.doesNotMatch(nullBranch, /matchday_horizontal_news|matchday_editorial_bank_items|editorial_articles/);
});
