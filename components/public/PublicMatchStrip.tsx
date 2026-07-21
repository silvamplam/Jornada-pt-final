import BroadcastChannelLogo from "@/components/public/BroadcastChannelLogo";
import { getPublicLiveMinute } from "@/lib/live-match-clock";
import { getPublicTeamName } from "@/lib/public-team-name";

export type PublicMatchStripTeam = {
  name?: string | null;
  public_name?: string | null;
  short_name?: string | null;
  code?: string | null;
  logo_url?: string | null;
};

export type PublicMatchStripBroadcastChannel = {
  name?: string | null;
  logo_url?: string | null;
};

export type PublicMatchStripMatch = {
  id: string;
  scheduled_date: string | null;
  kickoff_at?: string | null;
  matchdayNumber: number | null;
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

const compactMonthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const accessibleMonthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parseCivilDate(value?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function compactCivilDate(date: { month: number; day: number }) {
  return `${String(date.day).padStart(2, "0")} ${compactMonthNames[date.month - 1]}`;
}

function accessibleCivilDate(date: { year: number; month: number; day: number }) {
  return `${date.day} de ${accessibleMonthNames[date.month - 1]} de ${date.year}`;
}

function kickoffCivilDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Lisbon"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return year && month && day ? { year, month, day } : null;
}

function miniCardSchedule(match: PublicMatchStripMatch) {
  const scheduledDate = parseCivilDate(match.scheduled_date);
  const kickoffTime = formatKickoffTime(match.kickoff_at);

  if (kickoffTime) {
    const civilDate = scheduledDate ?? kickoffCivilDate(match.kickoff_at);
    if (civilDate) {
      return {
        visual: `${compactCivilDate(civilDate)} \u00b7 ${kickoffTime}`,
        accessible: `${accessibleCivilDate(civilDate)}, às ${kickoffTime.replace(":", "h")}`,
        dateTime: match.kickoff_at ?? null
      };
    }
  }

  if (scheduledDate) {
    return {
      visual: `${compactCivilDate(scheduledDate)} \u00b7 A DEFINIR`,
      accessible: `${accessibleCivilDate(scheduledDate)}, hora por definir`,
      dateTime: match.scheduled_date
    };
  }

  return match.matchdayNumber !== null
    ? {
        visual: `J${match.matchdayNumber} \u00b7 A DEFINIR`,
        accessible: `Jornada ${match.matchdayNumber}, data e hora por definir`,
        dateTime: null
      }
    : {
        visual: "A DEFINIR",
        accessible: "Data e hora por definir",
        dateTime: null
      };
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

function TeamBadge({ team }: { team?: PublicMatchStripTeam | null }) {
  const label = getPublicTeamName(
    { name: team?.name, publicName: team?.public_name, shortName: team?.short_name, code: team?.code },
    "badge"
  );

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

function CompactMatchCard({ match, focus }: { match: PublicMatchStripMatch; focus?: boolean }) {
  const kind = statusKind(match.status);
  const broadcastChannelName = match.broadcastChannel?.name?.trim();
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
      {broadcastChannelName ? (
        <BroadcastChannelLogo
          logoUrl={match.broadcastChannel?.logo_url}
          name={broadcastChannelName}
          variant="compact"
        />
      ) : null}
      <LivePulseDots />
    </>
  ) : statusLabel(match.status);
  const schedule = miniCardSchedule(match);

  return (
    <article className={`public-matchday-mini-card public-matchday-mini-card-${kind}`} data-live-focus={focus ? "true" : undefined}>
      <span className="public-matchday-mini-team">
        <TeamBadge team={match.homeTeam} />
        <span title={getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "full")}>
          {getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "compact")}
        </span>
        {showScore ? <b className="public-matchday-mini-score">{match.home_score}</b> : null}
      </span>
      <span className="public-matchday-mini-team">
        <TeamBadge team={match.awayTeam} />
        <span title={getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "full")}>
          {getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "compact")}
        </span>
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
            {schedule.dateTime ? (
              <time className="public-matchday-mini-time" dateTime={schedule.dateTime} aria-label={schedule.accessible}>
                {schedule.visual}
              </time>
            ) : (
              <span className="public-matchday-mini-time" aria-label={schedule.accessible}>{schedule.visual}</span>
            )}
            {broadcastChannelName ? (
              <>
                <span className="public-matchday-mini-separator" aria-hidden="true">{"\u00b7"}</span>
                <BroadcastChannelLogo
                  logoUrl={match.broadcastChannel?.logo_url}
                  name={broadcastChannelName}
                  variant="compact"
                />
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
