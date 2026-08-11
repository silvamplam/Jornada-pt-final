import { buildAccumulatedClassification, totalClassificationStats, type ClassificationSplit } from "@/lib/classification";
import { getPublicLiveMinute } from "@/lib/live-match-clock";
import { getPublicMatchdayDiagnostic, seasonLabelToUrlSegment, type PublicMatchdayContext, type PublicMatchdayDiagnostic, type PublicReferenceCompositionItem, type PublicSeasonMatch } from "@/lib/public-matchday";
import { getPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { buildPublicMatchdayLegNavigation } from "@/lib/public-matchday-leg-navigation";
import { resolveMatchdayHorizontalNewsItems } from "@/lib/editorial-horizontal-news";
import { buildPublicMatchdayEditorialVisibility, hasPublicMatchdayRoundupContent } from "@/lib/public-matchday-editorial-visibility";
import { isPublishableHierarchicalBeyondMatchday, isPublishableHierarchicalComposition } from "@/lib/editorial-hierarchical-composition";
import { getPublicTeamName } from "@/lib/public-team-name";
import { fetchSupabaseAdminTable } from "@/lib/supabase";
import BroadcastChannelLogo from "@/components/public/BroadcastChannelLogo";
import { PublicEditorialLayout } from "@/components/public/PublicEditorialLayout";
import type { PublicBeyondMatchdayNewsItem } from "@/components/public/PublicBeyondMatchdayNews";
import PublicHierarchicalComposition from "@/components/public/PublicHierarchicalComposition";
import PublicHorizontalNewsStrip from "@/components/public/PublicHorizontalNewsStrip";
import PublicMatchMeta from "@/components/public/PublicMatchMeta";
import PublicMatchStrip from "@/components/public/PublicMatchStrip";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import PublicTeamBadge, { type PublicTeamBadgeVariant } from "@/components/public/PublicTeamBadge";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PublicMatchdayPageProps = {
  params: Promise<{
    competitionSlug: string;
    seasonLabel: string;
    matchdayNumber: string;
  }>;
  searchParams?: Promise<{
    debug_logos?: string;
  }>;
};

const PUBLIC_STAT_COLUMNS: Array<{ key: keyof ClassificationSplit; label: string }> = [
  { key: "played", label: "J" },
  { key: "wins", label: "V" },
  { key: "draws", label: "E" },
  { key: "losses", label: "D" },
  { key: "goalsFor", label: "GM" },
  { key: "goalsAgainst", label: "GS" },
  { key: "goalDifference", label: "DG" },
  { key: "points", label: "PTS" }
];

function publicCompetitionBarColor(competitionSlug: string) {
  if (competitionSlug === "liga-portugal") return "#00235a";
  if (competitionSlug === "premier-league") return "#3d195b";
  if (competitionSlug === "la-liga") return "#1d2230";
  return "#262626";
}

const publicMatchdayStyles = `
  body {
    margin: 0;
    overflow-x: hidden;
    background: #ffffff;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .public-matchday-shell {
    min-height: 100vh;
    padding: 0 24px 28px;
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

  #jogos,
  #classificacao {
    scroll-margin-top: 132px;
  }

  #classificacao {
    width: min(100%, 1200px);
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
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
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-site-menu a[aria-current="page"] {
    color: #c40012;
  }

  .public-site-menu a,
  .public-site-actions a {
    color: #10151b;
    text-decoration: none;
  }

  .public-site-menu a[aria-current="page"] {
    color: #c40012;
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
    font-size: 11px;
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
    background: #ffffff;
  }

  .public-hidden-heading {
    display: none;
  }

  .public-season-label {
    color: #10151b;
    font-size: 14px;
    font-weight: 900;
    white-space: nowrap;
  }

  .public-season-select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px 5px 10px;
    border: 1px solid #cfd7e1;
    background: #f8fafc;
    color: #263241;
    font-size: 11px;
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

  .public-matchday-hero,
  .public-matchday-panel {
    border: 1px solid #dde4ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 14px 28px rgba(12, 22, 34, 0.08);
  }

  .public-matchday-hero {
    display: none;
  }

  .public-matchday-hero p,
  .public-matchday-hero h1 {
    margin: 0;
  }

  .public-matchday-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-hero h1 {
    margin-top: 6px;
    font-size: 34px;
    line-height: 1;
  }

  .public-matchday-hero span {
    display: block;
    margin-top: 8px;
    color: #526174;
    font-size: 15px;
  }

  .public-matchday-panel {
    max-width: 1512px;
    margin-left: auto;
    margin-right: auto;
    margin-top: 12px;
    overflow: visible;
  }

  .public-matchday-scoreboard-panel {
    margin-top: 0;
    padding: 2px 0 10px;
    border-top: 1px solid #dbe4ee;
    border-bottom: 1px solid #d4deea;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 10px 22px rgba(15, 23, 42, 0.055);
    min-height: 0;
  }

  .public-league-match-strip-scroll > .public-matchday-scoreboard-panel {
    margin-top: 3px;
  }

  .public-matchday-scoreboard-panel + .public-matchday-panel {
    margin-top: 10px;
  }

  .public-matchday-panel[aria-label="Capa da jornada"] {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
    max-width: 1512px;
    width: 100%;
  }

  .public-matchday-editorial-region {
    width: min(100%, 1200px);
    max-width: 1200px;
    min-width: 0;
    margin-left: auto;
    margin-right: auto;
  }

  .public-matchday-hierarchical-region {
    width: 100%;
    max-width: 1200px;
    min-width: 0;
    box-sizing: border-box;
    margin-inline: auto;
  }

  .public-matchday-hierarchical-region > .public-hierarchical-composition {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    background: #ffffff;
    box-shadow: none;
  }

  .public-matchday-panel header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
    background: #f8fafc;
  }

  .public-matchday-panel h2,
  .public-matchday-panel h3,
  .public-matchday-panel p {
    margin: 0;
  }

  .public-matchday-panel h2 {
    font-size: 24px;
    text-transform: uppercase;
  }

  .public-matchday-panel p {
    margin-top: 6px;
    color: #607086;
  }

  .public-matchday-list {
    display: grid;
    gap: 18px;
    padding: 20px;
  }

  .public-matchday-strip {
    display: grid;
    gap: 7px;
    padding: 6px 0;
    background: transparent;
  }

  .public-matchday-strip-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    align-items: center;
    min-height: 92px;
    padding: 0 12px;
    background: transparent;
  }

  .public-matchday-mini-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
    align-items: start;
    width: 100%;
    min-width: 0;
    min-height: 78px;
    padding: 7px 8px;
    border: 1px solid #ccd8e5;
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.085);
    font-size: 12px;
  }

  .public-matchday-mini-card + .public-matchday-mini-card::before {
    content: none;
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: -4px;
    width: 1px;
    background: #dfe5ec;
  }

  .public-matchday-mini-card-live {
    border-color: #ccd8e5;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-matchday-mini-card-halftime {
    border-color: #ccd8e5;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-matchday-mini-card-finished {
    border-color: #ccd8e5;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-matchday-mini-card-scheduled {
    border-color: #ccd8e5;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-matchday-mini-card-unknown {
    border-color: #d8dee6;
    background: #ffffff;
  }

  .public-matchday-mini-team {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    height: 28px;
    gap: 6px;
    overflow: visible;
    font-weight: 800;
    text-transform: none;
  }

  .public-matchday-mini-team:first-child {
    justify-content: flex-start;
  }

  .public-matchday-mini-team:last-child {
    justify-content: flex-start;
  }

  .public-matchday-mini-team > span:not([data-public-team-badge]) {
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
  }

  .public-matchday-mini-score {
    min-width: 14px;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 14px;
    font-weight: 900;
    line-height: 1;
    text-align: right;
  }

  .public-matchday-mini-card-live .public-matchday-mini-team:first-of-type .public-matchday-mini-score {
    padding-right: 0;
  }

  .public-matchday-mini-card .public-matchday-mini-status {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 3px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: visible;
    padding: 1px 2px 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font-size: 9.5px;
    font-weight: 800;
    line-height: 1.15;
    text-transform: none;
    white-space: nowrap;
  }

  .public-matchday-mini-card-live .public-matchday-mini-status > span,
  .public-matchday-mini-card-halftime .public-matchday-mini-status > span,
  .public-matchday-mini-card-finished .public-matchday-mini-status > span,
  .public-matchday-mini-card-unknown .public-matchday-mini-status > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border-radius: 0;
    background: transparent;
    font-weight: 900;
  }

  .public-matchday-mini-card-live .public-matchday-mini-status > span,
  .public-matchday-mini-card-halftime .public-matchday-mini-status > span {
    color: inherit;
  }

  .public-matchday-mini-card-live .public-matchday-mini-status > span {
    color: #10151b;
  }

  .public-matchday-live-label {
    color: #10151b;
  }

  .public-matchday-live-minute {
    color: #16a34a;
  }

  .public-matchday-mini-card-finished .public-matchday-mini-status > span {
    color: inherit;
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

  .public-matchday-mini-card-unknown .public-matchday-mini-status > span {
    color: inherit;
  }

  .public-matchday-mini-time {
    min-width: 0;
    color: inherit;
    white-space: nowrap;
  }

  .public-matchday-mini-card-scheduled .public-matchday-mini-time {
    padding: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font-weight: 900;
  }

  .public-matchday-mini-channel {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
    align-items: center;
    justify-content: center;
  }

  .public-matchday-cover {
    --public-cover-rule-color: #10151b;
    --public-cover-rule-gap: 8px;
    --public-cover-rule-size: 4px;
    display: grid;
    grid-template-columns:
      minmax(220px, 240px)
      minmax(0, 1fr)
      minmax(240px, 280px);
    grid-template-areas: "feature main news";
    gap: 20px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 16px 0 18px;
    align-items: stretch;
    min-height: 408px;
  }

  .public-matchday-cover > *,
  .public-matchday-main-column,
  .public-matchday-main-lower > * {
    min-width: 0;
  }

  .public-matchday-editorial,
  .public-matchday-feature,
  .public-matchday-main-column,
  .public-matchday-roundup,
  .public-matchday-cover-side,
  .public-matchday-news {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid #dbe4ee;
    background: #ffffff;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.045);
  }

  .public-matchday-main-column {
    grid-area: main;
    gap: 8px;
    padding: 0;
    border: 0;
    grid-template-rows: auto 1fr;
  }

  .public-matchday-editorial {
    align-content: start;
    min-height: 0;
    padding: 0;
    border: 0;
  }

  .public-matchday-feature {
    grid-area: feature;
    padding: 0 14px 14px;
  }

  .public-side-editorial-block {
    color: #263241;
  }

  .public-side-editorial-inner {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }

  .public-side-editorial-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-side-editorial-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-side-editorial-copy {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .public-side-editorial-label {
    color: #c40012;
    font-size: 10.5px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .public-side-editorial-copy strong {
    display: block;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16.5px;
    font-weight: 700;
    line-height: 1.18;
  }

  .public-side-editorial-copy small {
    color: #607086;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.2;
  }

  .public-side-editorial-copy p {
    margin: 0;
    color: #526174;
    font-size: 13px;
    line-height: 1.48;
  }

  .public-side-editorial-card-link {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
    color: inherit;
    text-decoration: none;
    border-radius: 6px;
  }

  .public-side-editorial-card-link:hover .public-side-editorial-copy strong {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-side-editorial-card-link:focus-visible {
    outline: 2px solid #003f8f;
    outline-offset: 4px;
  }

  .public-side-editorial-placeholder {
    padding: 10px 0;
    color: #7a8796;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.35;
  }

  .public-matchday-cover-side {
    min-height: 100%;
  }

  .public-matchday-news {
    grid-area: news;
    min-height: 100%;
    padding-top: 0;
  }

  .public-matchday-editorial h2,
  .public-cover-support h4,
  .public-matchday-roundup h3,
  .public-matchday-cover-side h3,
  .public-matchday-news h3 {
    margin: 0;
  }

  .public-matchday-editorial h2 {
    color: #c40012;
    font-family: Georgia, "Times New Roman", serif;
    max-width: 100%;
    font-size: 30px;
    line-height: 1.02;
    letter-spacing: 0;
  }

  .public-cover-headline {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.95fr);
    gap: 16px;
    align-items: start;
    min-height: 0;
    overflow: visible;
    padding: 0 0 6px;
    border-bottom: 1px solid #dfe5ec;
    background: #ffffff;
    color: #10151b;
  }

  .public-cover-headline::before {
    content: none;
  }

  .public-cover-headline > div {
    position: relative;
    z-index: 1;
  }

  .public-cover-headline-title-link {
    color: inherit;
    text-decoration: none;
  }

  .public-cover-headline-title-link:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-editorial-main-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 285px;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-editorial-main-image iframe,
  .public-editorial-main-image video,
  .public-editorial-main-image img {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
    object-position: center;
  }

  .public-editorial-main-image video {
    background: #0f141b;
    object-fit: contain;
  }

  .public-cover-headline p {
    max-width: 100%;
    color: #526174;
    font-size: 14px;
    line-height: 1.35;
  }

  .public-matchday-main-lower {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.95fr);
    gap: 24px;
    align-items: stretch;
    min-width: 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) {
    --public-roundup-top-align: 0px;
    --public-roundup-scroll-control-height: 14px;
    --public-roundup-visible-list-height: 285px;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .public-roundup-video-layout {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 340px) minmax(0, 372px);
    justify-content: end;
    gap: 14px;
    align-items: stretch;
    width: 100%;
    min-width: 0;
  }

  .public-roundup-video-layout > .public-matchday-roundup {
    justify-self: end;
    width: min(100%, 340px);
    margin-right: 0;
    margin-left: auto;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup,
  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
    border: 0;
    background: transparent;
    height: 100%;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup {
    --public-roundup-visible-list-height: 285px;
    grid-column: 1;
    grid-row: 1;
    grid-template-rows: auto 1fr;
    align-content: stretch;
    justify-self: end;
    width: min(100%, 340px);
    margin-right: 0;
    margin-left: auto;
    padding: var(--public-roundup-top-align) 6px 0 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-scroll-window {
    max-height: var(--public-roundup-visible-list-height);
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-scroll-frame {
    border-color: #edf2f7;
  }

  .public-editorial-flex-block {
    position: relative;
  }

  .public-cover-support h4,
  .public-editorial-block-head,
  .public-matchday-news h3 {
    padding-top: var(--public-cover-rule-gap);
    border-top: var(--public-cover-rule-size) solid var(--public-cover-rule-color);
  }

  .public-editorial-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .public-matchday-roundup .public-editorial-block-head {
    justify-content: flex-end;
  }

  .public-below-headline-highlights .public-editorial-block-head {
    justify-content: flex-start;
    padding: 0 0 8px;
    border-top: 0;
  }

  .public-below-headline-heading-copy {
    display: grid;
    gap: 4px;
  }

  .public-below-headline-subtitle {
    margin: 0;
    color: #5d6b7a;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-editorial-block-head {
    padding-top: 0;
    padding-right: 6px;
    padding-bottom: 1px;
    padding-left: 6px;
    border-top: 0;
    justify-content: flex-start;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-editorial-block-head .public-roundup-matchday-label {
    color: #263241;
    font-size: 10.5px;
  }

  .public-editorial-block-head h3,
  .public-matchday-roundup h3 {
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-editorial-block-head a,
  .public-editorial-block-head .public-roundup-matchday-label,
  .public-editorial-more-link {
    color: #003f8f;
    font-size: 11px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-matchday-feature {
    color: #263241;
  }

  .public-matchday-feature p {
    font-size: 13px;
  }

  .public-cover-support {
    display: grid;
    gap: 12px;
    align-content: start;
    height: auto;
    padding: 0;
    border: 0;
    background: #ffffff;
  }

  .public-cover-support h4 {
    margin: 0;
    padding-top: 0;
    border-top: 0;
    font-size: 13px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .public-cover-support p {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-cover-story-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 4px;
  }

  .public-matchday-roundup .public-cover-story-strip {
    grid-template-columns: 1fr;
    gap: 0;
    padding-top: 0;
  }

  .public-matchday-roundup {
    --public-roundup-scroll-control-height: 14px;
    --public-roundup-visible-list-height: 224px;
  }

  .public-roundup-scroll-frame {
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: visible;
    border-top: 1px solid #eef2f6;
    border-bottom: 1px solid #eef2f6;
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame {
    display: block;
    height: var(--public-roundup-visible-list-height);
    max-height: var(--public-roundup-visible-list-height);
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame::before,
  .public-roundup-has-scroll .public-roundup-scroll-frame::after {
    content: none;
    position: absolute;
    right: 0;
    left: 0;
    z-index: 1;
    height: 30px;
    pointer-events: none;
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame::before {
    top: 0;
    background: linear-gradient(#ffffff, rgba(255, 255, 255, 0));
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame::after {
    bottom: 0;
    background: linear-gradient(rgba(255, 255, 255, 0), #ffffff);
  }

  .public-matchday-roundup .public-roundup-scroll-window {
    height: 100%;
    max-height: var(--public-roundup-visible-list-height);
    overflow-y: auto;
    scroll-behavior: smooth;
    scrollbar-color: rgba(96, 112, 134, 0.32) transparent;
    scrollbar-width: thin;
  }

  .public-roundup-has-scroll .public-roundup-scroll-window {
    height: var(--public-roundup-visible-list-height);
    max-height: var(--public-roundup-visible-list-height);
    padding-right: 4px;
    box-sizing: border-box;
    scrollbar-gutter: stable;
  }

  .public-matchday-roundup .public-roundup-scroll-window::-webkit-scrollbar {
    width: 4px;
  }

  .public-matchday-roundup .public-roundup-scroll-window::-webkit-scrollbar-track {
    background: transparent;
  }

  .public-matchday-roundup .public-roundup-scroll-window::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(96, 112, 134, 0.28);
  }

  .public-roundup-scroll-button {
    position: absolute;
    right: 4px;
    left: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    width: auto;
    height: var(--public-roundup-scroll-control-height);
    border: 0;
    border-radius: 0;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0), #f5f7fa 18%, #f5f7fa 82%, rgba(255, 255, 255, 0));
    color: #526174;
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    box-shadow: none;
  }

  .public-roundup-scroll-button-top {
    top: 0;
    border-bottom: 1px solid #edf2f7;
  }

  .public-roundup-scroll-button-bottom {
    bottom: 0;
    border-top: 1px solid #edf2f7;
  }

  .public-cover-story {
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .public-matchday-roundup .public-cover-story {
    grid-template-columns: 44px minmax(0, 1fr) auto auto;
    gap: 2px 9px;
    align-items: center;
    box-sizing: border-box;
    min-height: 56px;
    padding: 5px 0;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-cover-story {
    min-height: calc(var(--public-roundup-visible-list-height) / 5);
    gap: 3px 14px;
    padding: 7px 6px;
    border-bottom-color: #edf2f7;
  }

  .public-roundup-has-scroll .public-cover-story {
    min-height: calc(var(--public-roundup-visible-list-height) / 5);
  }

  .public-matchday-roundup .public-highlight-image {
    position: relative;
    grid-column: 1 / 2;
    grid-row: 1 / 4;
    width: 44px;
    height: 44px;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: #eef2f6;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-highlight-image {
    width: 48px;
    height: 48px;
    border-radius: 4px;
  }

  .public-matchday-roundup .public-highlight-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-below-headline-highlights .public-cover-story-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding-top: 0;
  }

  .public-below-headline-highlights .public-cover-story {
    display: grid;
    grid-template-columns: 1fr;
    gap: 7px;
    align-items: start;
    padding: 0;
    border-bottom: 0;
  }

  .public-below-headline-highlights .public-highlight-image {
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
    border-radius: 4px;
  }

  .public-media-play {
    position: absolute;
    inset: 50% auto auto 50%;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    color: #10151b;
    font-size: 11px;
    font-weight: 900;
    transform: translate(-50%, -50%);
  }

  .public-media-play-icon-only::before {
    content: "";
    width: 0;
    height: 0;
    margin-left: 2px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 7px solid currentColor;
  }

  .public-matchday-roundup .public-highlight-image .public-media-play {
    width: 18px;
    height: 18px;
    background: rgba(255, 255, 255, 0.76);
    color: rgba(16, 21, 27, 0.62);
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    box-shadow: 0 1px 2px rgba(16, 21, 27, 0.08);
  }

  .public-matchday-roundup .public-highlight-image .public-media-play-icon-only::before {
    margin-left: 1px;
    border-top-width: 4px;
    border-bottom-width: 4px;
    border-left-width: 6px;
  }

  .public-matchday-roundup .public-cover-story span,
  .public-matchday-roundup .public-cover-story strong,
  .public-matchday-roundup .public-cover-story small {
    min-width: 0;
  }

  .public-matchday-roundup .public-cover-story span {
    grid-column: 2 / 5;
    grid-row: 1 / 2;
  }

  .public-matchday-roundup .public-cover-story .public-roundup-meta {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    grid-column: 2 / 5;
    grid-row: 1 / 2;
    min-width: 0;
    line-height: 1;
  }

  .public-matchday-roundup .public-cover-story .public-roundup-meta span {
    grid-column: auto;
    grid-row: auto;
    min-width: 0;
  }

  .public-matchday-roundup .public-cover-story strong {
    grid-column: 2 / 3;
    grid-row: 2 / 3;
    font-size: 13px;
    line-height: 1.1;
  }

  .public-matchday-roundup .public-cover-story small {
    grid-column: 2 / 5;
    grid-row: 3 / 4;
    color: #607086;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.15;
  }

  .public-roundup-duration,
  .public-roundup-arrow {
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .public-roundup-duration {
    grid-column: auto;
    grid-row: auto;
    justify-self: end;
  }

  .public-roundup-arrow {
    grid-column: 4 / 5;
    grid-row: 2 / 3;
    text-decoration: none;
  }

  .public-roundup-switch-item {
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .public-roundup-switch-item[aria-pressed="true"] {
    border-radius: 4px;
    background: #f8fafc;
    outline: 1px solid #dde5ed;
    outline-offset: -1px;
    box-shadow: inset 2px 0 0 rgba(96, 112, 134, 0.36), 0 1px 4px rgba(16, 21, 27, 0.03);
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-cover-story strong {
    grid-column: 2 / 4;
    font-size: 13.5px;
    line-height: 1.14;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-cover-story small {
    color: #6b7786;
    line-height: 1.2;
  }

  .public-below-headline-highlights .public-cover-story span,
  .public-below-headline-highlights .public-cover-story strong,
  .public-below-headline-highlights .public-cover-story small {
    grid-column: auto;
    grid-row: auto;
  }

  .public-below-headline-highlights .public-cover-story strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
  }

  .public-below-headline-highlights .public-cover-story small {
    margin: 0;
    color: #607086;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.35;
  }

  .public-highlight-image-link,
  .public-cover-story-title-link {
    color: inherit;
    text-decoration: none;
  }

  .public-highlight-image-link {
    display: block;
  }

  .public-cover-story-title-link:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-matchday-main-lower:has(.public-below-headline-highlights) .public-below-headline-side {
    padding-top: 22px;
  }

  .public-editorial-more-link {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }

  .public-complement-media {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-complement-media img,
  .public-complement-media iframe,
  .public-complement-media video {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }

  .public-complement-media img,
  .public-complement-media video {
    object-fit: cover;
    object-position: center;
  }

  .public-complement-media video {
    background: #0f141b;
    object-fit: contain;
  }

  .public-roundup-video-panel {
    align-self: stretch;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    padding: 0;
  }

  .public-roundup-video-block {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 372px;
    margin-left: auto;
    overflow: hidden;
  }

  .public-roundup-video-panel .public-complement-media {
    width: 100%;
    max-height: 210px;
    aspect-ratio: 16 / 9;
    overflow: hidden;
  }

  .public-roundup-video-panel .public-roundup-active-body {
    gap: 4px;
    width: 100%;
    box-sizing: border-box;
    padding: 7px 0 0;
  }

  .public-roundup-active-meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid #eef2f6;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-roundup-active-meta span:last-child {
    color: #607086;
    white-space: nowrap;
  }

  .public-complement-body {
    display: grid;
    gap: 6px;
  }

  .public-complement-label {
    color: #c40012;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-complement-body strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 17px;
    line-height: 1.18;
  }

  .public-roundup-video-panel .public-complement-body strong {
    margin-top: 2px;
    font-size: 16.5px;
  }

  .public-roundup-video-panel .public-complement-body p {
    max-width: 96%;
    color: #526174;
    line-height: 1.28;
  }

  .public-complement-title-link {
    color: inherit;
    text-decoration: none;
  }

  .public-complement-title-link:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-complement-body p {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-highlight-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-highlight-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-cover-story span {
    color: #c40012;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-cover-story strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
  }

  .public-matchday-editorial p,
  .public-matchday-feature p,
  .public-matchday-cover-side p {
    margin: 0;
    color: #607086;
  }

  .public-matchday-cover-side h3 {
    padding-top: 8px;
    border-top: 4px solid #10151b;
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-news h3 {
    padding-top: 0;
    border-top: 0;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.1;
    text-transform: none;
  }

  .public-matchday-news {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 100%;
    padding-right: 0;
    border-right: 0;
  }

  .public-news-list {
    display: grid;
    gap: 0;
    align-content: start;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    scrollbar-width: none;
  }

  .public-news-list::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .public-news-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .public-news-list::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(96, 112, 134, 0.28);
  }

  .public-news-item {
    display: grid;
    gap: 7px;
    padding: 0 0 14px;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-news-item + .public-news-item {
    padding-top: 14px;
  }

  .public-news-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-news-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-news-copy {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .public-news-list time {
    display: block;
    max-width: 100%;
    overflow: hidden;
    color: #c40012;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .public-news-title {
    display: block;
    color: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
    text-decoration: none;
  }

  .public-news-title:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-news-subtitle {
    margin: 0;
    color: #607086;
    font-size: 12px;
    line-height: 1.35;
  }

  .public-important-news {
    display: grid;
    gap: 16px;
    padding: 18px;
  }

  .public-important-news-head h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-important-news-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
  }

  .public-important-news-card {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }

  .public-important-news-image,
  .public-important-news-image-link {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-important-news-image img,
  .public-important-news-image-link img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-important-news-label {
    color: #c40012;
    font-size: 11px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-important-news-title {
    display: block;
    color: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.15;
    text-decoration: none;
  }

  .public-important-news-title:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-important-news-card p {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-matchday-summary {
    display: grid;
    gap: 0;
  }

  .public-matchday-summary span {
    padding: 8px 0;
    border-bottom: 1px solid #e6ebf1;
    border-radius: 0;
    background: transparent;
    color: #34404d;
    font-size: 13px;
    font-weight: 900;
    line-height: 1.32;
  }

  .public-matchday-feature-game {
    display: grid;
    grid-template-columns: 1fr;
    gap: 9px;
    align-items: center;
    min-height: 210px;
    padding: 14px;
    border: 1px solid #dde4ec;
    border-radius: 0;
    background: #f8fafc;
  }

  .public-matchday-feature-team {
    display: grid;
    justify-items: center;
    gap: 8px;
    text-align: center;
    font-weight: 900;
  }

  .public-matchday-feature-score {
    min-width: 74px;
    text-align: center;
  }

  .public-matchday-feature-score strong {
    display: block;
    font-size: 24px;
  }

  .public-matchday-future {
    padding: 20px;
    color: #607086;
  }

  .public-matchday-group {
    display: grid;
    gap: 10px;
  }

  .public-matchday-group h3 {
    color: #263241;
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    width: min(760px, 100%);
    margin: 0 auto;
    padding: 10px 12px;
    border: 1px solid #e3e9f0;
    border-radius: 8px;
    background: #ffffff;
  }

  .public-matchday-card-finished {
    border-color: #e3e9f0;
    background: #ffffff;
  }

  .public-matchday-card-live {
    border-color: #e3e9f0;
    background: #ffffff;
  }

  .public-matchday-card-halftime {
    border-color: #e3e9f0;
    background: #ffffff;
  }

  .public-matchday-card-scheduled {
    border-color: #e3e9f0;
    background: #ffffff;
  }

  .public-matchday-card-unknown {
    border-color: #d8dee6;
    background: #ffffff;
  }

  .public-matchday-team:first-child {
    text-align: right;
  }

  .public-matchday-team:last-of-type {
    text-align: left;
  }

  .public-matchday-team {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .public-matchday-team:first-child {
    justify-content: flex-end;
  }

  .public-matchday-team:last-of-type {
    justify-content: flex-start;
  }

  .public-matchday-team-copy {
    min-width: 0;
  }

  .public-matchday-team strong,
  .public-matchday-score strong {
    display: block;
    font-size: 14px;
  }

  .public-matchday-team small,
  .public-matchday-score small {
    display: block;
    margin-top: 3px;
    color: #66717f;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .public-matchday-team-winner strong {
    color: #137a3a;
  }

  .public-matchday-score {
    min-width: 72px;
    text-align: center;
  }

  .public-matchday-score strong {
    font-size: 18px;
    letter-spacing: 0;
  }

  .public-matchday-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    border-radius: 999px;
    background: #eef2f6;
    font-size: 9.5px;
  }

  .public-matchday-status-finished {
    background: #e9edf2;
    color: #4e5b69;
  }

  .public-matchday-status-live {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    color: #10151b;
    white-space: nowrap;
  }

  .public-matchday-status-halftime {
    background: #edf7f1;
    color: #286943;
  }

  .public-matchday-status-scheduled {
    background: #f4f1e8;
    color: #6b5a22;
  }

  .public-matchday-status-unknown {
    background: #eef2f6;
    color: #506075;
  }

  .public-matchday-meta {
    grid-column: 1 / -1;
    justify-content: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: #607086;
    font-size: 11px;
  }

  .public-matchday-nav {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    gap: 0;
    min-width: 0;
    padding: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border-top: 2px solid #10151b;
    border-bottom: 0;
    background: #ffffff;
  }

  .public-matchday-nav::-webkit-scrollbar {
    display: none;
  }

  .public-matchday-nav a,
  .public-matchday-nav span {
    display: inline-block;
    flex: 0 0 auto;
    padding: 8px 13px;
    border: 0;
    border-right: 1px solid #dfe5ec;
    border-radius: 0;
    background: #ffffff;
    color: #263241;
    font-size: 11px;
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
    padding: 8px 11px;
    border-right: 1px solid #dfe5ec;
    background: #ffffff;
    color: #263241;
    font-size: 11px;
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

  .public-table-wrap {
    overflow-x: auto;
    padding: 20px;
  }

  .public-table {
    width: 100%;
    min-width: 1080px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .public-table th,
  .public-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #e6ebf1;
    text-align: right;
    white-space: nowrap;
  }

  .public-table th {
    color: #506075;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-table-club {
    min-width: 300px;
    text-align: left;
  }

  .public-club-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }

  .public-club-name {
    min-width: 0;
    overflow: hidden;
    font-weight: 900;
    text-overflow: ellipsis;
  }

  .public-club-form {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
    color: #66717f;
    font-size: 11px;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
  }

  .public-table-divider {
    border-left: 2px solid #d8dee6;
  }

  .public-points {
    font-weight: 900;
  }

  .public-gd-positive {
    color: #137a3a;
    font-weight: 900;
  }

  .public-gd-negative {
    color: #b4232b;
    font-weight: 900;
  }

  .public-gd-neutral {
    color: #607086;
    font-weight: 900;
  }

  .public-form-list {
    display: inline-flex;
    gap: 4px;
  }

  .public-form-list span {
    padding: 3px 5px;
    border-radius: 999px;
    background: #eef2f6;
    font-size: 11px;
    font-weight: 900;
  }

  .public-form-win {
    color: #137a3a;
  }

  .public-form-draw {
    color: #607086;
  }

  .public-form-loss {
    color: #b4232b;
  }

  .public-diagnostic {
    margin-top: 18px;
    padding: 18px 20px;
    border: 1px solid #ffd3a3;
    border-radius: 8px;
    background: #fff8ee;
    color: #4a2d00;
  }

  .public-diagnostic h2,
  .public-diagnostic p {
    margin: 0;
  }

  .public-diagnostic p {
    margin-top: 8px;
  }

  .public-diagnostic pre {
    overflow-x: auto;
    margin: 14px 0 0;
    padding: 14px;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font-size: 13px;
    white-space: pre-wrap;
  }

  .public-logo-diagnostic {
    margin-top: 18px;
    padding: 16px;
    border: 1px solid #d8dee6;
    border-radius: 8px;
    background: #f8fafc;
    color: #26313d;
  }

  .public-logo-diagnostic h2,
  .public-logo-diagnostic p {
    margin: 0;
  }

  .public-logo-diagnostic p {
    margin-top: 6px;
    color: #667282;
    font-size: 13px;
  }

  .public-logo-diagnostic table {
    width: 100%;
    margin-top: 12px;
    border-collapse: collapse;
    font-size: 12px;
  }

  .public-logo-diagnostic th,
  .public-logo-diagnostic td {
    padding: 8px;
    border-top: 1px solid #e1e6ed;
    text-align: left;
    vertical-align: top;
  }

  .public-logo-diagnostic code {
    word-break: break-all;
  }

  @media (max-width: 760px) {
    .public-matchday-shell {
      padding: 0 16px 16px;
    }

    .public-top-stack {
      margin: 0 -16px;
      padding: 0 16px;
    }

    #jogos,
    #classificacao {
      scroll-margin-top: 156px;
    }

    .public-matchday-panel[aria-label="Navegacao de jornadas"] {
      margin: 0 -16px;
    }

    .public-season-nav-inner {
      padding: 8px 16px 9px;
    }

    .public-matchday-hero h1 {
      font-size: 32px;
    }

    .public-site-topbar {
      grid-template-columns: 1fr;
    }

    .public-site-menu {
      display: flex;
      flex-wrap: wrap;
      gap: 9px 11px;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
      font-size: 11px;
    }

    .public-site-actions {
      display: none;
    }

  .public-season-nav-bar {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .public-matchday-card {
      grid-template-columns: 1fr;
      text-align: left;
    }

    .public-matchday-cover {
      grid-template-columns: 1fr;
      grid-template-areas:
        "feature"
        "main"
        "news";
    }

    .public-cover-headline,
    .public-matchday-main-lower {
      grid-template-columns: 1fr;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) {
      grid-template-columns: 1fr;
    }

    .public-roundup-video-layout {
      grid-template-columns: 1fr;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup,
    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
      grid-column: auto;
      grid-row: auto;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup {
      justify-self: stretch;
      width: 100%;
      margin-left: 0;
    }

    .public-cover-story-strip {
      grid-template-columns: 1fr;
    }

    .public-matchday-editorial,
    .public-matchday-feature,
    .public-matchday-cover-side,
    .public-matchday-news {
      padding-right: 0;
      border-right: 0;
    }

    .public-matchday-team:first-child,
    .public-matchday-team:last-of-type,
    .public-matchday-score {
      text-align: left;
    }
  }

  .public-matchday-panel[aria-label="Navegacao de jornadas"] {
    max-width: none;
    margin: 0 -24px;
    border: 0;
    border-radius: 0;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 18px rgba(12, 22, 34, 0.06);
  }

  .public-matchday-panel[aria-label="Navegacao de jornadas"] header {
    display: none;
  }

  .public-season-nav-inner {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px 18px;
    align-items: center;
    min-height: 52px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 0;
    overflow: hidden;
  }

  @media (max-width: 1200px) {
    .public-site-topbar {
      gap: 14px;
    }

    .public-site-menu {
      gap: 12px;
      min-width: 0;
      font-size: 11.5px;
    }

    .public-site-actions {
      gap: 8px;
      min-width: 0;
    }

    .public-site-search {
      min-width: 132px;
    }

    .public-season-nav-inner {
      gap: 6px 10px;
    }

    .public-season-select-wrap {
      gap: 6px;
      padding: 5px 7px;
    }

    .public-season-select {
      min-width: 96px;
    }

    .public-matchday-leg-nav a,
    .public-matchday-nav a,
    .public-matchday-nav span {
      padding: 7px 10px;
      font-size: 10.5px;
    }

    .public-matchday-date-context {
      font-size: 10px;
    }

    .public-matchday-strip-shell {
      padding: 0 10px;
    }

    .public-matchday-cover {
      grid-template-columns:
        minmax(180px, 220px)
        minmax(0, 1fr)
        minmax(210px, 240px);
      gap: 14px;
    }

    .public-matchday-feature,
    .public-matchday-roundup,
    .public-matchday-cover-side,
    .public-matchday-news {
      padding: 14px;
    }

    .public-cover-headline {
      grid-template-columns: minmax(0, 1.25fr) minmax(220px, 0.85fr);
      gap: 12px;
    }

    .public-matchday-main-lower {
      grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.85fr);
      gap: 16px;
    }

    .public-roundup-video-layout {
      grid-template-columns: minmax(0, 300px) minmax(0, 330px);
      gap: 12px;
    }

    .public-table-wrap {
      max-width: 100%;
      -webkit-overflow-scrolling: touch;
    }

    .public-table {
      min-width: 960px;
      font-size: 12px;
    }

    .public-table th,
    .public-table td {
      padding: 9px 6px;
    }

    .public-table-club {
      min-width: 240px;
    }
  }

  @media (max-width: 1080px) {
    .public-matchday-cover {
      grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
      grid-template-areas:
        "feature main"
        "news news";
      min-height: 0;
    }

    .public-matchday-news {
      min-height: 0;
    }

    .public-news-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      overflow-y: visible;
    }

    .public-matchday-main-lower,
    .public-matchday-main-lower:has(.public-roundup-video-panel) {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-roundup-video-layout {
      grid-template-columns: minmax(0, 1fr);
      justify-content: stretch;
    }

    .public-roundup-video-layout > .public-matchday-roundup,
    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup {
      justify-self: stretch;
      width: 100%;
      margin-left: 0;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup,
    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
      grid-column: auto;
      grid-row: auto;
    }
  }

  @media (max-width: 980px) {
    .public-site-topbar {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .public-site-actions {
      display: none;
    }

    .public-matchday-cover {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "feature"
        "main"
        "news";
      gap: 14px;
    }

    .public-cover-headline,
    .public-matchday-main-lower,
    .public-matchday-main-lower:has(.public-roundup-video-panel),
    .public-roundup-video-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup {
      padding: 0;
    }

    .public-table-wrap {
      padding: 14px;
    }

    .public-table {
      min-width: 900px;
    }

    .public-table-club {
      min-width: 210px;
    }
  }

  @media (max-width: 900px) {
    .public-season-nav-inner {
      flex-wrap: wrap;
      align-items: flex-start;
      min-height: 0;
      padding: 6px 0 8px;
      overflow: visible;
    }

    .public-matchday-nav {
      flex: 1 1 100%;
      flex-wrap: wrap;
      order: 3;
      overflow-x: visible;
    }

    .public-matchday-date-row {
      flex: 1 1 auto;
      justify-content: flex-start;
      order: 4;
      margin-left: 0;
    }
  }

  @media (max-width: 760px) {
    .public-matchday-panel[aria-label="Navegacao de jornadas"] {
      margin: 0 -16px;
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
  }
  .public-matchday-cover[data-editorial-layout="feature-main"],
  .public-matchday-cover[data-editorial-layout="feature-news"],
  .public-matchday-cover[data-editorial-layout="main-news"],
  .public-matchday-cover[data-editorial-layout="feature"],
  .public-matchday-cover[data-editorial-layout="main"],
  .public-matchday-cover[data-editorial-layout="news"] {
    min-height: 0;
  }

  .public-matchday-cover[data-editorial-layout="feature-main"] {
    grid-template-columns: minmax(220px, 240px) minmax(0, 1fr);
    grid-template-areas: "feature main";
  }

  .public-matchday-cover[data-editorial-layout="feature-news"] {
    grid-template-columns: minmax(220px, 240px) minmax(0, 1fr);
    grid-template-areas: "feature news";
  }

  .public-matchday-cover[data-editorial-layout="main-news"] {
    grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
    grid-template-areas: "main news";
  }

  .public-matchday-cover[data-editorial-layout="feature"] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "feature";
  }

  .public-matchday-cover[data-editorial-layout="main"] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "main";
  }

  .public-matchday-cover[data-editorial-layout="news"] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "news";
  }

  .public-matchday-main-lower.public-matchday-main-lower-single {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-matchday-main-lower.public-matchday-main-lower-single > * {
    grid-column: 1 / -1;
  }

  .public-cover-headline[data-headline-layout="copy-only"],
  .public-cover-headline[data-headline-layout="media-only"] {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 980px) {
    .public-matchday-cover[data-editorial-layout="feature-main"],
    .public-matchday-cover[data-editorial-layout="feature-news"],
    .public-matchday-cover[data-editorial-layout="main-news"] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: none;
    }

    .public-matchday-cover[data-editorial-layout="feature-main"] > *,
    .public-matchday-cover[data-editorial-layout="feature-news"] > *,
    .public-matchday-cover[data-editorial-layout="main-news"] > * {
      grid-area: auto;
    }
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

function signedNumber(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function goalDifferenceClass(value: number) {
  return value > 0 ? "public-gd-positive" : value < 0 ? "public-gd-negative" : "public-gd-neutral";
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

function formatMiniCardKickoff(scheduledDate: string, value: string | null) {
  if (!value) {
    const date = parseCivilDate(scheduledDate);
    return date
      ? `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")} · Hora por definir`
      : "Hora por definir";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatKickoff(scheduledDate, null);

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

function matchSchedulePresentation(match: Pick<PublicSeasonMatch, "scheduled_date" | "kickoff_at" | "matchday">, compact: boolean) {
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
      visual: `${String(scheduledDate.day).padStart(2, "0")} ${compactMonthNames[scheduledDate.month - 1]} · ${compact ? "A DEFINIR" : "HORA POR DEFINIR"}`,
      accessible: `${scheduledDate.day} de ${civilMonthNames[scheduledDate.month - 1]} de ${scheduledDate.year}, hora por definir`,
      dateTime: match.scheduled_date
    };
  }

  const matchdayNumber = match.matchday?.number ?? null;
  return {
    visual: compact ? (matchdayNumber === null ? "A DEFINIR" : `J${matchdayNumber} · A DEFINIR`) : "DATA E HORA POR DEFINIR",
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

function statusKind(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "finished") return "finished";
  if (normalized === "live") return "live";
  if (normalized === "halftime") return "halftime";
  if (normalized === "scheduled") return "scheduled";
  return "unknown";
}

function sideBlockTypeLabel(value?: string | null) {
  const labels: Record<string, string> = {
    opiniao: "OPINIÃO",
    arbitragem: "ARBITRAGEM",
    balanco: "BALANÇO",
    analise: "ANÁLISE",
    cronica: "CRÓNICA",
    "figura-da-jornada": "FIGURA DA JORNADA",
    outro: "EDITORIAL"
  };

  return value ? labels[value] ?? null : null;
}

function cleanPublicSideBlockText(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const debugLinePattern = /^(estado|status|side_block_status)\s*:\s*(published|draft)$/i;
  const statusOnlyPattern = /^(published|draft)$/i;
  const cleanLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !debugLinePattern.test(line) && !statusOnlyPattern.test(line));

  return cleanLines.join("\n").trim() || null;
}

function cleanReferenceSnapshotText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeReferenceLabel(value?: string | null) {
  return cleanReferenceSnapshotText(value)?.toLowerCase() ?? "";
}

function normalizeReferenceSourceType(sourceType?: string | null) {
  const normalized = normalizeReferenceLabel(sourceType);

  if (normalized === "matchday_editorials") return "matchday_editorial";
  if (normalized === "matchday_highlights") return "matchday_highlight";
  if (normalized === "matchday_roundup_items") return "matchday_roundup_item";
  if (normalized === "articles") return "article";

  return normalized;
}

function isArtificialFreeZoneReferenceLabel(item: PublicReferenceCompositionItem) {
  const label = normalizeReferenceLabel(item.label_snapshot);
  const sourceType = normalizeReferenceSourceType(item.source_type);

  if (!label) return false;
  if (label === "zona editorial final" || label === "mais noticias da jornada" || label === "mais notícias da jornada") return true;
  if (sourceType === "matchday_editorial") {
    return label === "manchete" || label === "complemento" || label === "complemento da manchete" || label === "bloco lateral";
  }
  if (sourceType === "article") {
    return label === "artigo / noticia" || label === "artigo / notícia";
  }

  return false;
}

function publicFreeZoneReferenceLabel(item: PublicReferenceCompositionItem) {
  return isArtificialFreeZoneReferenceLabel(item) ? "" : cleanReferenceSnapshotText(item.label_snapshot) || "";
}

function firstReferenceSlotItem(items?: PublicReferenceCompositionItem[]) {
  return items?.[0] ?? null;
}

function hasReferenceSlotContent(item?: PublicReferenceCompositionItem | null) {
  return Boolean(
    cleanReferenceSnapshotText(item?.title_snapshot) ||
      cleanReferenceSnapshotText(item?.subtitle_snapshot) ||
      cleanReferenceSnapshotText(item?.image_url_snapshot) ||
      cleanReferenceSnapshotText(item?.link_url_snapshot) ||
      cleanReferenceSnapshotText(item?.label_snapshot)
  );
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

function renderStatsCells(stats: ClassificationSplit, options: { divider?: boolean; emphasizePoints?: boolean; group?: string } = {}) {
  return PUBLIC_STAT_COLUMNS.map((column, index) => {
    const value = stats[column.key];
    const className = [
      options.divider && index === 0 ? "public-table-divider" : "",
      column.key === "goalDifference" ? goalDifferenceClass(value) : ""
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <td className={className || undefined} key={`${options.group ?? "stats"}-${column.key}`}>
        {column.key === "points" ? (
          <b className={options.emphasizePoints ? "public-points" : undefined}>{value}</b>
        ) : column.key === "goalDifference" ? (
          signedNumber(value)
        ) : (
          value
        )}
      </td>
    );
  });
}

function renderStatHeaders(group: string) {
  return PUBLIC_STAT_COLUMNS.map((column, index) => (
    <th className={index === 0 ? "public-table-divider" : undefined} key={`${group}-${column.key}`}>
      {column.label}
    </th>
  ));
}

function TeamBadge({ team, variant = "default" }: { team?: PublicSeasonMatch["homeTeam"]; variant?: PublicTeamBadgeVariant }) {
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
      variant={variant}
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
  const publicMinute = getPublicLiveMinute(match);
  const broadcastChannelName = match.broadcastChannel?.name?.trim();
  const livePrimeClassName = "public-live-minute-prime public-live-minute-prime-active";
  const statusText = kind === "live" ? (
    <>
      <span className="public-matchday-live-label">Live</span>
      {publicMinute !== null ? (
        <span className="public-matchday-live-minute">{publicMinute}<span className={livePrimeClassName}>'</span></span>
      ) : null}
      {broadcastChannelName ? (
        <BroadcastChannelLogo
          logoUrl={match.broadcastChannel?.logo_url}
          name={broadcastChannelName}
          variant="matchMeta"
        />
      ) : null}
    </>
  ) : statusLabel(match.status);
  const homeWinner = isWinner(match, "home");
  const awayWinner = isWinner(match, "away");
  const schedule = matchSchedulePresentation(match, false);

  return (
    <article className={`public-matchday-card public-matchday-card-${kind}`} key={match.id}>
      <div className={`public-matchday-team ${homeWinner ? "public-matchday-team-winner" : ""}`}>
        <div className="public-matchday-team-copy">
          <strong title={getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "full")}>
            {getPublicTeamName({ name: match.homeTeam?.name, publicName: match.homeTeam?.public_name, shortName: match.homeTeam?.short_name, code: match.homeTeam?.code }, "compact")}
          </strong>
          <small>Casa</small>
        </div>
        <TeamBadge team={match.homeTeam} />
      </div>
      <div className="public-matchday-score">
        <strong>{matchResult(match)}</strong>
        <small className={`public-matchday-status public-matchday-status-${kind}`}>
          {statusText}
          {kind === "live" ? <LivePulseDots /> : null}
        </small>
      </div>
      <div className={`public-matchday-team ${awayWinner ? "public-matchday-team-winner" : ""}`}>
        <TeamBadge team={match.awayTeam} />
        <div className="public-matchday-team-copy">
          <strong title={getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "full")}>
            {getPublicTeamName({ name: match.awayTeam?.name, publicName: match.awayTeam?.public_name, shortName: match.awayTeam?.short_name, code: match.awayTeam?.code }, "compact")}
          </strong>
          <small>Fora</small>
        </div>
      </div>
      <div className="public-matchday-meta">
        <PublicMatchMeta
          channelLogoUrl={match.broadcastChannel?.logo_url}
          channelName={kind === "live" ? null : broadcastChannelName}
          dateTime={schedule.dateTime ? (
            <time dateTime={schedule.dateTime} aria-label={schedule.accessible}>{schedule.visual}</time>
          ) : (
            <span aria-label={schedule.accessible}>{schedule.visual}</span>
          )}
        />
        {match.venue ? <span>{match.venue}</span> : null}
      </div>
    </article>
  );
}

function DiagnosticPanel({ diagnostic }: { diagnostic: PublicMatchdayDiagnostic }) {
  return (
    <main className="public-matchday-shell">
      <style>{publicMatchdayStyles}</style>
      <section className="public-diagnostic">
        <h2>Diagnóstico temporário da página pública</h2>
        <p>A rota foi carregada, mas os dados necessários não foram encontrados ou ocorreu um erro de leitura.</p>
        <pre>{JSON.stringify(diagnostic, null, 2)}</pre>
      </section>
    </main>
  );
}

function logoDiagnosticStatus(logoUrl?: string | null) {
  const value = logoUrl?.trim();

  if (!value) {
    return "sem logo_url";
  }

  if (!/^https?:\/\//i.test(value)) {
    return "valor nao URL";
  }

  if (/Special:(FilePath|Redirect)/i.test(value)) {
    return "URL Wikimedia Special";
  }

  if (/upload\.wikimedia\.org/i.test(value)) {
    return "URL direta Wikimedia";
  }

  return "URL http/https";
}

function LogoDiagnosticPanel({ context }: { context: PublicMatchdayContext }) {
  const rowsById = new Map<
    string,
    {
      name: string;
      publicName: string | null;
      shortName: string;
      code: string | null;
      slug: string;
      logoUrl: string | null;
      sources: Set<string>;
    }
  >();
  const addTeam = (
    team: PublicSeasonMatch["homeTeam"],
    source: string
  ) => {
    if (!team) {
      return;
    }

    const existing = rowsById.get(team.id);
    if (existing) {
      existing.sources.add(source);
      return;
    }

    rowsById.set(team.id, {
      name: team.name,
      publicName: team.public_name ?? null,
      shortName: team.short_name,
      code: team.code ?? null,
      slug: team.slug,
      logoUrl: team.logo_url,
      sources: new Set([source])
    });
  };

  context.participants.forEach((participant, index) => {
    addTeam(participant.team, `participante ${index + 1}`);
  });
  context.matchesForMatchday.forEach((match) => {
    addTeam(match.homeTeam, `J${context.matchday.number} casa`);
    addTeam(match.awayTeam, `J${context.matchday.number} fora`);
  });
  const rows = Array.from(rowsById.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="public-logo-diagnostic" aria-label="Diagnóstico temporário dos emblemas">
      <h2>Diagnóstico temporário dos emblemas</h2>
      <p>
        Esta caixa só aparece com <code>?debug_logos=1</code>. A consola do browser também indica os URLs que falham no carregamento.
      </p>
      <table>
        <thead>
          <tr>
            <th>Clube</th>
            <th>Slug</th>
            <th>Logo recebido</th>
            <th>Estado</th>
            <th>Origem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slug}>
              <td>{getPublicTeamName({ name: row.name, publicName: row.publicName, shortName: row.shortName, code: row.code }, "full")}</td>
              <td>{row.slug}</td>
              <td>{row.logoUrl ? <code>{row.logoUrl}</code> : "—"}</td>
              <td>{logoDiagnosticStatus(row.logoUrl)}</td>
              <td>{Array.from(row.sources).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function PublicMatchdayPage({ params, searchParams }: PublicMatchdayPageProps) {
  const { competitionSlug, seasonLabel, matchdayNumber } = await params;
  const query = searchParams ? await searchParams : {};

  if (competitionSlug === "liga-espanha") {
    redirect(`/competicoes/la-liga/${seasonLabel}/jornadas/${matchdayNumber}`);
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
  const showLogoDiagnostic = query.debug_logos === "1";
  const competitionBarColor = publicCompetitionBarColor(context.competition.slug);

  const seasonSegment = seasonLabelToUrlSegment(context.season.label);
  const seasonOptions = context.seasons.map((season) => ({
    id: season.id,
    label: season.label,
    href: `/competicoes/${context.competition.slug}/${seasonLabelToUrlSegment(season.label)}/jornadas/1`
  }));
  const currentSeasonHref = `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/1`;
  const currentCompetitionMenuItem = {
    label: context.competition.name,
    slug: context.competition.slug,
    href: `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/${context.matchday.number}`,
    logoUrl: context.competition.logo_url
  };
  const publicCompetitionMenuBase = await getPublicCompetitionMenu().catch(() => []);
  const publicCompetitionMenu = publicCompetitionMenuBase.map((item) =>
    item.slug === currentCompetitionMenuItem.slug ? currentCompetitionMenuItem : item
  );

  if (!publicCompetitionMenu.some((item) => item.slug === currentCompetitionMenuItem.slug)) {
    publicCompetitionMenu.unshift(currentCompetitionMenuItem);
  }

  const classificationRows = buildAccumulatedClassification({
    participants: context.participants,
    matches: context.matchesForSeason,
    matchdays: context.matchdays,
    selectedMatchday: context.matchday
  });
  const classificationTeamsById = new Map(
    context.participants.map((participant) => [participant.team_id, participant.team] as const)
  );
  const publicClassificationRows = classificationRows.map((row) => {
    const team = classificationTeamsById.get(row.teamId);
    const nameInput = {
      name: team?.name ?? row.name,
      publicName: team?.public_name,
      shortName: team?.short_name,
      code: team?.code
    };

    return {
      ...row,
      publicName: getPublicTeamName(nameInput, "compact"),
      fullName: getPublicTeamName(nameInput, "full")
    };
  });
  const matchdayHref = (number: number) => `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/${number}`;
  const matchdayLegNavigation = buildPublicMatchdayLegNavigation(
    context.matchdays,
    context.activeParticipantCount,
    context.matchday.id
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
  const liveMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "live");
  const halftimeMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "halftime");
  const selectedMatchdayDateContext = formatPreferredMatchdayDateContext(
    context.matchesForMatchday,
    context.matchday.starts_on,
    context.matchday.ends_on
  );
  const editorial = context.editorial;
  const publishedHeadline = editorial?.status === "published" ? editorial : null;
  const usePublishedReferenceComposition = context.hasPublishedReferenceComposition;
  const useHierarchicalReferenceComposition =
    usePublishedReferenceComposition && context.referenceComposition?.presentation_mode === "hierarchical";
  const hierarchicalBeyondReferenceItems = useHierarchicalReferenceComposition
    ? context.referenceSlots.beyond_matchday ?? []
    : [];
  const hasValidHierarchicalReferenceComposition =
    useHierarchicalReferenceComposition &&
    isPublishableHierarchicalComposition(context.hierarchicalCompositionSlots) &&
    isPublishableHierarchicalBeyondMatchday(hierarchicalBeyondReferenceItems);
  const referenceBankItemIds = usePublishedReferenceComposition
    ? Array.from(
        new Set(
          context.referenceCompositionItems
            .filter((item) => item.source_type === "matchday_editorial_bank_item")
            .map((item) => item.source_id)
            .filter((value): value is string => Boolean(value))
        )
      )
    : [];
  const referenceBankItems = referenceBankItemIds.length > 0
    ? await fetchSupabaseAdminTable<{ id: string; source_type: string | null; source_id: string | null }>(
        `matchday_editorial_bank_items?select=id,source_type,source_id&id=in.(${referenceBankItemIds.join(",")})`
      ).catch(() => [])
    : [];
  const editorialArticleIdByBankItemId = new Map(
    referenceBankItems
      .filter((item) => item.source_type?.trim().toLowerCase() === "editorial_article" && item.source_id)
      .map((item) => [item.id, item.source_id as string])
  );
  const referenceEditorialArticleIds = Array.from(new Set(editorialArticleIdByBankItemId.values()));
  const referenceEditorialArticles = referenceEditorialArticleIds.length > 0
    ? await fetchSupabaseAdminTable<{ id: string; author: string | null }>(
        `editorial_articles?select=id,author&id=in.(${referenceEditorialArticleIds.join(",")})`
      ).catch(() => [])
    : [];
  const referenceEditorialArticleById = new Map(referenceEditorialArticles.map((article) => [article.id, article]));
  const referenceHeadline = usePublishedReferenceComposition ? firstReferenceSlotItem(context.referenceSlots.headline) : null;
  const referenceComplement = usePublishedReferenceComposition ? firstReferenceSlotItem(context.referenceSlots.complement) : null;
  const referenceSideBlock = usePublishedReferenceComposition ? firstReferenceSlotItem(context.referenceSlots.side_block) : null;
  const referenceEditorialLineItems = usePublishedReferenceComposition ? context.referenceSlots.editorial_line_item ?? [] : [];
  const useReferenceRoundupItems = usePublishedReferenceComposition && context.hasReferenceRoundupItems;
  const effectiveRoundupItems = (
    useHierarchicalReferenceComposition
      ? context.referenceRoundupItems
      : useReferenceRoundupItems
        ? context.referenceRoundupItems
        : context.roundupItems
  ).filter(hasPublicMatchdayRoundupContent);
  const headlineTitle = referenceHeadline
    ? cleanReferenceSnapshotText(referenceHeadline.title_snapshot)
    : publishedHeadline?.title?.trim() || null;
  const headlineSummary = referenceHeadline
    ? cleanReferenceSnapshotText(referenceHeadline.subtitle_snapshot)
    : publishedHeadline?.summary?.trim() || null;
  const headlineImageUrl = referenceHeadline
    ? cleanReferenceSnapshotText(referenceHeadline.image_url_snapshot)
    : publishedHeadline?.image_url?.trim() || null;
  const headlineLinkUrl = referenceHeadline
    ? cleanReferenceSnapshotText(referenceHeadline.link_url_snapshot)
    : cleanReferenceSnapshotText(publishedHeadline?.headline_link_url);
  const referenceHeadlineEditorialArticleId =
    referenceHeadline?.source_type === "matchday_editorial_bank_item" && referenceHeadline.source_id
      ? editorialArticleIdByBankItemId.get(referenceHeadline.source_id) ?? null
      : null;
  const headlineAuthor = referenceHeadlineEditorialArticleId
    ? referenceEditorialArticleById.get(referenceHeadlineEditorialArticleId)?.author?.trim() || null
    : null;
  const headlineMedia = context.headlineMedia;
  const hasPublishedHeadline = usePublishedReferenceComposition
    ? Boolean(headlineTitle || headlineSummary || headlineImageUrl || headlineMedia)
    : Boolean(publishedHeadline && (headlineTitle || headlineSummary || headlineImageUrl || headlineMedia));
  const complementaryMode = editorial?.complementary_mode ?? "none";
  const highlightColorById = new Map(
    context.highlights.map((item) => [item.id, item.label_color?.trim() || null])
  );
  const referenceHighlightItems = usePublishedReferenceComposition
    ? [...(context.referenceSlots.highlight ?? [])]
        .filter(hasReferenceSlotContent)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({
          id: item.id,
          label: cleanReferenceSnapshotText(item.label_snapshot),
          labelColor:
            item.source_type === "matchday_highlight" && item.source_id
              ? highlightColorById.get(item.source_id) ?? null
              : null,
          title: cleanReferenceSnapshotText(item.title_snapshot) || "",
          subtitle: cleanReferenceSnapshotText(item.subtitle_snapshot),
          imageUrl: cleanReferenceSnapshotText(item.image_url_snapshot),
          linkUrl: cleanReferenceSnapshotText(item.link_url_snapshot)
        }))
        .filter((item) => item.title.length > 0)
    : [];
  const highlightsAreActive = editorial
    ? editorial.below_headline_mode !== "roundup"
    : referenceHighlightItems.length > 0;
  const roundupIsActive = editorial
    ? complementaryMode === "roundup_video"
    : useReferenceRoundupItems;
  const belowHeadlineHeading = editorial?.below_headline_heading?.trim() ?? "";
  const belowHeadlineHeadingColor = editorial?.below_headline_heading_color?.trim();
  const effectiveHighlights =
    referenceHighlightItems.length > 0
      ? referenceHighlightItems
      : context.highlights.map((highlight) => ({
          id: highlight.id,
          label: highlight.label?.trim() || null,
          labelColor: highlight.label_color?.trim() || null,
          title: highlight.title?.trim() || "",
          subtitle: highlight.subtitle?.trim() || null,
          imageUrl: highlight.image_url?.trim() || null,
          linkUrl: highlight.link_url?.trim() || null
        })).filter((highlight) => highlight.title.length > 0);
  const visibleHighlights = highlightsAreActive ? effectiveHighlights : [];
  const visibleRoundupItems = roundupIsActive ? effectiveRoundupItems : [];
  const complementaryImageUrl = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceComplement?.image_url_snapshot)
    : editorial?.complementary_image_url?.trim() || null;
  const complementaryLabel = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceComplement?.label_snapshot)
    : editorial?.complementary_label?.trim() || null;
  const complementaryLabelColor = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceComplement?.label_color_snapshot)
    : editorial?.complementary_text_color?.trim() || null;
  const complementaryTitle = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceComplement?.title_snapshot)
    : editorial?.complementary_title?.trim() || null;
  const complementaryText = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceComplement?.subtitle_snapshot)
    : editorial?.complementary_text?.trim() || null;
  const complementaryLinkUrl = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceComplement?.link_url_snapshot)
    : editorial?.complementary_link_url?.trim() || null;
  const complementMedia = context.complementMedia;
  const complementaryIsActive = editorial
    ? editorial.complementary_status === "published"
    : Boolean(referenceComplement);
  const hasPublishedComplementaryStory =
    complementaryIsActive &&
    Boolean(complementaryTitle || complementaryText || complementaryImageUrl || complementMedia);
  const sideBlockImageUrl = usePublishedReferenceComposition
    ? cleanReferenceSnapshotText(referenceSideBlock?.image_url_snapshot)
    : editorial?.side_block_image_url?.trim() || null;
  const explicitSideBlockLabel = usePublishedReferenceComposition ? cleanReferenceSnapshotText(referenceSideBlock?.label_snapshot) : cleanPublicSideBlockText(editorial?.side_block_label);
  const sideBlockLabel = usePublishedReferenceComposition ? explicitSideBlockLabel : explicitSideBlockLabel || sideBlockTypeLabel(editorial?.side_block_type);
  const referenceSideBlockUsesEditorialColor = Boolean(
    usePublishedReferenceComposition
      && referenceSideBlock?.source_id === editorial?.id
      && ["matchday_editorial", "matchday_editorial_side_block"].includes(referenceSideBlock?.source_type ?? "")
  );
  const sideBlockLabelColor = usePublishedReferenceComposition
    ? referenceSideBlockUsesEditorialColor
      ? editorial?.side_block_label_color?.trim() || null
      : null
    : editorial?.side_block_label_color?.trim() || null;
  const sideBlockTitle = usePublishedReferenceComposition ? cleanReferenceSnapshotText(referenceSideBlock?.title_snapshot) : cleanPublicSideBlockText(editorial?.side_block_title);
  const sideBlockTitleColor = usePublishedReferenceComposition ? null : editorial?.side_block_title_color?.trim() || null;
  const sideBlockAuthor = usePublishedReferenceComposition ? null : cleanPublicSideBlockText(editorial?.side_block_author);
  const sideBlockText = usePublishedReferenceComposition ? cleanReferenceSnapshotText(referenceSideBlock?.subtitle_snapshot) : cleanPublicSideBlockText(editorial?.side_block_text);
  const sideBlockLinkUrl = usePublishedReferenceComposition ? cleanReferenceSnapshotText(referenceSideBlock?.link_url_snapshot) : editorial?.side_block_link_url?.trim() || null;
  const hasPublishedSideBlock = usePublishedReferenceComposition
    ? Boolean(sideBlockImageUrl || sideBlockTitle || sideBlockText)
    : editorial?.side_block_status === "published" &&
      Boolean(sideBlockImageUrl || sideBlockTitle || sideBlockText);
  const latestZoneMode = editorial?.latest_zone_mode === "editorial_line" ? "editorial_line" : "latest_news";
  const latestZonePlacement = editorial?.latest_zone_placement === "hidden" ? "hidden" : "top";
  const configuredLatestZoneTitle = editorial?.latest_zone_title?.trim() ?? "";
  const latestZoneTitle = usePublishedReferenceComposition
    ? ""
    : latestZoneMode === "latest_news" ? configuredLatestZoneTitle || "Últimas notícias" : configuredLatestZoneTitle;
  const configuredLatestZoneTitleColor = editorial?.latest_zone_title_color?.trim() ?? "";
  const latestZoneTitleColor =
    !usePublishedReferenceComposition && /^#[0-9A-Fa-f]{6}$/.test(configuredLatestZoneTitleColor)
      ? configuredLatestZoneTitleColor
      : null;
  const latestNewsColorById = new Map(
    context.latestNews.map((item) => [item.id, item.time_label_color?.trim() || null])
  );
  const latestNewsItems = usePublishedReferenceComposition
    ? referenceEditorialLineItems.map((item) => ({
        id: item.id,
        timeLabel: publicFreeZoneReferenceLabel(item),
        timeLabelColor:
          item.source_type === "matchday_latest_news" && item.source_id
            ? latestNewsColorById.get(item.source_id) ?? null
            : null,
        title: cleanReferenceSnapshotText(item.title_snapshot) || "",
        subtitle: cleanReferenceSnapshotText(item.subtitle_snapshot) || "",
        imageUrl: cleanReferenceSnapshotText(item.image_url_snapshot),
        linkUrl: cleanReferenceSnapshotText(item.link_url_snapshot)
      }))
    : context.latestNews.map((item) => ({
        id: item.id,
        timeLabel: item.time_label || "",
        timeLabelColor: item.time_label_color?.trim() || null,
        title: item.title?.trim() || "",
        subtitle: item.subtitle?.trim() || "",
        imageUrl: item.image_url?.trim() || null,
        linkUrl: item.link_url?.trim() || null
      })).filter((item) => item.title.length > 0);
  const importantNewsItems = resolveMatchdayHorizontalNewsItems({
    hasPublishedReferenceComposition: usePublishedReferenceComposition,
    referenceItems: [...(context.referenceSlots.important_item ?? [])]
      .filter(hasReferenceSlotContent)
      .map((item) => ({
        id: item.id,
        label: publicFreeZoneReferenceLabel(item),
        labelColor: cleanReferenceSnapshotText(item.label_color_snapshot),
        title: cleanReferenceSnapshotText(item.title_snapshot),
        subtitle: cleanReferenceSnapshotText(item.subtitle_snapshot),
        imageUrl: cleanReferenceSnapshotText(item.image_url_snapshot),
        linkUrl: cleanReferenceSnapshotText(item.link_url_snapshot),
        sortOrder: item.sort_order
      })),
    liveItems: context.horizontalNews.map((item) => ({
      id: item.id,
      label: item.label,
      labelColor: item.label_color ?? null,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.image_url,
      linkUrl: item.link_url,
      sortOrder: item.sort_order
    }))
  });
  const editorialVisibility = buildPublicMatchdayEditorialVisibility({
    hasHeadline: hasPublishedHeadline,
    hasSideBlock: hasPublishedSideBlock,
    highlightCount: visibleHighlights.length,
    roundupCount: visibleRoundupItems.length,
    hasComplementaryStory: hasPublishedComplementaryStory,
    latestNewsCount: latestNewsItems.length,
    latestZonePlacement,
    importantNewsCount: importantNewsItems.length
  });

  const hierarchicalVideoHighlight = useHierarchicalReferenceComposition && referenceComplement
    ? {
        isPublished: true,
        label: "DESTAQUE DA JORNADA",
        title: complementaryTitle,
        text: complementaryText,
        imageUrl: complementaryImageUrl,
        linkUrl: complementaryLinkUrl,
      }
    : null;
  const hierarchicalBeyondMatchdayNews = [...hierarchicalBeyondReferenceItems]
    .sort((left, right) => left.sort_order - right.sort_order)
    .reduce<PublicBeyondMatchdayNewsItem[]>((items, item) => {
      const title = cleanReferenceSnapshotText(item.title_snapshot);
      const linkUrl = cleanReferenceSnapshotText(item.link_url_snapshot);
      if (!title || !linkUrl) return items;

      items.push({
        id: item.id,
        label: cleanReferenceSnapshotText(item.label_snapshot),
        title,
        subtitle: cleanReferenceSnapshotText(item.subtitle_snapshot),
        imageUrl: cleanReferenceSnapshotText(item.image_url_snapshot),
        linkUrl,
      });
      return items;
    }, []);

  return (
    <main className="public-matchday-shell">
      <style>{publicMatchdayStyles}</style>
      {showLogoDiagnostic ? <LogoDiagnosticPanel context={context} /> : null}
      <div className="public-top-stack">
      <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
        <a className="public-site-brand" href="/">
          Jornada<span>.pt</span>
        </a>
        <PublicCompetitionNavigation
          competitions={publicCompetitionMenu}
          activeCompetitionSlug={context.competition.slug}
          classificationHref="#classificacao"
          showMessageTicker={false}
        />
        <div className="public-site-actions" aria-label="Ações">
          <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
          <a href="/admin/gestor">Entrar</a>
        </div>
      </header>
      <section className="public-season-nav-bar" aria-label="Navegacao de jornadas" style={{ background: competitionBarColor }}>
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
          <nav className="public-matchday-nav-compact" aria-label="Jornadas da época">
            {visibleMatchdays.map((matchday) => (
              <a
                aria-current={matchday.id === context.matchday.id ? "page" : undefined}
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
      <div className="public-league-match-strip-scroll">
        <PublicMatchStrip
          carouselLayout="fluid-peek"
          matches={context.matchesForMatchday.map((match) => ({
            ...match,
            matchdayNumber: context.matchday.number
          }))}
          variant="clean"
        />
      </div>
      {useHierarchicalReferenceComposition ? (
        <div className="public-matchday-hierarchical-region">
          {hasValidHierarchicalReferenceComposition ? (
            <PublicHierarchicalComposition
              slots={context.hierarchicalCompositionSlots}
              roundupItems={effectiveRoundupItems}
              roundupHeading="A JORNADA EM VÍDEO"
              matchdayNumber={context.matchday.number}
              videoHighlight={hierarchicalVideoHighlight}
              beyondMatchdayItems={hierarchicalBeyondMatchdayNews}
            />
          ) : (
            <section className="public-matchday-panel" aria-label="Composição hierárquica indisponível">
              <p>A composição hierárquica desta jornada está temporariamente indisponível.</p>
            </section>
          )}
        </div>
      ) : editorialVisibility.showCoverPanel ? (
        <PublicEditorialLayout
          ariaLabel="Capa da jornada"
          scope="matchday"
          showHeadline={editorialVisibility.showHeadline}
          showSideBlock={editorialVisibility.showSideBlock}
          showLatestNews={editorialVisibility.showLatestZone}
          sideBlock={{
            isPublished: hasPublishedSideBlock,
            label: sideBlockLabel,
            labelColor: sideBlockLabelColor,
            title: sideBlockTitle,
            titleColor: sideBlockTitleColor,
            author: sideBlockAuthor,
            text: sideBlockText,
            imageUrl: sideBlockImageUrl,
            linkUrl: sideBlockLinkUrl
          }}
          headline={{
            title: headlineTitle,
            subtitle: headlineSummary,
            author: headlineAuthor,
            imageUrl: headlineImageUrl,
            linkUrl: headlineLinkUrl,
            inlineMedia: headlineMedia
              ? {
                  kind: headlineMedia.kind,
                  embedUrl: headlineMedia.embed_url,
                  videoUrl: headlineMedia.video_url,
                  posterUrl: headlineMedia.poster_url,
                  caption: headlineMedia.caption,
                  contentSlug: headlineMedia.content_slug,
                  contentType: headlineMedia.content_type,
                  title: headlineMedia.title
                }
              : null,
            titleColor: !referenceHeadline ? publishedHeadline?.title_color ?? null : null,
            fallbackTitle: "",
            fallbackSubtitle: ""
          }}
          belowHeadline={{
            highlightHeading: belowHeadlineHeading,
            highlightHeadingColor: belowHeadlineHeadingColor ?? null,
            highlights: visibleHighlights,
            roundupItems: visibleRoundupItems,
            showRoundupVideo: editorialVisibility.showRoundup,
            roundupHeading: "A JORNADA EM VÍDEO",
            roundupHeadingColor: editorial?.roundup_video_heading_color ?? belowHeadlineHeadingColor ?? null,
            initialRoundupItemId: editorial?.complementary_roundup_item_id ?? null,
            matchdayNumber: context.matchday.number,
            complementary: {
              isPublished: hasPublishedComplementaryStory,
              label: complementaryLabel,
              labelColor: complementaryLabelColor,
              title: complementaryTitle,
              text: complementaryText,
              imageUrl: complementaryImageUrl,
              linkUrl: complementaryLinkUrl,
              inlineMedia: complementMedia
                ? {
                    kind: complementMedia.kind,
                    embedUrl: complementMedia.embed_url,
                    videoUrl: complementMedia.video_url,
                    posterUrl: complementMedia.poster_url,
                    caption: complementMedia.caption,
                    contentSlug: complementMedia.content_slug,
                    contentType: complementMedia.content_type,
                    title: complementMedia.title
                  }
                : null
            }
          }}
          latestNews={latestNewsItems}
          latestNewsTitle={latestZoneTitle}
          latestNewsTitleColor={latestZoneTitleColor}
        />
      ) : null}

      {!useHierarchicalReferenceComposition ? (
        <div className="public-matchday-editorial-region">
          <PublicHorizontalNewsStrip items={importantNewsItems} ariaLabel="Faixa horizontal de noticias" scope="matchday" />
        </div>
      ) : null}

      <section className="public-matchday-panel" id="classificacao" aria-label="Classificacao acumulada">
        <div className="public-table-wrap">
          <table className="public-table">
            <thead>
              <tr>
                <th rowSpan={2}>Pos</th>
                <th className="public-table-club" rowSpan={2}>Clube</th>
                <th className="public-table-divider" colSpan={PUBLIC_STAT_COLUMNS.length}>Total</th>
                <th className="public-table-divider" colSpan={PUBLIC_STAT_COLUMNS.length}>Casa</th>
                <th className="public-table-divider" colSpan={PUBLIC_STAT_COLUMNS.length}>Fora</th>
              </tr>
              <tr>
                {renderStatHeaders("total")}
                {renderStatHeaders("home")}
                {renderStatHeaders("away")}
              </tr>
            </thead>
            <tbody>
              {publicClassificationRows.map((row, index) => (
                <tr key={row.teamId}>
                  <td>{index + 1}</td>
                  <td className="public-table-club">
                    <span className="public-club-cell">
                    <span className="public-club-name" title={row.fullName}>{row.publicName}</span>
                    <span className="public-club-form">
                      <span>Últimos:</span>
                      {row.recentForm.length > 0 ? (
                        <span className="public-form-list">
                          {row.recentForm.map((result, resultIndex) => (
                            <span
                              className={
                                result.label.startsWith("V")
                                  ? "public-form-win"
                                  : result.label.startsWith("D")
                                    ? "public-form-loss"
                                    : "public-form-draw"
                              }
                              key={`${row.teamId}-${resultIndex}-${result.label}`}
                              title={result.title}
                            >
                              {result.label}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </span>
                    </span>
                  </td>
                  {renderStatsCells(totalClassificationStats(row), { divider: true, emphasizePoints: true, group: "total" })}
                  {renderStatsCells(row.home, { divider: true, group: "home" })}
                  {renderStatsCells(row.away, { divider: true, group: "away" })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
