import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CompetitionRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type SeasonRow = {
  id: string;
  label: string | null;
};

type MatchdayRow = {
  id: string;
  number: number | null;
  label: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
};

type BroadcastChannelRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  platform: string | null;
};

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
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  broadcast_channel_id: string | null;
};

type HydratedMatch = MatchRow & {
  competition: CompetitionRow | null;
  season: SeasonRow | null;
  matchday: MatchdayRow | null;
  homeTeam: TeamRow | null;
  awayTeam: TeamRow | null;
  channel: BroadcastChannelRow | null;
};

type MatchdayGroup = {
  key: string;
  label: string;
  number: number;
  matches: HydratedMatch[];
};

type CompetitionGroup = {
  key: string;
  label: string;
  matches: HydratedMatch[];
};

const pageStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .tv-admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .tv-admin-hero {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-end;
    padding: 26px;
    border-radius: 8px;
    background: linear-gradient(135deg, #10151b, #25303c);
    color: #ffffff;
    box-shadow: 0 18px 40px rgba(8, 15, 24, 0.16);
  }

  .tv-admin-hero p,
  .tv-admin-hero h1 {
    margin: 0;
  }

  .tv-admin-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .tv-admin-hero h1 {
    margin-top: 8px;
    font-size: 40px;
    line-height: 1;
  }

  .tv-admin-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .tv-admin-actions a,
  .tv-admin-button,
  .tv-admin-link-button {
    display: inline-block;
    padding: 11px 15px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    background: transparent;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
  }

  .tv-admin-button,
  .tv-admin-link-button {
    border-color: #e5252a;
    background: #e5252a;
  }

  .tv-admin-panel {
    margin-top: 18px;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .tv-admin-panel > header,
  .tv-admin-filter {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 18px 20px;
    border-bottom: 1px solid #e3e8ef;
  }

  .tv-admin-panel h2,
  .tv-admin-panel h3,
  .tv-admin-panel h4,
  .tv-admin-panel p {
    margin: 0;
  }

  .tv-admin-panel h2 {
    font-size: 24px;
  }

  .tv-admin-panel p {
    margin-top: 5px;
    color: #657184;
    font-size: 13px;
    font-weight: 700;
  }

  .tv-admin-filter label {
    display: grid;
    gap: 6px;
    color: #4d5866;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .tv-admin-filter select {
    min-width: 240px;
    padding: 10px 12px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
  }

  .tv-admin-filter button {
    align-self: end;
  }

  .tv-admin-message {
    margin: 16px 20px 0;
    padding: 11px 12px;
    border-radius: 6px;
    background: #eaf8ef;
    color: #176235;
    font-size: 13px;
    font-weight: 800;
  }

  .tv-admin-message.warning {
    background: #fff3e5;
    color: #8a4d00;
  }

  .tv-competition {
    padding: 20px;
    border-top: 1px solid #e8edf3;
  }

  .tv-competition:first-of-type {
    border-top: 0;
  }

  .tv-competition > header {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: baseline;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 4px solid #10151b;
  }

  .tv-competition h3 {
    font-size: 18px;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .tv-matchday {
    margin-top: 16px;
    overflow: hidden;
    border: 1px solid #dde4ec;
    border-radius: 8px;
    background: #fbfcfe;
  }

  .tv-matchday > header {
    padding: 12px 14px;
    border-bottom: 1px solid #e4eaf1;
    background: #f4f7fa;
  }

  .tv-matchday h4 {
    font-size: 13px;
    font-weight: 950;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .tv-match-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    background: #ffffff;
  }

  .tv-match-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(150px, 210px) minmax(230px, 320px);
    gap: 16px;
    align-items: center;
    padding: 14px;
    border-top: 1px solid #edf1f5;
  }

  .tv-match-row:first-child {
    border-top: 0;
  }

  .tv-match-teams {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
    color: #10151b;
    font-size: 15px;
    font-weight: 900;
  }

  .tv-match-team {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tv-match-versus {
    flex: 0 0 auto;
    color: #9aa6b4;
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
  }

  .tv-match-meta {
    display: grid;
    gap: 4px;
    color: #596679;
    font-size: 12px;
    font-weight: 800;
  }

  .tv-match-meta strong {
    color: #10151b;
    font-size: 12px;
    text-transform: uppercase;
  }

  .tv-channel-form {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  .tv-channel-form select {
    min-width: 170px;
    padding: 9px 10px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
  }

  .tv-channel-form button {
    white-space: nowrap;
  }

  .tv-empty {
    padding: 18px 20px;
    color: #657184;
    font-size: 14px;
    font-weight: 800;
  }

  @media (max-width: 900px) {
    .tv-admin-shell {
      padding: 18px;
    }

    .tv-admin-hero,
    .tv-admin-panel > header,
    .tv-admin-filter {
      align-items: stretch;
      flex-direction: column;
    }

    .tv-match-row {
      grid-template-columns: 1fr;
    }

    .tv-channel-form {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
`;

function textValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

async function readRowsById<T extends { id: string }>(table: string, select: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, T>();

  const rows = await fetchSupabaseAdminTable<T>(`${table}?select=${select}&id=${inFilter(ids)}`).catch(() => []);

  return new Map(rows.map((row) => [row.id, row]));
}

function formatCivilDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function formatLisbonDateTime(scheduledDate: string, value: string | null) {
  if (!value) {
    const dateLabel = formatCivilDate(scheduledDate);
    return dateLabel ? `${dateLabel} · Hora por definir` : "Hora por definir";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const dateLabel = formatCivilDate(scheduledDate);
    return dateLabel ? `${dateLabel} · Hora por definir` : "Hora por definir";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
}

function statusLabel(match: MatchRow) {
  const normalized = match.status?.trim().toLowerCase();

  if (normalized === "finished") return "Finalizado";
  if (normalized === "live") return match.minute ? `Em direto - ${match.minute}'` : "Em direto";
  if (normalized === "halftime") return "Intervalo";

  return "Agendado";
}

function matchdayLabel(matchday: MatchdayRow | null) {
  if (!matchday?.number) return "Sem jornada";

  return `Jornada ${String(matchday.number).padStart(2, "0")}`;
}

function matchdaySortNumber(matchday: MatchdayRow | null) {
  return matchday?.number ?? Number.MAX_SAFE_INTEGER;
}

function sortByKickoff(first: HydratedMatch, second: HydratedMatch) {
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

function groupByCompetition(matches: HydratedMatch[]) {
  const groups = new Map<string, CompetitionGroup>();

  for (const match of matches) {
    const key = match.competition?.id ?? "sem-competicao";
    const current = groups.get(key) ?? {
      key,
      label: cleanText(match.competition?.name) ?? "Sem competição",
      matches: []
    };

    current.matches.push(match);
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((first, second) => first.label.localeCompare(second.label, "pt"));
}

function groupByMatchday(matches: HydratedMatch[]) {
  const groups = new Map<string, MatchdayGroup>();

  for (const match of matches) {
    const key = match.matchday?.id ?? "sem-jornada";
    const current = groups.get(key) ?? {
      key,
      label: matchdayLabel(match.matchday),
      number: matchdaySortNumber(match.matchday),
      matches: []
    };

    current.matches.push(match);
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((first, second) => first.number - second.number);
}

async function readMatches(selectedCompetitionId: string | null) {
  const competitionFilter = selectedCompetitionId ? `&competition_id=eq.${encodeURIComponent(selectedCompetitionId)}` : "";
  const matches = await fetchSupabaseAdminTable<MatchRow>(
    `matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,scheduled_date,kickoff_at,status,minute,home_score,away_score,broadcast_channel_id${competitionFilter}&order=scheduled_date.asc,kickoff_at.asc.nullslast,id.asc&limit=1200`
  ).catch(() => []);
  const [competitionsById, seasonsById, matchdaysById, teamsById, channelsById] = await Promise.all([
    readRowsById<CompetitionRow>("competitions", "id,name,slug", uniqueValues(matches.map((match) => match.competition_id))),
    readRowsById<SeasonRow>("seasons", "id,label", uniqueValues(matches.map((match) => match.season_id))),
    readRowsById<MatchdayRow>("matchdays", "id,number,label", uniqueValues(matches.map((match) => match.matchday_id))),
    readRowsById<TeamRow>(
      "teams",
      "id,name,short_name,logo_url",
      uniqueValues(matches.flatMap((match) => [match.home_team_id, match.away_team_id]))
    ),
    readRowsById<BroadcastChannelRow>("broadcast_channels", "id,name,logo_url,platform", uniqueValues(matches.map((match) => match.broadcast_channel_id)))
  ]);

  return matches.map((match) => ({
    ...match,
    competition: match.competition_id ? competitionsById.get(match.competition_id) ?? null : null,
    season: match.season_id ? seasonsById.get(match.season_id) ?? null : null,
    matchday: match.matchday_id ? matchdaysById.get(match.matchday_id) ?? null : null,
    homeTeam: match.home_team_id ? teamsById.get(match.home_team_id) ?? null : null,
    awayTeam: match.away_team_id ? teamsById.get(match.away_team_id) ?? null : null,
    channel: match.broadcast_channel_id ? channelsById.get(match.broadcast_channel_id) ?? null : null
  }));
}

async function readCompetitions() {
  return fetchSupabaseAdminTable<CompetitionRow>("competitions?select=id,name,slug&order=name.asc&limit=200").catch(() => []);
}

async function readBroadcastChannels() {
  return fetchSupabaseAdminTable<BroadcastChannelRow>("broadcast_channels?select=id,name,logo_url,platform&order=name.asc&limit=200").catch(() => []);
}

function MatchRowCard({ channels, match }: { channels: BroadcastChannelRow[]; match: HydratedMatch }) {
  const returnTo = `/admin/jogos-tv${match.competition_id ? `?competicao=${encodeURIComponent(match.competition_id)}` : ""}#match-${match.id}`;
  const score =
    match.home_score !== null && match.away_score !== null
      ? `${match.home_score}-${match.away_score}`
      : "vs";

  return (
    <li className="tv-match-row" id={`match-${match.id}`}>
      <div className="tv-match-teams">
        <span className="tv-match-team">{match.homeTeam?.name ?? "Casa"}</span>
        <span className="tv-match-versus">{score}</span>
        <span className="tv-match-team">{match.awayTeam?.name ?? "Fora"}</span>
      </div>
      <div className="tv-match-meta">
        <strong>{statusLabel(match)}</strong>
        <span>{formatLisbonDateTime(match.scheduled_date, match.kickoff_at)}</span>
        <span>{match.channel?.name ? `Canal atual: ${match.channel.name}` : "Sem canal atribuído"}</span>
      </div>
      <form className="tv-channel-form" action="/api/admin/jogos-tv" method="post">
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <select name="broadcast_channel_id" defaultValue={match.broadcast_channel_id ?? ""} aria-label="Canal TV">
          <option value="">Sem canal</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
        <button className="tv-admin-link-button" type="submit">
          Guardar
        </button>
      </form>
    </li>
  );
}

export default async function AdminJogosTvPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const selectedCompetitionId = cleanText(textValue(params.competicao)) ?? null;
  const saved = textValue(params.saved) === "1";
  const error = cleanText(textValue(params.error));
  const [competitions, channels, matches] = await Promise.all([
    readCompetitions(),
    readBroadcastChannels(),
    readMatches(selectedCompetitionId)
  ]);
  const competitionGroups = groupByCompetition(matches);

  return (
    <main className="tv-admin-shell">
      <style>{pageStyles}</style>
      <section className="tv-admin-hero">
        <div>
          <p>Backoffice</p>
          <h1>Jogos e TV</h1>
        </div>
        <div className="tv-admin-actions">
          <a href="/admin">Voltar ao backoffice</a>
          <a href="/admin/gestor">Centro de gestão</a>
        </div>
      </section>

      <section className="tv-admin-panel" aria-label="Agenda e Transmissão">
        <header>
          <div>
            <h2>Agenda e Transmissão</h2>
            <p>Jogos organizados por competição e jornada para gestão dos canais TV.</p>
          </div>
        </header>

        <form className="tv-admin-filter" action="/admin/jogos-tv" method="get">
          <label>
            Competição
            <select name="competicao" defaultValue={selectedCompetitionId ?? ""}>
              <option value="">Todas as competições</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.name}
                </option>
              ))}
            </select>
          </label>
          <button className="tv-admin-button" type="submit">
            Filtrar
          </button>
        </form>

        {saved ? <div className="tv-admin-message">Canal TV guardado.</div> : null}
        {error ? <div className="tv-admin-message warning">Não foi possível guardar o canal TV.</div> : null}

        {competitionGroups.length === 0 ? (
          <div className="tv-empty">Não há jogos para mostrar com o filtro atual.</div>
        ) : (
          competitionGroups.map((competition) => (
            <section className="tv-competition" key={competition.key}>
              <header>
                <h3>{competition.label}</h3>
              </header>
              {groupByMatchday(competition.matches).map((matchday) => (
                <section className="tv-matchday" key={matchday.key}>
                  <header>
                    <h4>{matchday.label}</h4>
                  </header>
                  <ul className="tv-match-list">
                    {[...matchday.matches].sort(sortByKickoff).map((match) => (
                      <MatchRowCard channels={channels} key={match.id} match={match} />
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))
        )}
      </section>
    </main>
  );
}
