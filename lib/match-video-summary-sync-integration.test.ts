import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("a recolha automática fica integrada na zona Vídeo do Editorial da Jornada", () => {
  const page = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  assert.match(page, /import MatchdayVideoSummarySync from "@\/components\/admin\/MatchdayVideoSummarySync";/u);
  assert.match(page, /<MatchdayVideoSummarySync matchdayId=\{matchday\.id\} \/>/u);
});

test("a chave YouTube permanece exclusivamente server-side", () => {
  const youtube = source("lib/youtube-data-api.server.ts");
  const client = source("components/admin/MatchdayVideoSummarySync.tsx");
  assert.match(youtube, /process\.env\.YOUTUBE_DATA_API_KEY/u);
  assert.doesNotMatch(youtube, /NEXT_PUBLIC_YOUTUBE/u);
  assert.doesNotMatch(client, /YOUTUBE_DATA_API_KEY|googleapis\.com/u);
});

test("a recolha YouTube percorre várias páginas da playlist de uploads", () => {
  const youtube = source("lib/youtube-data-api.server.ts");
  assert.match(youtube, /maxPages = 10/u);
  assert.match(youtube, /nextPageToken\?: string;/u);
  assert.match(youtube, /let pageToken: string \| null = null;/u);
  assert.match(youtube, /for \(let page = 0; page < safeMaxPages; page \+= 1\)/u);
  assert.match(youtube, /\.\.\.\(pageToken \? \{ pageToken \} : \{\}\)/u);
  assert.match(youtube, /pageToken = payload\.nextPageToken\?\.trim\(\) \|\| null;/u);
  assert.match(youtube, /if \(!pageToken\) break;/u);
});

test("a Liga Portugal inclui a TVI entre as fontes YouTube autorizadas", () => {
  const youtube = source("lib/youtube-data-api.server.ts");
  assert.match(youtube, /"liga-portugal": \["UC5lg8zKcnJ1rnxR6lPgD1ug"\]/u);
  assert.match(youtube, /return Array\.from\(new Set\(\[\.\.\.configured, \.\.\.builtIn\]\)\);/u);
});

test("a página pública lê a informação de embeddability persistida", () => {
  const publicMatchday = source("lib/public-matchday.ts");
  const switcher = source("components/public/RoundupVideoSwitcher.tsx");
  assert.match(publicMatchday, /video_url,duration,is_embeddable,type/u);
  assert.match(switcher, /activeItem\?\.is_embeddable === false \? null : videoEmbedUrl/u);
});

test("uma edição manual do título ou URL invalida metadados automáticos antigos", () => {
  const route = source("app/api/admin/gestor/route.ts");
  assert.match(route, /payload\.match_id = null;/u);
  assert.match(route, /payload\.youtube_video_id = null;/u);
  assert.match(route, /payload\.source_candidate_id = null;/u);
});

test("a sincronização não substitui silenciosamente um resumo já associado", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  assert.match(sync, /roundup-match-occupied/u);
  assert.match(sync, /A sincronização não substitui escolhas editoriais/u);
});

test("o contador da recolha mostra também os jogos por terminar", () => {
  const client = source("components/admin/MatchdayVideoSummarySync.tsx");
  assert.match(client, /state\.waitingCount > 0/u);
  assert.match(client, /por terminar/u);
});
