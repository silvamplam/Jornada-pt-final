import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildNewsroomClassificationSeasonContext,
  classifyNewsroomArticleDeterministically,
  classifyNewsroomArticlesDeterministically,
  normalizeNewsroomClassificationEvidence,
  type NewsroomArticleClassificationEvidence,
  type NewsroomClassificationSeasonContext,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier";

const SEASON_ID = "95000000-0000-4000-8000-000000000001";
const COMPETITION_ID = "95000000-0000-4000-8000-000000000002";
const ids = {
  benfica: "95000000-0000-4000-8000-000000000011",
  sporting: "95000000-0000-4000-8000-000000000012",
  porto: "95000000-0000-4000-8000-000000000013",
  braga: "95000000-0000-4000-8000-000000000014",
  estoril: "95000000-0000-4000-8000-000000000015",
  rioAve: "95000000-0000-4000-8000-000000000016",
  nacional: "95000000-0000-4000-8000-000000000017",
  realMadrid: "95000000-0000-4000-8000-000000000018",
  manCity: "95000000-0000-4000-8000-000000000019",
} as const;

function context(): NewsroomClassificationSeasonContext {
  const built = buildNewsroomClassificationSeasonContext({
    seasonId: SEASON_ID,
    competitionId: COMPETITION_ID,
    participantTeamIds: [
      ids.benfica,
      ids.sporting,
      ids.porto,
      ids.braga,
      ids.estoril,
      ids.rioAve,
      ids.nacional,
    ],
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
        id: ids.estoril,
        name: "Grupo Desportivo Estoril Praia",
        publicName: "Estoril Praia",
        shortName: "Estoril",
        slug: "estoril",
        code: "EST",
      },
      {
        id: ids.rioAve,
        name: "Rio Ave Futebol Clube",
        publicName: "Rio Ave",
        shortName: "Rio Ave",
        slug: "rio-ave",
        code: "RAFC",
      },
      {
        id: ids.nacional,
        name: "Clube Desportivo Nacional",
        publicName: "Nacional",
        shortName: "Nacional",
        slug: "nacional",
        code: "CDN",
      },
      {
        id: ids.realMadrid,
        name: "Real Madrid Club de Fútbol",
        publicName: "Real Madrid",
        shortName: "Real Madrid",
        slug: "real-madrid",
        code: "RMA",
      },
      {
        id: ids.manCity,
        name: "Manchester City Football Club",
        publicName: "Manchester City",
        shortName: "Man City",
        slug: "manchester-city",
        code: "MCI",
      },
    ],
    aliases: [
      {
        teamId: ids.benfica,
        alias: "SL Benfica",
        normalizedAlias: "sl-benfica",
      },
      {
        teamId: ids.sporting,
        alias: "Sporting CP",
        normalizedAlias: "sporting-cp",
      },
      {
        teamId: ids.porto,
        alias: "Porto",
        normalizedAlias: "porto",
      },
      {
        teamId: ids.braga,
        alias: "SC Braga",
        normalizedAlias: "sc-braga",
      },
      {
        teamId: ids.estoril,
        alias: "Estoril Praia",
        normalizedAlias: "estoril-praia",
      },
      {
        teamId: ids.rioAve,
        alias: "Rio Ave FC",
        normalizedAlias: "rio-ave-fc",
      },
      {
        teamId: ids.realMadrid,
        alias: "Real Madrid CF",
        normalizedAlias: "real-madrid-cf",
      },
    ],
  });
  assert.ok(built);
  return built;
}

function evidence(
  title: string,
  overrides: Partial<NewsroomArticleClassificationEvidence> = {},
): NewsroomArticleClassificationEvidence {
  return {
    newsroomArticleId: "95000000-0000-4000-8000-000000000099",
    title,
    subtitle: null,
    summary: null,
    body: null,
    ...overrides,
  };
}

function classify(
  title: string,
  overrides: Partial<NewsroomArticleClassificationEvidence> = {},
) {
  return classifyNewsroomArticleDeterministically(
    evidence(title, overrides),
    context(),
  );
}

test("Benfica inequívoco no título classifica como benfica", () => {
  const result = classify("Benfica prepara jogo decisivo");
  assert.equal(result.classificationKey, "benfica");
  assert.equal(result.reason, "single_big_three");
  assert.equal(result.evidenceField, "title");
});

test("Sporting inequívoco no título classifica como sporting", () => {
  assert.equal(
    classify("Sporting renova contrato com médio").classificationKey,
    "sporting",
  );
});

test("FC Porto inequívoco no título classifica como fc_porto", () => {
  assert.equal(
    classify("FC Porto prepara deslocação").classificationKey,
    "fc_porto",
  );
});

test("um participante não-big3 classifica como other_liga_clubs", () => {
  assert.equal(
    classify("Braga confirma novo reforço").classificationKey,
    "other_liga_clubs",
  );
});

test("dois participantes não-big3 continuam na mesma classificação", () => {
  const result = classify("Estoril e Rio Ave empatam num jogo dividido");
  assert.equal(result.classificationKey, "other_liga_clubs");
  assert.deepEqual(result.matchedTeamIds, [ids.estoril, ids.rioAve]);
});

test("equipa conhecida fora da season é evidência positiva de exterior", () => {
  const result = classify("Real Madrid anuncia novo treinador");
  assert.equal(result.classificationKey, "outside_liga_other");
  assert.equal(result.reason, "known_outside_team");
});

test("Seleção Nacional é contexto exterior explícito e específico", () => {
  const result = classify("Seleção Nacional prepara o próximo encontro");
  assert.equal(result.classificationKey, "outside_liga_other");
  assert.equal(result.reason, "explicit_outside_context");
});

test("futebol internacional é contexto exterior explícito", () => {
  assert.equal(
    classify("Futebol internacional em destaque esta noite").classificationKey,
    "outside_liga_other",
  );
});

test("texto genérico sem autoridade identificável fica por classificar", () => {
  const result = classify("Mercado aquece nas últimas horas");
  assert.equal(result.state, "insufficient_evidence");
  assert.equal(result.classificationKey, null);
});

test("título insuficiente e body ausente fica por classificar", () => {
  assert.equal(classify("Última hora", { body: null }).classificationKey, null);
});

test("título inequívoco não depende de body", () => {
  assert.equal(
    classify("SL Benfica fecha acordo", { body: null }).classificationKey,
    "benfica",
  );
});

test("evidência progride por subtitle, summary e body", () => {
  const subtitleResult = classify("Mercado em atualização", {
    subtitle: "Benfica prepara proposta",
  });
  const summaryResult = classify("Mercado em atualização", {
    summary: "O Braga prepara uma proposta",
  });
  const bodyResult = classify("Mercado em atualização", {
    body: "O Real Madrid apresentou o jogador.",
  });

  assert.deepEqual(
    [subtitleResult.classificationKey, subtitleResult.evidenceField],
    ["benfica", "subtitle"],
  );
  assert.deepEqual(
    [summaryResult.classificationKey, summaryResult.evidenceField],
    ["other_liga_clubs", "summary"],
  );
  assert.deepEqual(
    [bodyResult.classificationKey, bodyResult.evidenceField],
    ["outside_liga_other", "body"],
  );
});

test("Benfica e Sporting com evidência equivalente são ambíguos", () => {
  const result = classify("Benfica e Sporting disputam jogador");
  assert.equal(result.state, "ambiguous");
  assert.equal(result.classificationKey, null);
  assert.equal(result.reason, "competing_big_three");
});

test("Benfica prevalece sobre participante não-big3 no headline", () => {
  assert.equal(
    classify("Benfica recebe o Braga").classificationKey,
    "benfica",
  );
});

test("Sporting prevalece sobre clube exterior no headline", () => {
  assert.equal(
    classify("Sporting negoceia com o Manchester City").classificationKey,
    "sporting",
  );
});

test("normalização preserva aliases com acentos e caixa variável", () => {
  assert.equal(normalizeNewsroomClassificationEvidence("  SC BRÁGA  "), "sc braga");
  assert.equal(classify("SC BRÁGA confirma saída").classificationKey, "other_liga_clubs");
});

test("aliases oficiais da tabela participam sem catálogo paralelo", () => {
  assert.equal(
    classify("SL Benfica prepara a pré-época").classificationKey,
    "benfica",
  );
});

test("alias longo de Braga suprime Sporting incidental dentro do nome", () => {
  const result = classify("Sporting Clube de Braga prepara a jornada");
  assert.equal(result.classificationKey, "other_liga_clubs");
  assert.equal(result.state, "classified");
  assert.deepEqual(result.matchedTeamIds, [ids.braga]);
});

test("matching respeita boundary e não encontra Porto em Portimonense", () => {
  assert.equal(
    classify("Portimonense anuncia contratação").classificationKey,
    null,
  );
});

test("evidência de título vence menção incidental no corpo", () => {
  const result = classify("Braga apresenta reforço", {
    body: "O Benfica foi referido a propósito de uma jornada anterior.",
  });
  assert.equal(result.classificationKey, "other_liga_clubs");
  assert.equal(result.evidenceField, "title");
});

test("body com big3 e outro sujeito não promove o big3 incidental", () => {
  const result = classify("Mercado em atualização", {
    body: "O Benfica e o Braga analisam alternativas para o plantel.",
  });
  assert.equal(result.state, "ambiguous");
  assert.equal(result.reason, "body_mixed_subjects");
});

test("equipa big3 fora da season é outside, não perfil global escondido", () => {
  const base = context();
  const withoutBenfica: NewsroomClassificationSeasonContext = {
    ...base,
    teams: base.teams.map((team) => team.id === ids.benfica
      ? { ...team, participating: false, classificationKey: "outside_liga_other" }
      : team),
  };
  const result = classifyNewsroomArticleDeterministically(
    evidence("Benfica prepara jogo"),
    withoutBenfica,
  );
  assert.equal(result.classificationKey, "outside_liga_other");
});

test("batch puro preserva ordem e reutiliza o mesmo contexto", () => {
  const items = [
    evidence("Benfica prepara jogo", { newsroomArticleId: ids.benfica }),
    evidence("Notícia sem sujeito", { newsroomArticleId: ids.realMadrid }),
    evidence("Rio Ave apresenta reforço", { newsroomArticleId: ids.rioAve }),
  ];
  const results = classifyNewsroomArticlesDeterministically(items, context());
  assert.deepEqual(
    results.map((item) => [item.newsroomArticleId, item.result.classificationKey]),
    [
      [ids.benfica, "benfica"],
      [ids.realMadrid, null],
      [ids.rioAve, "other_liga_clubs"],
    ],
  );
});

test("motor puro não depende de Supabase, rede ou writes", () => {
  const source = readFileSync(
    "lib/redacao-automatica/newsroom-deterministic-classifier.ts",
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /server-only|supabase|fetch\s*\(|writeSupabase|insert\s+into|update\s+public|delete\s+from/i,
  );
});
