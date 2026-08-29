import { notFound } from "next/navigation";

import { publicArticleParagraphs } from "@/lib/public-article-paragraphs";
import { selectPublicMoreArticles } from "@/lib/public-article-more";
import { editorialImageFramingProps } from "@/lib/editorial-image-framing";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import PublicMatchStrip from "@/components/public/PublicMatchStrip";
import PublicSideAdvertisement from "@/components/public/PublicSideAdvertisement";
import { getPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { buildPublicMatchdayLegNavigation } from "@/lib/public-matchday-leg-navigation";
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
  body?: string | null;
  image_url?: string | null;
  image_caption?: string | null;
  label?: string | null;
  author?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function publicCompetitionBarColor(competitionSlug: string) {
  if (competitionSlug === "liga-portugal") return "#00235a";
  if (competitionSlug === "premier-league") return "#3d195b";
  if (competitionSlug === "la-liga") return "#1d2230";
  return "#262626";
}

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


  .public-league-match-strip-scroll > .public-matchday-scoreboard-panel {
    margin-top: 3px;
  }

  /* JORNADA-CABECALHO-COMPETITIVO-INICIO */
  .public-season-nav-bar {
    margin: 0 -24px;
    padding: 0 24px;
    border: 0;
    background: #262626;
    color: #ffffff;
    box-shadow: 0 8px 18px rgba(68, 21, 47, 0.16);
  }

  .public-season-nav-inner {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    align-items: center;
    gap: 12px;
    height: 74px;
    min-height: 74px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 8px 0;
    overflow: visible;
  }

  .public-season-context-card {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .public-season-context-card .public-season-select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 4px 7px 4px 9px;
    border: 1px solid rgba(255, 255, 255, 0.42);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .public-season-context-card .public-season-select {
    width: auto;
    min-width: 96px;
    max-width: 126px;
    border: 0;
    background: transparent;
    color: #ffffff;
    font: inherit;
    outline: none;
    cursor: pointer;
  }

  .public-season-context-card .public-season-select option {
    color: #10151b;
  }

  .public-season-context-card .public-matchday-leg-nav {
    display: flex;
    align-items: center;
    gap: 2px;
    width: max-content;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    white-space: nowrap;
  }

  .public-season-context-card .public-matchday-leg-nav a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 5px 8px;
    border: 1px solid rgba(255, 255, 255, 0.36);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-season-context-card .public-matchday-leg-nav a[aria-current="true"] {
    border-color: #ffffff;
    background: #ffffff;
    color: #44152f;
  }

  .public-season-competition-emblem {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 52px;
    min-height: 32px;
    padding: 0 7px;
    border-left: 1px solid rgba(255, 255, 255, 0.32);
    text-decoration: none;
  }

  .public-season-competition-emblem img {
    display: block;
    width: auto;
    height: 28px;
    max-width: 88px;
    object-fit: contain;
  }

  .public-season-competition-emblem img[data-variant="liga-portugal-horizontal"] {
    box-sizing: border-box;
    width: 82px;
    height: 30px;
    max-width: 82px;
    padding: 5px 4px;
    border-radius: 3px;
    background: #00235a;
  }

  .public-season-competition-emblem img[data-variant="laliga-horizontal"] {
    width: 76px;
    height: auto;
    max-width: 76px;
  }

  .public-season-competition-emblem[data-logo-variant="premier-league-lockup"] {
    min-width: 88px;
    min-height: 32px;
    padding: 4px 7px;
    border-left: 0;
    border-radius: 4px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(17, 24, 32, 0.14);
  }

  .public-season-competition-emblem img[data-variant="premier-league-lockup"] {
    width: 76px;
    height: auto;
    max-width: 76px;
    max-height: 32px;
    filter: none;
    image-rendering: auto;
  }

  .public-matchday-nav-compact {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    overflow: visible;
  }

  .public-matchday-nav-compact a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    min-height: 28px;
    padding: 4px 5px;
    border: 1px solid transparent;
    border-radius: 3px;
    color: rgba(255, 255, 255, 0.82);
    font-size: 10px;
    font-weight: 850;
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
  }

  .public-matchday-nav-compact a:hover,
  .public-matchday-nav-compact a:focus-visible {
    border-color: rgba(255, 255, 255, 0.48);
    color: #ffffff;
  }

  .public-matchday-nav-compact a[aria-current="page"] {
    border-color: #ffffff;
    background: #ffffff;
    color: #44152f;
    font-weight: 950;
  }

  .public-matchday-date-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 34px;
    padding: 6px 11px;
    border: 1px solid #ffffff;
    border-radius: 3px;
    background: #ffffff;
    white-space: nowrap;
  }

  .public-matchday-date-row .public-matchday-date-context {
    display: inline;
    color: #44152f;
    font-size: 11px;
    font-weight: 850;
    line-height: 1.15;
    text-align: right;
  }

  .public-matchday-date-row .public-matchday-date-context strong {
    color: #2a1020;
    font-weight: 950;
  }

  @media (max-width: 1180px) {
    .public-season-nav-inner {
      grid-template-columns: minmax(0, 1fr) max-content;
      gap: 6px 10px;
      padding: 7px 16px;
    }

    .public-matchday-nav-compact {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .public-matchday-date-row {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media (max-width: 620px) {
    .public-season-nav-bar {
      margin: 0 -16px;
      padding: 0 16px;
    }

    .public-season-nav-inner {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
      padding: 8px 12px;
    }

    .public-season-context-card {
      flex-wrap: wrap;
    }

    .public-season-competition-emblem {
      min-height: 30px;
      padding-right: 5px;
      padding-left: 5px;
    }

    .public-season-competition-emblem img {
      max-width: 76px;
    }

    .public-season-context-card .public-season-select-wrap {
      flex: 1 1 150px;
    }

    .public-season-context-card .public-season-select {
      flex: 1 1 auto;
      min-width: 0;
    }

    .public-matchday-nav-compact {
      grid-column: 1;
      grid-row: 2;
      justify-content: flex-start;
    }

    .public-matchday-date-row {
      grid-column: 1;
      grid-row: 3;
      justify-content: flex-start;
      width: max-content;
      max-width: 100%;
      white-space: normal;
    }
  }
  /* JORNADA-CABECALHO-COMPETITIVO-FIM */
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

async function readArticle(slug: string) {
  const rows = await fetchSupabaseAdminTable<EditorialArticle>(
    `editorial_articles?select=id,slug,title,subtitle,body,image_url,image_caption,label,author,competition_id,season_id,matchday_id,published_at,created_at&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`
  );

  return rows[0] ?? null;
}

async function readMoreArticles(currentArticle: EditorialArticle) {
  try {
    return await selectPublicMoreArticles<EditorialArticle>(currentArticle, (scope, limit) =>
      fetchSupabaseAdminTable<EditorialArticle>(
        `editorial_articles?select=id,slug,title,subtitle,image_url,label,competition_id,season_id,matchday_id,published_at&status=eq.published&id=neq.${encodeURIComponent(
          currentArticle.id
        )}&${scope.filter}&order=published_at.desc.nullslast&limit=${limit}`
      )
    );
  } catch {
    return [];
  }
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
  const label = firstText(article.label);
  const subtitle = firstText(article.subtitle);
  const author = firstText(article.author);
  const publishedAt = formatDate(article.published_at ?? article.created_at);
  const paragraphs = publicArticleParagraphs(article.body);
  const articleMatches = articleContext?.matchesForMatchday ?? [];
  const seasonSegment = articleContext ? seasonLabelToUrlSegment(articleContext.season.label) : null;
  const matchdayHref = (matchdayNumber: number) =>
    articleContext && seasonSegment
      ? `/competicoes/${articleContext.competition.slug}/${seasonSegment}/jornadas/${matchdayNumber}`
      : "/";
  const classificationHref = articleContext ? `${matchdayHref(articleContext.matchday.number)}#classificacao` : null;
  const currentCompetitionMenuItem =
    articleContext && seasonSegment
      ? {
          label: articleContext.competition.name,
          slug: articleContext.competition.slug,
          href: matchdayHref(articleContext.matchday.number),
          logoUrl: articleContext.competition.logo_url
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
  const competitionBarColor = articleContext
    ? publicCompetitionBarColor(articleContext.competition.slug)
    : "#262626";

  return (
    <div className="news-article-shell">
      <style>{articlePageStyles}</style>
      <div className="public-top-stack">
        <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
          <a className="public-site-brand" href="/">
            Jornada<span>.pt</span>
          </a>
          <PublicCompetitionNavigation
            competitions={publicCompetitionMenu}
            activeCompetitionSlug={articleContext?.competition.slug}
            classificationHref={classificationHref}
            showMessageTicker={false}
          />
          <div className="public-site-actions" aria-label="Ações">
            <span className="public-site-search" aria-label="Pesquisar">
              Pesquisar
            </span>
            <a href="/admin/gestor">Entrar</a>
          </div>
        </header>
        {articleContext ? (
          <section className="public-season-nav-bar" aria-label="Navegação de jornadas" style={{ background: competitionBarColor }}>
            <div className="public-hidden-heading">
              <h2>Jornadas</h2>
              <p>Navegação principal da época {articleContext.season.label}.</p>
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
              <nav className="public-matchday-nav-compact" aria-label="Jornadas da época">
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
              <div className="public-matchday-date-row">
                <span className="public-matchday-date-context">
                  <strong>Data:</strong> {selectedMatchdayDateContext}
                </span>
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
        <section className="public-league-match-strip-scroll" aria-label="Jogos da jornada associados a esta notícia">
          <PublicMatchStrip
            carouselLayout="fluid-peek"
            matches={articleMatches.map((match) => ({
              ...match,
              matchdayNumber: match.matchday?.number ?? null
            }))}
            variant="clean"
          />
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
              <img
                {...editorialImageFramingProps("standard")}
                alt=""
                src={article.image_url}
              />
              {article.image_caption ? <figcaption>{article.image_caption}</figcaption> : null}
            </figure>
          ) : null}

          <div className="news-article-body">
            {paragraphs.length > 0 ? paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}
          </div>
        </article>

        <aside className="news-article-sidebar">
          <PublicSideAdvertisement className="news-article-ad news-article-ad-link" />
          {moreArticles.length > 0 ? (
            <section className="news-article-side-panel" aria-label="Artigos relacionados">
              <ul className="news-article-side-list">
                {moreArticles.map((item) => {
                  const itemLabel = firstText(item.label);
                  const itemSubtitle = firstText(item.subtitle);
                  const itemDate = formatShortDate(item.published_at);

                  return (
                    <li className="news-article-side-item" key={item.id}>
                      {item.image_url ? (
                        <img
                          {...editorialImageFramingProps("standard")}
                          alt=""
                          src={item.image_url}
                        />
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
