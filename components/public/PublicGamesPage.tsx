import Link from "next/link";
import { publicEditorialStyles } from "@/components/public/publicEditorialStyles";
import { readPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

type MatchRow = {
  id: string;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  scheduled_date: string;
  kickoff_at: string | null;
  status: string | null;
  minute: number | string | null;
  home_score: number | null;
  away_score: number | null;
  broadcast_channel_id: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
};

type CompetitionRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type SeasonRow = {
  id: string;
  label: string | null;
  competition_id?: string | null;
  starts_on?: string | null;
  is_current?: boolean | null;
};

type MatchdayRow = {
  id: string;
  number: number | null;
};

type BroadcastLinkRow = {
  match_id: string | null;
  broadcast_channel_id: string | null;
};

type BroadcastChannelRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
};

type PublicGame = {
  id: string;
  competition: CompetitionRow | null;
  season: SeasonRow | null;
  matchday: MatchdayRow | null;
  homeTeam: TeamRow | null;
  awayTeam: TeamRow | null;
  scheduled_date: string;
  kickoff_at: string | null;
  status: string | null;
  minute: number | string | null;
  home_score: number | null;
  away_score: number | null;
  broadcastChannel: BroadcastChannelRow | null;
};

type PublicGamesPageContentProps = {
  competitionSlug?: string | null;
  seasonLabel?: string | null;
  matchdayNumber?: string | null;
};

const gamesPageStyles = `
  .public-games-season-nav .public-season-nav-inner {
    flex-wrap: nowrap;
    overflow: hidden;
  }

  .public-games-season-nav .public-season-select-wrap {
    font-size: 11px;
  }

  .public-games-season-nav .public-matchday-nav {
    flex: 1 1 auto;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .public-games-season-nav .public-matchday-nav a {
    font-size: 11px;
    white-space: nowrap;
  }

  .public-games-season-nav .public-matchday-leg-nav {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0;
    border-top: 2px solid #10151b;
    background: #ffffff;
    white-space: nowrap;
  }

  .public-games-season-nav .public-matchday-leg-nav a {
    display: inline-block;
    padding: 8px 11px;
    border-right: 1px solid #dfe5ec;
    background: #ffffff;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-games-season-nav .public-matchday-leg-nav a[aria-current="true"] {
    background: #10151b;
    color: #ffffff;
  }

  .public-games-page {
    max-width: 1180px;
    margin: 26px auto 72px;
    padding: 0 0 48px;
  }

  .public-games-layout {
    display: grid;
    grid-template-columns: minmax(0, 760px) minmax(240px, 300px);
    gap: 32px;
    align-items: start;
  }

  .public-games-main {
    min-width: 0;
  }

  .public-games-heading {
    display: grid;
    gap: 8px;
    max-width: 760px;
    margin: 0 0 22px;
  }

  .public-games-kicker {
    color: #c40012;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .public-games-heading h1 {
    margin: 0;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(30px, 4vw, 44px);
    font-weight: 850;
    letter-spacing: 0;
    line-height: 1;
  }

  .public-games-heading p {
    margin: 0;
    color: #526174;
    font-size: 15px;
    line-height: 1.45;
  }

  .public-games-competition {
    margin-top: 18px;
  }

  .public-games-competition-title {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 4px solid #10151b;
  }

  .public-games-competition-title h2 {
    margin: 0;
    color: #10151b;
    font-size: 18px;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .public-games-matchday {
    margin-top: 12px;
    border: 1px solid #dde4ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 14px 28px rgba(12, 22, 34, 0.08);
    overflow: hidden;
  }

  .public-games-matchday > header {
    padding: 12px 16px;
    border-bottom: 1px solid #e6ebf1;
    background: #f8fafc;
  }

  .public-games-matchday h3 {
    margin: 0;
    color: #10151b;
    font-size: 13px;
    font-weight: 950;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .public-games-list {
    display: grid;
  }

  .public-games-state {
    border-top: 1px solid #edf1f5;
  }

  .public-games-state:first-of-type {
    border-top: 0;
  }

  .public-games-state-title {
    display: block;
    padding: 12px 16px 4px;
    color: #c40012;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .public-game-card {
    display: grid;
    grid-template-columns: minmax(140px, 190px) minmax(0, 1fr) minmax(170px, 230px);
    gap: 18px;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-game-card-no-context {
    grid-template-columns: minmax(0, 1fr) minmax(128px, 168px);
    gap: 14px;
    padding: 12px 14px;
  }

  .public-game-card:last-child {
    border-bottom: 0;
  }

  .public-game-context {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .public-game-competition {
    color: #10151b;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .public-game-matchday {
    color: #607086;
    font-size: 12px;
    font-weight: 800;
  }

  .public-game-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .public-game-card-no-context .public-game-main {
    display: grid;
    grid-template-columns: 28px minmax(120px, 180px) 70px minmax(120px, 180px) 28px;
    width: auto;
    max-width: 100%;
    justify-self: start;
    column-gap: 8px;
  }

  .public-game-team {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-width: 0;
    color: #10151b;
    font-size: 14px;
    font-weight: 900;
  }

  .public-game-team:last-child {
    grid-template-columns: minmax(0, 1fr) auto;
    text-align: right;
  }

  .public-game-card-no-context .public-game-team,
  .public-game-card-no-context .public-game-team:last-child {
    display: contents;
    text-align: left;
  }

  .public-game-card-no-context .public-game-team-name {
    max-width: none;
  }

  .public-game-card-no-context .public-game-team:last-child .public-game-team-name {
    text-align: right;
  }

  .public-game-card-no-context .public-game-team:last-child .public-game-team-name {
    min-width: 0;
    order: 1;
  }

  .public-game-card-no-context .public-game-team:last-child .public-game-team-badge {
    order: 2;
  }

  .public-game-team-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .public-game-team-badge {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid #dfe5ec;
    border-radius: 999px;
    background: #ffffff;
    color: #263241;
    font-size: 10px;
    font-weight: 950;
    overflow: hidden;
  }

  .public-game-team-badge img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .public-game-score {
    min-width: 64px;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 24px;
    font-weight: 950;
    text-align: center;
    line-height: 1;
  }

  .public-game-vs {
    min-width: 64px;
    color: #9aa6b4;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .public-game-card-no-context .public-game-score,
  .public-game-card-no-context .public-game-vs {
    min-width: 70px;
    padding: 0 4px;
  }

  .public-game-info {
    display: grid;
    gap: 5px;
    justify-items: end;
    min-width: 0;
    color: #526174;
    font-size: 12px;
    font-weight: 800;
    text-align: right;
  }

  .public-game-status {
    color: #10151b;
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
  }

  .public-game-status-live {
    color: #c40012;
  }

  .public-game-tv {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
    color: #607086;
  }

  .public-game-tv img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }

  .public-games-ad-rail {
    display: grid;
    gap: 18px;
  }

  .public-games-ad-box {
    display: grid;
    place-items: center;
    min-height: 360px;
    border: 1px solid #e0e6ee;
    border-radius: 8px;
    background: #f3f6f9;
    color: #8a96a6;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media (max-width: 820px) {
    .public-games-page {
      margin-top: 18px;
    }

    .public-games-layout {
      grid-template-columns: 1fr;
    }

    .public-game-card {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .public-game-card-no-context .public-game-main {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) 58px minmax(0, 1fr) 28px;
      max-width: none;
    }

    .public-game-info {
      justify-items: start;
      text-align: left;
    }

    .public-games-ad-box {
      min-height: 180px;
    }
  }
`;

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inFilter(values: string[]) {
  return `in.(${values.map((value) => encodeURIComponent(value)).join(",")})`;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function seasonSegmentToLabel(value: string | null | undefined) {
  return decodeURIComponent(value ?? "").replace(/-/g, "/");
}

function seasonLabelToUrlSegment(value: string | null | undefined) {
  return encodeURIComponent((value ?? "").replace(/\//g, "-"));
}

async function readRowsById<T extends { id: string }>(table: string, select: string, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, T>();
  }

  const rows = await fetchSupabaseAdminTable<T>(
    `${table}?select=${select}&id=${inFilter(ids)}`
  ).catch(() => []);

  return new Map(rows.map((row) => [row.id, row]));
}

function statusKind(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "finished") return "finished";
  if (normalized === "live") return "live";
  if (normalized === "halftime") return "halftime";
  return "scheduled";
}

function formatCivilDayMonth(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : null;
}

function formatKickoff(scheduledDate: string, value?: string | null) {
  if (!value) {
    const dayMonth = formatCivilDayMonth(scheduledDate);
    return dayMonth ? `${dayMonth} \u00b7 Hora por definir` : "Hora por definir";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const dayMonth = formatCivilDayMonth(scheduledDate);
    return dayMonth ? `${dayMonth} \u00b7 Hora por definir` : "Hora por definir";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
}

function teamInitials(team?: TeamRow | null) {
  const source = cleanText(team?.short_name) || cleanText(team?.name) || "";
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return initials || "FC";
}

function teamName(team?: TeamRow | null) {
  return cleanText(team?.name) || cleanText(team?.short_name) || "Equipa";
}

async function readCompetitionBySlug(slug?: string | null) {
  const cleanSlug = cleanText(slug);
  if (!cleanSlug) return null;

  const rows = await fetchSupabaseAdminTable<CompetitionRow>(
    `competitions?select=id,name,slug&slug=eq.${encodeURIComponent(cleanSlug)}&limit=1`
  ).catch(() => []);

  return rows[0] ?? null;
}

async function readSeasonByCompetitionAndSegment(competitionId: string | null | undefined, seasonSegment?: string | null) {
  if (!competitionId || !seasonSegment) return null;

  const label = seasonSegmentToLabel(seasonSegment);
  const rows = await fetchSupabaseAdminTable<SeasonRow>(
    `seasons?select=id,label,competition_id&competition_id=eq.${encodeURIComponent(competitionId)}&label=eq.${encodeURIComponent(label)}&limit=1`
  ).catch(() => []);

  return rows[0] ?? null;
}

async function readSeasonsByCompetition(competitionId: string | null | undefined) {
  if (!competitionId) return [];

  return fetchSupabaseAdminTable<SeasonRow>(
    `seasons?select=id,label,competition_id,starts_on,is_current&competition_id=eq.${encodeURIComponent(competitionId)}&order=starts_on.desc.nullslast,label.desc`
  ).catch(() => []);
}

async function readMatchdayBySeasonAndNumber(seasonId: string | null | undefined, matchdayNumber?: string | null) {
  if (!seasonId || !matchdayNumber) return null;

  const number = Number(matchdayNumber);
  if (!Number.isFinite(number)) return null;

  const rows = await fetchSupabaseAdminTable<MatchdayRow>(
    `matchdays?select=id,number&season_id=eq.${encodeURIComponent(seasonId)}&number=eq.${encodeURIComponent(String(number))}&limit=1`
  ).catch(() => []);

  return rows[0] ?? null;
}

async function readMatchdaysBySeason(seasonId: string | null | undefined) {
  if (!seasonId) return [];

  return fetchSupabaseAdminTable<MatchdayRow>(
    `matchdays?select=id,number&season_id=eq.${encodeURIComponent(seasonId)}&order=number.asc`
  ).catch(() => []);
}

async function readBroadcastChannelsByMatchId(matchIds: string[], matches: MatchRow[] = []) {
  const channelsByMatchId = new Map<string, BroadcastChannelRow>();
  if (matchIds.length === 0) return channelsByMatchId;

  const directChannelIdsByMatchId = new Map(
    matches
      .filter((match) => Boolean(match.broadcast_channel_id))
      .map((match) => [match.id, match.broadcast_channel_id as string])
  );
  const directChannelsById = await readRowsById<BroadcastChannelRow>(
    "broadcast_channels",
    "id,name,logo_url",
    uniqueValues(Array.from(directChannelIdsByMatchId.values()))
  );

  for (const [matchId, channelId] of directChannelIdsByMatchId) {
    const channel = directChannelsById.get(channelId);
    if (channel) {
      channelsByMatchId.set(matchId, channel);
    }
  }

  const matchFilter = inFilter(matchIds);
  const relationQueries = [
    `match_broadcast_channels?select=match_id,broadcast_channel_id&match_id=${matchFilter}`,
    `match_broadcasts?select=match_id,broadcast_channel_id&match_id=${matchFilter}`,
    `matches_broadcast_channels?select=match_id,broadcast_channel_id&match_id=${matchFilter}`
  ];
  let links: BroadcastLinkRow[] = [];

  for (const query of relationQueries) {
    links = await fetchSupabaseAdminTable<BroadcastLinkRow>(query).catch(() => []);
    if (links.length > 0) break;
  }

  if (links.length === 0) return channelsByMatchId;

  const channelsById = await readRowsById<BroadcastChannelRow>(
    "broadcast_channels",
    "id,name,logo_url",
    uniqueValues(links.map((link) => link.broadcast_channel_id))
  );

  for (const link of links) {
    if (!link.match_id || !link.broadcast_channel_id || channelsByMatchId.has(link.match_id)) continue;
    const channel = channelsById.get(link.broadcast_channel_id);
    if (channel) {
      channelsByMatchId.set(link.match_id, channel);
    }
  }

  return channelsByMatchId;
}

async function readPublicGames(filters: { competitionId?: string | null; seasonId?: string | null; matchdayId?: string | null } = {}): Promise<PublicGame[]> {
  const queryFilters = [
    filters.competitionId ? `competition_id=eq.${encodeURIComponent(filters.competitionId)}` : null,
    filters.seasonId ? `season_id=eq.${encodeURIComponent(filters.seasonId)}` : null,
    filters.matchdayId ? `matchday_id=eq.${encodeURIComponent(filters.matchdayId)}` : null
  ].filter(Boolean);
  const query =
    "matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,scheduled_date,kickoff_at,status,minute,home_score,away_score,broadcast_channel_id" +
    (queryFilters.length > 0 ? `&${queryFilters.join("&")}` : "") +
    "&order=scheduled_date.asc,kickoff_at.asc.nullslast,id.asc&limit=800";
  const matches = await fetchSupabaseAdminTable<MatchRow>(query).catch(() => []);
  const matchIds = matches.map((match) => match.id);
  const [teamsById, competitionsById, seasonsById, matchdaysById, broadcastChannelsByMatchId] = await Promise.all([
    readRowsById<TeamRow>(
      "teams",
      "id,name,short_name,logo_url",
      uniqueValues(matches.flatMap((match) => [match.home_team_id, match.away_team_id]))
    ),
    readRowsById<CompetitionRow>(
      "competitions",
      "id,name,slug",
      uniqueValues(matches.map((match) => match.competition_id))
    ),
    readRowsById<SeasonRow>(
      "seasons",
      "id,label",
      uniqueValues(matches.map((match) => match.season_id))
    ),
    readRowsById<MatchdayRow>(
      "matchdays",
      "id,number",
      uniqueValues(matches.map((match) => match.matchday_id))
    ),
    readBroadcastChannelsByMatchId(matchIds, matches)
  ]);

  return matches.map((match) => ({
    id: match.id,
    competition: match.competition_id ? competitionsById.get(match.competition_id) ?? null : null,
    season: match.season_id ? seasonsById.get(match.season_id) ?? null : null,
    matchday: match.matchday_id ? matchdaysById.get(match.matchday_id) ?? null : null,
    homeTeam: match.home_team_id ? teamsById.get(match.home_team_id) ?? null : null,
    awayTeam: match.away_team_id ? teamsById.get(match.away_team_id) ?? null : null,
    scheduled_date: match.scheduled_date,
    kickoff_at: match.kickoff_at,
    status: match.status,
    minute: match.minute,
    home_score: match.home_score,
    away_score: match.away_score,
    broadcastChannel: broadcastChannelsByMatchId.get(match.id) ?? null
  }));
}

function sortGames(first: PublicGame, second: PublicGame) {
  const dateDifference = first.scheduled_date.localeCompare(second.scheduled_date);
  if (dateDifference !== 0) return dateDifference;

  if (!first.kickoff_at || !second.kickoff_at) {
    if (first.kickoff_at !== second.kickoff_at) return first.kickoff_at ? -1 : 1;
    return first.id.localeCompare(second.id);
  }

  const firstTime = new Date(first.kickoff_at).getTime();
  const secondTime = new Date(second.kickoff_at).getTime();

  if (Number.isNaN(firstTime) && Number.isNaN(secondTime)) return first.id.localeCompare(second.id);
  if (Number.isNaN(firstTime)) return 1;
  if (Number.isNaN(secondTime)) return -1;

  return firstTime - secondTime || first.id.localeCompare(second.id);
}

function TeamBlock({ team, side }: { team: TeamRow | null; side: "home" | "away" }) {
  const badge = (
    <span className="public-game-team-badge">
      {team?.logo_url ? <img alt="" src={team.logo_url} /> : teamInitials(team)}
    </span>
  );
  const name = <span className="public-game-team-name">{teamName(team)}</span>;

  return (
    <span className="public-game-team">
      {side === "home" ? (
        <>
          {badge}
          {name}
        </>
      ) : (
        <>
          {name}
          {badge}
        </>
      )}
    </span>
  );
}

function GameScore({ game }: { game: PublicGame }) {
  const kind = statusKind(game.status);
  const hasScore = game.home_score !== null && game.home_score !== undefined && game.away_score !== null && game.away_score !== undefined;

  if (hasScore && (kind === "finished" || kind === "live" || kind === "halftime")) {
    return <strong className="public-game-score">{game.home_score} - {game.away_score}</strong>;
  }

  return <span className="public-game-vs">vs</span>;
}

function GameCard({ game, showCompetition, showContext = true }: { game: PublicGame; showCompetition: boolean; showContext?: boolean }) {
  const kind = statusKind(game.status);
  const channelName = cleanText(game.broadcastChannel?.name);
  const seasonLabel = cleanText(game.season?.label);
  const liveLabel = kind === "halftime" ? "Intervalo" : game.minute ? `Em direto - ${game.minute}'` : "Em direto";

  return (
    <article className={`public-game-card${showContext ? "" : " public-game-card-no-context"}`}>
      {showContext ? (
        <div className="public-game-context">
          {showCompetition ? <span className="public-game-competition">{cleanText(game.competition?.name) || "Competicao"}</span> : null}
          <span className="public-game-matchday">
            {seasonLabel || "Epoca por definir"}
          </span>
        </div>
      ) : null}
      <div className="public-game-main">
        <TeamBlock team={game.homeTeam} side="home" />
        <GameScore game={game} />
        <TeamBlock team={game.awayTeam} side="away" />
      </div>
      <div className="public-game-info">
        {kind === "live" || kind === "halftime" ? (
          <span className="public-game-status public-game-status-live">{liveLabel}</span>
        ) : kind === "finished" ? (
          <span className="public-game-status">Finalizado</span>
        ) : (
          <time dateTime={game.kickoff_at ?? game.scheduled_date}>{formatKickoff(game.scheduled_date, game.kickoff_at)}</time>
        )}
        {channelName ? (
          <span className="public-game-tv">
            {game.broadcastChannel?.logo_url ? <img alt="" src={game.broadcastChannel.logo_url} /> : null}
            <span>{channelName}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}

function competitionKey(game: PublicGame) {
  return game.competition?.id || "sem-competicao";
}

function competitionLabel(game: PublicGame) {
  return cleanText(game.competition?.name) || "Competicao por definir";
}

type CompetitionGameGroup = {
  label: string;
  slug: string | null;
  games: PublicGame[];
};

type MatchdayGameGroup = {
  id: string;
  label: string;
  number: number;
  games: PublicGame[];
};

function groupedByCompetition(games: PublicGame[], menuOrder: string[]): CompetitionGameGroup[] {
  const groups = new Map<string, { label: string; slug: string | null; games: PublicGame[] }>();

  for (const game of games) {
    const key = competitionKey(game);
    const current = groups.get(key) ?? {
      label: competitionLabel(game),
      slug: cleanText(game.competition?.slug),
      games: []
    };
    current.games.push(game);
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((first, second) => {
    const firstIndex = first.slug ? menuOrder.indexOf(first.slug) : -1;
    const secondIndex = second.slug ? menuOrder.indexOf(second.slug) : -1;
    const firstRank = firstIndex === -1 ? Number.MAX_SAFE_INTEGER : firstIndex;
    const secondRank = secondIndex === -1 ? Number.MAX_SAFE_INTEGER : secondIndex;

    if (firstRank !== secondRank) return firstRank - secondRank;

    return first.label.localeCompare(second.label, "pt");
  });
}

function matchdayKey(game: PublicGame) {
  return game.matchday?.id || "sem-jornada";
}

function matchdayLabel(game: PublicGame) {
  return game.matchday?.number ? `Jornada ${String(game.matchday.number).padStart(2, "0")}` : "Jornada por definir";
}

function matchdayNumber(game: PublicGame) {
  return game.matchday?.number ?? Number.MAX_SAFE_INTEGER;
}

function groupedByMatchday(games: PublicGame[]): MatchdayGameGroup[] {
  const groups = new Map<string, MatchdayGameGroup>();

  for (const game of games) {
    const key = matchdayKey(game);
    const current = groups.get(key) ?? {
      id: key,
      label: matchdayLabel(game),
      number: matchdayNumber(game),
      games: []
    };
    current.games.push(game);
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((first, second) => first.number - second.number);
}

function statusRank(game: PublicGame) {
  const kind = statusKind(game.status);
  if (kind === "live" || kind === "halftime") return 0;
  if (kind === "finished") return 1;
  return 2;
}

function sortGamesByPublicOrder(first: PublicGame, second: PublicGame) {
  const rankDifference = statusRank(first) - statusRank(second);
  if (rankDifference !== 0) return rankDifference;

  return sortGames(first, second);
}

function singleValue<T>(values: T[]) {
  const uniqueValues = Array.from(new Set(values));
  return uniqueValues.length === 1 ? uniqueValues[0] : null;
}

function deriveNavigationGameFromUniformContext(games: PublicGame[]) {
  const gamesWithContext = games.filter((game) =>
    cleanText(game.competition?.slug) &&
    cleanText(game.season?.label) &&
    game.season?.id &&
    game.matchday?.id &&
    game.matchday?.number
  );

  if (gamesWithContext.length === 0) {
    return null;
  }

  const competitionId = singleValue(gamesWithContext.map((game) => game.competition?.id ?? ""));
  const seasonId = singleValue(gamesWithContext.map((game) => game.season?.id ?? ""));
  const matchdayId = singleValue(gamesWithContext.map((game) => game.matchday?.id ?? ""));

  return competitionId && seasonId && matchdayId ? gamesWithContext[0] : null;
}

function liveGamesFor(games: PublicGame[]) {
  return games.filter((game) => {
    const kind = statusKind(game.status);
    return kind === "live" || kind === "halftime";
  });
}

function finishedGamesFor(games: PublicGame[]) {
  return games.filter((game) => statusKind(game.status) === "finished");
}

function scheduledGamesFor(games: PublicGame[]) {
  return games.filter((game) => statusKind(game.status) === "scheduled");
}

function GamesStateBlock({ title, games, showCompetition, showContext }: { title: string; games: PublicGame[]; showCompetition: boolean; showContext: boolean }) {
  if (games.length === 0) {
    return null;
  }

  return (
    <section className="public-games-state" aria-label={title}>
      <span className="public-games-state-title">{title}</span>
      <div className="public-games-list">
        {games.map((game) => (
          <GameCard game={game} key={game.id} showCompetition={showCompetition} showContext={showContext} />
        ))}
      </div>
    </section>
  );
}

function MatchdayGamesBlock({
  group,
  showCompetition,
  showStateTitles,
  showContext
}: {
  group: MatchdayGameGroup;
  showCompetition: boolean;
  showStateTitles: boolean;
  showContext: boolean;
}) {
  const orderedGames = [...group.games].sort(sortGamesByPublicOrder);

  return (
    <section className="public-games-matchday" aria-label={group.label}>
      <header>
        <h3>{group.label}</h3>
      </header>
      {showStateTitles ? (
        <>
          <GamesStateBlock title="Jogos em direto" games={liveGamesFor(orderedGames)} showCompetition={showCompetition} showContext={showContext} />
          <GamesStateBlock title="Jogos finalizados" games={finishedGamesFor(orderedGames)} showCompetition={showCompetition} showContext={showContext} />
          <GamesStateBlock title="Jogos em agenda" games={scheduledGamesFor(orderedGames)} showCompetition={showCompetition} showContext={showContext} />
        </>
      ) : (
        <div className="public-games-list">
          {orderedGames.map((game) => (
            <GameCard game={game} key={game.id} showCompetition={showCompetition} showContext={showContext} />
          ))}
        </div>
      )}
    </section>
  );
}

function GamesByMatchday({
  games,
  showCompetition,
  showStateTitles,
  showContext
}: {
  games: PublicGame[];
  showCompetition: boolean;
  showStateTitles: boolean;
  showContext: boolean;
}) {
  const matchdayGroups = groupedByMatchday(games);

  return (
    <>
      {matchdayGroups.map((group) => (
        <MatchdayGamesBlock
          group={group}
          key={group.id}
          showCompetition={showCompetition}
          showContext={showContext}
          showStateTitles={showStateTitles}
        />
      ))}
    </>
  );
}

export default async function PublicGamesPageContent({ competitionSlug, seasonLabel, matchdayNumber }: PublicGamesPageContentProps) {
  const competition = await readCompetitionBySlug(competitionSlug);
  const season = await readSeasonByCompetitionAndSegment(competition?.id, seasonLabel);
  const selectedMatchday = await readMatchdayBySeasonAndNumber(season?.id, matchdayNumber);
  const isContextual = Boolean(competitionSlug);
  const isMatchdayContext = Boolean(competitionSlug && seasonLabel && matchdayNumber);
  const [competitionLinks, games] = await Promise.all([
    readPublicCompetitionMenu(),
    isContextual && (!competition || !season || (matchdayNumber && !selectedMatchday))
      ? Promise.resolve<PublicGame[]>([])
      : readPublicGames({
          competitionId: competition?.id ?? null,
          seasonId: season?.id ?? null,
          matchdayId: selectedMatchday?.id ?? null
        })
  ]);
  const menuOrder = competitionLinks.map((link) => link.slug);
  const groupedGames = groupedByCompetition(games, menuOrder);
  const activeCompetitionSlug = cleanText(competition?.slug);
  const activeCompetitionName = cleanText(competition?.name) || activeCompetitionSlug || "Competicao";
  const gamesHref = isContextual && activeCompetitionSlug && seasonLabel
    ? matchdayNumber
      ? `/competicoes/${activeCompetitionSlug}/${seasonLabel}/jornadas/${matchdayNumber}/jogos`
      : `/competicoes/${activeCompetitionSlug}/${seasonLabel}/jogos`
    : "/jogos";
  const classificacaoHref = activeCompetitionSlug && seasonLabel && matchdayNumber
    ? `/competicoes/${activeCompetitionSlug}/${seasonLabel}/jornadas/${matchdayNumber}#classificacao`
    : null;
  const title = competition ? `Jogos - ${activeCompetitionName}` : "Jogos";
  const explicitNavigationContext = Boolean(competition && season && selectedMatchday);
  const navigationSourceGame = explicitNavigationContext ? null : deriveNavigationGameFromUniformContext(games);
  const navigationCompetition = competition ?? navigationSourceGame?.competition ?? null;
  const navigationSeason = season ?? navigationSourceGame?.season ?? null;
  const navigationMatchday = selectedMatchday ?? navigationSourceGame?.matchday ?? null;
  const navigationCompetitionSlug = cleanText(navigationCompetition?.slug);
  const navigationSeasonLabel = cleanText(navigationSeason?.label);
  const navigationSeasonSegment = navigationSeasonLabel ? seasonLabelToUrlSegment(navigationSeasonLabel) : null;
  const navigationMatchdayNumber = navigationMatchday?.number ?? null;
  let navigationSeasons: SeasonRow[] = [];
  let navigationMatchdays: MatchdayRow[] = [];
  if (navigationCompetition?.id && navigationSeason?.id) {
    [navigationSeasons, navigationMatchdays] = await Promise.all([
      readSeasonsByCompetition(navigationCompetition.id),
      readMatchdaysBySeason(navigationSeason.id)
    ]);
  }
  const hasSeasonNavigation = Boolean(
    navigationCompetitionSlug &&
    navigationSeasonSegment &&
    navigationMatchdayNumber &&
    navigationMatchdays.length > 0
  );
  const navigationMatchdayHref = (number: number) =>
    navigationCompetitionSlug && navigationSeasonSegment
      ? `/competicoes/${navigationCompetitionSlug}/${navigationSeasonSegment}/jornadas/${number}/jogos`
      : "/jogos";
  const navigationSeasonOptions = navigationCompetitionSlug
    ? navigationSeasons.map((item) => ({
        id: item.id,
        label: cleanText(item.label) || "Epoca",
        href: `/competicoes/${navigationCompetitionSlug}/${seasonLabelToUrlSegment(item.label)}/jornadas/1/jogos`
      }))
    : [];
  const currentNavigationSeasonHref = navigationCompetitionSlug && navigationSeasonSegment
    ? `/competicoes/${navigationCompetitionSlug}/${navigationSeasonSegment}/jornadas/1/jogos`
    : "/jogos";
  const shouldSplitMatchdayNav = navigationMatchdays.length > 20;
  const firstLegMatchdays = shouldSplitMatchdayNav ? navigationMatchdays.slice(0, 19) : navigationMatchdays;
  const secondLegMatchdays = shouldSplitMatchdayNav ? navigationMatchdays.slice(19) : [];
  const activeMatchdayLeg =
    shouldSplitMatchdayNav && secondLegMatchdays.some((item) => item.id === navigationMatchday?.id)
      ? "second"
      : "first";
  const visibleMatchdays = activeMatchdayLeg === "second" ? secondLegMatchdays : firstLegMatchdays;
  const firstLegHref = firstLegMatchdays[0]?.number ? navigationMatchdayHref(firstLegMatchdays[0].number) : currentNavigationSeasonHref;
  const secondLegHref = secondLegMatchdays[0]?.number ? navigationMatchdayHref(secondLegMatchdays[0].number) : currentNavigationSeasonHref;

  return (
    <main className="public-matchday-shell">
      <style>{publicEditorialStyles}</style>
      <style>{gamesPageStyles}</style>
      <div className="public-top-stack">
        <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
          <Link className="public-site-brand" href="/" aria-label="Jornada.pt">
            Jornada<span>.pt</span>
          </Link>
          <nav className="public-site-menu" aria-label="Competicoes principais">
            {competitionLinks.map((link) => (
              <Link
                aria-current={competition && link.slug === competition.slug ? "page" : undefined}
                href={link.href}
                key={link.slug}
              >
                {link.label}
              </Link>
            ))}
            <Link aria-current="page" href={gamesHref}>
              Jogos
            </Link>
            {classificacaoHref ? <Link href={classificacaoHref}>Classificação</Link> : null}
          </nav>
          <div className="public-site-actions" aria-label="Acoes">
            <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
            <Link href="/admin/login">Entrar</Link>
          </div>
        </header>
        {hasSeasonNavigation ? (
          <section className="public-season-nav-bar public-games-season-nav" aria-label="Navegacao de jornadas">
            <div className="public-hidden-heading">
              <h2>Jornadas</h2>
              <p>Navegacao principal da epoca {navigationSeasonLabel}.</p>
            </div>
            <div className="public-season-nav-inner">
              <label className="public-season-select-wrap">
                <span>Epoca</span>
                <select className="public-season-select" data-games-season-select defaultValue={currentNavigationSeasonHref}>
                  {navigationSeasonOptions.map((item) => (
                    <option key={item.id} value={item.href}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {shouldSplitMatchdayNav ? (
                <nav className="public-matchday-leg-nav" aria-label="Voltas da epoca">
                  <Link aria-current={activeMatchdayLeg === "first" ? "true" : undefined} href={firstLegHref}>
                    1.ª volta
                  </Link>
                  <Link aria-current={activeMatchdayLeg === "second" ? "true" : undefined} href={secondLegHref}>
                    2.ª volta
                  </Link>
                </nav>
              ) : null}
              <nav className="public-matchday-nav" aria-label="Jornadas">
                {visibleMatchdays.map((item) => (
                  item.number ? (
                    <Link
                      aria-current={item.id === navigationMatchday?.id ? "page" : undefined}
                      href={navigationMatchdayHref(item.number)}
                      key={item.id}
                    >
                      J{String(item.number).padStart(2, "0")}
                    </Link>
                  ) : null
                ))}
              </nav>
            </div>
          </section>
        ) : null}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("DOMContentLoaded", function () {
              var select = document.querySelector("[data-games-season-select]");
              if (!select) return;
              select.addEventListener("change", function () {
                if (select.value) window.location.href = select.value;
              });
            });
          `
        }}
      />

      <div className="public-games-page">
        <div className="public-games-layout">
          <section className="public-games-main" aria-label="Jogos">
            <div className="public-games-heading">
              <span className="public-games-kicker">Agenda</span>
              <h1>{title}</h1>
            </div>

            {isMatchdayContext ? (
              games.length > 0 ? (
                <GamesByMatchday games={games} showCompetition={false} showContext={false} showStateTitles />
              ) : null
            ) : isContextual ? (
              games.length > 0 ? (
                <GamesByMatchday games={games} showCompetition={false} showContext={false} showStateTitles={false} />
              ) : null
            ) : groupedGames.length > 0 ? (
              groupedGames.map((group) => (
                <section className="public-games-competition" key={group.slug || group.label}>
                  <div className="public-games-competition-title">
                    <h2>{group.label}</h2>
                  </div>
                  <GamesByMatchday games={group.games} showCompetition={true} showContext={true} showStateTitles={false} />
                </section>
              ))
            ) : null}
          </section>
          <aside className="public-games-ad-rail" aria-label="Publicidade">
            <div className="public-games-ad-box">Publicidade</div>
          </aside>
        </div>
      </div>
    </main>
  );
}
