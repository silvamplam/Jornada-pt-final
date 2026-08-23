"use client";

import PublicMatchMeta from "@/components/public/PublicMatchMeta";
import PublicMatchStripCarousel from "@/components/public/PublicMatchStripCarousel";
import PublicTeamBadge from "@/components/public/PublicTeamBadge";
import {
  PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS,
  mergePublicMatchStripLiveUpdates,
  type PublicMatchStripLiveUpdate
} from "@/lib/public-match-strip-live-refresh";
import { getPublicMatchStripPresentation } from "@/lib/public-match-strip-presentation";
import { getPublicMatchStripTheme } from "@/lib/public-match-strip-theme";
import { getPublicTeamName } from "@/lib/public-team-name";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
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

function toCardDisplayCase(value: string) {
  const lowerWords = new Set(["de", "da", "do", "das", "dos", "e"]);
  const source = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");

  return source
    .split(" ")
    .map((word, wordIndex) => {
      if (!word) return word;

      return word
        .split("-")
        .map((part, partIndex) => {
          if (!part) return part;

          if (/^[A-Za-zÀ-ÿ]\.$/.test(part)) {
            const letter = part.slice(0, 1).toLocaleUpperCase("pt-PT");
            return `${letter}.`;
          }

          const normalized = part.toLocaleLowerCase("pt-PT");

          if ((wordIndex > 0 || partIndex > 0) && lowerWords.has(normalized)) {
            return normalized;
          }

          return normalized.slice(0, 1).toLocaleUpperCase("pt-PT") + normalized.slice(1);
        })
        .join("-");
    })
    .join(" ");
}

function cardDisplayTeamName(team?: PublicMatchStripTeam | null) {
  const candidates = [
    team?.public_name,
    team?.name,
    team?.short_name,
    team?.code
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;

    const normalized = toCardDisplayCase(value);
    if (normalized) return normalized;
  }

  return "—";
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

type PublicMatchStripVariant = "default" | "home" | "clean";
type PublicMatchStripCarouselLayout = "fixed" | "fluid-peek";

type PublicMatchStripCardStyle = CSSProperties & {
  "--public-match-home-backdrop-image": string;
  "--public-match-away-backdrop-image": string;
};

function matchBackdropImage(value?: string | null): string {
  const url = value?.trim();
  return url ? `url(${JSON.stringify(url)})` : "none";
}

function CompactMatchCard({
  match,
  focus,
  now,
  visualVariant
}: {
  match: PublicMatchStripMatch;
  focus?: boolean;
  now: Date;
  visualVariant: PublicMatchStripVariant;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const homeTeamNameRef = useRef<HTMLSpanElement>(null);
  const presentation = getPublicMatchStripPresentation(match, now);
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
  const homeCompactName = cardDisplayTeamName(match.homeTeam);
  const awayCompactName = cardDisplayTeamName(match.awayTeam);
  const activeScore = presentation.center.kind === "score"
    ? presentation.center.text
    : null;
  const finishedScoreText = presentation.finishedScore !== null
    ? `${presentation.finishedScore.left}–${presentation.finishedScore.right}`
    : null;
  const visualStyle: PublicMatchStripCardStyle | undefined = visualVariant === "home"
    ? {
        "--public-match-home-backdrop-image": matchBackdropImage(match.homeTeam?.logo_url),
        "--public-match-away-backdrop-image": matchBackdropImage(match.awayTeam?.logo_url)
      }
    : undefined;
  const scheduleContent = schedule.dateTime ? (
    <time className="public-matchday-mini-time" dateTime={schedule.dateTime} aria-label={schedule.accessible}>
      {schedule.visual}
    </time>
  ) : (
    <span className="public-matchday-mini-time" aria-label={schedule.accessible}>{schedule.visual}</span>
  );
  const scheduledDateTimeMatch = presentation.kind === "scheduled"
    ? /^(.*) · (\d{2}:\d{2})$/.exec(schedule.visual)
    : null;
  const scheduleDateVisual = scheduledDateTimeMatch?.[1] ?? null;
  const scheduleTimeVisual = scheduledDateTimeMatch?.[2] ?? null;
  const hasScheduledFooterTime = Boolean(
    visualVariant === "clean"
      && kind === "scheduled"
      && scheduleTimeVisual
  );
  const scheduleDateOnlyContent = scheduleDateVisual
    ? schedule.dateTime
      ? (
        <time className="public-matchday-mini-time" dateTime={schedule.dateTime} aria-label={schedule.accessible}>
          {scheduleDateVisual}
        </time>
      )
      : (
        <span className="public-matchday-mini-time" aria-label={schedule.accessible}>{scheduleDateVisual}</span>
      )
    : scheduleContent;
  const statusContent = presentation.status.kind === "live" ? (
    <span
      aria-label={`${presentation.statusLabel}${activeScore ? `. Resultado ${match.home_score} a ${match.away_score}` : ""}${presentation.status.minute !== null ? `. Minuto ${presentation.status.minute}` : ""}`}
      className={styles.liveStatus}
    >
      {activeScore ? (
        <strong aria-hidden="true" className={styles.statusScore}>{activeScore}</strong>
      ) : null}
      {presentation.status.minute !== null ? (
        <span aria-hidden="true" className="public-matchday-live-minute">
          {presentation.status.minute}
          <span className={`${styles.livePrime} home-live-minute-prime home-live-minute-prime-active`}>{"'"}</span>
        </span>
      ) : null}
      <LivePulseDots />
    </span>
  ) : presentation.kind === "halftime" ? (
    <span
      aria-label={`${presentation.statusLabel}${activeScore ? `. Resultado ${match.home_score} a ${match.away_score}` : ""}`}
      className={styles.halftimeStatus}
    >
      {activeScore ? (
        <strong aria-hidden="true" className={styles.statusScore}>{activeScore}</strong>
      ) : null}
      <span aria-hidden="true" className={`${styles.stateLabel} public-matchday-live-minute`}>
        {presentation.statusLabel}
      </span>
    </span>
  ) : presentation.status.kind === "label" ? (
    <span className={styles.stateLabel}>{presentation.status.label}</span>
  ) : scheduleContent;
  const cleanStateLabel = kind === "live"
    ? "AGORA"
    : kind === "halftime"
      ? "INTERVALO"
      : kind === "postponed"
        ? "ADIADO"
        : null;
  const cleanStateLabelClass = kind === "live"
    ? styles.cleanStateBadgeLive
    : kind === "halftime"
      ? styles.cleanStateBadgeHalftime
      : styles.cleanStateBadgePostponed;
  const halftimeMinuteSource = match.live_base_minute ?? match.minute;
  const halftimeMinuteValue = typeof halftimeMinuteSource === "number"
    ? halftimeMinuteSource
    : typeof halftimeMinuteSource === "string" && halftimeMinuteSource.trim()
      ? Number(halftimeMinuteSource)
      : null;
  const cleanMinute = presentation.status.kind === "live"
    ? presentation.status.minute
    : kind === "halftime"
      && halftimeMinuteValue !== null
      && Number.isFinite(halftimeMinuteValue)
      ? Math.max(0, Math.floor(halftimeMinuteValue))
      : null;
  const cleanHeaderLead = cleanMinute !== null ? `${cleanMinute}'` : null;
  const cleanHeaderContent = kind === "finished" ? (
    <span className="public-matchday-mini-time" aria-label="Finalizado">FINAL</span>
  ) : cleanStateLabel ? (
    <span
      aria-label={kind === "live"
        ? `${cleanMinute !== null ? `Minuto ${cleanMinute}. ` : ""}Agora`
        : kind === "halftime"
          ? `${cleanMinute !== null ? `Minuto ${cleanMinute}. ` : ""}Intervalo`
          : "Adiado"}
      className={styles.cleanStatusLine}
    >
      {cleanHeaderLead ? (
        <strong className={styles.cleanStatusLead} aria-hidden="true">
          {cleanHeaderLead}
        </strong>
      ) : (
        <span aria-hidden="true" />
      )}
      <span
        aria-hidden="true"
        className={`${styles.cleanStateBadge} ${cleanStateLabelClass}`}
      >
        {cleanStateLabel}
      </span>
    </span>
  ) : hasScheduledFooterTime ? scheduleDateOnlyContent : scheduleContent;
  const cleanScoreText = activeScore ?? finishedScoreText;
  const cleanScoreContent = cleanScoreText ? (
    <strong
      aria-label={`Resultado ${match.home_score} a ${match.away_score}`}
      className={`${styles.cleanScore} ${
        kind === "finished" ? styles.cleanScoreFinished : styles.cleanScoreActive
      }`}
    >
      {cleanScoreText}
    </strong>
  ) : null;
  const hasCleanBroadcast = Boolean(
    (kind === "live" || kind === "halftime")
      && presentation.showChannel
      && broadcastChannelName
  );
  const cleanFooterClassName = kind === "finished"
    ? `${styles.broadcast} ${styles.cleanFinishedFooter}`
    : kind === "live" || kind === "halftime"
      ? `${styles.broadcast} ${styles.cleanActiveFooter} ${
          hasCleanBroadcast ? "" : styles.cleanActiveFooterWithoutBroadcast
        }`
      : kind === "postponed" || hasScheduledFooterTime
        ? `${styles.broadcast} ${styles.cleanScheduledFooterWithTime}`
        : styles.broadcast;

  const syncCleanHeaderAlignment = useCallback(() => {
    if (visualVariant !== "clean") return;

    const card = cardRef.current;
    const homeName = homeTeamNameRef.current;
    if (!card || !homeName) return;

    const cardRect = card.getBoundingClientRect();
    const homeNameRect = homeName.getBoundingClientRect();
    const cardStyle = window.getComputedStyle(card);
    const borderLeft = Number.parseFloat(cardStyle.borderLeftWidth) || 0;
    const paddingLeft = Number.parseFloat(cardStyle.paddingLeft) || 0;
    const contentLeft = cardRect.left + borderLeft + paddingLeft;
    const inlineStart = homeNameRect.left - contentLeft;

    card.style.setProperty(
      "--match-card-status-inline-start",
      `${Math.round(inlineStart * 100) / 100}px`
    );
  }, [homeCompactName, visualVariant]);

  useLayoutEffect(() => {
    if (visualVariant !== "clean") return;

    syncCleanHeaderAlignment();

    const card = cardRef.current;
    const homeName = homeTeamNameRef.current;
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncCleanHeaderAlignment);

    if (card) observer?.observe(card);
    if (homeName) observer?.observe(homeName);

    if (!observer) {
      window.addEventListener("resize", syncCleanHeaderAlignment);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncCleanHeaderAlignment);
    };
  }, [syncCleanHeaderAlignment, visualVariant]);

  return (
    <article
      ref={cardRef}
      className={`${styles.card} public-matchday-mini-card public-matchday-mini-card-${kind}`}
      data-live-focus={focus ? "true" : undefined}
      data-public-match-card
      data-visual-variant={visualVariant}
      style={visualStyle}
    >
      <span className={`${styles.team} public-matchday-mini-team`}>
        <TeamBadge team={match.homeTeam} />
      </span>
      <span className={`${styles.team} public-matchday-mini-team`}>
        <TeamBadge team={match.awayTeam} />
      </span>
      <span className={styles.teamNames} data-public-match-team-names="coordinated">
        <span ref={homeTeamNameRef} className={styles.teamName} title={homeFullName}>{homeCompactName}</span>
        <span
          className={styles.teamName}
          data-public-match-away-name
          title={awayFullName}
        >
          {awayCompactName}
        </span>
      </span>
      {presentation.center.kind === "placeholder" && visualVariant !== "home" ? (
        <span aria-label={presentation.statusLabel} className={styles.center}>
          <strong aria-hidden="true" className={`${styles.score} ${styles.scheduledSeparator}`}>
            {presentation.center.text}
          </strong>
        </span>
      ) : null}
      <span
        className={`${styles.status} public-matchday-mini-status`}
        data-public-match-schedule={visualVariant === "clean" ? "true" : undefined}
      >
        {visualVariant === "clean" ? (
          cleanHeaderContent
        ) : presentation.kind === "finished" ? (
          <span
            aria-label={finishedScoreText
              ? `Finalizado. Resultado ${presentation.finishedScore?.left} a ${presentation.finishedScore?.right}`
              : "Finalizado"}
            className={styles.finishedMeta}
            data-public-match-meta
          >
            {finishedScoreText ? (
              <strong aria-hidden="true" className={styles.finishedScore}>
                {finishedScoreText}
              </strong>
            ) : null}
          </span>
        ) : (
          <PublicMatchMeta
            channelLogoUrl={presentation.showChannel ? match.broadcastChannel?.logo_url : null}
            channelName={presentation.showChannel ? broadcastChannelName : null}
            dateTime={statusContent}
          />
        )}
      </span>
      {visualVariant === "clean" ? (
        <span className={cleanFooterClassName} data-public-match-broadcast>
          {kind === "postponed" ? (
            <span className={styles.cleanScheduledTime}>Nova data por definir</span>
          ) : kind === "scheduled" ? (
            hasScheduledFooterTime ? (
              <>
                <span className={styles.cleanScheduledTime} aria-hidden="true">
                  {scheduleTimeVisual}
                </span>
                {presentation.showChannel && broadcastChannelName ? (
                  <PublicMatchMeta
                    channelLogoUrl={match.broadcastChannel?.logo_url}
                    channelName={broadcastChannelName}
                    dateTime={<span aria-hidden="true" />}
                    variant="compact"
                  />
                ) : null}
              </>
            ) : (
              <PublicMatchMeta
                channelLogoUrl={presentation.showChannel ? match.broadcastChannel?.logo_url : null}
                channelName={presentation.showChannel ? broadcastChannelName : null}
                dateTime={<span aria-hidden="true" />}
                variant="compact"
              />
            )
          ) : (
            <>
              {cleanScoreContent}
              {hasCleanBroadcast ? (
                <PublicMatchMeta
                  channelLogoUrl={match.broadcastChannel?.logo_url}
                  channelName={broadcastChannelName}
                  dateTime={<span aria-hidden="true" />}
                  variant="compact"
                />
              ) : null}
            </>
          )}
        </span>
      ) : null}
    </article>
  );
}

export default function PublicMatchStrip({
  matches,
  competitionSlug,
  carouselLayout = "fixed",
  variant = "clean"
}: {
  matches: PublicMatchStripMatch[];
  competitionSlug?: string | null;
  carouselLayout?: PublicMatchStripCarouselLayout;
  variant?: PublicMatchStripVariant;
}) {
  const [currentMatches, setCurrentMatches] = useState(matches);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const matchIdsKey = useMemo(
    () => matches.map((match) => match.id).join(","),
    [matches]
  );
  const competitionTheme = getPublicMatchStripTheme(competitionSlug);
  const now = new Date(nowMs);
  const focusedMatch = currentMatches.find((match) => {
    const kind = getPublicMatchStripPresentation(match, now).kind;
    return kind === "live" || kind === "halftime";
  }) ?? null;

  useEffect(() => {
    setCurrentMatches(matches);
  }, [matches]);

  const refreshLiveState = useCallback(async (signal: AbortSignal) => {
    if (!matchIdsKey) return;

    const response = await fetch(
      `/api/public/matches/live?ids=${encodeURIComponent(matchIdsKey)}`,
      { cache: "no-store", signal }
    );

    if (!response.ok) return;

    const payload = await response.json() as {
      matches?: PublicMatchStripLiveUpdate[];
    };

    if (!Array.isArray(payload.matches)) return;

    setCurrentMatches((current) => (
      mergePublicMatchStripLiveUpdates(current, payload.matches ?? [])
    ));
  }, [matchIdsKey]);

  useEffect(() => {
    if (!matchIdsKey) return;

    let controller: AbortController | null = null;

    const refresh = () => {
      setNowMs(Date.now());
      if (document.visibilityState !== "visible") return;

      controller?.abort();
      controller = new AbortController();
      // Browser polling disabled: final results are refreshed by the scheduled sync.
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const intervalId = window.setInterval(
      refresh,
      PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controller?.abort();
    };
  }, [matchIdsKey, refreshLiveState]);

  if (currentMatches.length === 0) {
    return null;
  }

  return (
    <section
      className={`${styles.panel} public-matchday-panel public-matchday-scoreboard-panel`}
      data-competition-theme={competitionTheme ?? undefined}
      data-carousel-layout={variant === "clean" ? carouselLayout : undefined}
      data-visual-variant={variant}
      aria-label="Visao rapida dos jogos"
    >
      <div className={`${styles.shell} public-matchday-strip-shell`}>
        {variant === "clean" ? (
          <PublicMatchStripCarousel layout={carouselLayout}>
            {currentMatches.map((match) => (
              <CompactMatchCard
                focus={focusedMatch?.id === match.id}
                key={match.id}
                match={match}
                now={now}
                visualVariant={variant}
              />
            ))}
          </PublicMatchStripCarousel>
        ) : (
          <div
            className={`${styles.row} public-matchday-strip`}
            data-matchday-strip
            style={{ "--public-match-strip-columns": currentMatches.length } as CSSProperties}
          >
            {currentMatches.map((match) => (
              <CompactMatchCard
                focus={focusedMatch?.id === match.id}
                key={match.id}
                match={match}
                now={now}
                visualVariant={variant}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
