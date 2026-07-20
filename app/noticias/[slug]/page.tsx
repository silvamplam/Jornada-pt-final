import { notFound } from "next/navigation";

import PublicTeamBadge from "@/components/public/PublicTeamBadge";
import { getPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { getPublicLiveMinute } from "@/lib/live-match-clock";
import { buildPublicMatchdayLegNavigation } from "@/lib/public-matchday-leg-navigation";
import { getPublicTeamName } from "@/lib/public-team-name";
import {
  getPublicMatchdayDiagnostic,
  seasonLabelToUrlSegment,
  type PublicSeasonMatch
} from "@/lib/public-matchday";
import {
  fetchSupabaseAdminTable,
  type SupabaseCompetition,
  type SupabaseMatchday,
  type SupabaseSeason
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

type EditorialArticle = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  excerpt?: string | null;
  body?: string | null;
  image_url?: string | null;
  image_caption?: string | null;
  label?: string | null;
  category?: string | null;
  type?: string | null;
  author?: string | null;
  author_name?: string | null;
  status: string;
  source_url?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
  match_id?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const articlePageStyles = `
  body {
    margin: 0;
    overflow-x: hidden;
    background: #ffffff;
  }

  .news-article-shell {
    min-height: 100vh;
    color: #111820;
    padding: 0 24px 28px;
    font-family: Arial, Helvetica, sans-serif;
  }

  .public-top-stack {
    position: sticky;
    top: 0;
    z-index: 20;
    margin: 0 -24px;
    padding: 0 24px;
    border-bottom: 1px solid #d8dee6;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.08);
  }

  .public-site-topbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 22px;
    align-items: center;
    min-height: 56px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 0;
    border-bottom: 1px solid #dfe5ec;
  }

  .public-site-brand {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    color: #2f343b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 29px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    letter-spacing: -0.02em;
  }

  .public-site-brand span {
    color: #6b7480;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .public-site-menu {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-site-menu a,
  .public-site-actions a {
    color: #10151b;
    text-decoration: none;
  }

  .public-site-menu a[aria-current="page"] {
    color: #c40012;
  }

  .public-site-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    font-weight: 900;
  }

  .public-site-search {
    display: inline-flex;
    min-width: 170px;
    align-items: center;
    gap: 8px;
    padding: 6px 11px;
    border: 1px solid #d8dee6;
    border-radius: 999px;
    background: #ffffff;
    color: #66717f;
    font-size: 12px;
    font-weight: 900;
  }

  .public-site-search::before {
    content: "⌕";
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #ffe04f;
    color: #10151b;
    font-size: 13px;
  }

  .public-season-nav-bar {
    margin: 0;
    padding: 0;
    border-top: 1px solid #dbe4ee;
    border-bottom: 1px solid #d4deea;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 10px 22px rgba(15, 23, 42, 0.045);
  }

  .public-hidden-heading {
    display: none;
  }

  .public-season-nav-inner {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px 12px;
    align-items: center;
    min-height: 46px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 0;
    overflow: hidden;
  }

  .public-season-select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border: 1px solid #ccd8e5;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    color: #263241;
    font-size: 10.5px;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .public-season-select {
    min-width: 118px;
    border: 0;
    background: transparent;
    color: #10151b;
    font: inherit;
    outline: none;
    cursor: pointer;
  }

  .public-matchday-nav {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    gap: 0;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 0;
    border-top: 2px solid #10151b;
    background: #ffffff;
  }

  .public-matchday-nav::-webkit-scrollbar {
    display: none;
  }

  .public-matchday-nav a {
    display: inline-block;
    flex: 0 0 auto;
    padding: 7px 12px;
    border: 0;
    border-right: 1px solid #dfe5ec;
    border-radius: 0;
    background: #ffffff;
    color: #263241;
    font-size: 10.5px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .public-matchday-nav a[aria-current="page"] {
    border-color: #c40012;
    background: #c40012;
    color: #ffffff;
  }

  .public-matchday-leg-nav {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0;
    border-top: 2px solid #10151b;
    background: #ffffff;
    white-space: nowrap;
  }

  .public-matchday-leg-nav a {
    display: inline-block;
    padding: 7px 10px;
    border-right: 1px solid #dfe5ec;
    background: #ffffff;
    color: #263241;
    font-size: 10.5px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-matchday-leg-nav a[aria-current="true"] {
    background: #10151b;
    color: #ffffff;
  }

  .public-matchday-date-row {
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
    min-width: 0;
    margin-left: auto;
  }

  .public-matchday-date-context {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    color: #66717f;
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1;
    text-align: right;
    white-space: nowrap;
  }

  .news-article-layout {
    display: grid;
    grid-template-columns: minmax(0, 780px) 320px;
    gap: 42px;
    width: min(1180px, calc(100% - 32px));
    margin: 0 auto;
    padding: 24px 0 56px;
  }

  .news-article-main {
    min-width: 0;
  }

  .news-article-kickers {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 12px;
  }

  .news-article-label {
    display: inline-block;
    padding: 5px 7px 4px;
    border-radius: 2px;
    background: #ffe04f;
    color: #111820;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .news-article-label + .news-article-label {
    background: transparent;
    color: #c40012;
  }

  .news-article-title {
    margin: 0;
    max-width: 100%;
    color: #05080c;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(32px, 3vw, 43px);
    font-weight: 900;
    line-height: 1.09;
    letter-spacing: 0;
  }

  .news-article-subtitle {
    margin: 14px 0 0;
    max-width: 690px;
    color: #293442;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 20px;
    font-weight: 500;
    line-height: 1.45;
  }

  .news-article-meta {
    display: grid;
    gap: 4px;
    margin: 16px 0 22px;
    color: #5e6976;
    font-size: 12.5px;
  }

  .news-article-author {
    color: #4d5967;
    font-size: 13px;
    font-weight: 600;
  }

  .news-article-image {
    margin: 0 0 30px;
    background: #eef2f6;
  }

  .news-article-image img {
    display: block;
    width: 100%;
    max-height: 620px;
    object-fit: cover;
    background: #eef2f6;
  }

  .news-article-image figcaption {
    margin-top: 8px;
    color: #687482;
    font-size: 12px;
  }

  .news-article-body {
    max-width: 880px;
    color: #111820;
    font-size: 20px;
    line-height: 1.62;
  }

  .news-article-body p {
    margin: 0 0 22px;
  }

  .news-article-games-strip {
    width: calc(100% + 48px);
    margin: 0 -24px;
    margin-left: -24px;
    margin-right: -24px;
    padding: 2px 24px 10px;
    border-top: 1px solid #dbe4ee;
    border-bottom: 1px solid #d4deea;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
  }

  .news-article-games-shell {
    display: block;
  }

  .news-article-games-button {
    display: none;
  }

  .news-article-games-button:hover {
    display: none;
  }

  .news-article-games-scroller {
    display: grid;
    width: 100%;
    min-width: 0;
    gap: 7px;
    align-items: stretch;
    overflow-x: visible;
    padding: 6px 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .news-article-games-scroller::-webkit-scrollbar {
    display: none;
  }

  .news-article-game-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    gap: 3px;
    align-items: center;
    min-height: 78px;
    padding: 7px 8px;
    border: 1px solid #ccd8e5;
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.085);
    color: #111820;
    font-size: 12px;
  }

  .news-article-game-team {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 5px;
    align-items: center;
    min-width: 0;
    color: #0d141d;
    font-weight: 900;
    line-height: 1.1;
  }

  .news-article-game-team span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .news-article-game-card .public-team-badge {
    width: 24px;
    height: 24px;
    font-size: 9px;
  }

  .news-article-game-score {
    min-width: 18px;
    color: #05080c;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    font-weight: 900;
    line-height: 1;
    text-align: right;
  }

  .news-article-game-card-live .news-article-game-team:first-of-type .news-article-game-score {
    padding-right: 0;
  }

  .news-article-game-meta {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
    justify-content: center;
    overflow: visible;
    padding: 1px 2px 0;
    color: #435160;
    font-size: 9.5px;
    font-weight: 900;
    line-height: 1.15;
    white-space: nowrap;
  }

  .public-live-pulse-dots {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 5px;
    vertical-align: middle;
  }

  .public-live-pulse-dots span {
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: #16a34a;
    opacity: 0.35;
    animation: public-live-dot-alternate 1.15s infinite ease-in-out;
  }

  .public-live-pulse-dots span:nth-child(2) {
    animation-delay: 0.55s;
  }

  .public-live-minute-prime {
    display: inline-block;
    color: inherit;
  }

  .public-live-minute-prime-active {
    animation: public-live-prime-pulse 1s infinite ease-in-out;
  }

  @keyframes public-live-dot-alternate {
    0%,
    100% {
      opacity: 0.35;
    }

    50% {
      opacity: 1;
    }
  }

  @keyframes public-live-prime-pulse {
    0%,
    100% {
      opacity: 0.35;
    }

    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .public-live-pulse-dots span {
      animation: none;
      opacity: 0.75;
      transform: none;
    }

    .public-live-minute-prime-active {
      animation: none;
      opacity: 1;
    }
  }

  .news-article-game-live-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #10151b;
    white-space: nowrap;
  }

  .news-article-game-live-label,
  .news-article-game-live-separator {
    color: #10151b;
  }

  .news-article-game-live-minute {
    color: #16a34a;
  }

  .news-article-game-live-channel {
    color: #263241;
    white-space: nowrap;
  }

  .news-article-game-channel {
    min-width: 0;
    overflow: visible;
    color: #263241;
    text-overflow: clip;
    white-space: nowrap;
  }

  .news-article-sidebar {
    display: grid;
    align-content: start;
    gap: 20px;
    position: sticky;
    top: 128px;
  }

  .news-article-ad {
    display: grid;
    min-height: 300px;
    place-items: center;
    border: 1px solid #dfe5eb;
    border-radius: 8px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.66)),
      linear-gradient(135deg, #eef4f6, #e5ecf2 55%, #f5f0e8);
    color: #7a8794;
    font-size: 12px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .news-article-ad-link {
    display: block;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    background: #ffffff;
    color: inherit;
    text-decoration: none;
  }

  .news-article-ad-link img {
    display: block;
    width: 100%;
    height: auto;
  }

  .news-article-side-panel {
    background: #ffffff;
  }

  .news-article-side-list {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .news-article-side-item {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .news-article-side-item img {
    display: block;
    width: 86px;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: #eef2f6;
  }

  .news-article-side-thumb-placeholder {
    display: block;
    width: 86px;
    aspect-ratio: 4 / 3;
    background: linear-gradient(135deg, #eef2f6, #dbe3eb);
  }

  .news-article-side-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .news-article-side-label {
    color: #c40012;
    font-size: 11px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .news-article-side-item a {
    color: #17202b;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.16;
    text-decoration: none;
  }

  .news-article-side-item a:hover {
    text-decoration: underline;
  }

  .news-article-side-subtitle {
    margin: 0;
    color: #5d6875;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.25;
  }

  .news-article-side-date {
    color: #7b8795;
    font-size: 12px;
    line-height: 1.1;
  }

  @media (max-width: 900px) {
    .news-article-shell {
      padding: 0 14px 26px;
    }

    .public-top-stack {
      margin: 0 -14px;
      padding: 0 14px;
    }

    .public-site-topbar {
      grid-template-columns: 1fr;
    }

    .public-site-menu,
    .public-site-actions {
      justify-content: flex-start;
    }

    .public-season-nav-inner {
      gap: 8px;
      padding: 8px 16px 9px;
    }

    .public-matchday-date-context {
      text-align: left;
    }

    .public-matchday-date-row {
      margin-left: 0;
      justify-content: flex-start;
    }

    .news-article-layout {
      grid-template-columns: 1fr;
      padding-top: 18px;
    }

    .news-article-games-strip {
      width: calc(100% + 28px);
      margin: 0 -14px;
      margin-top: 0;
      padding: 2px 14px 8px;
    }

    .news-article-games-shell {
      display: block;
    }

    .news-article-games-button {
      display: none;
    }

    .news-article-games-scroller {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(148px, 100%), 1fr)) !important;
      padding: 6px 0;
      overflow-x: visible;
    }

    .news-article-game-card {
      flex: 1 1 auto;
    }

    .news-article-sidebar {
      position: static;
    }

    .news-article-title {
      font-size: 31px;
    }

    .news-article-subtitle {
      font-size: 17px;
    }

    .news-article-body {
      font-size: 18px;
    }
  }
`;

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? null;
}

function formatDate(value?: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value?: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function publicArticleHref(article: EditorialArticle) {
  return `/noticias/${encodeURIComponent(article.slug)}`;
}

const civilMonthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

const compactMonthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function parseCivilDate(value: string | null | undefined) {
  const cleanValue = value ?? "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanValue);
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

  return { day, month, year, key: cleanValue };
}

function formatKickoffTime(value: string | null) {
  if (!value) return "Hora por definir";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Hora por definir";

  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
}

function formatMiniCardKickoff(scheduledDate: string, value: string | null) {
  if (!value) {
    const date = parseCivilDate(scheduledDate);
    return date
      ? `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")} · Hora por definir`
      : "Hora por definir";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatMiniCardKickoff(scheduledDate, null);

  const dayMonth = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);

  return `${dayMonth} · ${formatKickoffTime(value)}`;
}

function formatMatchdayDateContext(matches: PublicSeasonMatch[]) {
  const scheduledDates = matches
    .map((match) => parseCivilDate(match.scheduled_date))
    .filter((date): date is NonNullable<typeof date> => date !== null)
    .sort((firstDate, secondDate) => firstDate.key.localeCompare(secondDate.key));

  if (scheduledDates.length === 0) return "Data por definir";

  const firstDate = scheduledDates[0];
  const lastDate = scheduledDates[scheduledDates.length - 1];
  const firstLabel = `${firstDate.day} ${civilMonthNames[firstDate.month - 1]}`;
  const lastLabel = `${lastDate.day} ${civilMonthNames[lastDate.month - 1]}`;
  if (firstDate.key === lastDate.key) return firstLabel;

  if (firstDate.year === lastDate.year && firstDate.month === lastDate.month) {
    return `${firstDate.day}–${lastDate.day} ${civilMonthNames[lastDate.month - 1]}`;
  }

  return `${firstLabel} – ${lastLabel}`;
}

function validKickoffTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
}

function kickoffCivilDate(value: string | null) {
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
  return year && month && day
    ? { day, month, year, key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` }
    : null;
}

function compactMatchSchedule(match: Pick<PublicSeasonMatch, "scheduled_date" | "kickoff_at" | "matchday">) {
  const scheduledDate = parseCivilDate(match.scheduled_date);
  const kickoffTime = validKickoffTime(match.kickoff_at);
  if (kickoffTime) {
    const civilDate = scheduledDate ?? kickoffCivilDate(match.kickoff_at);
    if (civilDate) {
      return {
        visual: `${String(civilDate.day).padStart(2, "0")} ${compactMonthNames[civilDate.month - 1]} · ${kickoffTime}`,
        accessible: `${civilDate.day} de ${civilMonthNames[civilDate.month - 1]} de ${civilDate.year}, às ${kickoffTime.replace(":", "h")}`,
        dateTime: match.kickoff_at
      };
    }
  }
  if (scheduledDate) {
    return {
      visual: `${String(scheduledDate.day).padStart(2, "0")} ${compactMonthNames[scheduledDate.month - 1]} · A DEFINIR`,
      accessible: `${scheduledDate.day} de ${civilMonthNames[scheduledDate.month - 1]} de ${scheduledDate.year}, hora por definir`,
      dateTime: match.scheduled_date
    };
  }
  const matchdayNumber = match.matchday?.number ?? null;
  return {
    visual: matchdayNumber === null ? "A DEFINIR" : `J${matchdayNumber} · A DEFINIR`,
    accessible: matchdayNumber === null ? "Data e hora por definir" : `Jornada ${matchdayNumber}, data e hora por definir`,
    dateTime: null
  };
}

function formatCivilDateRange(firstDate: NonNullable<ReturnType<typeof parseCivilDate>>, lastDate: NonNullable<ReturnType<typeof parseCivilDate>>) {
  if (firstDate.key === lastDate.key) return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} de ${firstDate.year}`;
  if (firstDate.year === lastDate.year && firstDate.month === lastDate.month) {
    return `${firstDate.day}–${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
  }
  if (firstDate.year === lastDate.year) {
    return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} – ${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
  }
  return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} de ${firstDate.year} – ${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
}

function formatPreferredMatchdayDateContext(matches: PublicSeasonMatch[], startsOn: string | null, endsOn: string | null) {
  const startsDate = parseCivilDate(startsOn);
  const endsDate = parseCivilDate(endsOn);
  if (startsDate && endsDate) return formatCivilDateRange(startsDate, endsDate);
  const scheduledDates = matches
    .map((match) => parseCivilDate(match.scheduled_date))
    .filter((date): date is NonNullable<typeof date> => date !== null)
    .sort((firstDate, secondDate) => firstDate.key.localeCompare(secondDate.key));
  if (scheduledDates.length === 0) return "Data por definir";
  return formatCivilDateRange(scheduledDates[0], scheduledDates[scheduledDates.length - 1]);
}

function statusKind(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "finished") return "finished";
  if (normalized === "live") return "live";
  if (normalized === "halftime") return "halftime";
  if (normalized === "scheduled") return "scheduled";
  return "unknown";
}

function statusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "finished") return "Finalizado";
  if (normalized === "scheduled") return "Agendado";
  if (normalized === "live") return "Live";
  if (normalized === "halftime") return "Intervalo";
  if (normalized === "postponed") return "Adiado";
  if (normalized === "cancelled") return "Cancelado";
  return status;
}

function TeamBadge({ team }: { team?: PublicSeasonMatch["homeTeam"] }) {
  return (
    <PublicTeamBadge
      fallbackLabel={getPublicTeamName(
        { name: team?.name, publicName: team?.public_name, shortName: team?.short_name, code: team?.code },
        "badge"
      )}
      logoUrl={team?.logo_url}
    />
  );
}

function LivePulseDots() {
  return (
    <span className="public-live-pulse-dots" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function compactTvLabel(value?: string | null) {
  const label = value?.trim();
  return label ? label.replace(/^Sport\s*TV\s*/i, "SportTV") : "";
}

function ArticleMatchCard({ match }: { match: PublicSeasonMatch }) {
  const kind = statusKind(match.status);
  const hasScore = match.home_score !== null && match.away_score !== null;
  const showScore = hasScore && (kind === "finished" || kind === "live" || kind === "halftime");
  const publicMinute = getPublicLiveMinute(match);
  const channelName = match.broadcastChannel?.name?.trim();
  const compactChannelName = compactTvLabel(channelName);
  const livePrimeClassName = "public-live-minute-prime public-live-minute-prime-active";
  const liveStatus = kind === "live" ? (
    <>
      <span className="news-article-game-live-label">Live</span>
      {publicMinute !== null ? (
        <span className="news-article-game-live-minute">{publicMinute}<span className={livePrimeClassName}>'</span></span>
      ) : null}
      {compactChannelName ? <span className="news-article-game-live-channel" title={channelName}>{compactChannelName}</span> : null}
    </>
  ) : statusLabel(match.status);
  const homeTeamName = getPublicTeamName(
    { name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code },
    "full"
  );
  const awayTeamName = getPublicTeamName(
    { name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code },
    "full"
  );
  const schedule = compactMatchSchedule(match);

  return (
    <article className={`news-article-game-card news-article-game-card-${kind}`}>
      <span className="news-article-game-team">
        <TeamBadge team={match.homeTeam} />
        <span title={homeTeamName}>
          {getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "compact")}
        </span>
        {showScore ? <b className="news-article-game-score">{match.home_score}</b> : null}
      </span>
      <span className="news-article-game-team">
        <TeamBadge team={match.awayTeam} />
        <span title={awayTeamName}>
          {getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "compact")}
        </span>
        {showScore ? <b className="news-article-game-score">{match.away_score}</b> : null}
      </span>
      <span className="news-article-game-meta">
        {kind === "scheduled" ? (
          <>
            {schedule.dateTime ? (
              <time dateTime={schedule.dateTime} aria-label={schedule.accessible}>{schedule.visual}</time>
            ) : (
              <span aria-label={schedule.accessible}>{schedule.visual}</span>
            )}
            {channelName ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="news-article-game-channel" title={channelName}>{compactChannelName}</span>
              </>
            ) : null}
          </>
        ) : kind === "live" || kind === "halftime" ? (
          <span className="news-article-game-live-status">
            {liveStatus}
            {kind === "live" ? <LivePulseDots /> : null}
          </span>
        ) : (
          <span>{kind === "finished" ? "Finalizado" : statusLabel(match.status)}</span>
        )}
      </span>
    </article>
  );
}

function articleParagraphs(body?: string | null) {
  return (body ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

async function readArticle(slug: string) {
  const rows = await fetchSupabaseAdminTable<EditorialArticle>(
    `editorial_articles?select=*&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`
  );

  return rows[0] ?? null;
}

function articleContextPriority(candidate: EditorialArticle, current: EditorialArticle) {
  const currentCompetitionId = firstText(current.competition_id);
  const currentSeasonId = firstText(current.season_id);
  const currentMatchdayId = firstText(current.matchday_id);
  const candidateCompetitionId = firstText(candidate.competition_id);
  const candidateSeasonId = firstText(candidate.season_id);
  const candidateMatchdayId = firstText(candidate.matchday_id);
  const candidateIsGeneral = !candidateCompetitionId && !candidateSeasonId && !candidateMatchdayId;

  if (currentMatchdayId && candidateMatchdayId === currentMatchdayId) {
    return 1;
  }

  if (currentCompetitionId && currentSeasonId) {
    if (
      candidateCompetitionId === currentCompetitionId &&
      candidateSeasonId === currentSeasonId &&
      !candidateMatchdayId
    ) {
      return 2;
    }

    if (candidateCompetitionId === currentCompetitionId && !candidateSeasonId && !candidateMatchdayId) {
      return 3;
    }

    return candidateIsGeneral ? 4 : null;
  }

  if (currentCompetitionId) {
    if (candidateCompetitionId === currentCompetitionId && !candidateSeasonId && !candidateMatchdayId) {
      return 3;
    }

    return candidateIsGeneral ? 4 : null;
  }

  return candidateIsGeneral ? 4 : null;
}

async function readMoreArticles(currentArticle: EditorialArticle) {
  const rows = await fetchSupabaseAdminTable<EditorialArticle>(
    `editorial_articles?select=*&status=eq.published&slug=neq.${encodeURIComponent(
      currentArticle.slug
    )}&order=published_at.desc.nullslast&limit=80`
  ).catch(() => []);

  return rows
    .map((article, index) => ({ article, index, priority: articleContextPriority(article, currentArticle) }))
    .filter((item): item is { article: EditorialArticle; index: number; priority: number } => item.priority !== null)
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, 5)
    .map((item) => item.article);
}

async function readArticleMatchdayContext(article: EditorialArticle) {
  if (!article.matchday_id) {
    return null;
  }

  try {
    const matchdays = await fetchSupabaseAdminTable<SupabaseMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&id=eq.${encodeURIComponent(
        article.matchday_id
      )}&limit=1`
    );
    const matchday = matchdays[0] ?? null;
    const seasonId = matchday?.season_id ?? article.season_id;

    if (!matchday || !seasonId) {
      return null;
    }

    const seasons = await fetchSupabaseAdminTable<SupabaseSeason>(
      `seasons?select=id,competition_id,label,starts_on,ends_on,is_current&id=eq.${encodeURIComponent(seasonId)}&limit=1`
    );
    const season = seasons[0] ?? null;
    const competitionId = season?.competition_id ?? article.competition_id;

    if (!season || !competitionId) {
      return null;
    }

    const competitions = await fetchSupabaseAdminTable<SupabaseCompetition>(
      `competitions?select=id,name,slug,country_id,country,logo_url,accent_color,is_active&id=eq.${encodeURIComponent(
        competitionId
      )}&limit=1`
    );
    const competition = competitions[0] ?? null;

    if (!competition?.slug || !matchday.number) {
      return null;
    }

    const { context } = await getPublicMatchdayDiagnostic({
      competitionSlug: competition.slug,
      seasonLabel: seasonLabelToUrlSegment(season.label),
      matchdayNumber: matchday.number
    });

    return context;
  } catch {
    return null;
  }
}

export default async function NewsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await readArticle(slug);

  if (!article) {
    notFound();
  }

  const [moreArticles, articleContext, publicCompetitionMenuBase] = await Promise.all([
    readMoreArticles(article),
    readArticleMatchdayContext(article),
    getPublicCompetitionMenu().catch(() => [])
  ]);
  const label = firstText(article.label, article.category, article.type);
  const subtitle = firstText(article.subtitle, article.summary, article.excerpt);
  const author = firstText(article.author, article.author_name);
  const publishedAt = formatDate(article.published_at ?? article.created_at);
  const paragraphs = articleParagraphs(article.body);
  const articleMatches = articleContext?.matchesForMatchday ?? [];
  const seasonSegment = articleContext ? seasonLabelToUrlSegment(articleContext.season.label) : null;
  const matchdayHref = (matchdayNumber: number) =>
    articleContext && seasonSegment
      ? `/competicoes/${articleContext.competition.slug}/${seasonSegment}/jornadas/${matchdayNumber}`
      : "/";
  const gamesPageHref =
    articleContext && seasonSegment
      ? `/competicoes/${articleContext.competition.slug}/${seasonSegment}/jornadas/${articleContext.matchday.number}/jogos`
      : null;
  const classificationHref = articleContext ? `${matchdayHref(articleContext.matchday.number)}#classificacao` : null;
  const currentCompetitionMenuItem =
    articleContext && seasonSegment
      ? {
          label: articleContext.competition.name,
          slug: articleContext.competition.slug,
          href: matchdayHref(articleContext.matchday.number)
        }
      : null;
  const publicCompetitionMenu = currentCompetitionMenuItem
    ? publicCompetitionMenuBase.map((item) => (item.slug === currentCompetitionMenuItem.slug ? currentCompetitionMenuItem : item))
    : publicCompetitionMenuBase;
  const seasonOptions =
    articleContext && seasonSegment
      ? articleContext.seasons.map((season) => ({
          id: season.id,
          label: season.label,
          href: `/competicoes/${articleContext.competition.slug}/${seasonLabelToUrlSegment(season.label)}/jornadas/1`
        }))
      : [];
  const currentSeasonHref = articleContext && seasonSegment ? `/competicoes/${articleContext.competition.slug}/${seasonSegment}/jornadas/1` : "/";
  const matchdayLegNavigation = buildPublicMatchdayLegNavigation(
    articleContext?.matchdays ?? [],
    articleContext?.activeParticipantCount,
    articleContext?.matchday.id
  );
  const shouldSplitMatchdayNav = matchdayLegNavigation.applies;
  const activeMatchdayLeg = matchdayLegNavigation.activeLeg;
  const visibleMatchdays = matchdayLegNavigation.visibleMatchdays;
  const firstLegHref = matchdayLegNavigation.firstLegTarget
    ? matchdayHref(matchdayLegNavigation.firstLegTarget.number)
    : currentSeasonHref;
  const secondLegHref = matchdayLegNavigation.secondLegTarget
    ? matchdayHref(matchdayLegNavigation.secondLegTarget.number)
    : currentSeasonHref;
  const selectedMatchdayDateContext = formatPreferredMatchdayDateContext(
    articleMatches,
    articleContext?.matchday.starts_on ?? null,
    articleContext?.matchday.ends_on ?? null
  );
  const articleGamesGridTemplateColumns = "repeat(auto-fit, minmax(min(132px, 100%), 1fr))";

  return (
    <div className="news-article-shell">
      <style>{articlePageStyles}</style>
      <div className="public-top-stack">
        <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
          <a className="public-site-brand" href="/">
            Jornada<span>.pt</span>
          </a>
          <nav className="public-site-menu" aria-label="Competições principais">
            {publicCompetitionMenu.map((item) => (
              <a
                aria-current={articleContext?.competition.slug === item.slug ? "page" : undefined}
                href={item.href}
                key={item.slug}
              >
                {item.label}
              </a>
            ))}
            {gamesPageHref ? <a href={gamesPageHref}>Jogos</a> : null}
            {classificationHref ? <a href={classificationHref}>Classificação</a> : null}
          </nav>
          <div className="public-site-actions" aria-label="Ações">
            <span className="public-site-search" aria-label="Pesquisar">
              Pesquisar
            </span>
            <a href="/admin/gestor">Entrar</a>
          </div>
        </header>
        {articleContext ? (
          <section className="public-season-nav-bar" aria-label="Navegação de jornadas">
            <div className="public-hidden-heading">
              <h2>Jornadas</h2>
              <p>Navegação principal da época {articleContext.season.label}.</p>
            </div>
            <div className="public-season-nav-inner">
              <label className="public-season-select-wrap">
                <span>Época</span>
                <select className="public-season-select" data-season-select defaultValue={currentSeasonHref}>
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.href}>
                      {season.label}
                    </option>
                  ))}
                </select>
              </label>
              {shouldSplitMatchdayNav ? (
                <nav className="public-matchday-leg-nav" aria-label="Voltas da época">
                  <a aria-current={activeMatchdayLeg === "first" ? "true" : undefined} href={firstLegHref}>
                    1.ª volta
                  </a>
                  <a aria-current={activeMatchdayLeg === "second" ? "true" : undefined} href={secondLegHref}>
                    2.ª volta
                  </a>
                </nav>
              ) : null}
              <nav className="public-matchday-nav" aria-label="Jornadas">
                {visibleMatchdays.map((matchday) => (
                  <a
                    aria-current={matchday.id === articleContext.matchday.id ? "page" : undefined}
                    href={matchdayHref(matchday.number)}
                    key={matchday.id}
                  >
                    J{String(matchday.number).padStart(2, "0")}
                  </a>
                ))}
              </nav>
              <div className="public-matchday-date-row" aria-label="Data da jornada selecionada">
                <span className="public-matchday-date-context">{selectedMatchdayDateContext}</span>
              </div>
            </div>
          </section>
        ) : null}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("DOMContentLoaded", function () {
              var select = document.querySelector("[data-season-select]");
              if (select) {
                select.addEventListener("change", function () {
                  if (select.value) window.location.href = select.value;
                });
              }
            });
          `
        }}
      />
      {articleMatches.length > 0 ? (
        <section className="news-article-games-strip" aria-label="Jogos da jornada associados a esta notícia">
          <div className="news-article-games-shell">
            <div className="news-article-games-scroller" data-news-article-games-strip style={{ gridTemplateColumns: articleGamesGridTemplateColumns }}>
              {articleMatches.map((match) => (
                <ArticleMatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <main className="news-article-layout">
        <article className="news-article-main">
          {label ? (
            <div className="news-article-kickers">
              <span className="news-article-label">{label}</span>
            </div>
          ) : null}

          <h1 className="news-article-title">{article.title}</h1>
          {subtitle ? <p className="news-article-subtitle">{subtitle}</p> : null}

          <div className="news-article-meta">
            {author ? <span className="news-article-author">{author}</span> : null}
            {publishedAt ? <time dateTime={article.published_at ?? article.created_at ?? undefined}>{publishedAt}</time> : null}
          </div>

          {article.image_url ? (
            <figure className="news-article-image">
              <img alt="" src={article.image_url} />
              {article.image_caption ? <figcaption>{article.image_caption}</figcaption> : null}
            </figure>
          ) : null}

          <div className="news-article-body">
            {paragraphs.length > 0 ? paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}
          </div>
        </article>

        <aside className="news-article-sidebar">
          <a
            className="news-article-ad news-article-ad-link"
            href="https://now.startupmadeira.eu/"
            target="_blank"
            rel="noopener noreferrer sponsored"
            aria-label="Startup Madeira NOW"
          >
            <img src="/ads/startup-madeira-now-sidebar.png" alt="Startup Madeira NOW" />
          </a>
          {moreArticles.length > 0 ? (
            <section className="news-article-side-panel" aria-label="Artigos relacionados">
              <ul className="news-article-side-list">
                {moreArticles.map((item) => {
                  const itemLabel = firstText(item.label, item.category, item.type);
                  const itemSubtitle = firstText(item.subtitle, item.summary, item.excerpt);
                  const itemDate = formatShortDate(item.published_at);

                  return (
                    <li className="news-article-side-item" key={item.id}>
                      {item.image_url ? (
                        <img alt="" src={item.image_url} />
                      ) : (
                        <span className="news-article-side-thumb-placeholder" aria-hidden="true" />
                      )}
                      <div className="news-article-side-copy">
                        {itemLabel ? <span className="news-article-side-label">{itemLabel}</span> : null}
                        <a href={publicArticleHref(item)}>{item.title}</a>
                        {itemSubtitle ? <p className="news-article-side-subtitle">{itemSubtitle}</p> : null}
                        {itemDate ? <time className="news-article-side-date" dateTime={item.published_at ?? undefined}>{itemDate}</time> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
