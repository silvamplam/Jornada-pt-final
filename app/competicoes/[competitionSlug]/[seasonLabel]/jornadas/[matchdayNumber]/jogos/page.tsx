import { getPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { buildPublicMatchdayLegNavigation } from "@/lib/public-matchday-leg-navigation";
import {
  getPublicMatchdayDiagnostic,
  seasonLabelToUrlSegment,
  type PublicMatchdayDiagnostic,
  type PublicSeasonMatch
} from "@/lib/public-matchday";
import { getPublicTeamName } from "@/lib/public-team-name";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import PublicMatchdayNavigation from "@/components/public/PublicMatchdayNavigation";
import PublicMatchMeta from "@/components/public/PublicMatchMeta";
import PublicTeamBadge from "@/components/public/PublicTeamBadge";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PublicMatchdayGamesPageProps = {
  params: Promise<{
    competitionSlug: string;
    seasonLabel: string;
    matchdayNumber: string;
  }>;
};

const gamesPageStyles = `
  body {
    margin: 0;
    overflow-x: hidden;
    background: #ffffff;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .public-games-shell {
    min-height: 100vh;
    padding: 0 24px 32px;
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
    gap: 18px;
    align-items: center;
    font-size: 13px;
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
    gap: 12px;
    align-items: center;
    font-size: 13px;
    font-weight: 900;
  }

  .public-site-search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 170px;
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
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 0;
    border-top: 2px solid #10151b;
    background: #ffffff;
    white-space: nowrap;
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
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    text-align: right;
    white-space: nowrap;
  }

  .public-games-wrap {
    max-width: 1180px;
    margin: 0 auto;
  }

  .public-games-page-head {
    display: block;
    padding: 20px 0 10px;
  }

  .public-games-kicker {
    display: inline-flex;
    width: fit-content;
    margin-bottom: 10px;
    padding: 4px 7px;
    background: #c40012;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-games-page-title {
    display: grid;
    gap: 4px;
  }

  .public-games-page-title strong {
    margin: 0;
    color: #10151b;
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .public-games-page-title span {
    color: #607086;
    font-size: 14px;
    font-weight: 900;
  }

  .public-games-layout {
    display: grid;
    grid-template-columns: minmax(0, 760px) minmax(280px, 320px);
    gap: 22px;
    align-items: start;
    justify-content: start;
    margin-top: 18px;
  }

  .public-games-layout > * {
    min-width: 0;
  }

  .public-games-main,
  .public-games-sidebar {
    display: grid;
    gap: 16px;
  }

  .public-games-panel {
    border: 1px solid #dde4ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 14px 28px rgba(12, 22, 34, 0.08);
  }

  .public-games-main.public-games-panel {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-games-panel header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
    background: #f8fafc;
  }

  .public-games-panel h2,
  .public-games-panel h3,
  .public-games-panel p {
    margin: 0;
  }

  .public-games-panel h2 {
    color: #10151b;
    font-size: 21px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-games-panel header p {
    margin-top: 6px;
    color: #607086;
    font-size: 14px;
  }

  .public-games-list {
    display: grid;
    gap: 14px;
    inline-size: min(100%, 720px);
    justify-self: start;
    padding: 4px 0 0;
  }

  .public-games-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .public-games-group + .public-games-group {
    margin-top: 8px;
  }

  .public-games-group h3 {
    flex: 0 0 100%;
    margin: 0 0 3px;
    color: #7a8796;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-games-card {
    position: relative;
    display: grid;
    flex: 0 0 176px;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    align-items: center;
    min-height: 84px;
    padding: 8px 9px;
    border: 1px solid #ccd8e5;
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
    font-size: 13px;
  }

  .public-games-card-finished {
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-games-card-live,
  .public-games-card-halftime {
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-games-card-scheduled {
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-games-card-unknown {
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-games-team-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    height: 28px;
    gap: 6px;
    min-width: 0;
    overflow: visible;
    font-weight: 900;
  }

  .public-games-team-line > span:not([data-public-team-badge]) {
    min-width: max-content;
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
  }

  .public-games-team-score {
    min-width: 16px;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    font-weight: 900;
    line-height: 1;
    text-align: right;
  }

  .public-games-card-live .public-games-team-line:first-of-type .public-games-team-score {
    padding-right: 0;
  }

  .public-games-team-winner strong {
    color: #137a3a;
  }

  .public-games-meta {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    padding: 2px 0 0;
    color: #607086;
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
  }

  .public-games-status-live {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #10151b;
    white-space: nowrap;
  }

  .public-games-live-label,
  .public-games-live-separator {
    color: #10151b;
  }

  .public-games-live-minute {
    color: #16a34a;
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

  .public-games-empty {
    padding: 22px;
    color: #607086;
    font-size: 14px;
  }

  .public-games-side-block {
    padding: 16px;
  }

  .public-games-side-block p {
    color: #607086;
    font-size: 14px;
    line-height: 1.42;
  }

  .public-games-ad-slot {
    display: grid;
    min-height: 260px;
    place-items: center;
    border: 1px solid #dfe5ec;
    background: #f8fafc;
    color: #8a96a5;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-games-news-list {
    display: grid;
    gap: 12px;
  }

  .public-games-news-item {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 0;
    border-bottom: 0;
    color: inherit;
    text-decoration: none;
  }

  .public-games-news-item-no-image {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-games-news-item + .public-games-news-item {
    padding-top: 8px;
  }

  .public-games-news-thumb {
    display: block;
    width: 72px;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-games-news-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-games-news-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .public-games-news-label {
    color: #c40012;
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-games-news-item strong {
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
  }

  .public-games-news-date {
    color: #7a8796;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .public-games-diagnostic {
    max-width: 1100px;
    margin: 18px auto 0;
    padding: 18px 20px;
    border: 1px solid #ffd3a3;
    border-radius: 8px;
    background: #fff8ee;
    color: #4a2d00;
  }

  .public-games-diagnostic pre {
    overflow-x: auto;
    margin: 14px 0 0;
    padding: 14px;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font-size: 13px;
    white-space: pre-wrap;
  }

  @media (max-width: 1120px) {
    .public-games-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-games-list {
      inline-size: 100%;
    }
  }

  @media (max-width: 980px) {
    .public-games-shell {
      padding: 0 14px 26px;
    }

    .public-top-stack {
      margin: 0 -14px;
      padding: 0 14px;
    }

    .public-site-topbar,
    .public-games-layout {
      grid-template-columns: 1fr;
    }

    .public-season-nav-inner {
      gap: 8px;
      padding: 8px 16px 9px;
      overflow-x: auto;
    }

    .public-site-menu,
    .public-site-actions {
      justify-content: flex-start;
    }

    .public-matchday-date-row {
      justify-content: flex-start;
      margin-left: 0;
    }

    .public-matchday-date-context {
      text-align: left;
    }

    .public-games-card {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }

    .public-games-meta {
      grid-column: auto;
    }
  }

  @media (max-width: 640px) {
    .public-site-search {
      min-width: 0;
    }

    .public-games-page-title strong {
      font-size: 16px;
    }

  }


  /* JORNADA-CABECALHO-COMPETITIVO-INICIO */
  .public-season-nav-bar {
    border-top: 1px solid #e1e6ec;
    border-bottom: 1px solid #d7dee7;
    background: #ffffff;
  }

  .public-season-nav-inner {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    gap: 18px;
    align-items: end;
    min-height: 78px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 6px 0 0;
    overflow: hidden;
  }

  .public-season-context-card {
    display: grid;
    align-self: stretch;
    align-content: end;
    gap: 6px;
    min-width: 220px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-season-context-card .public-season-select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: 100%;
    min-height: 30px;
    padding: 5px 8px 5px 10px;
    border: 1px solid #cfd7e1;
    background: #f8fafc;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .public-season-context-card .public-season-select {
    width: auto;
    min-width: 112px;
    max-width: 138px;
    border: 0;
    background: transparent;
    color: #10151b;
    font: inherit;
    outline: none;
    cursor: pointer;
  }

  .public-season-context-card .public-matchday-leg-nav {
    display: flex;
    width: max-content;
    max-width: 100%;
    align-items: center;
    gap: 0;
    padding: 0;
    border-top: 2px solid #10151b;
    background: #ffffff;
    white-space: nowrap;
  }

  .public-season-context-card .public-matchday-leg-nav a {
    display: inline-block;
    min-width: 0;
    padding: 8px 11px;
    border: 0;
    border-right: 1px solid #dfe5ec;
    border-radius: 0;
    background: #ffffff;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-season-context-card .public-matchday-leg-nav a[aria-current="true"] {
    background: #10151b;
    color: #ffffff;
  }

  .public-matchday-date-row {
    display: flex;
    align-self: end;
    align-items: center;
    justify-content: flex-end;
    min-height: 32px;
    padding: 0 2px 8px 0;
    border: 0;
    background: transparent;
    white-space: nowrap;
  }

  .public-matchday-date-row .public-matchday-date-context {
    display: inline;
    color: #607086;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.25;
    text-align: right;
  }

  .public-matchday-date-row .public-matchday-date-context strong {
    color: #263241;
    font-weight: 900;
  }

  @media (max-width: 1180px) {
    .public-season-nav-inner {
      grid-template-columns: minmax(194px, max-content) minmax(0, 1fr) max-content;
      gap: 10px;
    }

    .public-season-context-card {
      min-width: 194px;
    }

    .public-season-context-card .public-season-select-wrap {
      gap: 6px;
      padding: 5px 7px;
    }

    .public-season-context-card .public-season-select {
      min-width: 96px;
    }

    .public-season-context-card .public-matchday-leg-nav a {
      padding: 7px 10px;
      font-size: 10.5px;
    }

    .public-matchday-date-row .public-matchday-date-context {
      font-size: 9.5px;
    }
  }

  @media (max-width: 900px) {
    .public-season-nav-inner {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      align-items: stretch;
      min-height: 0;
      padding: 8px 16px 9px;
      overflow: visible;
    }

    .public-season-context-card {
      align-content: start;
      min-width: 0;
    }

    .public-matchday-date-row {
      justify-content: flex-start;
      min-height: 0;
      padding: 0;
    }

    .public-matchday-date-row .public-matchday-date-context {
      text-align: left;
    }
  }

  @media (max-width: 620px) {
    .public-season-context-card .public-season-select-wrap,
    .public-season-context-card .public-matchday-leg-nav {
      width: 100%;
    }

    .public-season-context-card .public-season-select {
      flex: 1 1 auto;
      min-width: 0;
    }

    .public-season-context-card .public-matchday-leg-nav a {
      flex: 1 1 50%;
    }

    .public-matchday-date-row {
      white-space: normal;
    }
  }
  /* JORNADA-CABECALHO-COMPETITIVO-FIM */
`;

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

function formatCivilDate(value: string) {
  const date = parseCivilDate(value);
  return date ? `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}/${date.year}` : null;
}

function formatKickoff(scheduledDate: string, value: string | null) {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("pt-PT", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Lisbon"
      }).format(date);
    }
  }

  const dateLabel = formatCivilDate(scheduledDate);
  return dateLabel ? `${dateLabel} · Hora por definir` : "Hora por definir";
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

function matchSchedulePresentation(match: Pick<PublicSeasonMatch, "scheduled_date" | "kickoff_at">) {
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
      visual: `${String(scheduledDate.day).padStart(2, "0")} ${compactMonthNames[scheduledDate.month - 1]} · HORA POR DEFINIR`,
      accessible: `${scheduledDate.day} de ${civilMonthNames[scheduledDate.month - 1]} de ${scheduledDate.year}, hora por definir`,
      dateTime: match.scheduled_date
    };
  }
  return { visual: "DATA E HORA POR DEFINIR", accessible: "Data e hora por definir", dateTime: null };
}

function MatchScheduleLabel({ match }: { match: PublicSeasonMatch }) {
  const schedule = matchSchedulePresentation(match);
  return schedule.dateTime ? (
    <time dateTime={schedule.dateTime} aria-label={schedule.accessible}>{schedule.visual}</time>
  ) : (
    <span aria-label={schedule.accessible}>{schedule.visual}</span>
  );
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
  return status || "Estado por definir";
}

function matchResult(match: PublicSeasonMatch) {
  const hasScore = match.home_score !== null && match.away_score !== null;
  const kind = statusKind(match.status);
  if ((kind !== "finished" && kind !== "live" && kind !== "halftime") || !hasScore) {
    return "vs";
  }

  return `${match.home_score} - ${match.away_score}`;
}

function isWinner(match: PublicSeasonMatch, side: "home" | "away") {
  if (match.status !== "finished" || match.home_score === null || match.away_score === null || match.home_score === match.away_score) {
    return false;
  }

  return side === "home" ? match.home_score > match.away_score : match.away_score > match.home_score;
}

function TeamBadge({ team }: { team?: PublicSeasonMatch["homeTeam"] }) {
  return (
    <PublicTeamBadge
      altLabel={getPublicTeamName(
        { name: team?.name, publicName: team?.public_name, shortName: team?.short_name, code: team?.code },
        "full"
      )}
      fallbackLabel={getPublicTeamName(
        { name: team?.name, publicName: team?.public_name, shortName: team?.short_name, code: team?.code },
        "badge"
      )}
      logoUrl={team?.logo_url}
      slug={team?.slug}
      variant="compact"
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

function MatchCard({ match }: { match: PublicSeasonMatch }) {
  const kind = statusKind(match.status);
  const broadcastChannelName = match.broadcastChannel?.name?.trim();
  const livePrimeClassName = "public-live-minute-prime public-live-minute-prime-active";
  const statusText = kind === "live" ? (
    <>
      <span className="public-games-live-label">Live</span>
      {match.minute ? (
        <span className="public-games-live-minute">{match.minute}<span className={livePrimeClassName}>'</span></span>
      ) : null}
    </>
  ) : match.minute && kind === "halftime" ? `${statusLabel(match.status)} · ${match.minute}'` : statusLabel(match.status);
  const homeWinner = isWinner(match, "home");
  const awayWinner = isWinner(match, "away");
  const homeTeamName = getPublicTeamName(
    { name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code },
    "full"
  );
  const awayTeamName = getPublicTeamName(
    { name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code },
    "full"
  );

  return (
    <article className={`public-games-card public-games-card-${kind}`} key={match.id}>
      <div className="public-games-crest public-games-crest-home">
        <TeamBadge team={match.homeTeam} />
      </div>
      <div className={`public-games-team-copy public-games-team-copy-home ${homeWinner ? "public-games-team-winner" : ""}`}>
        <strong title={homeTeamName}>
          {getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "compact")}
        </strong>
        <small>Casa</small>
      </div>
      <div className="public-games-score">
        <strong>{matchResult(match)}</strong>
        <small className={`public-games-status public-games-status-${kind}`}>
          {statusText}
          {kind === "live" ? <LivePulseDots /> : null}
        </small>
      </div>
      <div className={`public-games-team-copy public-games-team-copy-away ${awayWinner ? "public-games-team-winner" : ""}`}>
        <strong title={awayTeamName}>
          {getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "compact")}
        </strong>
        <small>Fora</small>
      </div>
      <div className="public-games-crest public-games-crest-away">
        <TeamBadge team={match.awayTeam} />
      </div>
      <div className="public-games-meta">
        <PublicMatchMeta
          channelLogoUrl={match.broadcastChannel?.logo_url}
          channelName={broadcastChannelName}
          dateTime={<MatchScheduleLabel match={match} />}
        />
      </div>
    </article>
  );
}

function ReferenceGamesCard({ match }: { match: PublicSeasonMatch }) {
  const kind = statusKind(match.status);
  const showScore = (kind === "finished" || kind === "live" || kind === "halftime") && match.home_score !== null && match.away_score !== null;
  const broadcastChannelName = match.broadcastChannel?.name?.trim();
  const livePrimeClassName = "public-live-minute-prime public-live-minute-prime-active";
  const statusText = kind === "live" ? (
    <>
      <span className="public-games-live-label">Live</span>
      {match.minute ? (
        <span className="public-games-live-minute">{match.minute}<span className={livePrimeClassName}>'</span></span>
      ) : null}
    </>
  ) : match.minute && kind === "halftime" ? `${statusLabel(match.status)} - ${match.minute}'` : statusLabel(match.status);
  const homeTeamName = getPublicTeamName(
    { name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code },
    "full"
  );
  const awayTeamName = getPublicTeamName(
    { name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code },
    "full"
  );

  return (
    <article className={`public-games-card public-games-card-${kind}`} key={match.id}>
      <span className="public-games-team-line">
        <TeamBadge team={match.homeTeam} />
        <span title={homeTeamName}>
          {getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "compact")}
        </span>
        {showScore ? <b className="public-games-team-score">{match.home_score}</b> : null}
      </span>
      <span className="public-games-team-line">
        <TeamBadge team={match.awayTeam} />
        <span title={awayTeamName}>
          {getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "compact")}
        </span>
        {showScore ? <b className="public-games-team-score">{match.away_score}</b> : null}
      </span>
      <div className="public-games-meta">
        <PublicMatchMeta
          channelLogoUrl={match.broadcastChannel?.logo_url}
          channelName={broadcastChannelName}
          dateTime={(
            <span className={kind === "live" ? "public-games-status-live" : undefined}>
              {kind === "scheduled" ? <MatchScheduleLabel match={match} /> : statusText}
              {kind === "live" ? <LivePulseDots /> : null}
            </span>
          )}
        />
      </div>
    </article>
  );
}

function DiagnosticPanel({ diagnostic }: { diagnostic: PublicMatchdayDiagnostic }) {
  return (
    <main className="public-games-shell">
      <style>{gamesPageStyles}</style>
      <section className="public-games-diagnostic">
        <h2>Diagnóstico temporário da página pública</h2>
        <p>A rota foi carregada, mas os dados necessários não foram encontrados ou ocorreu um erro de leitura.</p>
        <pre>{JSON.stringify(diagnostic, null, 2)}</pre>
      </section>
    </main>
  );
}

export default async function PublicMatchdayGamesPage({ params }: PublicMatchdayGamesPageProps) {
  const { competitionSlug, seasonLabel, matchdayNumber } = await params;

  if (competitionSlug === "liga-espanha") {
    redirect(`/competicoes/la-liga/${seasonLabel}/jornadas/${matchdayNumber}/jogos`);
  }

  const matchdayNumberValue = Number(matchdayNumber);
  const { context, diagnostic } = await getPublicMatchdayDiagnostic({
    competitionSlug,
    seasonLabel,
    matchdayNumber: matchdayNumberValue
  });

  if (!context) {
    return <DiagnosticPanel diagnostic={diagnostic} />;
  }

  const seasonSegment = seasonLabelToUrlSegment(context.season.label);
  const matchdayPageHref = (number: number) => `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/${number}`;
  const gamesPageHref = (number: number) => `${matchdayPageHref(number)}/jogos`;
  const currentMatchdayHref = matchdayPageHref(context.matchday.number);
  const classificationHref = `${currentMatchdayHref}#classificacao`;
  const seasonOptions = context.seasons.map((season) => ({
    id: season.id,
    label: season.label,
    href: `/competicoes/${context.competition.slug}/${seasonLabelToUrlSegment(season.label)}/jornadas/1/jogos`
  }));
  const currentSeasonHref = `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/1/jogos`;
  const currentCompetitionMenuItem = {
    label: context.competition.name,
    slug: context.competition.slug,
    href: currentMatchdayHref,
    logoUrl: context.competition.logo_url
  };
  const publicCompetitionMenuBase = await getPublicCompetitionMenu().catch(() => []);
  const publicCompetitionMenu = publicCompetitionMenuBase.map((item) =>
    item.slug === currentCompetitionMenuItem.slug ? currentCompetitionMenuItem : item
  );

  if (!publicCompetitionMenu.some((item) => item.slug === currentCompetitionMenuItem.slug)) {
    publicCompetitionMenu.unshift(currentCompetitionMenuItem);
  }

  const liveMatches = context.matchesForMatchday.filter((match) => {
    const kind = statusKind(match.status);
    return kind === "live" || kind === "halftime";
  });
  const finishedMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "finished");
  const scheduledMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "scheduled");
  const otherMatches = context.matchesForMatchday.filter((match) => {
    const kind = statusKind(match.status);
    return kind !== "live" && kind !== "halftime" && kind !== "finished" && kind !== "scheduled";
  });
  const matchGroups = [
    { key: "live", label: "Live", matches: liveMatches },
    { key: "finished", label: "Finalizados", matches: finishedMatches },
    { key: "scheduled", label: "Agendados", matches: scheduledMatches },
    { key: "other", label: "Outros estados", matches: otherMatches }
  ].filter((group) => group.matches.length > 0);
  const matchdayLegNavigation = buildPublicMatchdayLegNavigation(
    context.matchdays,
    context.activeParticipantCount,
    context.matchday.id
  );
  const shouldSplitMatchdayNav = matchdayLegNavigation.applies;
  const activeMatchdayLeg = matchdayLegNavigation.activeLeg;
  const visibleMatchdays = matchdayLegNavigation.visibleMatchdays;
  const firstLegHref = matchdayLegNavigation.firstLegTarget
    ? gamesPageHref(matchdayLegNavigation.firstLegTarget.number)
    : currentSeasonHref;
  const secondLegHref = matchdayLegNavigation.secondLegTarget
    ? gamesPageHref(matchdayLegNavigation.secondLegTarget.number)
    : currentSeasonHref;
  const selectedMatchdayDateContext = formatPreferredMatchdayDateContext(
    context.matchesForMatchday,
    context.matchday.starts_on,
    context.matchday.ends_on
  );
  const sidebarNewsItems = context.latestNews.slice(0, 4).map((item) => ({
    id: item.id,
    dateLabel: item.time_label?.trim() || "",
    imageUrl: item.image_url?.trim() || "",
    label: "label" in item ? ((item as { label?: string | null }).label?.trim() || "") : "",
    title: item.title || "Notícia da jornada",
    linkUrl: item.link_url?.trim() || ""
  }));

  return (
    <main className="public-games-shell">
      <style>{gamesPageStyles}</style>
      <div className="public-top-stack">
        <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
          <a className="public-site-brand" href="/">
            Jornada<span>.pt</span>
          </a>
          <PublicCompetitionNavigation
            competitions={publicCompetitionMenu}
            activeCompetitionSlug={context.competition.slug}
            classificationHref={classificationHref}
          />
          <div className="public-site-actions" aria-label="Ações">
            <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
            <a href="/admin/gestor">Entrar</a>
          </div>
        </header>
        <section className="public-season-nav-bar" aria-label="Navegação de jornadas">
          <div className="public-hidden-heading">
            <h2>Jornadas</h2>
            <p>Navegação principal da época {context.season.label}.</p>
          </div>
          <div className="public-season-nav-inner">
            <div className="public-season-context-card" aria-label="Contexto da competição">
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
            </div>
            <PublicMatchdayNavigation
              ariaLabel="Jornadas"
              items={visibleMatchdays.map((matchday) => ({
                id: matchday.id,
                href: gamesPageHref(matchday.number),
                isActive: matchday.id === context.matchday.id,
                label: `J${String(matchday.number).padStart(2, "0")}`
              }))}
              storageKey={`public-matchday-nav:${context.competition.slug}:${context.season.label}:games`}
            />
            <div className="public-matchday-date-row">
              <span className="public-matchday-date-context">
                <strong>Data:</strong> {selectedMatchdayDateContext}
              </span>
            </div>
          </div>
        </section>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("DOMContentLoaded", function () {
              var select = document.querySelector("[data-season-select]");
              if (!select) return;
              select.addEventListener("change", function () {
                if (select.value) window.location.href = select.value;
              });
            });
          `
        }}
      />

      <div className="public-games-wrap">
        <section className="public-games-page-head" aria-label="Cabeçalho dos jogos da jornada">
          <span className="public-games-kicker">
            {context.competition.name} · {context.season.label} · J{String(context.matchday.number).padStart(2, "0")}
          </span>
          <div className="public-games-page-title">
            <strong>Jogos da jornada</strong>
            <span>{selectedMatchdayDateContext}</span>
          </div>
        </section>

        <div className="public-games-layout">
          <section className="public-games-main public-games-panel" aria-label="Lista detalhada dos jogos">
            {context.matchesForMatchday.length > 0 ? (
              <div className="public-games-list">
                {matchGroups.map((group) => (
                  <section className="public-games-group" aria-label={`Jogos: ${group.label}`} key={group.key}>
                    <h3>{group.label}</h3>
                    {group.matches.map((match) => (
                      <ReferenceGamesCard key={match.id} match={match} />
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <div className="public-games-empty">Ainda não há jogos nesta jornada.</div>
            )}
          </section>

          <aside className="public-games-sidebar" aria-label="Informação lateral da jornada">
            <section className="public-games-panel public-games-side-block" aria-label="Publicidade">
              <div className="public-games-ad-slot">Publicidade</div>
            </section>

            {sidebarNewsItems.length > 0 ? (
              <section className="public-games-panel public-games-side-block" aria-label="Mais notícias">
                <div className="public-games-news-list">
                  {sidebarNewsItems.map((item) => {
                    const itemClassName = `public-games-news-item ${item.imageUrl ? "" : "public-games-news-item-no-image"}`.trim();
                    const itemContent = (
                      <>
                        {item.imageUrl ? (
                          <span className="public-games-news-thumb">
                            <img alt="" src={item.imageUrl} />
                          </span>
                        ) : null}
                        <span className="public-games-news-copy">
                          {item.label ? <span className="public-games-news-label">{item.label}</span> : null}
                          <strong>{item.title}</strong>
                          {item.dateLabel ? <span className="public-games-news-date">{item.dateLabel}</span> : null}
                        </span>
                      </>
                    );

                    return item.linkUrl ? (
                      <a className={itemClassName} href={item.linkUrl} key={item.id}>
                        {itemContent}
                      </a>
                    ) : (
                      <div className={itemClassName} key={item.id}>
                        {itemContent}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
