import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSeasonParticipantLookup,
  buildSeasonParticipantPlan,
  resolveSeasonParticipantRow,
  type SeasonParticipantCatalogTeam
} from "@/lib/season-participant-list";

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "22222222-2222-4222-8222-222222222222";

const club: SeasonParticipantCatalogTeam = {
  id: TEAM_A,
  name: "Clube Exemplo",
  shortName: "CEX",
  slug: "clube-exemplo",
  code: "CEX-CODE"
};

test("1. um alias ativo fornecido pelo catálogo resolve o clube", () => {
  const lookup = buildSeasonParticipantLookup(
    [club],
    [{ teamId: TEAM_A, normalizedAlias: "exemplo-futebol-clube" }]
  );
  assert.deepEqual(
    resolveSeasonParticipantRow(lookup, {
      name: "Exemplo Futebol Clube",
      shortName: "CEX",
      slug: "clube-exemplo"
    }),
    { status: "resolved", teamId: TEAM_A }
  );
});

test("2. um alias inativo ausente da query não resolve", () => {
  const lookup = buildSeasonParticipantLookup([club], []);
  assert.deepEqual(
    resolveSeasonParticipantRow(lookup, {
      name: "Nome Antigo Inativo",
      shortName: "CEX",
      slug: "clube-exemplo"
    }),
    { status: "unresolved" }
  );
});

test("3. public_name isolado não participa na identidade", () => {
  const teamWithDisplayOnlyName = { ...club, publicName: "Exemplo Público" };
  const lookup = buildSeasonParticipantLookup([teamWithDisplayOnlyName], []);
  assert.deepEqual(
    resolveSeasonParticipantRow(lookup, {
      name: "Exemplo Público",
      shortName: "",
      slug: ""
    }),
    { status: "unresolved" }
  );
});

test("4. um clube fora do catálogo do país selecionado não resolve", () => {
  const lookup = buildSeasonParticipantLookup(
    [],
    [{ teamId: TEAM_A, normalizedAlias: "exemplo-futebol-clube" }]
  );
  assert.deepEqual(
    resolveSeasonParticipantRow(lookup, {
      name: "Exemplo Futebol Clube",
      shortName: "CEX",
      slug: "clube-exemplo"
    }),
    { status: "unresolved" }
  );
});

test("5. identificadores discordantes continuam em conflito", () => {
  const otherClub: SeasonParticipantCatalogTeam = {
    id: TEAM_B,
    name: "Outro Clube",
    shortName: "OUT",
    slug: "outro-clube",
    code: null
  };
  const lookup = buildSeasonParticipantLookup([club, otherClub], []);
  assert.deepEqual(
    resolveSeasonParticipantRow(lookup, {
      name: "Clube Exemplo",
      shortName: "OUT",
      slug: "clube-exemplo"
    }),
    { status: "conflict", teamIds: [TEAM_A, TEAM_B] }
  );
});

test("6. uma identidade partilhada por dois clubes permanece ambígua", () => {
  const secondClub: SeasonParticipantCatalogTeam = {
    id: TEAM_B,
    name: "Clube Exemplo",
    shortName: "CEX2",
    slug: "clube-exemplo-2",
    code: null
  };
  const lookup = buildSeasonParticipantLookup([club, secondClub], []);
  assert.deepEqual(
    resolveSeasonParticipantRow(lookup, {
      name: "Clube Exemplo",
      shortName: "",
      slug: ""
    }),
    { status: "ambiguous", teamIds: [TEAM_A, TEAM_B] }
  );
});

test("7. um clube criado e o seu alias ativo ficam associáveis à época", () => {
  const plan = buildSeasonParticipantPlan({
    rawList: "Exemplo Futebol Clube;CEX;clube-exemplo;;#123ABC",
    teams: [club],
    aliases: [{ teamId: TEAM_A, normalizedAlias: "exemplo-futebol-clube" }],
    participants: []
  });
  assert.equal(plan.applicable, true);
  assert.equal(plan.rows[0]?.action, "associate");
  assert.equal(plan.rows[0]?.teamId, TEAM_A);
});

test("8. o formato atual de preparação de participantes permanece aceite", () => {
  const plan = buildSeasonParticipantPlan({
    rawList: "Nome;Sigla;Slug;Emblema URL;Cor\nClube Exemplo;CEX;clube-exemplo;;#123ABC",
    teams: [club],
    aliases: [],
    participants: []
  });
  assert.equal(plan.headerPresent, true);
  assert.equal(plan.applicable, true);
  assert.equal(plan.rows[0]?.action, "associate");
});
