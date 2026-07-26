import PublicMatchMeta from "@/components/public/PublicMatchMeta";
import PublicTeamBadge from "@/components/public/PublicTeamBadge";
import { getPublicMatchStripPresentation } from "@/lib/public-match-strip-presentation";
import { getPublicTeamName } from "@/lib/public-team-name";
import type { CSSProperties } from "react";
import styles from "./PublicMatchStrip.module.css";

export type PublicMatchStripTeam = {
  name?: string | null;
  public_name?: string | null;
  short_name?: string | null;
  code?: string | null;
  slug?: string | null;
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

function TeamBadge({ team }: { team?: PublicMatchStripTeam | null }) {
  const label = getPublicTeamName(
    { name: team?.name, publicName: team?.public_name, shortName: team?.short_name, code: team?.code },
    "badge"
  );

  return (
    <PublicTeamBadge
      altLabel={getPublicTeamName(
        { name: team?.name, publicName: team?.public_name, shortName: team?.short_name, code: team?.code },
        "full"
      )}
      fallbackLabel={label}
      logoUrl={team?.logo_url}
      slug={team?.slug}
      variant="compact"
    />
  );
}

function LivePulseDots() {
  return (
    <span className={`${styles.livePulseDots} home-live-pulse-dots`} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function CompactMatchCard({
  match,
  focus
}: {
  match: PublicMatchStripMatch;
  focus?: boolean;
}) {
  const presentation = getPublicMatchStripPresentation(match);
  const kind = presentation.kind;
  const broadcastChannelName = match.broadcastChannel?.name?.trim();
  const schedule = miniCardSchedule(match);
  const homeTeamName = {
    name: match.homeTeam?.name,
    publicName: match.homeTeam?.public_name,
    shortName: match.homeTeam?.short_name,
    code: match.homeTeam?.code
  };
  const awayTeamName = {
    name: match.awayTeam?.name,
    publicName: match.awayTeam?.public_name,
    shortName: match.awayTeam?.short_name,
    code: match.awayTeam?.code
  };
  const homeFullName = getPublicTeamName(homeTeamName, "full");
  const awayFullName = getPublicTeamName(awayTeamName, "full");
  const homeCompactName = getPublicTeamName(homeTeamName, "compact");
  const awayCompactName = getPublicTeamName(awayTeamName, "compact");
  const statusContent = presentation.status.kind === "live" ? (
    <span className={styles.liveStatus}>
      <span className="public-matchday-live-label">{presentation.status.label}</span>
      {presentation.status.minute !== null ? (
        <span className="public-matchday-live-minute">
          {presentation.status.minute}
          <span className={`${styles.livePrime} home-live-minute-prime home-live-minute-prime-active`}>{"'"}</span>
        </span>
      ) : null}
      <LivePulseDots />
    </span>
  ) : presentation.status.kind === "label" ? (
    <span className={styles.stateLabel}>{presentation.status.label}</span>
  ) : schedule.dateTime ? (
    <time className="public-matchday-mini-time" dateTime={schedule.dateTime} aria-label={schedule.accessible}>
      {schedule.visual}
    </time>
  ) : (
    <span className="public-matchday-mini-time" aria-label={schedule.accessible}>{schedule.visual}</span>
  );

  return (
    <article className={`${styles.card} public-matchday-mini-card public-matchday-mini-card-${kind}`} data-live-focus={focus ? "true" : undefined}>
      <span className={`${styles.team} public-matchday-mini-team`}>
        <TeamBadge team={match.homeTeam} />
      </span>
      <span className={`${styles.team} public-matchday-mini-team`}>
        <TeamBadge team={match.awayTeam} />
      </span>
      <span className={styles.teamNames} data-public-match-team-names="coordinated">
        <span className={styles.teamName} title={homeFullName}>{homeCompactName}</span>
        <span className={styles.teamName} title={awayFullName}>{awayCompactName}</span>
      </span>
      {presentation.center.kind !== "empty" ? (
        <span
          aria-label={presentation.center.kind === "score"
            ? `${presentation.statusLabel}. Resultado ${match.home_score} a ${match.away_score}`
            : presentation.statusLabel}
          className={styles.center}
        >
          <strong
            aria-hidden="true"
            className={presentation.center.kind === "score"
              ? styles.score
              : `${styles.score} ${styles.scheduledSeparator}`}
          >
            {presentation.center.text}
          </strong>
        </span>
      ) : null}
      <span className={`${styles.status} public-matchday-mini-status`}>
        {presentation.lowerScore !== null ? (
          <span className={styles.finishedMeta} data-public-match-meta>
            <span>{statusContent}</span>
            <strong
              aria-label={`Resultado ${match.home_score} a ${match.away_score}`}
              className={styles.finishedScore}
            >
              {presentation.lowerScore}
            </strong>
          </span>
        ) : (
          <PublicMatchMeta
            channelLogoUrl={presentation.showChannel ? match.broadcastChannel?.logo_url : null}
            channelName={presentation.showChannel ? broadcastChannelName : null}
            dateTime={statusContent}
          />
        )}
      </span>
    </article>
  );
}

export default function PublicMatchStrip({ matches }: { matches: PublicMatchStripMatch[] }) {
  const focusedMatch = matches.find((match) => {
    const kind = getPublicMatchStripPresentation(match).kind;
    return kind === "live" || kind === "halftime";
  }) ?? null;

  if (matches.length === 0) {
    return null;
  }

  return (
    <section className="public-matchday-panel public-matchday-scoreboard-panel" aria-label="Visao rapida dos jogos">
      <div className={`${styles.shell} public-matchday-strip-shell`}>
        <div
          className={`${styles.row} public-matchday-strip`}
          data-matchday-strip
          style={{ "--public-match-strip-columns": matches.length } as CSSProperties}
        >
          {matches.map((match) => (
            <CompactMatchCard focus={focusedMatch?.id === match.id} key={match.id} match={match} />
          ))}
        </div>
      </div>
    </section>
  );
}
