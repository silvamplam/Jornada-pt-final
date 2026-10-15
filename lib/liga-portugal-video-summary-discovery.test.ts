import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLigaPortugalMatchTeams,
  parseLigaPortugalMatchVideoDiscoveries,
  parseVsportsMatchTeams,
  sameVideoSummaryMatchTeams,
} from "./vsports-video-summary-discovery";

const officialTitle = "Liga Portugal - Moreirense FC - Gil Vicente FC";
const vsportsTitle = "Moreirense 0-1 Gil Vicente";

function nuxtFixture() {
  const iframe = [
    "<iframe width='100%' height='100%' id='vsports-embd-131274' ",
    "src='https://ligaportugal.vsports.pt/embd/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1?autostart=true' ",
    "frameborder='0'></iframe>",
    "<script src='//vsports.pt/video/vsports-embd-scripts?vid=131274'></script>",
  ].join("");
  const data = [
    {
      videoId: 1,
      vsportsId: 2,
      title: 3,
      url: 4,
      background: 5,
      publishedAt: 6,
      iframeText: 7,
    },
    "6017796",
    "131274",
    "Liga Portugal Betclic (8ªJ): Resumo Moreirense FC 0-1 Gil Vicente FC",
    "https://ligaportugal.vsports.pt/vod/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1",
    "https://stc.vsports.pt/bigpic/liga/2627/xMfkaDSPBNdgbEHeUXJFF.jpg",
    "2026-10-09T20:35:22.987Z",
    iframe,
  ];
  return `<html><head><title>${officialTitle}</title></head><body><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(data)}</script></body></html>`;
}

test("relaciona o título VSPORTS do jogo com a página oficial da Liga Portugal", () => {
  const vsports = parseVsportsMatchTeams(`<title>${vsportsTitle}</title>`);
  const official = parseLigaPortugalMatchTeams(`<title>${officialTitle}</title>`);
  assert.ok(vsports);
  assert.ok(official);
  assert.equal(sameVideoSummaryMatchTeams(vsports, official), true);
});

test("extrai do __NUXT_DATA__ o resumo real Moreirense 0-1 Gil Vicente", () => {
  const pageUrl = "https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/8/7";
  const items = parseLigaPortugalMatchVideoDiscoveries(nuxtFixture(), pageUrl);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    sourceItemId: "131274",
    title: "Liga Portugal Betclic (8ªJ): Resumo Moreirense FC 0-1 Gil Vicente FC",
    sourceUrl: "https://ligaportugal.vsports.pt/vod/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1",
    matchUrl: pageUrl,
    thumbnailUrl: "https://stc.vsports.pt/bigpic/liga/2627/xMfkaDSPBNdgbEHeUXJFF.jpg",
    publishedAt: "2026-10-09T20:35:22.987Z",
    youtubeVideoId: null,
    youtubeUrl: null,
    vsportsEmbedUrl: "https://ligaportugal.vsports.pt/embd/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1?autostart=true",
    playableMediaUrl: "https://ligaportugal.vsports.pt/embd/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1?autostart=true",
  });
});
