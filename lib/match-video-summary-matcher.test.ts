import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanRoundupTitleFromYouTube,
  formatVideoDuration,
  isMainVideoSummaryTitle,
  matchVideoSummaryTitle,
  normalizeVideoSummaryText,
  parseYouTubeDurationSeconds,
} from "./match-video-summary-matcher";

const matches = [
  {
    matchId: "sporting-vitoria",
    homeVariants: ["Sporting", "Sporting CP"],
    awayVariants: ["Vitória SC", "Vitória"],
    homeScore: 3,
    awayScore: 2,
  },
  {
    matchId: "benfica-academico",
    homeVariants: ["Benfica", "SL Benfica"],
    awayVariants: ["Académico de Viseu", "Académico"],
    homeScore: 2,
    awayScore: 2,
  },
];

test("normaliza acentos e pontuação", () => {
  assert.equal(normalizeVideoSummaryText("Vitória SC — Sporting CP"), "vitoria sc sporting cp");
});

test("aceita resumo principal e rejeita resumo flash", () => {
  assert.equal(isMainVideoSummaryTitle("Resumo: Sporting 3-2 Vitória SC - Liga Portugal Betclic | sport tv"), true);
  assert.equal(isMainVideoSummaryTitle("Resumo Flash Sporting 3-2 Vitória SC"), false);
});

test("associa automaticamente quando equipas e resultado coincidem", () => {
  assert.deepEqual(
    matchVideoSummaryTitle("Resumo: Sporting 3-2 Vitória SC - Liga Portugal Betclic | sport tv", matches),
    {
      eligible: true,
      matchId: "sporting-vitoria",
      confidence: 100,
      reason: "teams-and-score",
      matchedHomeVariant: "sporting",
      matchedAwayVariant: "vitoria sc",
    },
  );
});

test("não associa quando o resultado contradiz o jogo", () => {
  const decision = matchVideoSummaryTitle("Resumo: Sporting 2-0 Vitória SC", matches);
  assert.equal(decision.matchId, null);
  assert.equal(decision.reason, "no-match");
});

test("aceita alias curto existente no circuito editorial", () => {
  const decision = matchVideoSummaryTitle("Resumo: Benfica 2-2 Académico - Liga Portugal Betclic", matches);
  assert.equal(decision.matchId, "benfica-academico");
  assert.equal(decision.confidence, 100);
});

test("limpa o título editorial do ruído do YouTube", () => {
  assert.equal(
    cleanRoundupTitleFromYouTube("Resumo: Sporting 3-2 Vitória SC - Liga Portugal Betclic | sport tv"),
    "Sporting 3 - 2 Vitória SC",
  );
  assert.equal(
    cleanRoundupTitleFromYouTube("Liga Portugal Betclic (2ªJ): Resumo Sporting 3-2 Vitória SC"),
    "Sporting 3 - 2 Vitória SC",
  );
});

test("converte duração ISO 8601 para formato editorial", () => {
  assert.equal(parseYouTubeDurationSeconds("PT5M2S"), 302);
  assert.equal(formatVideoDuration(302), "05:02");
});


test("resolve os nove padrões reais de uma jornada sem colisões", () => {
  const jornada = [
    ["estoril-famalicao", ["Estoril Praia", "Estoril"], ["Famalicão", "Famalicao"], 1, 1, "Resumo: Estoril 1-1 Famalicão - Liga Portugal Betclic | sport tv"],
    ["maritimo-casa-pia", ["Marítimo", "Maritimo M"], ["Casa Pia"], 1, 0, "Resumo: Marítimo 1-0 Casa Pia - Liga Portugal Betclic | sport tv"],
    ["vitoria-arouca", ["Vitória SC", "Vitoria"], ["Arouca"], 0, 1, "Resumo: Vitória SC 0-1 Arouca - Liga Portugal Betclic | sport tv"],
    ["estrela-sporting", ["Estrela da Amadora", "Estrela Amadora"], ["Sporting", "Sporting CP"], 2, 2, "Resumo: Estrela Amadora 2-2 Sporting - Liga Portugal Betclic | sport tv"],
    ["porto-alverca", ["FC Porto", "Porto"], ["Alverca", "FC Alverca"], 2, 0, "Resumo: FC Porto 2-0 Alverca - Liga Portugal Betclic | sport tv"],
    ["benfica-academico-real", ["Benfica", "SL Benfica"], ["Académico de Viseu", "Académico"], 2, 2, "Resumo: Benfica 2-2 Académico - Liga Portugal Betclic | sport tv"],
    ["gil-rio-ave", ["Gil Vicente", "Gil Vicente FC"], ["Rio Ave", "Rio Ave FC"], 1, 0, "Resumo: Gil Vicente 1-0 Rio Ave - Liga Portugal Betclic | sport tv"],
    ["moreirense-braga", ["Moreirense", "Moreirense FC"], ["Braga", "SC Braga"], 2, 2, "Resumo: Moreirense 2-2 SC Braga - Liga Portugal Betclic | sport tv"],
    ["santa-clara-nacional", ["Santa Clara"], ["Nacional"], 2, 2, "Resumo: Santa Clara 2-2 Nacional - Liga Portugal Betclic | sport tv"],
  ] as const;

  const targets = jornada.map(([matchId, homeVariants, awayVariants, homeScore, awayScore]) => ({
    matchId,
    homeVariants: [...homeVariants],
    awayVariants: [...awayVariants],
    homeScore,
    awayScore,
  }));

  for (const [matchId, , , , , title] of jornada) {
    const decision = matchVideoSummaryTitle(title, targets);
    assert.equal(decision.matchId, matchId, title);
    assert.equal(decision.confidence, 100, title);
  }
});
