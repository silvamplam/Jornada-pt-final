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

test("uma alternativa confirmada atualiza o mesmo roundup sem duplicar a posição editorial", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const provider = source("lib/match-video-summary-provider.ts");
  const promotion = sync.slice(
    sync.indexOf("async function promoteCandidate"),
    sync.indexOf("export async function syncMatchVideoSummaries"),
  );
  assert.match(promotion, /const roundupToUpdate = sameVideo \?\? sameMatch/u);
  assert.match(promotion, /matchday_roundup_items\?id=eq\.\$\{encodeURIComponent\(roundupToUpdate\.id\)\}/u);
  assert.doesNotMatch(promotion, /roundup-match-occupied/u);
  assert.match(promotion, /const mediaPatch = confirmedCandidateMediaPatch\(candidate/u);
  assert.match(promotion, /\.\.\.mediaPatch/u);
  assert.match(provider, /youtube_video_id: candidate\.provider === "youtube" \? candidate\.provider_video_id : null/u);
  assert.match(provider, /youtube_channel_id: candidate\.provider === "youtube" \? candidate\.channel_id : null/u);
  assert.match(provider, /video_url: candidate\.playable_media_url \?\? candidate\.canonical_url/u);
  assert.match(provider, /source_candidate_id: candidate\.id/u);
});

test("o contador da recolha mostra também os jogos por terminar", () => {
  const client = source("components/admin/MatchdayVideoSummarySync.tsx");
  assert.match(client, /state\.waitingCount > 0/u);
  assert.match(client, /por terminar/u);
});

test("fontes configuradas e históricas são combinadas antes do discovery YouTube", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  assert.match(sync, /inferTrustedSourceChannelIds\(approvedVideos\.flatMap/u);
  assert.match(sync, /mergeTrustedSourceChannelIds\(configured, inferred\)/u);
  assert.doesNotMatch(sync, /if \(configured\.length > 0\) return/u);
  assert.match(sync, /\.\.\.targetIds/u);
});

test("sync nunca promove e confirmação explícita continua como única fronteira de publicação", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const automatic = sync.slice(
    sync.indexOf("export async function syncMatchVideoSummaries"),
    sync.indexOf("export async function syncRelevantMatchVideoSummaries"),
  );
  const confirmation = sync.slice(
    sync.indexOf("export async function confirmMatchVideoSummaryCandidate"),
    sync.indexOf("export async function rejectMatchVideoSummaryCandidate"),
  );
  assert.doesNotMatch(automatic, /promoteCandidate\(/u);
  assert.doesNotMatch(automatic, /matchday_roundup_items/u);
  assert.match(confirmation, /await promoteCandidate\(base, candidate\)/u);
  assert.equal(sync.match(/promoteCandidate\(base, candidate\)/gu)?.length, 1);
  assert.match(sync.slice(sync.indexOf("async function promoteCandidate"), sync.indexOf("export async function syncMatchVideoSummaries")), /status: "published"/u);
});

test("migration mantém histórico full e limita candidatos aos providers YouTube/VSPORTS", () => {
  const migration = source("supabase/migrations/20260920180000_match_video_summary_discovery_audit.sql");
  const originalSchema = source("supabase/sql/jornada-resumos-video-automaticos-1-aplicar.sql");
  assert.match(originalSchema, /check \(provider = 'youtube'\)/u);
  assert.match(migration, /drop constraint if exists match_video_summary_candidates_provider_check/iu);
  assert.match(migration, /check \(provider in \('youtube', 'vsports'\)\)/u);
  assert.match(migration, /add column if not exists source_url text/u);
  assert.match(migration, /add column if not exists playable_media_url text/u);
  assert.match(migration, /summary_kind text not null default 'full'/u);
  assert.doesNotMatch(migration, /update public\.match_video_summary_candidates/iu);
  for (const reason of [
    "full",
    "flash",
    "not-summary",
    "outside-window",
    "teams-not-recognized",
    "score-mismatch",
    "ambiguous-match",
    "already-associated",
    "no-playable-media",
  ]) {
    assert.match(migration, new RegExp(`'${reason}'`, "u"));
  }
  assert.match(migration, /enable row level security/u);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/u);
});

test("VSPORTS com data-embed oficial mantém atualização manual e o cron fica desativado", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const cron = source("app/api/cron/jornada/video-summaries/route.ts");
  const manualRoute = source("app/api/admin/editorial/jornada/[matchdayId]/video-summaries/route.ts");
  const historicalMigration = source("supabase/migrations/20260920180000_match_video_summary_discovery_audit.sql");
  const manualOnlyMigration = source("supabase/migrations/20260921122500_match_video_summary_manual_only.sql");
  assert.match(sync, /playableMediaUrl: item\.playableMediaUrl/u);
  assert.match(sync, /await saveVsportsCandidate\(base, input/u);
  assert.match(sync, /reason: "no-playable-media"/u);
  assert.match(sync, /matchVideoSummaryStateNeedsSync\(state\)/u);
  assert.match(sync, /missingVsportsMatchIds\(/u);
  assert.doesNotMatch(sync, /discovery\.supported && discovery\.items\.length === 0/u);
  assert.match(sync, /14 \* 24 \* 60 \* 60 \* 1000/u);
  assert.match(sync, /\.slice\(0, 8\)/u);
  assert.match(manualRoute, /body\.action === "sync"/u);
  assert.match(manualRoute, /syncMatchVideoSummaries\(matchdayId\)/u);
  assert.match(cron, /syncRelevantMatchVideoSummaries/u);
  assert.match(cron, /payload\?\.token/u);
  assert.match(cron, /rpc\/match_video_summary_consume_automation_token_v1/u);
  assert.match(cron, /status: 401/u);
  assert.match(historicalMigration, /jornada-video-summaries-quarter-hour/u);
  assert.match(historicalMigration, /extensions\.gen_random_bytes\(32\)/u);
  assert.match(
    manualOnlyMigration,
    /cron\.unschedule\('jornada-video-summaries-quarter-hour'\)/u,
  );
  assert.doesNotMatch(manualOnlyMigration, /cron\.schedule\(/u);
  assert.doesNotMatch(historicalMigration, /grant execute[\s\S]*to (?:anon|authenticated)/u);
  assert.doesNotMatch(cron, /matchdays\?|seasons\?/u);
});

test("source e media VSPORTS permanecem distintos e o player usa allowlist", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const parser = source("lib/vsports-video-summary-discovery.ts");
  const embed = source("lib/public-video-embed.ts");
  const switcher = source("components/public/RoundupVideoSwitcher.tsx");
  assert.match(sync, /source_url: input\.sourceUrl/u);
  assert.match(sync, /playable_media_url: input\.playableMediaUrl/u);
  assert.match(parser, /officialEmbedFromItem\(anchor\.attr\("data-embed"\), sourceItemId\)/u);
  assert.match(parser, /embedItemId === sourceItemId[\s\S]*iframeItemId === sourceItemId[\s\S]*scriptItemId === sourceItemId/u);
  assert.doesNotMatch(parser, /youtubeLinkFromCard/u);
  assert.match(embed, /hostname !== "vsports\.pt"/u);
  assert.match(embed, /!parsed\.pathname\.startsWith\("\/vsports\/embd\/"\)/u);
  assert.match(switcher, /const officialVsportsEmbed = vsportsEmbedUrl\(value\)/u);
});

test("VSPORTS publicado continua em discovery até YouTube full sem autopromoção", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const types = source("lib/match-video-summary-types.ts");
  const provider = source("lib/match-video-summary-provider.ts");
  const automatic = sync.slice(
    sync.indexOf("export async function syncMatchVideoSummaries"),
    sync.indexOf("export async function syncRelevantMatchVideoSummaries"),
  );
  assert.match(sync, /associatedProvider: roundup \? publishedVideoSummaryProvider\(roundup\) : null/u);
  assert.match(provider, /if \(vsportsEmbedUrl\(item\.video_url\)\) return "vsports"/u);
  assert.match(types, /row\.associatedProvider === "vsports"/u);
  assert.match(types, /candidate\.provider === "youtube" && candidate\.summaryKind === "full"/u);
  assert.match(sync, /associatedMatchIds: youtubeAssociatedMatchIds/u);
  assert.doesNotMatch(automatic, /promoteCandidate\(/u);
  assert.doesNotMatch(automatic, /matchday_roundup_items/u);
});

test("confirmação explícita suporta VSPORTS→YouTube e YouTube→VSPORTS no mesmo item", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const provider = source("lib/match-video-summary-provider.ts");
  const promotion = sync.slice(
    sync.indexOf("async function promoteCandidate"),
    sync.indexOf("export async function syncMatchVideoSummaries"),
  );
  assert.match(promotion, /const roundupToUpdate = sameVideo \?\? sameMatch/u);
  assert.match(promotion, /roundupToUpdate\.id/u);
  assert.match(promotion, /roundupToUpdate\.youtube_video_id = mediaPatch\.youtube_video_id/u);
  assert.match(promotion, /roundupToUpdate\.youtube_channel_id = mediaPatch\.youtube_channel_id/u);
  assert.match(promotion, /roundupToUpdate\.source_candidate_id = mediaPatch\.source_candidate_id/u);
  assert.match(provider, /youtube_video_id: candidate\.provider === "youtube" \? candidate\.provider_video_id : null/u);
  assert.match(provider, /youtube_channel_id: candidate\.provider === "youtube" \? candidate\.channel_id : null/u);
  assert.doesNotMatch(promotion, /delete[\s\S]*match_video_summary_candidates/iu);
});

test("discovery repetido faz upsert pela identidade estável da fonte", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  const migration = source("supabase/migrations/20260920180000_match_video_summary_discovery_audit.sql");
  assert.match(sync, /on_conflict=matchday_id,source_provider,source_item_id/u);
  assert.match(migration, /unique \(matchday_id, source_provider, source_item_id\)/u);
});

test("full tem prioridade visual, permite upgrade e não reabre candidatos rejeitados", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");
  assert.match(sync, /allCandidates\.some\(\(candidate\) => candidate\.summary_kind === "full"\)/u);
  assert.match(sync, /allCandidates\.filter\(\(candidate\) => candidate\.summary_kind === "full"\)/u);
  const existingStart = sync.indexOf("if (existing) {");
  const existingEnd = sync.indexOf("\n  const rows = await writeSupabaseAdminReturning<VideoSummaryCandidateRow>(", existingStart + 1);
  assert.ok(existingStart >= 0 && existingEnd > existingStart);
  const existingUpdate = sync.slice(existingStart, existingEnd);
  assert.doesNotMatch(existingUpdate, /status:/u);
  assert.match(existingUpdate, /summary_kind: upgradedVideoSummaryKind\(existing\.summary_kind, summaryKind\)/u);
});
