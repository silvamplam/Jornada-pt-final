import { buildAccumulatedClassification, totalClassificationStats, type ClassificationSplit } from "@/lib/classification";
import { getPublicMatchdayDiagnostic, seasonLabelToUrlSegment, type PublicMatchdayDiagnostic, type PublicSeasonMatch } from "@/lib/public-matchday";
import RoundupVideoSwitcher from "@/components/public/RoundupVideoSwitcher";

export const dynamic = "force-dynamic";

type PublicMatchdayPageProps = {
  params: Promise<{
    competitionSlug: string;
    seasonLabel: string;
    matchdayNumber: string;
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
    font-size: 12px;
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
    overflow: hidden;
  }

  .public-matchday-scoreboard-panel {
    margin-top: 1px;
    border-top: 0;
    border-bottom: 0;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
    background: #ffffff;
    box-shadow: none;
    min-height: 84px;
  }

  .public-matchday-scoreboard-panel + .public-matchday-panel {
    margin-top: 6px;
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
    display: flex;
    gap: 14px;
    overflow-x: auto;
    scroll-behavior: smooth;
    scroll-padding: 14px;
    padding: 8px;
    background: #ffffff;
  }

  .public-matchday-strip-shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    min-height: 84px;
    padding: 0 10px;
    background: #ffffff;
  }

  .public-matchday-strip-button {
    align-self: center;
    width: 30px;
    height: 52px;
    border: 1px solid #d8dee6;
    border-radius: 999px;
    background: #ffffff;
    color: #263241;
    font-size: 22px;
    font-weight: 900;
    cursor: pointer;
  }

  .public-matchday-mini-card {
    position: relative;
    display: grid;
    flex: 0 0 236px;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 7px 8px;
    align-items: center;
    min-height: 72px;
    padding: 9px 12px 8px;
    border: 1px solid #eef2f6;
    border-radius: 6px;
    background: #ffffff;
    box-shadow: 0 8px 18px rgba(12, 22, 34, 0.05);
    font-size: 13px;
  }

  .public-matchday-mini-card + .public-matchday-mini-card::before {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: -7px;
    width: 1px;
    background: #dfe5ec;
  }

  .public-matchday-mini-card-live {
    border-color: #f5c2c7;
    background: #fff8f8;
  }

  .public-matchday-mini-card-halftime {
    border-color: #ffd3a3;
    background: #fffaf2;
  }

  .public-matchday-mini-card-finished {
    border-color: #dce8e1;
  }

  .public-matchday-mini-card strong {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 38px;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
  }

  .public-matchday-mini-team {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-mini-team:first-child {
    justify-content: flex-end;
  }

  .public-matchday-mini-team:last-child {
    justify-content: flex-start;
  }

  .public-matchday-mini-team span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .public-matchday-mini-card .public-team-badge {
    width: 30px;
    height: 30px;
    background: #ffffff;
  }

  .public-matchday-mini-card .public-matchday-mini-status {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 5px 8px;
    padding: 0;
    border-radius: 0;
    background: transparent;
    color: #607086;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-mini-time {
    color: #263241;
  }

  .public-matchday-mini-tv {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #263241;
    font-size: 12px;
    font-weight: 900;
    text-transform: none;
  }

  .public-matchday-mini-tv img {
    width: 34px;
    height: 20px;
    object-fit: contain;
  }

  .public-matchday-cover {
    display: grid;
    grid-template-columns:
      minmax(220px, 240px)
      minmax(0, 1fr)
      minmax(240px, 280px);
    grid-template-areas: "feature main news";
    gap: 24px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 20px 0;
    align-items: stretch;
    min-height: 420px;
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
    border: 1px solid #dfe5ec;
    background: #ffffff;
  }

  .public-matchday-main-column {
    grid-area: main;
    gap: 12px;
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
  }

  .public-matchday-cover-side {
    min-height: 100%;
  }

  .public-matchday-news {
    grid-area: news;
    min-height: 100%;
  }

  .public-matchday-editorial h2,
  .public-matchday-feature h3,
  .public-matchday-roundup h3,
  .public-matchday-cover-side h3,
  .public-matchday-news h3 {
    margin: 0;
  }

  .public-matchday-editorial h2 {
    color: #c40012;
    font-family: Georgia, "Times New Roman", serif;
    max-width: 100%;
    font-size: 28px;
    line-height: 1.04;
    letter-spacing: 0;
  }

  .public-cover-headline {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.95fr);
    gap: 18px;
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

  .public-editorial-main-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 285px;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-editorial-main-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
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

  .public-editorial-flex-block {
    position: relative;
  }

  .public-editorial-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 8px;
    border-top: 4px solid #10151b;
  }

  .public-matchday-roundup .public-editorial-block-head {
    justify-content: flex-end;
  }

  .public-editorial-block-head h3,
  .public-matchday-roundup h3 {
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-editorial-block-head a,
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

  .public-matchday-feature h3 {
    padding-bottom: 10px;
    border-bottom: 1px solid #dfe5ec;
    font-size: 14px;
    text-transform: uppercase;
  }

  .public-matchday-feature p {
    font-size: 13px;
  }

  .public-cover-support {
    display: grid;
    gap: 8px;
    align-content: start;
    height: auto;
    padding: 0;
    border: 0;
    background: #ffffff;
  }

  .public-cover-support h4 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
  }

  .public-cover-support p {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-cover-channel-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .public-cover-channel-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    align-items: start;
    min-width: 0;
    padding: 9px 0;
    border-top: 1px solid #eef2f6;
    font-size: 13px;
    font-weight: 900;
  }

  .public-cover-tv-game {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .public-cover-tv-game strong {
    color: #10151b;
    line-height: 1.18;
    white-space: normal;
  }

  .public-cover-tv-game time {
    color: #607086;
    font-size: 12px;
    font-weight: 800;
  }

  .public-cover-tv-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  .public-cover-tv-channel,
  .public-cover-tv-empty {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    min-width: 0;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    text-align: right;
  }

  .public-cover-tv-empty {
    color: #8a95a3;
    font-weight: 800;
  }

  .public-cover-tv-channel-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    min-height: 24px;
    padding: 3px 6px;
    border: 1px solid #eef2f6;
    border-radius: 4px;
    background: #eef2f6;
    color: #10151b;
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    text-align: center;
    text-transform: uppercase;
  }

  .public-cover-channel-list img {
    width: 46px;
    height: 24px;
    object-fit: contain;
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

  .public-cover-story {
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .public-matchday-roundup .public-cover-story {
    grid-template-columns: 56px minmax(0, 1fr) auto auto;
    gap: 4px 10px;
    align-items: center;
    padding: 9px 0;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-matchday-roundup .public-highlight-image {
    position: relative;
    grid-column: 1 / 2;
    grid-row: 1 / 4;
    width: 56px;
    height: 56px;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: #eef2f6;
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
    padding-top: 12px;
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

  .public-matchday-roundup .public-cover-story span,
  .public-matchday-roundup .public-cover-story strong,
  .public-matchday-roundup .public-cover-story small {
    min-width: 0;
  }

  .public-matchday-roundup .public-cover-story span {
    grid-column: 2 / 5;
    grid-row: 1 / 2;
  }

  .public-matchday-roundup .public-cover-story strong {
    grid-column: 2 / 3;
    grid-row: 2 / 3;
    font-size: 14px;
  }

  .public-matchday-roundup .public-cover-story small {
    grid-column: 2 / 5;
    grid-row: 3 / 4;
    color: #607086;
    font-size: 12px;
    font-weight: 800;
  }

  .public-roundup-duration,
  .public-roundup-arrow {
    color: #263241;
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
  }

  .public-roundup-duration {
    grid-column: 3 / 4;
    grid-row: 2 / 3;
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
    background: #f8fafc;
    outline: 1px solid #dce3eb;
    outline-offset: -1px;
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
    background:
      linear-gradient(rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.62)),
      url("https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=700&q=80") center / cover;
  }

  .public-complement-media img,
  .public-complement-media iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }

  .public-complement-media img {
    object-fit: cover;
    object-position: center;
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
    line-height: 1.15;
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

  .public-matchday-cover-side h3,
  .public-matchday-news h3 {
    padding-top: 8px;
    border-top: 4px solid #10151b;
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-news {
    padding-right: 0;
    border-right: 0;
  }

  .public-news-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .public-news-list li {
    display: grid;
    gap: 4px;
    padding: 10px 0;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-news-list time {
    color: #c40012;
    font-size: 12px;
    font-weight: 900;
  }

  .public-news-list span {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 17px;
    line-height: 1.15;
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    width: min(820px, 100%);
    margin: 0 auto;
    padding: 14px 16px;
    border: 1px solid #e3e9f0;
    border-radius: 8px;
    background: #ffffff;
  }

  .public-matchday-card-finished {
    border-color: #cfe5d7;
    background: #fbfffc;
  }

  .public-matchday-card-live {
    border-color: #f5c2c7;
    background: #fff8f8;
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
    gap: 10px;
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
    font-size: 18px;
  }

  .public-matchday-team small,
  .public-matchday-score small {
    display: block;
    margin-top: 4px;
    color: #66717f;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .public-matchday-team-winner strong {
    color: #137a3a;
  }

  .public-team-badge {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 34px;
    height: 34px;
    overflow: hidden;
    border: 1px solid #d8dee6;
    border-radius: 999px;
    background: #f8fafc;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
  }

  .public-team-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .public-matchday-score {
    min-width: 86px;
    text-align: center;
  }

  .public-matchday-score strong {
    font-size: 24px;
    letter-spacing: 0;
  }

  .public-matchday-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: #eef2f6;
  }

  .public-matchday-status-finished {
    background: #eaf7ef;
    color: #137a3a;
  }

  .public-matchday-status-live {
    background: #fee2e2;
    color: #b4232b;
  }

  .public-matchday-status-halftime {
    background: #fff0d8;
    color: #8a3a00;
  }

  .public-matchday-status-scheduled {
    background: #eef2f6;
    color: #506075;
  }

  .public-matchday-meta {
    grid-column: 1 / -1;
    justify-content: center;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: #607086;
    font-size: 13px;
  }

  .public-matchday-tv {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 7px;
    border: 1px solid #dce3eb;
    border-radius: 999px;
    background: #ffffff;
    color: #263241;
    font-weight: 800;
  }

  .public-matchday-tv img {
    width: 28px;
    height: 18px;
    object-fit: contain;
  }

  .public-matchday-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    min-width: 0;
    padding: 0;
    overflow-x: auto;
    border-top: 2px solid #10151b;
    border-bottom: 0;
    background: #ffffff;
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
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-matchday-nav a[aria-current="page"] {
    border-color: #c40012;
    background: #c40012;
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

  @media (max-width: 760px) {
    .public-matchday-shell {
      padding: 0 16px 16px;
    }

    .public-top-stack {
      margin: 0 -16px;
      padding: 0 16px;
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

    .public-site-menu,
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
    }

    .public-cover-headline,
    .public-matchday-main-lower {
      grid-template-columns: 1fr;
    }

    .public-cover-story-strip {
      grid-template-columns: 1fr;
    }

    .public-cover-channel-list li {
      grid-template-columns: 1fr;
    }

    .public-cover-tv-channel,
    .public-cover-tv-empty {
      justify-content: flex-start;
      text-align: left;
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
    flex-wrap: wrap;
    gap: 8px 18px;
    align-items: center;
    min-height: 52px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 0;
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

function formatCivilDate(value: string | null) {
  const date = parseCivilDate(value);
  return date ? `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}/${date.year}` : null;
}

function formatKickoff(scheduledDate: string | null, value: string | null) {
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
  return dateLabel ? `${dateLabel} · HORA POR DEFINIR` : "DATA E HORA POR DEFINIR";
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

function formatBroadcastGuideKickoff(scheduledDate: string | null, value: string | null) {
  if (!value) {
    const date = parseCivilDate(scheduledDate);
    return date
      ? `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")} · Hora por definir`
      : "DATA E HORA POR DEFINIR";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatBroadcastGuideKickoff(scheduledDate, null);

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon"
  }).format(date);
}

function compareMatchSchedule(first: PublicSeasonMatch, second: PublicSeasonMatch) {
  if (first.scheduled_date !== second.scheduled_date) {
    if (first.scheduled_date === null) return 1;
    if (second.scheduled_date === null) return -1;
    const dateDifference = first.scheduled_date.localeCompare(second.scheduled_date);
    if (dateDifference !== 0) return dateDifference;
  }

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

function statusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "finished") return "Finalizado";
  if (normalized === "scheduled") return "Agendado";
  if (normalized === "live") return "Em direto";
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
  return "scheduled";
}

function matchResult(match: PublicSeasonMatch) {
  const hasScore = match.home_score !== null && match.away_score !== null;
  const kind = statusKind(match.status);
  if ((kind !== "finished" && kind !== "live" && kind !== "halftime") || !hasScore) {
    return "vs";
  }

  return `${match.home_score} - ${match.away_score}`;
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

function shortTeamLabel(name?: string | null, shortName?: string | null) {
  return shortName || name || "Equipa";
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

function TeamBadge({ logoUrl, name, shortName }: { logoUrl?: string | null; name?: string | null; shortName?: string | null }) {
  return (
    <span className="public-team-badge" aria-hidden="true">
      {logoUrl ? <img alt="" src={logoUrl} /> : teamInitials(name, shortName)}
    </span>
  );
}

function BroadcastBadge({ match }: { match: PublicSeasonMatch }) {
  if (!match.broadcastChannel) {
    return null;
  }

  return (
    <span className="public-matchday-tv">
      {match.broadcastChannel.logo_url ? <img alt="" src={match.broadcastChannel.logo_url} /> : null}
      <span>{match.broadcastChannel.name}</span>
    </span>
  );
}

function MiniBroadcastBadge({ match }: { match: PublicSeasonMatch }) {
  if (!match.broadcastChannel) {
    return null;
  }

  return (
    <span className="public-matchday-mini-tv">
      {match.broadcastChannel.logo_url ? <img alt="" src={match.broadcastChannel.logo_url} /> : null}
      <span>{match.broadcastChannel.name}</span>
    </span>
  );
}

function CompactMatchCard({ match, focus }: { match: PublicSeasonMatch; focus?: boolean }) {
  const kind = statusKind(match.status);
  const statusText = match.minute && (kind === "live" || kind === "halftime") ? `${statusLabel(match.status)} - ${match.minute}'` : statusLabel(match.status);
  const showKickoffTime = kind === "scheduled";
  const kickoffDateTime = match.kickoff_at ?? match.scheduled_date;
  const undatedLabel = match.matchday?.number ? `J${match.matchday.number} · A DEFINIR` : "A DEFINIR";
  const undatedAccessibleLabel = match.matchday?.number
    ? `Jornada ${match.matchday.number}, data e hora por definir`
    : "Data e hora por definir";

  return (
    <article className={`public-matchday-mini-card public-matchday-mini-card-${kind}`} data-live-focus={focus ? "true" : undefined}>
      <span className="public-matchday-mini-team">
        <TeamBadge logoUrl={match.homeTeam?.logo_url} name={match.homeTeam?.name} shortName={match.homeTeam?.short_name} />
        <span>{shortTeamLabel(match.homeTeam?.name, match.homeTeam?.short_name)}</span>
      </span>
      <strong>{matchResult(match)}</strong>
      <span className="public-matchday-mini-team">
        <span>{shortTeamLabel(match.awayTeam?.name, match.awayTeam?.short_name)}</span>
        <TeamBadge logoUrl={match.awayTeam?.logo_url} name={match.awayTeam?.name} shortName={match.awayTeam?.short_name} />
      </span>
      <span className={`public-matchday-mini-status public-matchday-status-${statusKind(match.status)}`}>
        <span>{statusText}</span>
        {showKickoffTime ? (
          kickoffDateTime ? (
            <time className="public-matchday-mini-time" dateTime={kickoffDateTime}>{formatBroadcastGuideKickoff(match.scheduled_date, match.kickoff_at)}</time>
          ) : (
            <span className="public-matchday-mini-time" aria-label={undatedAccessibleLabel}>{undatedLabel}</span>
          )
        ) : null}
        <MiniBroadcastBadge match={match} />
      </span>
    </article>
  );
}

function MatchCard({ match }: { match: PublicSeasonMatch }) {
  const kind = statusKind(match.status);
  const statusText = match.minute && (kind === "live" || kind === "halftime") ? `${statusLabel(match.status)} - ${match.minute}'` : statusLabel(match.status);
  const homeWinner = isWinner(match, "home");
  const awayWinner = isWinner(match, "away");

  return (
    <article className={`public-matchday-card public-matchday-card-${kind}`} key={match.id}>
      <div className={`public-matchday-team ${homeWinner ? "public-matchday-team-winner" : ""}`}>
        <div className="public-matchday-team-copy">
          <strong>{match.homeTeam?.name ?? "Equipa da casa"}</strong>
          <small>Casa</small>
        </div>
        <TeamBadge logoUrl={match.homeTeam?.logo_url} name={match.homeTeam?.name} shortName={match.homeTeam?.short_name} />
      </div>
      <div className="public-matchday-score">
        <strong>{matchResult(match)}</strong>
        <small className={`public-matchday-status public-matchday-status-${kind}`}>{statusText}</small>
      </div>
      <div className={`public-matchday-team ${awayWinner ? "public-matchday-team-winner" : ""}`}>
        <TeamBadge logoUrl={match.awayTeam?.logo_url} name={match.awayTeam?.name} shortName={match.awayTeam?.short_name} />
        <div className="public-matchday-team-copy">
          <strong>{match.awayTeam?.name ?? "Equipa visitante"}</strong>
          <small>Fora</small>
        </div>
      </div>
      <div className="public-matchday-meta">
        <span>{formatKickoff(match.scheduled_date, match.kickoff_at)}</span>
        {match.venue ? <span>{match.venue}</span> : null}
        <BroadcastBadge match={match} />
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

export default async function PublicMatchdayPage({ params }: PublicMatchdayPageProps) {
  const { competitionSlug, seasonLabel, matchdayNumber } = await params;
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
  const seasonOptions = context.seasons.map((season) => ({
    id: season.id,
    label: season.label,
    href: `/competicoes/${context.competition.slug}/${seasonLabelToUrlSegment(season.label)}/jornadas/1`
  }));
  const currentSeasonHref = `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/1`;
  const classificationRows = buildAccumulatedClassification({
    participants: context.participants,
    matches: context.matchesForSeason,
    matchdays: context.matchdays,
    selectedMatchday: context.matchday
  });
  const matchdayHref = (number: number) => `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/${number}`;
  const liveMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "live");
  const halftimeMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "halftime");
  const finishedMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "finished");
  const scheduledMatches = context.matchesForMatchday.filter((match) => statusKind(match.status) === "scheduled");
  const selectedMatchdayDateContext = formatMatchdayDateContext(context.matchesForMatchday);
  const publishedHeadline = context.editorial?.status === "published" ? context.editorial : null;
  const belowHeadlineMode = context.editorial?.below_headline_mode === "roundup" ? "roundup" : "highlights";
  const complementaryMode = context.editorial?.complementary_mode ?? "none";
  const focusedStripMatch = liveMatches[0] ?? halftimeMatches[0] ?? null;
  const nextScheduledMatches = [...scheduledMatches]
    .sort(compareMatchSchedule)
    .slice(0, 4);
  const broadcastGuideItems =
    nextScheduledMatches.length > 0
      ? nextScheduledMatches.map((match) => ({
          id: match.id,
          game: `${match.homeTeam?.short_name || match.homeTeam?.name || "Casa"} vs ${match.awayTeam?.short_name || match.awayTeam?.name || "Fora"}`,
          kickoffLabel: formatBroadcastGuideKickoff(match.scheduled_date, match.kickoff_at),
          kickoffDateTime: match.kickoff_at ?? match.scheduled_date,
          channelName: match.broadcastChannel?.name || "TV por definir",
          channelLogoUrl: match.broadcastChannel?.logo_url || null
        }))
      : [
          {
            id: "placeholder-mallorca-barcelona",
            game: "RCD Mallorca vs FC Barcelona",
            kickoffLabel: "16/08, 19:30",
            kickoffDateTime: null,
            channelName: "DAZN 1",
            channelLogoUrl: null
          },
          {
            id: "placeholder-valencia-real-sociedad",
            game: "Valencia CF vs Real Sociedad",
            kickoffLabel: "16/08, 21:30",
            kickoffDateTime: null,
            channelName: "Sport TV 2",
            channelLogoUrl: null
          },
          {
            id: "placeholder-real-madrid-osasuna",
            game: "Real Madrid vs CA Osasuna",
            kickoffLabel: "19/08, 21:00",
            kickoffDateTime: null,
            channelName: "DAZN 1",
            channelLogoUrl: null
          }
        ];

  return (
    <main className="public-matchday-shell">
      <style>{publicMatchdayStyles}</style>
      <div className="public-top-stack">
      <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
        <a className="public-site-brand" href="/">
          Jornada<span>.pt</span>
        </a>
        <nav className="public-site-menu" aria-label="Competições principais">
          <a aria-current="page" href={`/competicoes/${context.competition.slug}/${seasonSegment}`}>{context.competition.name}</a>
          <a href="/competicoes/liga-portugal/2025-26">Liga Portugal</a>
          <a href="/competicoes/liga-espanha/2026-27">La Liga</a>
          <a href="/competicoes/premier-league/2025-26">Premier League</a>
          <a href="#jogos">Jogos</a>
          <a href="#classificacao">Classificação</a>
        </nav>
        <div className="public-site-actions" aria-label="Ações">
          <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
          <a href="/admin/gestor">Entrar</a>
        </div>
      </header>
      <section className="public-season-nav-bar" aria-label="Navegacao de jornadas">
        <div className="public-hidden-heading">
          <h2>Jornadas</h2>
          <p>Navegação principal da época {context.season.label}.</p>
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
        <nav className="public-matchday-nav">
          {context.matchdays.map((matchday) => (
            <a
              aria-current={matchday.id === context.matchday.id ? "page" : undefined}
              href={matchdayHref(matchday.number)}
              key={matchday.id}
            >
              J{String(matchday.number).padStart(2, "0")}
            </a>
          ))}
        </nav>
        <div className="public-matchday-date-row" aria-label="Data da jornada selecionada">
          <span className="public-matchday-date-context">
            {selectedMatchdayDateContext}
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

      <section className="public-matchday-panel public-matchday-scoreboard-panel" aria-label="Visao rapida dos jogos">
        <div className="public-matchday-strip-shell">
          <button className="public-matchday-strip-button" data-strip-scroll="left" type="button" aria-label="Ver jogos anteriores">
            ‹
          </button>
          <div className="public-matchday-strip" data-matchday-strip>
            {context.matchesForMatchday.length > 0 ? (
              context.matchesForMatchday.map((match) => (
                <CompactMatchCard focus={focusedStripMatch?.id === match.id} key={match.id} match={match} />
              ))
            ) : (
              <p>Ainda nao ha jogos nesta jornada.</p>
            )}
          </div>
          <button className="public-matchday-strip-button" data-strip-scroll="right" type="button" aria-label="Ver jogos seguintes">
            ›
          </button>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener("DOMContentLoaded", function () {
                var strip = document.querySelector("[data-matchday-strip]");
                if (!strip) return;
                var focused = strip.querySelector("[data-live-focus='true']");
                if (focused && "scrollIntoView" in focused) {
                  focused.scrollIntoView({ block: "nearest", inline: "center" });
                }
                document.querySelectorAll("[data-strip-scroll]").forEach(function (button) {
                  button.addEventListener("click", function () {
                    var direction = button.getAttribute("data-strip-scroll") === "left" ? -1 : 1;
                    strip.scrollBy({ left: direction * Math.max(260, Math.round(strip.clientWidth * 0.85)), behavior: "smooth" });
                  });
                });
              });
            `
          }}
        />
      </section>

      <section className="public-matchday-panel" aria-label="Capa da jornada">
        <div className="public-matchday-cover">
          <aside className="public-matchday-feature" aria-label="Informação em destaque">
            <div>
              <h3>Informação em destaque</h3>
            </div>
            <div className="public-cover-support">
              <h4>Onde ver</h4>
              <ul className="public-cover-channel-list">
                {broadcastGuideItems.map((item) => (
                  <li key={item.id}>
                    <span className="public-cover-tv-game">
                      <strong>{item.game}</strong>
                      <span className="public-cover-tv-meta">
                        {item.kickoffDateTime ? (
                          <time dateTime={item.kickoffDateTime}>{item.kickoffLabel}</time>
                        ) : (
                          <span>{item.kickoffLabel}</span>
                        )}
                        <span className="public-cover-tv-channel">
                          {item.channelLogoUrl ? <img alt="" src={item.channelLogoUrl} /> : <span className="public-cover-tv-channel-logo">{item.channelName}</span>}
                          {item.channelLogoUrl ? <span>{item.channelName}</span> : null}
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          <div className="public-matchday-main-column">
            <article className="public-matchday-editorial">
              <div className="public-cover-headline">
                {publishedHeadline?.image_url ? (
                  <div className="public-editorial-main-image">
                    <img src={publishedHeadline.image_url} alt="" />
                  </div>
                ) : null}
                <div>
                  <h2 style={publishedHeadline?.title_color ? { color: publishedHeadline.title_color } : undefined}>
                    {publishedHeadline?.title || "Manchete da jornada"}
                  </h2>
                  <p>{publishedHeadline?.summary || "Espaço reservado para a leitura editorial desta jornada."}</p>
                </div>
              </div>
            </article>
            <div className="public-matchday-main-lower">
              {complementaryMode === "roundup_video" ? (
                <RoundupVideoSwitcher
                  items={context.roundupItems}
                  initialItemId={context.editorial?.complementary_roundup_item_id ?? null}
                />
              ) : (
                <>
              <section
                className={`public-matchday-roundup public-below-headline-${belowHeadlineMode} public-editorial-flex-block`}
                data-editorial-slot="videos-ou-noticias"
                aria-label="Zona editorial abaixo da manchete"
              >
                <div className="public-editorial-block-head">
                  <a href="#jogos">Ver todos</a>
                </div>
                <div className="public-cover-story-strip" aria-label="Resumos e destaques da jornada">
              {belowHeadlineMode === "highlights" ? (
                context.highlights.length > 0 ? (
                  context.highlights.map((highlight) => {
                    const imageUrl = highlight.image_url?.trim();
                    return (
                      <article className="public-cover-story" key={highlight.id}>
                        <div className="public-highlight-image">
                          {imageUrl ? <img src={imageUrl} alt="" /> : null}
                        </div>
                        {highlight.label ? <span>{highlight.label}</span> : null}
                        <strong>{highlight.title}</strong>
                      </article>
                    );
                  })
                ) : (
                  <>
                    <article className="public-cover-story">
                      <div className="public-highlight-image">
                        <img
                          src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=700&q=80"
                          alt=""
                        />
                      </div>
                      <span>Antevisão</span>
                      <strong>Os pontos de atenção antes da bola rolar</strong>
                    </article>
                    <article className="public-cover-story">
                      <div className="public-highlight-image">
                        <img
                          src="https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=700&q=80"
                          alt=""
                        />
                      </div>
                      <span>Ambiente</span>
                      <strong>A jornada vista pelas bancadas e pelos protagonistas</strong>
                    </article>
                    <article className="public-cover-story">
                      <div className="public-highlight-image">
                        <img
                          src="https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=700&q=80"
                          alt=""
                        />
                      </div>
                      <span>Contexto</span>
                      <strong>O que pode mudar na tabela depois dos resultados</strong>
                    </article>
                  </>
                )
              ) : context.roundupItems.length > 0 ? (
                context.roundupItems.map((item) => {
                  const showPlay = Boolean(item.video_url) || item.type === "video" || item.type === "golos" || item.type === "resumo";
                  const imageUrl = item.image_url?.trim();
                  return (
                    <article className="public-cover-story" key={item.id}>
                      <div className="public-highlight-image">
                        {imageUrl ? <img src={imageUrl} alt="" /> : null}
                        {showPlay ? <span className="public-media-play" aria-hidden="true">▶</span> : null}
                      </div>
                      {item.label ? <span>{item.label}</span> : null}
                      <strong>{item.title}</strong>
                      {item.subtitle ? <small>{item.subtitle}</small> : null}
                      {item.duration ? <span className="public-roundup-duration">{item.duration}</span> : null}
                      {item.video_url ? (
                        <a className="public-roundup-arrow" href={item.video_url} aria-label="Abrir conteudo do resumo">
                          ›
                        </a>
                      ) : (
                        <span className="public-roundup-arrow" aria-hidden="true">›</span>
                      )}
                    </article>
                  );
                })
              ) : (
                <>
                  <article className="public-cover-story">
                    <div className="public-highlight-image">
                      <img
                        src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=700&q=80"
                        alt=""
                      />
                      <span className="public-media-play" aria-hidden="true">▶</span>
                    </div>
                    <span>Antevisão</span>
                    <strong>Os pontos de atenção antes da bola rolar</strong>
                    <small>Resumo completo</small>
                    <span className="public-roundup-duration">5:42</span>
                    <span className="public-roundup-arrow" aria-hidden="true">›</span>
                  </article>
                  <article className="public-cover-story">
                    <div className="public-highlight-image">
                      <img
                        src="https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=700&q=80"
                        alt=""
                      />
                      <span className="public-media-play" aria-hidden="true">▶</span>
                    </div>
                    <span>Ambiente</span>
                    <strong>A jornada vista pelas bancadas e pelos protagonistas</strong>
                    <small>Golos e melhores momentos</small>
                    <span className="public-roundup-duration">4:18</span>
                    <span className="public-roundup-arrow" aria-hidden="true">›</span>
                  </article>
                  <article className="public-cover-story">
                    <div className="public-highlight-image">
                      <img
                        src="https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=700&q=80"
                        alt=""
                      />
                      <span className="public-media-play" aria-hidden="true">▶</span>
                    </div>
                    <span>Contexto</span>
                    <strong>O que pode mudar na tabela depois dos resultados</strong>
                    <small>Notícia de contexto</small>
                    <span className="public-roundup-duration">6:21</span>
                    <span className="public-roundup-arrow" aria-hidden="true">›</span>
                  </article>
                </>
              )}
                </div>
                <a className="public-editorial-more-link" href="#jogos">
                  {belowHeadlineMode === "roundup" ? "Ver mais vídeos e golos" : "Ver mais destaques"} <span aria-hidden="true">›</span>
                </a>
              </section>
              <aside className="public-matchday-cover-side public-editorial-flex-block" data-editorial-slot="video-ou-imagem-noticia" aria-label="Bloco complementar da jornada">
                {complementaryMode === "complementary_story" && context.editorial?.complementary_status === "published" ? (
                  <>
                    {context.editorial.complementary_image_url ? (
                      <div className="public-complement-media">
                        <img src={context.editorial.complementary_image_url} alt="" />
                      </div>
                    ) : null}
                    <div className="public-complement-body">
                      {context.editorial.complementary_label ? (
                        <span className="public-complement-label">{context.editorial.complementary_label}</span>
                      ) : null}
                      {context.editorial.complementary_title ? (
                        context.editorial.complementary_link_url ? (
                          <a className="public-complement-title-link" href={context.editorial.complementary_link_url}>
                            <strong>{context.editorial.complementary_title}</strong>
                          </a>
                        ) : (
                          <strong>{context.editorial.complementary_title}</strong>
                        )
                      ) : null}
                      {context.editorial.complementary_text ? <p>{context.editorial.complementary_text}</p> : null}
                      {context.editorial.complementary_link_url ? (
                        <a className="public-editorial-more-link" href={context.editorial.complementary_link_url}>
                          Ver mais <span aria-hidden="true">›</span>
                        </a>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="public-complement-body">
                    <strong>Espaço editorial preparado</strong>
                    <p>Bloco complementar por definir.</p>
                  </div>
                )}
              </aside>
                </>
              )}
            </div>
          </div>
          <aside className="public-matchday-news" aria-label="Últimas notícias">
            <h3>Últimas notícias</h3>
            <ul className="public-news-list">
              <li>
                <time dateTime="12:30">12:30</time>
                <span>Mercado aquece antes da jornada europeia</span>
              </li>
              <li>
                <time dateTime="12:45">12:45</time>
                <span>Treinador confirma alterações no onze</span>
              </li>
              <li>
                <time dateTime="13:10">13:10</time>
                <span>Adeptos esgotam bilhetes para o clássico</span>
              </li>
            </ul>
          </aside>
        </div>
      </section>

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
              {classificationRows.map((row, index) => (
                <tr key={row.teamId}>
                  <td>{index + 1}</td>
                  <td className="public-table-club">
                    <span className="public-club-cell">
                    <span className="public-club-name">{row.name}</span>
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


