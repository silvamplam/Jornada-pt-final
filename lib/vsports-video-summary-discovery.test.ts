import assert from "node:assert/strict";
import test from "node:test";

import { vsportsEmbedUrl } from "./public-video-embed";
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

function vsportsCard(input: {
  id: string;
  title: string;
  sourcePath: string;
  embedPath: string;
  matchPath: string;
}) {
  const dataEmbed = [
    `&lt;iframe id=&quot;vsports-embd-${input.id}&quot; src=&quot;https://vsports.pt${input.embedPath}?autostart=false&quot;&gt;&lt;/iframe&gt;`,
    `&lt;script src=&quot;https://vsports.pt/vsports/js/embed.js?vid=${input.id}&quot;&gt;&lt;/script&gt;`,
  ].join("");
  return `<div class="card"><a class="video-btn" data-title="${input.title}" data-share="${input.sourcePath}" data-match="${input.matchPath}" data-embed="${dataEmbed}"></a></div>`;
}

const jornada7Cards = [
  {
    id: "130895",
    title: "Liga Portugal Betclic (7ªJ): Resumo Nacional 0-4 Famalicão",
    sourcePath: "/vsports/vod/liga-portugal-betclic-jornada-7-resumo-nacional-0-4-famalicao-130895",
    embedPath: "/vsports/embd/liga-portugal-betclic-7-j-resumo-nacional-0-4-famalicao-130895",
    matchPath: "/vsports/jogo/i-liga/nacional-famalicao/30411",
  },
  {
    id: "130893",
    title: "Liga Portugal Betclic (7ªJ): Resumo Gil Vicente 1-1 Marítimo",
    sourcePath: "/vsports/vod/liga-portugal-betclic-jornada-7-resumo-gil-vicente-1-1-maritimo-130893",
    embedPath: "/vsports/embd/liga-portugal-betclic-7-j-resumo-gil-vicente-1-1-maritimo-130893",
    matchPath: "/vsports/jogo/i-liga/gil-vicente-maritimo/30412",
  },
  {
    id: "130951",
    title: "Liga Portugal Betclic (7ªJ): Resumo Alverca 1-0 Rio Ave",
    sourcePath: "/vsports/vod/liga-portugal-betclic-jornada-7-resumo-alverca-1-0-rio-ave-130951",
    embedPath: "/vsports/embd/liga-portugal-betclic-7-j-resumo-alverca-1-0-rio-ave-130951",
    matchPath: "/vsports/jogo/i-liga/alverca-rio-ave/30415",
  },
  {
    id: "130983",
    title: "Liga Portugal Betclic (7ªJ): Resumo Sporting 2-2 Arouca",
    sourcePath: "/vsports/vod/liga-portugal-betclic-jornada-7-resumo-sporting-2-2-arouca-130983",
    embedPath: "/vsports/embd/liga-portugal-betclic-7-j-resumo-sporting-2-2-arouca-130983",
    matchPath: "/vsports/jogo/i-liga/sporting-arouca/30408",
  },
] as const;

const matchday = `
  ${jornada7Cards.map(vsportsCard).join("\n")}
  ${vsportsCard({
    id: "130894",
    title: "Liga Portugal Betclic (7ªJ): Resumo Flash Nacional 0-4 Famalicão",
    sourcePath: "/vsports/vod/liga-portugal-betclic-jornada-7-resumo-flash-nacional-0-4-famalicao-130894",
    embedPath: "/vsports/embd/liga-portugal-betclic-7-j-resumo-flash-nacional-0-4-famalicao-130894",
    matchPath: "/vsports/jogo/i-liga/nacional-famalicao/30411",
  })}
  <aside><a href="https://www.youtube.com/watch?v=elNskBgE3Ew" title="Resumo: Sporting 2-2 Arouca (Liga 26/27 #7)">YouTube</a></aside>
`;

test("resolve a época e a jornada pedidas sem pesquisa global", () => {
  assert.equal(currentLigaPortugalCompetitionUrl(home), "https://vsports.pt/vsports/competicao/i-liga/31/");
  assert.equal(ligaPortugalSeasonUrl(competition, "2026/27"), "https://vsports.pt/vsports/competicao/i-liga/31/jornadas");
  assert.equal(ligaPortugalMatchdayUrl(competition, 7), "https://vsports.pt/vsports/competicao/i-liga/31/jornadas/4110");
});

test("os quatro resumos completos reais da J7 usam o data-embed oficial do próprio VOD", () => {
  const items = parseVsportsMatchdayDiscoveries(matchday);
  for (const expected of jornada7Cards) {
    const item = items.find((candidate) => candidate.sourceItemId === expected.id);
    assert.ok(item, expected.title);
    assert.equal(item.sourceUrl, `https://vsports.pt${expected.sourcePath}`);
    assert.equal(item.vsportsEmbedUrl, `https://vsports.pt${expected.embedPath}?autostart=false`);
    assert.equal(item.playableMediaUrl, item.vsportsEmbedUrl);
    assert.equal(item.youtubeVideoId, null);
  }
});

test("um YouTube noutro bloco é descoberta independente e não é atribuído ao VOD por proximidade", () => {
  const items = parseVsportsMatchdayDiscoveries(matchday);
  const sportingVod = items.find((item) => item.sourceItemId === "130983");
  const youtube = items.find((item) => item.sourceItemId === "youtube-elNskBgE3Ew");
  assert.equal(sportingVod?.youtubeUrl, null);
  assert.equal(sportingVod?.playableMediaUrl, sportingVod?.vsportsEmbedUrl);
  assert.equal(youtube?.youtubeUrl, "https://www.youtube.com/watch?v=elNskBgE3Ew");
  assert.equal(youtube?.vsportsEmbedUrl, null);
});

test("rejeita data-embed cujo iframe ou script não pertença ao mesmo VOD", () => {
  const mismatched = vsportsCard({
    id: "130983",
    title: "Resumo Sporting 2-2 Arouca",
    sourcePath: "/vsports/vod/resumo-sporting-arouca-130999",
    embedPath: "/vsports/embd/resumo-sporting-arouca-130983",
    matchPath: "/vsports/jogo/i-liga/sporting-arouca/30408",
  });
  const item = parseVsportsMatchdayDiscoveries(mismatched)[0];
  assert.equal(item?.sourceItemId, "130999");
  assert.equal(item?.vsportsEmbedUrl, null);
  assert.equal(item?.playableMediaUrl, null);
});

test("o player VSPORTS só aceita HTTPS e a origem/path oficial sem credentials", () => {
  assert.equal(
    vsportsEmbedUrl("https://vsports.pt/vsports/embd/resumo-130983?autostart=false"),
    "https://vsports.pt/vsports/embd/resumo-130983?autostart=false",
  );
  for (const invalid of [
    "http://vsports.pt/vsports/embd/resumo-130983",
    "https://evil.example/vsports/embd/resumo-130983",
    "https://user:pass@vsports.pt/vsports/embd/resumo-130983",
    "https://vsports.pt/vsports/vod/resumo-130983",
  ]) {
    assert.equal(vsportsEmbedUrl(invalid), null, invalid);
  }
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
