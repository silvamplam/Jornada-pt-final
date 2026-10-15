import assert from "node:assert/strict";
import test from "node:test";

import { createVsportsMatchdayDiscoveryLoader } from "./vsports-video-summary-discovery.server";

const home = '<a href="/vsports/competicao/i-liga/31/">Liga Portugal Betclic</a>';
const competition = `
  <select><option value="/vsports/competicao/i-liga/31/jornadas">Época 2026/2027</option></select>
  <a href="/vsports/competicao/i-liga/31/jornadas/4111">8ª Jornada</a>
`;
const matchday = `
  <a href="/vsports/jogo/i-liga/moreirense-gil-vicente/30422">Moreirense 0-1 Gil Vicente</a>
`;
const vsportsMatch = "<html><head><title>Moreirense 0-1 Gil Vicente</title></head><body></body></html>";

function officialMatch(index: number) {
  if (index !== 7) {
    return `<html><head><title>Liga Portugal - Equipa ${index} - Adversário ${index}</title></head><body><script id="__NUXT_DATA__" type="application/json">[]</script></body></html>`;
  }
  const iframe = "<iframe id='vsports-embd-131274' src='https://ligaportugal.vsports.pt/embd/131274/m/30422/liga/hash?autostart=true'></iframe><script src='//vsports.pt/video/vsports-embd-scripts?vid=131274'></script>";
  const data = [
    { vsportsId: 1, title: 2, url: 3, iframeText: 4, publishedAt: 5 },
    "131274",
    "Liga Portugal Betclic (8ªJ): Resumo Moreirense FC 0-1 Gil Vicente FC",
    "https://ligaportugal.vsports.pt/vod/131274/m/30422/liga/hash",
    iframe,
    "2026-10-09T20:23:18.000Z",
  ];
  const payload = JSON.stringify(data).replace(/</gu, "\\u003C").replace(/>/gu, "\\u003E");
  return `<html><head><title>Liga Portugal - Moreirense FC - Gil Vicente FC</title></head><body><script id="__NUXT_DATA__" type="application/json">${payload}</script></body></html>`;
}

test("quando o índice VSPORTS omite um jogo, procura a página oficial correspondente e encontra o resumo", async () => {
  const requestedLigaPages: string[] = [];
  const loader = createVsportsMatchdayDiscoveryLoader({
    async fetchHtml(url) {
      if (url === "https://vsports.pt/") return home;
      if (url === "https://vsports.pt/vsports/competicao/i-liga/31/") return competition;
      if (url === "https://vsports.pt/vsports/competicao/i-liga/31/jornadas") return competition;
      if (url === "https://vsports.pt/vsports/competicao/i-liga/31/jornadas/4111") return matchday;
      if (url === "https://vsports.pt/vsports/jogo/i-liga/moreirense-gil-vicente/30422") return vsportsMatch;
      throw new Error(`unexpected-vsports-url:${url}`);
    },
    async fetchLigaPortugalHtml(url) {
      requestedLigaPages.push(url);
      const index = Number(url.split("/").at(-1));
      return officialMatch(index);
    },
  });

  const result = await loader({
    competitionSlug: "liga-portugal",
    seasonLabel: "2026/27",
    matchdayNumber: 8,
  });

  const summary = result.items.find((item) => item.sourceItemId === "131274");
  assert.ok(summary);
  assert.equal(summary.title, "Liga Portugal Betclic (8ªJ): Resumo Moreirense FC 0-1 Gil Vicente FC");
  assert.equal(summary.vsportsEmbedUrl, "https://ligaportugal.vsports.pt/embd/131274/m/30422/liga/hash?autostart=true");
  assert.equal(requestedLigaPages.at(-1), "https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/8/7");
  assert.equal(requestedLigaPages.length, 7);
});
