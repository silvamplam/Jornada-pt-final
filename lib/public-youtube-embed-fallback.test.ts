import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { youtubeThumbnailUrl, youtubeVideoId, youtubeWatchUrl } from "./public-video-embed";

test("reconhece os formatos publicos de URL do YouTube usados pela Jornada", () => {
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=M7lc1UVf-VE"), "M7lc1UVf-VE");
  assert.equal(youtubeVideoId("https://youtu.be/M7lc1UVf-VE?t=12"), "M7lc1UVf-VE");
  assert.equal(youtubeVideoId("https://www.youtube.com/embed/M7lc1UVf-VE"), "M7lc1UVf-VE");
  assert.equal(youtubeVideoId("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"), "M7lc1UVf-VE");
  assert.equal(youtubeVideoId("https://www.youtube.com/shorts/M7lc1UVf-VE"), "M7lc1UVf-VE");
  assert.equal(youtubeVideoId("https://vimeo.com/123456"), null);
});

test("gera URL canonico e thumbnail para o fallback", () => {
  assert.equal(
    youtubeWatchUrl("https://www.youtube.com/embed/M7lc1UVf-VE"),
    "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  );
  assert.equal(
    youtubeThumbnailUrl("https://youtu.be/M7lc1UVf-VE"),
    "https://img.youtube.com/vi/M7lc1UVf-VE/hqdefault.jpg",
  );
});

test("o player publico troca erros de embed por thumbnail e ligacao ao YouTube", () => {
  const player = readFileSync("components/public/YouTubeEmbedWithFallback.tsx", "utf8");
  const roundup = readFileSync("components/public/RoundupVideoSwitcher.tsx", "utf8");
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");
  const contentPage = readFileSync("app/conteudos/[slug]/page.tsx", "utf8");

  assert.match(player, /onError:\s*\(\) => \{/);
  assert.match(player, /setFallbackToYouTube\(true\)/);
  assert.match(player, /Ver vídeo no YouTube/);
  assert.match(player, /href=\{watchUrl\}/);
  assert.match(player, /https:\/\/www\.youtube\.com\/iframe_api/);
  assert.match(roundup, /<YouTubeEmbedWithFallback/);
  assert.match(layout, /<YouTubeEmbedWithFallback/g);
  assert.match(contentPage, /<YouTubeEmbedWithFallback/);
  assert.doesNotMatch(roundup, /<iframe/);
  assert.doesNotMatch(layout, /<iframe/);
  assert.doesNotMatch(contentPage, /<iframe/);
});
