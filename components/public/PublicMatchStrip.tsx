import { getPublicLiveMinute } from "@/lib/live-match-clock";

export type PublicMatchStripTeam = {
  name?: string | null;
  short_name?: string | null;
  logo_url?: string | null;
};

export type PublicMatchStripBroadcastChannel = {
  name?: string | null;
  logo_url?: string | null;
};

export type PublicMatchStripMatch = {
  id: string;
  scheduled_date: string;
  kickoff_at?: string | null;
  status?: string | null;
  minute?: number | string | null;
  live_started_at?: string | null;
  live_base_minute?: number | string | null;
  is_clock_running?: boolean | null;
  home_score?: number | null;
  away_score?: number | null;
  homeTeam?: PublicMatchStripTeam | null;
  awayTeam?: PublicMatchStripTeam | null;
  broadcastChannel?: PublicMatchStripBroadcastChannel | null;
};

function formatKickoffTime(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
}

function formatCivilDayMonth(value?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;

  return `${match[3]}/${match[2]}`;
}

function formatMiniCardKickoff(scheduledDate: string, value?: string | null) {
  if (!value) {
    const dayMonth = formatCivilDayMonth(scheduledDate);
    return dayMonth ? `${dayMonth} \u00b7 Hora por definir` : "Hora por definir";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const dayMonth = formatCivilDayMonth(scheduledDate);
    return dayMonth ? `${dayMonth} \u00b7 Hora por definir` : "Hora por definir";
  }

  const dayMonth = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
  const time = formatKickoffTime(value);

  return time ? `${dayMonth} \u00b7 ${time}` : dayMonth;
}

function statusLabel(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "finished") return "Finalizado";
  if (normalized === "scheduled") return "Agendado";
  if (normalized === "live") return "Live";
  if (normalized === "halftime") return "Intervalo";
  if (normalized === "postponed") return "Adiado";
  if (normalized === "cancelled") return "Cancelado";
  return status?.trim() || "Agendado";
}

function statusKind(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "finished") return "finished";
  if (normalized === "live") return "live";
  if (normalized === "halftime") return "halftime";
  if (normalized === "scheduled") return "scheduled";
  return "scheduled";
}

function teamInitials(name?: string | null, shortName?: string | null) {
  const source = shortName || name || "";
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return initials || "FC";
}

function normalizeTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const compactTeamNameOverrides: Record<string, string> = {
  "academico de viseu": "A. de Viseu",
  "athletic club": "Athletic",
  "atletico de madrid": "A. Madrid",
  "atletico madrid": "A. Madrid",
  "brighton & hove albion": "Brighton",
  "brighton and hove albion": "Brighton",
  "celta vigo": "Celta",
  "deportivo la coruna": "Deportivo",
  "estoril praia": "Estoril",
  "estrela da amadora": "Estrela",
  "manchester city": "M. City",
  "manchester united": "M. United",
  "nottingham forest": "N. Forest",
  "racing santander": "Racing",
  "rayo vallecano": "Rayo",
  "real betis": "Betis",
  "real madrid": "R. Madrid",
  "real sociedad": "R. Sociedad",
  "tottenham hotspur": "Tottenham"
};

function fullTeamName(team?: PublicMatchStripTeam | null) {
  return team?.name?.trim() || team?.short_name?.trim() || "Equipa";
}

function compactTeamName(team?: PublicMatchStripTeam | null) {
  const editorialName = team?.name?.trim();
  const fallback = team?.short_name?.trim() || editorialName || "Equipa";

  if (!editorialName) {
    return fallback;
  }

  const normalizedName = normalizeTeamName(editorialName);
  const override = compactTeamNameOverrides[normalizedName];
  if (override) {
    return override;
  }

  if (editorialName.length <= 13) {
    return editorialName;
  }

  const parts = editorialName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const compactName = `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
    return compactName.length <= 16 ? compactName : `${parts[0][0]}. ${parts[1]}`;
  }

  return fallback.length <= 13 ? fallback : editorialName;
}

function TeamBadge({ team }: { team?: PublicMatchStripTeam | null }) {
  const label = teamInitials(team?.name, team?.short_name);

  return (
    <span className="public-team-badge">
      {team?.logo_url ? <img alt="" src={team.logo_url} /> : label}
    </span>
  );
}

function LivePulseDots() {
  return (
    <span className="home-live-pulse-dots" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function compactTvLabel(value?: string | null) {
  const label = value?.trim();
  return label ? label.replace(/^Sport\s*TV\s*/i, "SportTV") : "";
}

function CompactMatchCard({ match, focus }: { match: PublicMatchStripMatch; focus?: boolean }) {
  const kind = statusKind(match.status);
  const broadcastChannelName = match.broadcastChannel?.name?.trim();
  const compactBroadcastChannelName = compactTvLabel(broadcastChannelName);
  const hasScore = match.home_score !== null && match.home_score !== undefined && match.away_score !== null && match.away_score !== undefined;
  const showScore = hasScore && (kind === "finished" || kind === "live" || kind === "halftime");
  const publicMinute = getPublicLiveMinute(match);
  const livePrimeClassName = "home-live-minute-prime home-live-minute-prime-active";
  const liveStatus = kind === "live" ? (
    <>
      <span className="public-matchday-live-label">Live</span>
      {publicMinute !== null ? (
        <span className="public-matchday-live-minute">{publicMinute}<span className={livePrimeClassName}>'</span></span>
      ) : null}
      {compactBroadcastChannelName ? <span className="public-matchday-mini-channel" title={broadcastChannelName}>{compactBroadcastChannelName}</span> : null}
      <LivePulseDots />
    </>
  ) : statusLabel(match.status);

  return (
    <article className={`public-matchday-mini-card public-matchday-mini-card-${kind}`} data-live-focus={focus ? "true" : undefined}>
      <span className="public-matchday-mini-team">
        <TeamBadge team={match.homeTeam} />
        <span title={fullTeamName(match.homeTeam)}>{compactTeamName(match.homeTeam)}</span>
        {showScore ? <b className="public-matchday-mini-score">{match.home_score}</b> : null}
      </span>
      <span className="public-matchday-mini-team">
        <TeamBadge team={match.awayTeam} />
        <span title={fullTeamName(match.awayTeam)}>{compactTeamName(match.awayTeam)}</span>
        {showScore ? <b className="public-matchday-mini-score">{match.away_score}</b> : null}
      </span>
      <span className="public-matchday-mini-status">
        {kind === "finished" ? (
          <span>Finalizado</span>
        ) : kind === "live" || kind === "halftime" ? (
          <span>
            {liveStatus}
          </span>
        ) : (
          <>
            <time className="public-matchday-mini-time" dateTime={match.kickoff_at ?? match.scheduled_date}>
              {formatMiniCardKickoff(match.scheduled_date, match.kickoff_at)}
            </time>
            {broadcastChannelName ? (
              <>
                <span className="public-matchday-mini-separator" aria-hidden="true">{"\u00b7"}</span>
                <span className="public-matchday-mini-channel" title={broadcastChannelName}>{compactBroadcastChannelName}</span>
              </>
            ) : null}
          </>
        )}
      </span>
    </article>
  );
}

export default function PublicMatchStrip({ matches }: { matches: PublicMatchStripMatch[] }) {
  const focusedMatch = matches.find((match) => {
    const kind = statusKind(match.status);
    return kind === "live" || kind === "halftime";
  }) ?? null;
  const gridTemplateColumns = "repeat(auto-fit, minmax(min(132px, 100%), 1fr))";

  if (matches.length === 0) {
    return null;
  }

  return (
    <section className="public-matchday-panel public-matchday-scoreboard-panel" aria-label="Visao rapida dos jogos">
      <div className="public-matchday-strip-shell">
        <div className="public-matchday-strip" data-matchday-strip style={{ gridTemplateColumns }}>
          {matches.map((match) => (
            <CompactMatchCard focus={focusedMatch?.id === match.id} key={match.id} match={match} />
          ))}
        </div>
      </div>
    </section>
  );
}
