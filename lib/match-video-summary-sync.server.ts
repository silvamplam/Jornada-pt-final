import "server-only";

import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
  type SupabaseMatchdayRoundupItem,
} from "@/lib/supabase";
import { youtubeVideoId } from "@/lib/public-video-embed";
import {
  cleanRoundupTitleFromYouTube,
  formatVideoDuration,
  isMainVideoSummaryTitle,
  matchVideoSummaryTitle,
  normalizeVideoSummaryText,
  parseYouTubeDurationSeconds,
  type VideoSummaryMatchTarget,
} from "@/lib/match-video-summary-matcher";
import type {
  MatchVideoSummaryCandidateView,
  MatchVideoSummaryState,
  MatchVideoSummaryStateRow,
} from "@/lib/match-video-summary-types";
import {
  configuredYouTubeSummaryChannelIds,
  listRecentYouTubeUploads,
  listYouTubeVideos,
  resolveYouTubeUploadsPlaylists,
  YouTubeDataApiError,
  type YouTubeVideoResource,
} from "@/lib/youtube-data-api.server";

type MatchdayRow = {
  id: string;
  season_id: string;
  number: number;
  label: string;
};

type SeasonRow = {
  id: string;
  competition_id: string;
  label: string;
};

type CompetitionRow = {
  id: string;
  name: string;
  slug: string;
};

type MatchRow = {
  id: string;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: string;
  scheduled_date: string | null;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
};

type TeamRow = {
  id: string;
  name: string;
  public_name: string | null;
  short_name: string | null;
  code: string | null;
};

type TeamAliasRow = {
  team_id: string;
  alias: string | null;
  normalized_alias: string | null;
};

type RoundupRow = SupabaseMatchdayRoundupItem & {
  match_id?: string | null;
  youtube_video_id?: string | null;
  youtube_channel_id?: string | null;
  is_embeddable?: boolean | null;
  source_candidate_id?: string | null;
};

export type VideoSummaryCandidateRow = {
  id: string;
  matchday_id: string;
  match_id: string | null;
  provider: "youtube";
  provider_video_id: string;
  canonical_url: string;
  title: string;
  channel_id: string | null;
  channel_title: string | null;
  video_published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  is_embeddable: boolean | null;
  availability_status: string | null;
  source_key: string | null;
  status: "candidate" | "used" | "rejected";
  match_confidence: number | null;
  discovered_at: string;
  last_synced_at: string;
};

export class MatchVideoSummarySyncError extends Error {
  constructor(
    public code:
      | "matchday-not-found"
      | "youtube-api-key-missing"
      | "youtube-api-failed"
      | "youtube-source-missing"
      | "candidate-not-found"
      | "candidate-invalid"
      | "roundup-match-occupied"
      | "roundup-no-slot"
      | "video-summary-schema-missing",
    message: string,
  ) {
    super(message);
  }
}

function cleanIdList(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function idList(ids: string[]) {
  return cleanIdList(ids).map(encodeURIComponent).join(",");
}

async function readFirst<T>(path: string) {
  const rows = await fetchSupabaseAdminTable<T>(`${path}${path.includes("?") ? "&" : "?"}limit=1`);
  return rows[0] ?? null;
}

async function loadContext(matchdayId: string) {
  const matchday = await readFirst<MatchdayRow>(
    `matchdays?select=id,season_id,number,label&id=eq.${encodeURIComponent(matchdayId)}`,
  ).catch(() => null);
  if (!matchday) throw new MatchVideoSummarySyncError("matchday-not-found", "A jornada já não existe.");

  const season = await readFirst<SeasonRow>(
    `seasons?select=id,competition_id,label&id=eq.${encodeURIComponent(matchday.season_id)}`,
  ).catch(() => null);
  if (!season) throw new MatchVideoSummarySyncError("matchday-not-found", "A época da jornada já não existe.");

  const competition = await readFirst<CompetitionRow>(
    `competitions?select=id,name,slug&id=eq.${encodeURIComponent(season.competition_id)}`,
  ).catch(() => null);
  if (!competition) throw new MatchVideoSummarySyncError("matchday-not-found", "A competição da jornada já não existe.");

  return { matchday, season, competition };
}

async function loadRoundups(matchdayId: string): Promise<RoundupRow[]> {
  try {
    return await fetchSupabaseAdminTable<RoundupRow>(
      `matchday_roundup_items?select=id,matchday_id,label,title,subtitle,image_url,video_url,duration,type,sort_order,status,match_id,youtube_video_id,youtube_channel_id,is_embeddable,source_candidate_id,created_at,updated_at&matchday_id=eq.${encodeURIComponent(matchdayId)}&order=sort_order.asc&limit=50`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/match_id|youtube_video_id|source_candidate_id|is_embeddable/iu.test(message)) {
      throw new MatchVideoSummarySyncError(
        "video-summary-schema-missing",
        "A infraestrutura de resumos automáticos ainda não foi aplicada à base de dados.",
      );
    }
    throw error;
  }
}

async function loadBase(matchdayId: string) {
  const context = await loadContext(matchdayId);
  const matches = await fetchSupabaseAdminTable<MatchRow>(
    `matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,status,scheduled_date,kickoff_at,home_score,away_score&matchday_id=eq.${encodeURIComponent(matchdayId)}&order=kickoff_at.asc.nullslast,scheduled_date.asc.nullslast,id.asc&limit=50`,
  );
  const teamIds = cleanIdList(matches.flatMap((match) => [match.home_team_id, match.away_team_id]));
  const teams = teamIds.length > 0
    ? await fetchSupabaseAdminTable<TeamRow>(
        `teams?select=id,name,public_name,short_name,code&id=in.(${idList(teamIds)})&limit=100`,
      )
    : [];
  const aliases = teamIds.length > 0
    ? await fetchSupabaseAdminTable<TeamAliasRow>(
        `team_aliases?select=team_id,alias,normalized_alias&team_id=in.(${idList(teamIds)})&status=eq.active&limit=1000`,
      ).catch(() => [])
    : [];
  const roundups = await loadRoundups(matchdayId);
  const candidates = await fetchSupabaseAdminTable<VideoSummaryCandidateRow>(
    `match_video_summary_candidates?select=id,matchday_id,match_id,provider,provider_video_id,canonical_url,title,channel_id,channel_title,video_published_at,thumbnail_url,duration_seconds,is_embeddable,availability_status,source_key,status,match_confidence,discovered_at,last_synced_at&matchday_id=eq.${encodeURIComponent(matchdayId)}&order=video_published_at.asc.nullslast,discovered_at.asc&limit=200`,
  ).catch((error) => {
    const message = error instanceof Error ? error.message : "";
    if (/match_video_summary_candidates/iu.test(message)) {
      throw new MatchVideoSummarySyncError(
        "video-summary-schema-missing",
        "A infraestrutura de resumos automáticos ainda não foi aplicada à base de dados.",
      );
    }
    throw error;
  });

  return { ...context, matches, teams, aliases, roundups, candidates };
}

function teamDisplayName(team?: TeamRow | null) {
  return team?.public_name?.trim() || team?.name?.trim() || "Equipa";
}

const TEAM_TOKEN_STOPWORDS = new Set(["fc", "sc", "cp", "sl", "cf", "sad", "de", "da", "do", "dos", "das"]);

function teamVariantSources(team: TeamRow, aliases: TeamAliasRow[]) {
  return cleanIdList([
    team.public_name ?? "",
    team.name,
    team.short_name ?? "",
    team.code ?? "",
    ...aliases.filter((alias) => alias.team_id === team.id).flatMap((alias) => [alias.alias ?? "", (alias.normalized_alias ?? "").replace(/-/g, " ")]),
  ]);
}

function buildMatchTargets(matches: MatchRow[], teams: TeamRow[], aliases: TeamAliasRow[]) {
  const teamById = new Map(teams.map((team) => [team.id, team] as const));
  const variantsByTeam = new Map<string, Set<string>>();
  const tokenOwners = new Map<string, Set<string>>();

  teams.forEach((team) => {
    const variants = new Set<string>();
    for (const source of teamVariantSources(team, aliases)) {
      const normalized = normalizeVideoSummaryText(source);
      if (!normalized) continue;
      variants.add(normalized);
      const compact = normalized
        .split(" ")
        .filter((token) => !TEAM_TOKEN_STOPWORDS.has(token))
        .join(" ");
      if (compact) variants.add(compact);
      normalized.split(" ").forEach((token) => {
        if (token.length < 5 || TEAM_TOKEN_STOPWORDS.has(token)) return;
        const owners = tokenOwners.get(token) ?? new Set<string>();
        owners.add(team.id);
        tokenOwners.set(token, owners);
      });
    }
    variantsByTeam.set(team.id, variants);
  });

  tokenOwners.forEach((owners, token) => {
    if (owners.size !== 1) return;
    const [teamId] = owners;
    variantsByTeam.get(teamId)?.add(token);
  });

  const targets: VideoSummaryMatchTarget[] = matches.map((match) => ({
    matchId: match.id,
    homeVariants: Array.from(variantsByTeam.get(match.home_team_id) ?? []),
    awayVariants: Array.from(variantsByTeam.get(match.away_team_id) ?? []),
    homeScore: match.home_score,
    awayScore: match.away_score,
  }));

  return { targets, teamById };
}

function inferredRoundupMatchId(roundup: RoundupRow, targets: VideoSummaryMatchTarget[]) {
  if (roundup.match_id) return roundup.match_id;
  const title = roundup.title?.trim();
  if (!title) return null;
  const decision = matchVideoSummaryTitle(`Resumo ${title}`, targets);
  return decision.matchId;
}

function matchLabel(match: MatchRow, teamById: Map<string, TeamRow>) {
  const home = teamDisplayName(teamById.get(match.home_team_id));
  const away = teamDisplayName(teamById.get(match.away_team_id));
  if (Number.isInteger(match.home_score) && Number.isInteger(match.away_score)) {
    return `${home} ${match.home_score} - ${match.away_score} ${away}`;
  }
  return `${home} — ${away}`;
}

function candidateView(candidate: VideoSummaryCandidateRow): MatchVideoSummaryCandidateView {
  return {
    id: candidate.id,
    title: candidate.title,
    videoUrl: candidate.canonical_url,
    thumbnailUrl: candidate.thumbnail_url,
    duration: formatVideoDuration(candidate.duration_seconds),
    channelTitle: candidate.channel_title,
    isEmbeddable: candidate.is_embeddable,
    confidence: candidate.match_confidence,
  };
}

function buildStateFromBase(base: Awaited<ReturnType<typeof loadBase>>): MatchVideoSummaryState {
  const { targets, teamById } = buildMatchTargets(base.matches, base.teams, base.aliases);
  const roundupByMatchId = new Map<string, RoundupRow>();
  base.roundups.forEach((roundup) => {
    const matchId = inferredRoundupMatchId(roundup, targets);
    if (matchId && !roundupByMatchId.has(matchId)) roundupByMatchId.set(matchId, roundup);
  });
  const candidatesByMatchId = new Map<string, VideoSummaryCandidateRow[]>();
  base.candidates
    .filter((candidate) => candidate.status === "candidate" && candidate.match_id)
    .forEach((candidate) => {
      const list = candidatesByMatchId.get(candidate.match_id as string) ?? [];
      list.push(candidate);
      candidatesByMatchId.set(candidate.match_id as string, list);
    });

  const rows = base.matches.map<MatchVideoSummaryStateRow>((match) => {
    const roundup = roundupByMatchId.get(match.id) ?? null;
    const candidates = candidatesByMatchId.get(match.id) ?? [];
    const waiting = match.status !== "finished";
    return {
      matchId: match.id,
      label: matchLabel(match, teamById),
      status: roundup ? "associated" : candidates.length > 0 ? "candidate" : waiting ? "waiting" : "missing",
      roundupId: roundup?.id ?? null,
      videoUrl: roundup?.video_url ?? null,
      candidates: candidates.map(candidateView),
    };
  });

  return {
    matchdayId: base.matchday.id,
    totalGames: rows.length,
    associatedCount: rows.filter((row) => row.status === "associated").length,
    candidateCount: rows.filter((row) => row.status === "candidate").length,
    missingCount: rows.filter((row) => row.status === "missing").length,
    waitingCount: rows.filter((row) => row.status === "waiting").length,
    rows,
  };
}

export async function readMatchVideoSummaryState(matchdayId: string) {
  return buildStateFromBase(await loadBase(matchdayId));
}

function canonicalYouTubeUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function bestThumbnail(video: YouTubeVideoResource) {
  const thumbnails = video.snippet?.thumbnails ?? {};
  return thumbnails.maxres?.url
    ?? thumbnails.standard?.url
    ?? thumbnails.high?.url
    ?? thumbnails.medium?.url
    ?? thumbnails.default?.url
    ?? null;
}

function videoMetadata(video: YouTubeVideoResource) {
  const seconds = parseYouTubeDurationSeconds(video.contentDetails?.duration);
  return {
    videoId: video.id,
    canonicalUrl: canonicalYouTubeUrl(video.id),
    title: video.snippet?.title?.trim() || "Vídeo YouTube",
    channelId: video.snippet?.channelId?.trim() || null,
    channelTitle: video.snippet?.channelTitle?.trim() || null,
    publishedAt: video.snippet?.publishedAt?.trim() || null,
    thumbnailUrl: bestThumbnail(video),
    durationSeconds: seconds,
    duration: formatVideoDuration(seconds),
    isEmbeddable: typeof video.status?.embeddable === "boolean" ? video.status.embeddable : null,
    availabilityStatus: video.status?.privacyStatus?.trim() || null,
  };
}

async function seasonRoundupVideoIds(seasonId: string, targetRoundups: RoundupRow[]) {
  const targetIds = cleanIdList(targetRoundups.map((row) => row.youtube_video_id || youtubeVideoId(row.video_url) || ""));
  if (targetIds.length > 0) return targetIds;

  const matchdays = await fetchSupabaseAdminTable<{ id: string }>(
    `matchdays?select=id&season_id=eq.${encodeURIComponent(seasonId)}&limit=100`,
  );
  const matchdayIds = matchdays.map((item) => item.id);
  if (matchdayIds.length === 0) return [];

  const rows = await fetchSupabaseAdminTable<{ video_url: string | null; youtube_video_id?: string | null }>(
    `matchday_roundup_items?select=video_url,youtube_video_id&matchday_id=in.(${idList(matchdayIds)})&status=eq.published&video_url=not.is.null&limit=200`,
  ).catch(async () => fetchSupabaseAdminTable<{ video_url: string | null }>(
    `matchday_roundup_items?select=video_url&matchday_id=in.(${idList(matchdayIds)})&status=eq.published&video_url=not.is.null&limit=200`,
  ));

  return cleanIdList(rows.map((row) => ("youtube_video_id" in row && row.youtube_video_id) || youtubeVideoId(row.video_url) || ""));
}

async function trustedSourceChannels(base: Awaited<ReturnType<typeof loadBase>>) {
  const configured = configuredYouTubeSummaryChannelIds(base.competition.id, base.competition.slug);
  if (configured.length > 0) return { channelIds: configured, approvedVideos: [] as YouTubeVideoResource[] };

  const approvedIds = (await seasonRoundupVideoIds(base.season.id, base.roundups)).slice(0, 50);
  if (approvedIds.length === 0) {
    throw new MatchVideoSummarySyncError(
      "youtube-source-missing",
      "Ainda não existe um canal autorizado configurado nem um resumo YouTube previamente aprovado nesta competição.",
    );
  }

  const approvedVideos = await listYouTubeVideos(approvedIds);
  const counts = new Map<string, number>();
  approvedVideos.forEach((video) => {
    const channelId = video.snippet?.channelId?.trim();
    if (channelId) counts.set(channelId, (counts.get(channelId) ?? 0) + 1);
  });

  if (counts.size === 1) {
    return { channelIds: Array.from(counts.keys()), approvedVideos };
  }

  const maxCount = Math.max(0, ...counts.values());
  const channelIds = Array.from(counts.entries())
    .filter(([, count]) => count >= 2 && count >= Math.ceil(maxCount / 2))
    .map(([channelId]) => channelId);

  if (channelIds.length === 0) {
    throw new MatchVideoSummarySyncError(
      "youtube-source-missing",
      "Os vídeos previamente aprovados apontam para fontes diferentes e não permitem determinar automaticamente a fonte autorizada.",
    );
  }

  return { channelIds, approvedVideos };
}

function youtubeError(error: unknown): never {
  if (error instanceof MatchVideoSummarySyncError) throw error;
  if (error instanceof YouTubeDataApiError) {
    throw new MatchVideoSummarySyncError(error.code, error.message);
  }
  throw error;
}

function publicationWindow(matches: MatchRow[]) {
  const timestamps = matches.flatMap((match) => {
    const value = match.kickoff_at || (match.scheduled_date ? `${match.scheduled_date}T12:00:00Z` : null);
    if (!value) return [];
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? [timestamp] : [];
  });
  if (timestamps.length === 0) return null;
  return {
    from: Math.min(...timestamps) - 12 * 60 * 60 * 1000,
    to: Math.max(...timestamps) + 7 * 24 * 60 * 60 * 1000,
  };
}

function publishedInWindow(publishedAt: string | null | undefined, window: ReturnType<typeof publicationWindow>) {
  if (!window || !publishedAt) return true;
  const timestamp = Date.parse(publishedAt);
  return Number.isFinite(timestamp) && timestamp >= window.from && timestamp <= window.to;
}

async function patchRoundupTechnicalMetadata(
  roundup: RoundupRow,
  matchId: string,
  video: YouTubeVideoResource,
) {
  const meta = videoMetadata(video);
  const payload: Record<string, unknown> = {
    match_id: matchId,
    youtube_video_id: meta.videoId,
    youtube_channel_id: meta.channelId,
    is_embeddable: meta.isEmbeddable,
    updated_at: new Date().toISOString(),
  };
  if (!roundup.image_url && meta.thumbnailUrl) payload.image_url = meta.thumbnailUrl;
  if (!roundup.duration && meta.duration) payload.duration = meta.duration;

  await writeSupabaseAdmin(`matchday_roundup_items?id=eq.${encodeURIComponent(roundup.id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function backfillExistingRoundups(
  base: Awaited<ReturnType<typeof loadBase>>,
  approvedVideos: YouTubeVideoResource[],
) {
  const { targets } = buildMatchTargets(base.matches, base.teams, base.aliases);
  const byVideoId = new Map(approvedVideos.map((video) => [video.id, video] as const));
  const unresolvedIds = cleanIdList(base.roundups.flatMap((roundup) => {
    const videoId = roundup.youtube_video_id || youtubeVideoId(roundup.video_url);
    return videoId && !byVideoId.has(videoId) ? [videoId] : [];
  }));
  if (unresolvedIds.length > 0) {
    (await listYouTubeVideos(unresolvedIds)).forEach((video) => byVideoId.set(video.id, video));
  }

  for (const roundup of base.roundups) {
    const videoId = roundup.youtube_video_id || youtubeVideoId(roundup.video_url);
    if (!videoId) continue;
    const video = byVideoId.get(videoId);
    if (!video) continue;
    const sourceTitle = video.snippet?.title?.trim() || (roundup.title ? `Resumo ${roundup.title}` : "");
    const decision = matchVideoSummaryTitle(sourceTitle, targets);
    const matchId = roundup.match_id || decision.matchId;
    if (!matchId) continue;
    await patchRoundupTechnicalMetadata(roundup, matchId, video);
    roundup.match_id = matchId;
    roundup.youtube_video_id = videoId;
    roundup.youtube_channel_id = video.snippet?.channelId?.trim() || null;
    roundup.is_embeddable = typeof video.status?.embeddable === "boolean" ? video.status.embeddable : null;
  }
}

async function existingCandidatesByVideoId(videoIds: string[]) {
  if (videoIds.length === 0) return new Map<string, VideoSummaryCandidateRow>();
  const rows = await fetchSupabaseAdminTable<VideoSummaryCandidateRow>(
    `match_video_summary_candidates?select=id,matchday_id,match_id,provider,provider_video_id,canonical_url,title,channel_id,channel_title,video_published_at,thumbnail_url,duration_seconds,is_embeddable,availability_status,source_key,status,match_confidence,discovered_at,last_synced_at&provider=eq.youtube&provider_video_id=in.(${videoIds.map(encodeURIComponent).join(",")})&limit=200`,
  );
  return new Map(rows.map((row) => [row.provider_video_id, row] as const));
}

async function saveCandidate(
  base: Awaited<ReturnType<typeof loadBase>>,
  video: YouTubeVideoResource,
  matchId: string | null,
  confidence: number,
  existing: VideoSummaryCandidateRow | undefined,
) {
  const meta = videoMetadata(video);
  const now = new Date().toISOString();
  const payload = {
    matchday_id: base.matchday.id,
    match_id: matchId,
    provider: "youtube",
    provider_video_id: meta.videoId,
    canonical_url: meta.canonicalUrl,
    title: meta.title,
    channel_id: meta.channelId,
    channel_title: meta.channelTitle,
    video_published_at: meta.publishedAt,
    thumbnail_url: meta.thumbnailUrl,
    duration_seconds: meta.durationSeconds,
    is_embeddable: meta.isEmbeddable,
    availability_status: meta.availabilityStatus,
    source_key: `${base.competition.id}:${meta.channelId ?? "youtube"}`,
    match_confidence: confidence,
    last_synced_at: now,
  };

  if (existing) {
    if (existing.matchday_id !== base.matchday.id) return existing;
    const rows = await writeSupabaseAdminReturning<VideoSummaryCandidateRow>(
      `match_video_summary_candidates?id=eq.${encodeURIComponent(existing.id)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    return rows[0] ?? { ...existing, ...payload };
  }

  const rows = await writeSupabaseAdminReturning<VideoSummaryCandidateRow>(
    "match_video_summary_candidates",
    {
      method: "POST",
      body: JSON.stringify({ ...payload, status: "candidate", discovered_at: now }),
    },
  );
  return rows[0];
}

function nextSortOrder(matchId: string, base: Awaited<ReturnType<typeof loadBase>>) {
  const orderedMatches = [...base.matches];
  const desired = orderedMatches.findIndex((match) => match.id === matchId) + 1;
  const occupied = new Set(base.roundups.map((roundup) => roundup.sort_order));
  if (desired >= 1 && desired <= 10 && !occupied.has(desired)) return desired;
  for (let order = 1; order <= 10; order += 1) {
    if (!occupied.has(order)) return order;
  }
  return null;
}

async function markCandidateUsed(candidateId: string) {
  await writeSupabaseAdmin(`match_video_summary_candidates?id=eq.${encodeURIComponent(candidateId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "used", last_synced_at: new Date().toISOString() }),
  });
}

async function promoteCandidate(
  base: Awaited<ReturnType<typeof loadBase>>,
  candidate: VideoSummaryCandidateRow,
) {
  const matchId = candidate.match_id;
  if (!matchId || !base.matches.some((match) => match.id === matchId)) {
    throw new MatchVideoSummarySyncError("candidate-invalid", "O candidato já não corresponde a um jogo desta jornada.");
  }

  const sameMatch = base.roundups.find((roundup) => roundup.match_id === matchId);
  const sameVideo = base.roundups.find((roundup) =>
    roundup.youtube_video_id === candidate.provider_video_id
    || youtubeVideoId(roundup.video_url) === candidate.provider_video_id,
  );

  if (sameMatch && sameMatch.id !== sameVideo?.id) {
    throw new MatchVideoSummarySyncError(
      "roundup-match-occupied",
      "Este jogo já tem um resumo associado. A sincronização não substitui escolhas editoriais.",
    );
  }

  if (sameVideo) {
    await writeSupabaseAdmin(`matchday_roundup_items?id=eq.${encodeURIComponent(sameVideo.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        match_id: matchId,
        youtube_video_id: candidate.provider_video_id,
        youtube_channel_id: candidate.channel_id,
        is_embeddable: candidate.is_embeddable,
        source_candidate_id: candidate.id,
        updated_at: new Date().toISOString(),
      }),
    });
    sameVideo.match_id = matchId;
    sameVideo.youtube_video_id = candidate.provider_video_id;
    sameVideo.source_candidate_id = candidate.id;
    await markCandidateUsed(candidate.id);
    return;
  }

  const sortOrder = nextSortOrder(matchId, base);
  if (!sortOrder) {
    throw new MatchVideoSummarySyncError("roundup-no-slot", "Não existe uma posição livre entre os 10 vídeos da jornada.");
  }

  const rows = await writeSupabaseAdminReturning<RoundupRow>("matchday_roundup_items", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: base.matchday.id,
      match_id: matchId,
      label: "Vídeo",
      title: cleanRoundupTitleFromYouTube(candidate.title),
      subtitle: "Golos e resumo do jogo",
      image_url: candidate.thumbnail_url,
      video_url: candidate.canonical_url,
      duration: formatVideoDuration(candidate.duration_seconds),
      type: "video",
      sort_order: sortOrder,
      status: "published",
      youtube_video_id: candidate.provider_video_id,
      youtube_channel_id: candidate.channel_id,
      is_embeddable: candidate.is_embeddable,
      source_candidate_id: candidate.id,
      updated_at: new Date().toISOString(),
    }),
  });
  if (rows[0]) base.roundups.push(rows[0]);
  await markCandidateUsed(candidate.id);
}

export async function syncMatchVideoSummaries(matchdayId: string) {
  try {
    const base = await loadBase(matchdayId);
    const sources = await trustedSourceChannels(base);
    await backfillExistingRoundups(base, sources.approvedVideos);

    const { targets } = buildMatchTargets(base.matches, base.teams, base.aliases);
    const associatedMatchIds = new Set(base.roundups.flatMap((roundup) => {
      const matchId = inferredRoundupMatchId(roundup, targets);
      return matchId ? [matchId] : [];
    }));
    const missingFinishedMatches = base.matches.filter(
      (match) => match.status === "finished" && !associatedMatchIds.has(match.id),
    );

    if (missingFinishedMatches.length === 0) {
      const state = buildStateFromBase(await loadBase(matchdayId));
      return { ...state, sourceChannels: sources.channelIds, message: "Todos os jogos terminados já têm resumo associado." };
    }

    const playlists = await resolveYouTubeUploadsPlaylists(sources.channelIds);
    if (playlists.length === 0) {
      throw new MatchVideoSummarySyncError("youtube-source-missing", "Não foi possível obter a playlist de uploads das fontes autorizadas.");
    }

    const uploads = (await Promise.all(
      playlists.map((playlist) => listRecentYouTubeUploads(playlist.uploadsPlaylistId, 50)),
    )).flat();
    const window = publicationWindow(base.matches);
    const uploadIds = cleanIdList(
      uploads
        .filter((upload) => isMainVideoSummaryTitle(upload.title))
        .filter((upload) => publishedInWindow(upload.publishedAt, window))
        .map((upload) => upload.videoId),
    );
    const videos = await listYouTubeVideos(uploadIds);
    const trusted = new Set(sources.channelIds);
    const plausible = videos.filter((video) => {
      const channelId = video.snippet?.channelId?.trim();
      const title = video.snippet?.title?.trim() || "";
      return Boolean(channelId && trusted.has(channelId) && isMainVideoSummaryTitle(title) && publishedInWindow(video.snippet?.publishedAt, window));
    });
    const existingByVideoId = await existingCandidatesByVideoId(plausible.map((video) => video.id));
    const candidatesByMatch = new Map<string, VideoSummaryCandidateRow[]>();

    for (const video of plausible) {
      const decision = matchVideoSummaryTitle(video.snippet?.title?.trim() || "", targets);
      if (!decision.matchId || associatedMatchIds.has(decision.matchId)) continue;
      const candidate = await saveCandidate(
        base,
        video,
        decision.matchId,
        decision.confidence,
        existingByVideoId.get(video.id),
      );
      if (!candidate || candidate.matchday_id !== base.matchday.id || candidate.status === "rejected") continue;
      const list = candidatesByMatch.get(decision.matchId) ?? [];
      list.push(candidate);
      candidatesByMatch.set(decision.matchId, list);
    }

    for (const [matchId, candidates] of candidatesByMatch) {
      const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.provider_video_id, candidate])).values());
      if (uniqueCandidates.length !== 1) continue;
      const [candidate] = uniqueCandidates;
      if ((candidate.match_confidence ?? 0) < 100 || candidate.status === "used") continue;
      try {
        await promoteCandidate(base, candidate);
        associatedMatchIds.add(matchId);
      } catch (error) {
        if (!(error instanceof MatchVideoSummarySyncError) || error.code !== "roundup-match-occupied") throw error;
      }
    }

    const state = buildStateFromBase(await loadBase(matchdayId));
    const channelTitles = playlists.map((playlist) => playlist.channelTitle);
    return {
      ...state,
      sourceChannels: channelTitles,
      message: `${state.associatedCount} resumos associados · ${state.candidateCount} com decisão pendente · ${state.missingCount} por encontrar.`,
    };
  } catch (error) {
    youtubeError(error);
  }
}

export async function confirmMatchVideoSummaryCandidate(matchdayId: string, candidateId: string) {
  const base = await loadBase(matchdayId);
  const candidate = await readFirst<VideoSummaryCandidateRow>(
    `match_video_summary_candidates?select=id,matchday_id,match_id,provider,provider_video_id,canonical_url,title,channel_id,channel_title,video_published_at,thumbnail_url,duration_seconds,is_embeddable,availability_status,source_key,status,match_confidence,discovered_at,last_synced_at&id=eq.${encodeURIComponent(candidateId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
  );
  if (!candidate) throw new MatchVideoSummarySyncError("candidate-not-found", "O candidato já não existe.");
  if (candidate.status === "rejected") throw new MatchVideoSummarySyncError("candidate-invalid", "O candidato foi rejeitado.");
  if (candidate.status !== "used") await promoteCandidate(base, candidate);
  return buildStateFromBase(await loadBase(matchdayId));
}

export async function rejectMatchVideoSummaryCandidate(matchdayId: string, candidateId: string) {
  const candidate = await readFirst<VideoSummaryCandidateRow>(
    `match_video_summary_candidates?select=id,status&id=eq.${encodeURIComponent(candidateId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
  );
  if (!candidate) throw new MatchVideoSummarySyncError("candidate-not-found", "O candidato já não existe.");
  if (candidate.status === "used") throw new MatchVideoSummarySyncError("candidate-invalid", "Um vídeo já utilizado não pode ser rejeitado por esta ação.");
  await writeSupabaseAdmin(`match_video_summary_candidates?id=eq.${encodeURIComponent(candidateId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "rejected", last_synced_at: new Date().toISOString() }),
  });
  return buildStateFromBase(await loadBase(matchdayId));
}
