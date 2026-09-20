import assert from "node:assert/strict";
import test from "node:test";

import {
  currentLigaPortugalCompetitionUrl,
  ligaPortugalMatchdayUrl,
  ligaPortugalSeasonUrl,
  missingVsportsMatchIds,
  parseVsportsMatchdayDiscoveries,
} from "./vsports-video-summary-discovery";

const home = '<a href="/vsports/competicao/i-liga/31/">Liga Portugal Betclic</a>';
const competition = `
  <select>
    <option value="/vsports/competicao/i-liga/30/jornadas">Época 2025/2026</option>
    <option value="/vsports/competicao/i-liga/31/jornadas">Época 2026/2027</option>
  </select>
  <a href="/vsports/competicao/i-liga/31/jornadas/4110">7ª Jornada</a>
`;

const matchday = `
  <div class="card"><a class="video-btn" data-title="Liga Portugal Betclic (7ªJ): Resumo Flash Nacional 0-4 Famalicão" data-share="/vsports/vod/resumo-flash-nacional-famalicao-130896" data-match="/vsports/jogo/i-liga/nacional-famalicao/30411"></a><span class="card-tag">2026-09-19 17:41:36</span></div>
  <div class="card"><a class="video-btn" data-title="Liga Portugal Betclic (7ªJ): Resumo Flash Gil Vicente 1-1 Marítimo" data-share="/vsports/vod/resumo-flash-gil-maritimo-130894" data-match="/vsports/jogo/i-liga/gil-vicente-maritimo/30412"></a></div>
  <div class="card"><a class="video-btn" data-title="Liga Portugal Betclic (7ªJ): Resumo Flash Alverca 1-0 Rio Ave" data-share="/vsports/vod/resumo-flash-alverca-rio-ave-130952" data-match="/vsports/jogo/i-liga/alverca-rio-ave/30415"></a></div>
  <div class="card"><a class="video-btn" data-title="Liga Portugal Betclic (7ªJ): Resumo Flash Sporting 2-2 Arouca" data-share="/vsports/vod/resumo-flash-sporting-arouca-130984" data-match="/vsports/jogo/i-liga/sporting-arouca/30408"></a></div>
  <div class="card"><a class="video-btn" data-title="Liga Portugal Betclic (7ªJ): Resumo Sporting 2-2 Arouca" data-share="/vsports/vod/resumo-sporting-arouca-130983" data-match="/vsports/jogo/i-liga/sporting-arouca/30408"></a><a href="https://www.youtube.com/watch?v=abcdefghijk">YouTube</a></div>
`;

test("resolve a época e a jornada pedidas sem pesquisa global", () => {
  assert.equal(currentLigaPortugalCompetitionUrl(home), "https://vsports.pt/vsports/competicao/i-liga/31/");
  assert.equal(ligaPortugalSeasonUrl(competition, "2026/27"), "https://vsports.pt/vsports/competicao/i-liga/31/jornadas");
  assert.equal(ligaPortugalMatchdayUrl(competition, 7), "https://vsports.pt/vsports/competicao/i-liga/31/jornadas/4110");
});

test("descobre os quatro jogos da J7 e não inventa media para VSPORTS", () => {
  const items = parseVsportsMatchdayDiscoveries(matchday);
  const flashItems = items.filter((item) => item.title.includes("Resumo Flash"));
  assert.equal(flashItems.length, 4);
  assert.equal(flashItems.every((item) => item.youtubeUrl === null), true);
  const full = items.find((item) => item.title.includes("Resumo Sporting"));
  assert.equal(full?.youtubeVideoId, "abcdefghijk");
  assert.equal(full?.youtubeUrl, "https://www.youtube.com/watch?v=abcdefghijk");
});

test("o parsing repetido é idempotente", () => {
  assert.deepEqual(parseVsportsMatchdayDiscoveries(matchday), parseVsportsMatchdayDiscoveries(matchday));
});

test("marca not-found por jogo mesmo quando a página contém outros resumos", () => {
  assert.deepEqual(
    missingVsportsMatchIds(
      ["nacional-famalicao", "gil-maritimo", "sporting-arouca"],
      ["nacional-famalicao", "sporting-arouca", null],
    ),
    ["gil-maritimo"],
  );
});
