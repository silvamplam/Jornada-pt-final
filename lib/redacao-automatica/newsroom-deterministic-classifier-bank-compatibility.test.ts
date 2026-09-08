import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildNewsroomClassificationSeasonContext,
  classifyNewsroomArticleDeterministically,
  type NewsroomArticleClassificationEvidence,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier";

const historicalBank = readFileSync(
  "supabase/migrations/20260826134553_matchday_editorial_bank_automatic_eligibility.sql",
  "utf8",
);
const headlineBank = readFileSync(
  "supabase/migrations/20260828101705_thematic_editorial_new_workflow.sql",
  "utf8",
);
const preservedBank = readFileSync(
  "supabase/migrations/20260829160000_thematic_positional_order_without_actuality.sql",
  "utf8",
);
const contextualBank = readFileSync(
  "supabase/migrations/20260831110517_matchday_editorial_bank_contextual_classification.sql",
  "utf8",
);
const aliasSeed = readFileSync(
  "supabase/sql/fase-importador-jogos-team-aliases.sql",
  "utf8",
);

const ids = {
  benfica: "98000000-0000-4000-8000-000000000001",
  sporting: "98000000-0000-4000-8000-000000000002",
  porto: "98000000-0000-4000-8000-000000000003",
  braga: "98000000-0000-4000-8000-000000000004",
  realMadrid: "98000000-0000-4000-8000-000000000005",
} as const;

const builtContext = buildNewsroomClassificationSeasonContext({
  seasonId: "98000000-0000-4000-8000-000000000006",
  competitionId: "98000000-0000-4000-8000-000000000007",
  participantTeamIds: [ids.benfica, ids.sporting, ids.porto, ids.braga],
  teams: [
    {
      id: ids.benfica,
      name: "Sport Lisboa e Benfica",
      publicName: "Benfica",
      shortName: "Benfica",
      slug: "benfica",
      code: "SLB",
    },
    {
      id: ids.sporting,
      name: "Sporting Clube de Portugal",
      publicName: "Sporting",
      shortName: "Sporting CP",
      slug: "sporting",
      code: "SCP",
    },
    {
      id: ids.porto,
      name: "Futebol Clube do Porto",
      publicName: "FC Porto",
      shortName: "FC Porto",
      slug: "fc-porto",
      code: "FCP",
    },
    {
      id: ids.braga,
      name: "Sporting Clube de Braga",
      publicName: "SC Braga",
      shortName: "Braga",
      slug: "braga",
      code: "SCB",
    },
    {
      id: ids.realMadrid,
      name: "Real Madrid Club de Fútbol",
      publicName: "Real Madrid",
      shortName: "Real Madrid",
      slug: "real-madrid",
      code: "RMA",
    },
  ],
  aliases: [
    { teamId: ids.benfica, alias: "SL Benfica", normalizedAlias: "sl-benfica" },
    { teamId: ids.sporting, alias: "Sporting CP", normalizedAlias: "sporting-cp" },
    { teamId: ids.braga, alias: "SC Braga", normalizedAlias: "sc-braga" },
  ],
});
if (!builtContext) throw new Error("invalid_test_context");
const context = builtContext;

function classify(title: string) {
  const evidence: NewsroomArticleClassificationEvidence = {
    newsroomArticleId: "98000000-0000-4000-8000-000000000008",
    title,
    subtitle: null,
    summary: null,
    body: null,
  };
  return classifyNewsroomArticleDeterministically(evidence, context);
}

test("migrations preservam o classificador derivado histórico separado do contrato público", () => {
  assert.match(
    headlineBank,
    /rename to matchday_editorial_profile_classification_plan_body_text_v1/i,
  );
  assert.match(
    preservedBank,
    /rename to matchday_editorial_profile_classification_plan_actuality_v1/i,
  );
  assert.match(
    contextualBank,
    /matchday_editorial_profile_derived_classification_plan_v1[\s\S]*matchday_editorial_profile_classification_plan_actuality_v1/i,
  );
});

test("contrato público atual do Bank projeta a classificação contextual persistida", () => {
  assert.match(
    contextualBank,
    /bank_row\.classification_key as classified_zone_key/i,
  );
  assert.match(
    contextualBank,
    /authority is matchday_editorial_bank_items\.classification_key/i,
  );
});

test("semântica canónica histórica usa season_teams, teams e team_aliases", () => {
  assert.match(historicalBank, /join public\.season_teams/i);
  assert.match(historicalBank, /join public\.teams/i);
  assert.match(historicalBank, /join public\.team_aliases/i);
  assert.match(historicalBank, /season_team_row\.status = 'active'/i);
  assert.match(historicalBank, /team_alias_row\.status = 'active'/i);
  assert.match(historicalBank, /when 'benfica' then 'benfica'/i);
  assert.match(historicalBank, /when 'sporting' then 'sporting'/i);
  assert.match(historicalBank, /when 'fc-porto' then 'fc_porto'/i);
});

test("fixtures do motor usam aliases oficiais existentes no projeto", () => {
  assert.match(aliasSeed, /\('benfica', 'SL Benfica', 'sl-benfica'\)/);
  assert.match(aliasSeed, /\('sporting', 'Sporting CP', 'sporting-cp'\)/);
  assert.match(aliasSeed, /\('braga', 'SC Braga', 'sc-braga'\)/);
});

test("casos de alta confiança coincidem com as prioridades do Bank", () => {
  assert.equal(classify("SL Benfica prepara jogo").classificationKey, "benfica");
  assert.equal(classify("Sporting CP renova contrato").classificationKey, "sporting");
  assert.equal(classify("FC Porto apresenta reforço").classificationKey, "fc_porto");
  assert.equal(classify("SC Braga prepara jornada").classificationKey, "other_liga_clubs");
  assert.equal(classify("Real Madrid apresenta reforço").classificationKey, "outside_liga_other");
});

test("divergência intencional: fallback e conflito do Bank tornam-se null", () => {
  assert.match(historicalBank, /else 'outside_liga_other'[\s\S]*end as classified_zone_key/i);
  const generic = classify("Mercado fecha esta noite");
  const conflict = classify("Benfica e Sporting disputam jogador");
  assert.equal(generic.classificationKey, null);
  assert.equal(generic.state, "insufficient_evidence");
  assert.equal(conflict.classificationKey, null);
  assert.equal(conflict.state, "ambiguous");
});

test("wrapper de 2026-08-28 prova que body deixou de promover big3", () => {
  assert.match(headlineBank, /article_row\.title,[\s\S]*article_row\.subtitle[\s\S]*as normalized_headline/i);
  assert.doesNotMatch(
    headlineBank.match(/as normalized_headline[\s\S]*?from previous_plan/i)?.[0] ?? "",
    /article_row\.body/i,
  );
});
