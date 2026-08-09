import {
  buildAccumulatedClassification,
  STAT_COLUMNS,
  totalClassificationStats,
  type ClassificationRow,
  type ClassificationSplit
} from "@/lib/classification";
import { getPublicLiveMinute } from "@/lib/live-match-clock";
import Link from "next/link";
import {
  buildSeasonParticipantPlan,
  type SeasonParticipantPlanSummary
} from "@/lib/season-participant-list";
import {
  fetchSupabaseAdminTable,
  getAdminSeasonParticipants,
  getAdminSeasons,
  type SupabaseAdminSeasonTeam,
  type SupabaseCompetition,
  type SupabaseCountry,
  type SupabaseSeason,
  type SupabaseTeam
} from "@/lib/supabase";
import { CalendarImportTool } from "./CalendarImportTool";
import { ContextSelector } from "./ContextSelector";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type CountryTeam = SupabaseTeam & {
  country_id: string | null;
};
type UnassignedTeam = Pick<CountryTeam, "id" | "name" | "short_name" | "slug" | "country_id">;
type ClubPreviewTeam = Pick<CountryTeam, "id" | "name" | "short_name" | "slug" | "code" | "country_id" | "logo_url" | "primary_color">;
type TeamAlias = {
  team_id: string;
  normalized_alias: string;
};
type SeasonMatchday = {
  id: string;
  season_id: string;
  number: number;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
};
type SeasonAgendaMatch = {
  id: string;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  scheduled_date: string | null;
  kickoff_at: string | null;
  venue: string | null;
  status: string;
  minute: number | null;
  live_started_at: string | null;
  live_base_minute: number | null;
  is_clock_running: boolean | null;
  home_score: number | null;
  away_score: number | null;
  broadcast_channel_id: string | null;
};
type BlockingMatch = Pick<SeasonAgendaMatch, "id" | "season_id" | "matchday_id" | "home_team_id" | "away_team_id">;
type ClubApplySummary = SeasonParticipantPlanSummary;
const managerStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .manager-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .manager-hero {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 20px;
    padding: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #10151b, #25303c);
    color: #ffffff;
    box-shadow: 0 18px 40px rgba(8, 15, 24, 0.16);
  }

  .manager-hero p,
  .manager-hero h1,
  .manager-hero span {
    margin: 0;
  }

  .manager-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-hero h1 {
    margin-top: 8px;
    font-size: 42px;
    line-height: 1;
  }

  .manager-hero > div:first-child {
    flex: 1 1 520px;
    min-width: min(100%, 360px);
  }

  .manager-hero span {
    display: block;
    margin-top: 10px;
    max-width: 780px;
    color: #cdd5df;
    font-size: 16px;
  }

  .manager-hero-actions {
    display: flex;
    flex: 1 1 420px;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    max-width: 640px;
  }

  .manager-hero a,
  .manager-hero .manager-disabled-link,
  .manager-button,
  .manager-link-button {
    display: inline-block;
    flex: 0 0 auto;
    padding: 12px 16px;
    border: 0;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
  }

  .manager-hero a {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: transparent;
  }

  .manager-hero .manager-disabled-link {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: transparent;
    opacity: 0.52;
    cursor: not-allowed;
    pointer-events: none;
  }

  .manager-subtle-button {
    display: inline-block;
    align-self: flex-start;
    flex: 0 0 auto;
    padding: 8px 12px;
    border: 1px solid #c8d2dd;
    border-radius: 6px;
    background: #ffffff;
    color: #263241;
    font: inherit;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
    cursor: pointer;
  }

  .manager-clipboard-message {
    margin: -4px 0 0;
    color: #66717f;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.4;
  }

  .manager-button:disabled,
  .manager-link-button:disabled,
  .manager-link-button[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .manager-context,
  .manager-panel,
  .manager-warning {
    margin-top: 18px;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .manager-workspace {
    display: flex;
    flex-direction: column;
  }

  .manager-section-base {
    order: 9;
  }

  .manager-section-clubs {
    order: 8;
  }

  .manager-section-participants {
    order: 2;
  }

  .manager-section-calendar {
    order: 3;
  }

  .manager-section-matches {
    order: 4;
  }

  .manager-section-standings {
    order: 5;
  }

  .manager-section-editorial {
    order: 6;
    border-style: dashed;
    background: #fbfcfe;
    box-shadow: none;
  }

  .manager-section-maintenance {
    order: 10;
  }

  .manager-section-prepare {
    order: 1;
  }

  .manager-section-maintenance .manager-create-card {
    background: #ffffff;
  }

  .manager-section-base,
  .manager-section-maintenance {
    box-shadow: none;
  }

  .manager-section-base {
    border-style: dashed;
  }

  .manager-support-section,
  .manager-fallback-card,
  .manager-manual-actions {
    border: 1px solid #d8dee6;
    background: #f6f8fa;
    box-shadow: none;
  }

  .manager-support-section .manager-create-card {
    border-color: #dfe5ec;
    background: #ffffff;
  }

  .manager-section-base > summary,
  .manager-section-maintenance > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    color: #4d5866;
    cursor: pointer;
    list-style: none;
  }

  .manager-section-base > summary::-webkit-details-marker,
  .manager-section-maintenance > summary::-webkit-details-marker {
    display: none;
  }

  .manager-section-base > summary::after,
  .manager-section-maintenance > summary::after {
    content: "+";
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid #cbd3dd;
    border-radius: 999px;
    background: #ffffff;
    color: #5f6b7a;
    font-weight: 900;
  }

  .manager-section-base[open] > summary,
  .manager-section-maintenance[open] > summary {
    border-bottom: 1px solid #d8dee6;
  }

  .manager-section-base[open] > summary::after,
  .manager-section-maintenance[open] > summary::after {
    content: "-";
  }

  .manager-section-base > summary strong,
  .manager-section-maintenance > summary strong {
    display: block;
    font-size: 15px;
    text-transform: uppercase;
  }

  .manager-section-base > summary small,
  .manager-section-maintenance > summary small {
    display: block;
    margin-top: 3px;
    color: #66717f;
    font-size: 12px;
    line-height: 1.3;
  }

  .manager-section-maintenance .manager-summary-grid,
  .manager-section-maintenance .manager-create-grid {
    padding: 12px 16px 16px;
  }

  .manager-section-maintenance .manager-create-card {
    gap: 10px;
    padding: 12px;
  }

  .manager-primary-card {
    order: 1;
  }

  .manager-fallback-card {
    order: 2;
  }

  .manager-future-card {
    border-style: dashed;
    background: #f8fafc;
    box-shadow: none;
  }

  .manager-compact-participants {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-compact-participants li {
    padding: 7px 10px;
    border: 1px solid #dce3eb;
    border-radius: 999px;
    background: #f8fafc;
    color: #263241;
    font-size: 13px;
    font-weight: 800;
  }

  .manager-calendar-future,
  .manager-jornada-selector {
    order: 1;
  }

  .manager-calendar-list,
  .manager-match-summary {
    order: 2;
  }

  .manager-calendar-fallback,
  .manager-match-scheduled {
    order: 3;
  }

  .manager-match-live {
    order: 4;
  }

  .manager-match-finished {
    order: 5;
  }

  .manager-match-form {
    order: 6;
  }

  .manager-section-clubs {
  }

  .manager-section-clubs > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    color: #4d5866;
    cursor: pointer;
    list-style: none;
  }

  .manager-section-clubs > summary::-webkit-details-marker {
    display: none;
  }

  .manager-section-clubs > summary::after {
    content: "+";
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid #cbd3dd;
    border-radius: 999px;
    background: #ffffff;
    color: #5f6b7a;
    font-weight: 900;
  }

  .manager-section-clubs[open] > summary {
    border-bottom: 1px solid #d8dee6;
  }

  .manager-section-clubs[open] > summary::after {
    content: "-";
  }

  .manager-section-clubs > summary strong {
    display: block;
    font-size: 15px;
    text-transform: uppercase;
  }

  .manager-section-clubs > summary small {
    display: block;
    margin-top: 3px;
    color: #66717f;
    font-size: 12px;
    line-height: 1.3;
  }

  .manager-section-clubs > header {
    background: #f6f8fa;
  }

  .manager-section-prepare {
    border-color: #cddfeb;
    box-shadow: 0 14px 28px rgba(12, 22, 34, 0.08);
  }

  .manager-section-prepare > header {
    background: #f7fbff;
  }

  .manager-section-editorial > header {
    background: #f8fafc;
  }

  .manager-editorial-page {
    display: grid;
    gap: 14px;
  }

  .manager-editorial-page > header {
    display: grid;
    gap: 4px;
    padding: 14px;
    border: 1px solid #d8dee6;
    border-radius: 6px;
    background: #ffffff;
  }

  .manager-editorial-page > header h3,
  .manager-editorial-page > header p,
  .manager-editorial-block h4,
  .manager-editorial-block p,
  .manager-editorial-note-list {
    margin: 0;
  }

  .manager-editorial-block {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid #d8dee6;
    border-radius: 6px;
    background: #ffffff;
  }

  .manager-editorial-block > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .manager-editorial-block-number {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #10151b;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
  }

  .manager-editorial-block h4 {
    font-size: 15px;
    text-transform: uppercase;
  }

  .manager-editorial-block p,
  .manager-editorial-page > header p,
  .manager-editorial-note-list {
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .manager-editorial-placeholder {
    border-style: dashed;
    background: #f8fafc;
  }

  .manager-editorial-note-list {
    display: grid;
    gap: 8px;
    padding-left: 18px;
  }

  .manager-warning {
    padding: 18px 20px;
    border-color: #ffd3a3;
    background: #fff8ee;
    color: #6a3d00;
  }

  .manager-warning h2,
  .manager-warning p,
  .manager-message p {
    margin: 0;
  }

  .manager-warning p {
    margin-top: 8px;
    color: #6a3d00;
  }

  .manager-context header,
  .manager-panel header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
  }

  .manager-context h2,
  .manager-panel h2,
  .manager-context p,
  .manager-panel p {
    margin: 0;
  }

  .manager-context h2,
  .manager-panel h2 {
    font-size: 21px;
    text-transform: uppercase;
  }

  .manager-context p,
  .manager-panel p {
    margin-top: 6px;
    color: #687380;
  }

  .manager-form {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 12px;
    align-items: end;
    padding: 18px 20px;
  }

  .manager-field {
    display: grid;
    gap: 6px;
  }

  .manager-field label {
    color: #5e6874;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-field select,
  .manager-field input,
  .manager-field textarea {
    width: 100%;
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 16px;
  }

  .manager-field textarea {
    min-height: 156px;
    padding: 12px;
    resize: vertical;
  }

  .manager-field input[type="checkbox"] {
    width: 18px;
    min-height: 18px;
    padding: 0;
  }

  .manager-message {
    margin: 18px 0 0;
    padding: 13px 15px;
    border-radius: 8px;
    color: #174a28;
    background: #e9f8ef;
    font-weight: 700;
  }

  .manager-message.warning {
    color: #6a3d00;
    background: #fff4df;
  }

  .manager-panel > .manager-message {
    margin: 18px 20px 0;
  }

  .manager-path {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 0 20px 20px;
  }

  .manager-path article,
  .manager-stat {
    padding: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
  }

  .manager-path small,
  .manager-stat small {
    display: block;
    color: #687380;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-path strong {
    display: block;
    margin-top: 8px;
    min-width: 0;
    overflow: hidden;
    font-size: 21px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-create-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding: 18px 20px;
  }

  .manager-create-card {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
  }

  .manager-create-card header {
    padding: 0;
    border: 0;
  }

  .manager-card-heading-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .manager-create-card h3,
  .manager-create-card p {
    margin: 0;
  }

  .manager-create-card h3 {
    font-size: 16px;
    text-transform: uppercase;
  }

  .manager-create-card p {
    margin-top: 5px;
    color: #687380;
    font-size: 13px;
    line-height: 1.35;
  }

  .manager-wide-card {
    grid-column: 1 / -1;
  }

  .manager-create-form {
    display: grid;
    gap: 10px;
    align-items: end;
  }

  .manager-check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    color: #5e6874;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-stat-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
  }

  .manager-stat strong {
    display: block;
    color: #e5252a;
    font-size: 34px;
    line-height: 1;
  }

  .manager-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding: 18px 20px;
  }

  .manager-match-stat-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .manager-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 48px;
    padding: 10px 0;
    border-bottom: 1px solid #e6ebf1;
  }

  .manager-list li:last-child {
    border-bottom: 0;
  }

  .manager-list b {
    display: block;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-list small,
  .manager-list em {
    color: #687380;
    font-style: normal;
    font-size: 12px;
  }

  .manager-list .manager-match-list-item {
    grid-template-columns: minmax(220px, 1fr) minmax(0, 1.8fr) auto;
    gap: 12px;
    align-items: center;
    min-height: 0;
    padding: 8px 0;
  }

  .manager-match-summary-line {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  .manager-state-actions {
    align-items: end;
    justify-content: flex-start;
    gap: 8px;
    padding: 0;
  }

  .manager-state-actions .manager-score-field span {
    font-size: 10px;
  }

  .manager-state-actions .manager-score-field input,
  .manager-state-actions .manager-score-field select {
    min-height: 32px;
    font-size: 13px;
  }

  .manager-state-actions .manager-link-button {
    padding: 9px 10px;
    font-size: 11px;
  }

  .manager-match-secondary-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 0;
  }

  .manager-match-secondary-actions .manager-link-button {
    padding: 9px 10px;
    font-size: 11px;
  }

  .manager-danger-link {
    border: 1px solid #d7a3a3;
    background: #fff5f5;
    color: #9b1c1c;
  }

  .manager-matchday-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-matchday-card {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #fbfcfe;
  }

  .manager-matchday-card.is-selected {
    border-color: #b71c1c;
    background: #fff8f8;
  }

  .manager-matchday-card strong {
    display: block;
    overflow: hidden;
    color: #17202b;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-matchday-card small {
    color: #687380;
    font-size: 12px;
  }

  .manager-matchday-card code {
    display: inline-flex;
    width: fit-content;
    padding: 3px 7px;
    border-radius: 999px;
    background: #eef2f7;
    color: #263241;
    font-size: 12px;
    font-weight: 900;
  }

  .manager-matchday-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .manager-empty {
    padding: 10px 0;
    color: #687380;
  }

  .manager-table-wrap {
    overflow-x: auto;
  }

  .manager-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .manager-table th,
  .manager-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #e6ebf1;
    text-align: right;
    white-space: nowrap;
  }

  .manager-table th {
    color: #5e6874;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-table th:nth-child(2),
  .manager-table td:nth-child(2) {
    min-width: 160px;
    text-align: left;
  }

  .manager-goal-difference-positive,
  .manager-form-win {
    color: #15803d;
    font-weight: 900;
  }

  .manager-goal-difference-neutral,
  .manager-form-draw {
    color: #64748b;
    font-weight: 900;
  }

  .manager-goal-difference-negative,
  .manager-form-loss {
    color: #b91c1c;
    font-weight: 900;
  }

  .manager-form-list {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .manager-table .manager-table-group {
    background: #f8fafc;
    color: #263241;
    font-size: 11px;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .manager-table .manager-table-group-total {
    background: #fff7f7;
  }

  .manager-table .manager-table-points {
    font-weight: 900;
  }

  .manager-table .manager-table-divider-left {
    border-left: 2px solid #dce3eb;
  }

  .manager-classification-table {
    min-width: 1180px;
  }

  .manager-classification-table th,
  .manager-classification-table td {
    padding: 8px 6px;
  }

  .manager-classification-table thead tr:nth-child(2) th {
    min-width: 0;
    text-align: right;
  }

  .manager-classification-table tbody td:nth-child(2) {
    min-width: 300px;
    text-align: left;
  }

  .manager-classification-table .manager-form-list {
    min-width: 0;
  }

  .manager-classification-club-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }

  .manager-classification-club-name {
    min-width: 0;
    overflow: hidden;
    font-weight: 900;
    text-overflow: ellipsis;
  }

  .manager-classification-club-form {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
  }

  .manager-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 0 20px 20px;
  }

  .manager-list .manager-actions {
    justify-content: flex-end;
    padding: 0;
  }

  .manager-score-field {
    display: inline-grid;
    gap: 4px;
    color: #5e6874;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-score-field input,
  .manager-score-field select {
    width: 64px;
    min-height: 38px;
    padding: 0 8px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 15px;
  }

  .manager-score-field select {
    width: 128px;
  }

  .manager-finished-match {
    align-items: start;
  }

  .manager-finished-score {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: #17202b;
    font-size: 15px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-manual-actions {
    justify-self: end;
    min-width: min(360px, 100%);
    border-radius: 8px;
  }

  .manager-manual-actions summary {
    display: flex;
    cursor: pointer;
    padding: 9px 11px;
    color: #5b6673;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .manager-manual-actions .manager-actions {
    justify-content: flex-start;
    padding: 10px;
  }

  @media (max-width: 1180px) {
    .manager-form,
    .manager-path,
    .manager-create-grid,
    .manager-stat-row,
    .manager-summary-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 760px) {
    .manager-shell {
      padding: 16px;
    }

    .manager-hero,
    .manager-form,
    .manager-path,
    .manager-create-grid,
    .manager-stat-row,
    .manager-summary-grid {
      display: grid;
      grid-template-columns: 1fr;
    }

    .manager-hero a,
    .manager-hero .manager-disabled-link,
    .manager-button {
      width: 100%;
      text-align: center;
    }

    .manager-card-heading-row {
      display: grid;
      grid-template-columns: 1fr;
    }

    .manager-list .manager-match-list-item {
      grid-template-columns: 1fr;
    }

    .manager-match-secondary-actions {
      justify-content: flex-start;
    }
  }
`;

function oneParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function competitionCountryId(competition: SupabaseCompetition) {
  return competition.country_id ?? "";
}

function signedNumber(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function goalDifferenceClass(value: number) {
  return value > 0
    ? "manager-goal-difference-positive"
    : value < 0
      ? "manager-goal-difference-negative"
      : "manager-goal-difference-neutral";
}

function renderClassificationStatCells(
  stats: ClassificationSplit,
  options: { divider?: boolean; emphasizePoints?: boolean; group?: string } = {}
) {
  return STAT_COLUMNS.map((column, index) => {
    const value = stats[column.key];
    const className = [
      options.divider && index === 0 ? "manager-table-divider-left" : "",
      column.key === "goalDifference" ? goalDifferenceClass(value) : ""
    ]
      .filter(Boolean)
      .join(" ");

    if (column.key === "points") {
      return (
        <td className={className || undefined} key={`${options.group ?? "stats"}-${column.key}`}>
          <b className={options.emphasizePoints ? "manager-table-points" : undefined}>{value}</b>
        </td>
      );
    }

    return (
      <td className={className || undefined} key={`${options.group ?? "stats"}-${column.key}`}>
        {column.key === "goalDifference" ? signedNumber(value) : value}
      </td>
    );
  });
}

function renderClassificationStatHeaders(group: string) {
  return STAT_COLUMNS.map((column, index) => (
    <th className={index === 0 ? "manager-table-divider-left" : undefined} key={`${group}-${column.key}`}>
      {column.label}
    </th>
  ));
}

function buildContextQuery(country: SupabaseCountry | null, competition: SupabaseCompetition | null, season: SupabaseSeason | null) {
  const params = new URLSearchParams();

  if (country) params.set("pais", country.id);
  if (competition) params.set("competicao", competition.id);
  if (season) params.set("epoca", season.id);

  return params.toString();
}

function returnTo(country: SupabaseCountry | null, competition: SupabaseCompetition | null, season: SupabaseSeason | null) {
  const query = buildContextQuery(country, competition, season);
  return `/admin/gestor${query ? `?${query}` : ""}`;
}

function withSection(url: string, section: string) {
  const [pathAndQuery] = url.split("#");
  const separator = pathAndQuery.includes("?") ? "&" : "?";

  return `${pathAndQuery}${separator}section=${section}#${section}`;
}

function withQueryAndHash(url: string, values: Record<string, string>, hash: string) {
  const [pathAndQuery] = url.split("#");
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  const query = new URLSearchParams(values).toString();

  return `${pathAndQuery}${separator}${query}#${hash}`;
}

function buildMatchdayUrl(
  currentReturnTo: string,
  matchdayId: string,
  section: string
) {
  const [pathAndQuery] = currentReturnTo.split("#");
  const separator = pathAndQuery.includes("?") ? "&" : "?";

  return `${pathAndQuery}${separator}jornada=${matchdayId}&section=${section}#${section}`;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}T${byType.get("hour")}:${byType.get("minute")}`;
}

function formatLisbonDateTime(scheduledDate: string | null, kickoffAt: string | null) {
  const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate ?? "");
  const month = civil ? Number(civil[2]) : 0;
  const dateLabel = civil && month >= 1 && month <= 12 ? `${civil[3]} ${monthNames[month - 1]}` : null;
  if (kickoffAt) {
    const kickoff = new Date(kickoffAt);
    if (!Number.isNaN(kickoff.getTime())) {
      const time = new Intl.DateTimeFormat("pt-PT", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        minute: "2-digit"
      }).format(kickoff);
      return dateLabel ? `${dateLabel} · ${time}` : time;
    }
  }
  return dateLabel ? `${dateLabel} · HORA POR DEFINIR` : "DATA E HORA POR DEFINIR";
}

async function readTeamsForCountry(countryId?: string): Promise<CountryTeam[]> {
  if (!countryId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<CountryTeam>(
      `teams?select=id,name,short_name,slug,country_id,logo_url,primary_color&country_id=eq.${encodeURIComponent(
        countryId
      )}&order=name.asc`
    );
  } catch {
    return [];
  }
}

async function readTeamsForClubPreview(countryId?: string): Promise<ClubPreviewTeam[] | null> {
  if (!countryId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<ClubPreviewTeam>(
      `teams?select=id,name,short_name,slug,code,country_id,logo_url,primary_color&country_id=eq.${encodeURIComponent(
        countryId
      )}&order=name.asc&limit=2000`
    );
  } catch {
    return null;
  }
}

async function readTeamAliasesForTeams(teamIds: string[]): Promise<TeamAlias[] | null> {
  const uniqueTeamIds = Array.from(new Set(teamIds)).filter(Boolean);
  if (uniqueTeamIds.length === 0) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<TeamAlias>(
      `team_aliases?select=team_id,normalized_alias&team_id=in.(${uniqueTeamIds.map(encodeURIComponent).join(",")})&status=eq.active&limit=2000`
    );
  } catch {
    return null;
  }
}

async function readUnassignedTeams(): Promise<UnassignedTeam[]> {
  try {
    return await fetchSupabaseAdminTable<UnassignedTeam>(
      "teams?select=id,name,short_name,slug,country_id&country_id=is.null&order=name.asc&limit=200"
    );
  } catch {
    return [];
  }
}

async function readMatchdaysForSeason(seasonId?: string): Promise<SeasonMatchday[]> {
  if (!seasonId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<SeasonMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on,status&season_id=eq.${encodeURIComponent(
        seasonId
      )}&manual_override=is.true&order=number.asc`
    );
  } catch {
    return [];
  }
}

async function readMatchesForMatchday(matchdayId?: string): Promise<SeasonAgendaMatch[]> {
  if (!matchdayId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<SeasonAgendaMatch>(
      `matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,scheduled_date,kickoff_at,venue,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score,broadcast_channel_id&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&manual_override=is.true&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc`
    );
  } catch {
    return [];
  }
}

async function readMatchesForSeason(seasonId?: string): Promise<SeasonAgendaMatch[]> {
  if (!seasonId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<SeasonAgendaMatch>(
      `matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,scheduled_date,kickoff_at,venue,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score,broadcast_channel_id&season_id=eq.${encodeURIComponent(
        seasonId
      )}&manual_override=is.true&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc`
    );
  } catch {
    return [];
  }
}

async function readBlockingMatchdaysForSeason(seasonId?: string): Promise<SeasonMatchday[]> {
  if (!seasonId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<SeasonMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on,status&season_id=eq.${encodeURIComponent(
        seasonId
      )}&order=number.asc`
    );
  } catch {
    return [];
  }
}

async function readBlockingMatchesForSeason(seasonId?: string): Promise<BlockingMatch[]> {
  if (!seasonId) {
    return [];
  }

  try {
    return await fetchSupabaseAdminTable<BlockingMatch>(
      `matches?select=id,season_id,matchday_id,home_team_id,away_team_id&season_id=eq.${encodeURIComponent(seasonId)}`
    );
  } catch {
    return [];
  }
}

async function readBlockingMatchesForTeams(teamIds: string[]): Promise<BlockingMatch[]> {
  if (teamIds.length === 0) {
    return [];
  }

  const ids = teamIds.join(",");

  try {
    return await fetchSupabaseAdminTable<BlockingMatch>(
      `matches?select=id,season_id,matchday_id,home_team_id,away_team_id&or=(home_team_id.in.(${ids}),away_team_id.in.(${ids}))`
    );
  } catch {
    return [];
  }
}

function resolveSelectedContext({
  countries,
  competitions,
  seasons,
  requestedCountryId,
  requestedCompetitionId,
  requestedSeasonId
}: {
  countries: SupabaseCountry[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  requestedCountryId?: string;
  requestedCompetitionId?: string;
  requestedSeasonId?: string;
}) {
  const linkedCompetitions = competitions.filter((competition) => Boolean(competitionCountryId(competition)));
  const requestedSeason = seasons.find((season) => season.id === requestedSeasonId) ?? null;
  const requestedCompetition =
    linkedCompetitions.find((competition) => competition.id === requestedCompetitionId) ??
    linkedCompetitions.find((competition) => competition.id === requestedSeason?.competition_id) ??
    null;
  const firstCountryWithCompetition =
    countries.find((country) => linkedCompetitions.some((competition) => competitionCountryId(competition) === country.id)) ??
    countries[0] ??
    null;
  const selectedCountry =
    countries.find((country) => country.id === requestedCountryId) ??
    (requestedCompetition
      ? countries.find((country) => country.id === competitionCountryId(requestedCompetition)) ?? null
      : null) ??
    firstCountryWithCompetition;
  const competitionsForCountry = selectedCountry
    ? linkedCompetitions.filter((competition) => competitionCountryId(competition) === selectedCountry.id)
    : [];
  const selectedCompetition =
    competitionsForCountry.find((competition) => competition.id === requestedCompetition?.id) ??
    competitionsForCountry[0] ??
    null;
  const seasonsForCompetition = selectedCompetition
    ? seasons.filter((season) => season.competition_id === selectedCompetition.id)
    : [];
  const selectedSeason =
    seasonsForCompetition.find((season) => season.id === requestedSeasonId) ??
    seasonsForCompetition.find((season) => season.is_current) ??
    seasonsForCompetition[0] ??
    null;

  return {
    linkedCompetitions,
    selectedCountry,
    competitionsForCountry,
    selectedCompetition,
    seasonsForCompetition,
    selectedSeason
  };
}

export default async function AdminSeasonManagerPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const seasonData = await getAdminSeasons();
  const configured = seasonData.configured;
  const error = seasonData.error;
  const countries = seasonData.countries.filter((country) => country.is_active !== false);
  const competitions = seasonData.competitions.filter((competition) => competition.is_active !== false);
  const seasons = seasonData.seasons;
  const requestedCountryId = oneParam(params, "pais");
  const requestedCompetitionId = oneParam(params, "competicao");
  const requestedSeasonId = oneParam(params, "epoca");
  const requestedMatchdayId = oneParam(params, "jornada");
  const requestedEditMatchId = oneParam(params, "editar_jogo");
  const rawClubPreviewList = oneParam(params, "club_preview") ?? "";
  const messageSection = oneParam(params, "section");
  const {
    linkedCompetitions,
    selectedCountry,
    competitionsForCountry,
    selectedCompetition,
    seasonsForCompetition,
    selectedSeason
  } = resolveSelectedContext({
    countries,
    competitions,
    seasons,
    requestedCountryId,
    requestedCompetitionId,
    requestedSeasonId
  });
  const participantData = configured ? await getAdminSeasonParticipants() : null;
  const participantsForSeason = selectedSeason
    ? (participantData?.participants ?? []).filter(
        (participant) =>
          participant.season_id === selectedSeason.id &&
          participant.data_source === "manual" &&
          participant.sync_status === "manual" &&
          participant.manual_override === true
      )
    : [];
  const teamsForCountry = await readTeamsForCountry(selectedCountry?.id);
  const teamsForClubPreview = rawClubPreviewList.trim() ? await readTeamsForClubPreview(selectedCountry?.id) : [];
  const teamAliasesForClubPreview = rawClubPreviewList.trim()
    ? teamsForClubPreview === null
      ? null
      : await readTeamAliasesForTeams(teamsForClubPreview.map((team) => team.id))
    : [];
  const unassignedTeams = await readUnassignedTeams();
  const matchdaysForSeason = await readMatchdaysForSeason(selectedSeason?.id);
  const selectedMatchday = requestedMatchdayId
    ? matchdaysForSeason.find((matchday) => matchday.id === requestedMatchdayId) ?? null
    : null;
  const matchesForMatchday = await readMatchesForMatchday(selectedMatchday?.id);
  const scheduledMatchesForMatchday = matchesForMatchday.filter((match) => match.status === "scheduled");
  const futureLiveMatchesForMatchday = matchesForMatchday.filter(
    (match) => match.status === "live" || match.status === "halftime"
  );
  const finishedMatchesForMatchday = matchesForMatchday.filter((match) => match.status === "finished");
  const matchesForSeason = await readMatchesForSeason(selectedSeason?.id);
  const blockingMatchdaysForSeason = await readBlockingMatchdaysForSeason(selectedSeason?.id);
  const blockingMatchesForSeason = await readBlockingMatchesForSeason(selectedSeason?.id);
  const blockingMatchesForCountryTeams = await readBlockingMatchesForTeams(teamsForCountry.map((team) => team.id));
  const editingMatch = matchesForMatchday.find((match) => match.id === requestedEditMatchId) ?? null;
  const allParticipants = participantData?.participants ?? [];
  const allParticipantsForSeason = selectedSeason
    ? allParticipants.filter((participant) => participant.season_id === selectedSeason.id)
    : [];
  const blockingMatchesForSelectedMatchday = selectedMatchday
    ? blockingMatchesForSeason.filter((match) => match.matchday_id === selectedMatchday.id)
    : [];
  const teamBlockDiagnostics = teamsForCountry.map((team) => {
    const teamParticipants = allParticipants.filter((participant) => participant.team_id === team.id);
    const manualParticipants = teamParticipants.filter(
      (participant) =>
        participant.data_source === "manual" &&
        participant.sync_status === "manual" &&
        participant.manual_override === true
    );
    const oldParticipants = teamParticipants.filter((participant) => participant.manual_override !== true);
    const homeMatches = blockingMatchesForCountryTeams.filter((match) => match.home_team_id === team.id);
    const awayMatches = blockingMatchesForCountryTeams.filter((match) => match.away_team_id === team.id);

    return {
      team,
      manualParticipants: manualParticipants.length,
      oldParticipants: oldParticipants.length,
      homeMatches: homeMatches.length,
      awayMatches: awayMatches.length
    };
  });
  const participantTeamIds = new Set(participantsForSeason.map((participant) => participant.team_id));
  const clubPreview = buildSeasonParticipantPlan({
    rawList: rawClubPreviewList,
    teams:
      teamsForClubPreview?.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        slug: team.slug,
        code: team.code ?? null
      })) ?? null,
    aliases:
      teamAliasesForClubPreview?.map((alias) => ({
        teamId: alias.team_id,
        normalizedAlias: alias.normalized_alias
      })) ?? null,
    participants: participantData?.error
      ? null
      : allParticipantsForSeason.map((participant) => ({
          teamId: participant.team_id,
          status: participant.status
        }))
  });
  const teamsAvailableForSeason = teamsForCountry.filter((team) => !participantTeamIds.has(team.id));
  const participantTeamOptions = participantsForSeason
    .map((participant) => participant.team)
    .filter((team): team is SupabaseTeam => Boolean(team));
  const participantTeamsById = new Map(participantTeamOptions.map((team) => [team.id, team]));
  const classificationRows = buildAccumulatedClassification({
    participants: participantsForSeason,
    matches: matchesForSeason,
    matchdays: matchdaysForSeason,
    selectedMatchday
  });
  const teamsUsedInOtherMatches = new Set<string>();
  matchesForMatchday
    .filter((match) => match.id !== editingMatch?.id)
    .forEach((match) => {
      teamsUsedInOtherMatches.add(match.home_team_id);
      teamsUsedInOtherMatches.add(match.away_team_id);
    });
  const matchTeamOptions = participantTeamOptions.filter(
    (team) =>
      !teamsUsedInOtherMatches.has(team.id) ||
      team.id === editingMatch?.home_team_id ||
      team.id === editingMatch?.away_team_id
  );
  const defaultMatchHomeId = editingMatch?.home_team_id ?? matchTeamOptions[0]?.id ?? "";
  const defaultMatchAwayId =
    editingMatch?.away_team_id ?? matchTeamOptions.find((team) => team.id !== defaultMatchHomeId)?.id ?? "";
  const unavailableTeamMessage =
    teamsForCountry.length === 0
      ? "Ainda nao ha clubes associados a este pais"
      : "Todos os clubes disponiveis deste pais ja foram adicionados a esta epoca";
  const selectorCountries = countries.map((country) => ({
    id: country.id,
    name: country.name
  }));
  const selectorCompetitions = linkedCompetitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
    countryId: competitionCountryId(competition)
  }));
  const selectorSeasons = seasons.map((season) => ({
    id: season.id,
    label: season.label,
    competitionId: season.competition_id,
    isCurrent: season.is_current
  }));
  const currentReturnTo = returnTo(selectedCountry, selectedCompetition, selectedSeason);
  const baseReturnTo = withSection(currentReturnTo, "base");
  const maintenanceReturnTo = withSection(currentReturnTo, "manutencao");
  const prepareParticipantsReturnTo = withSection(currentReturnTo, "preparar-participantes");
  const clubsReturnTo = withSection(currentReturnTo, "clubes");
  const calendarReturnTo = withSection(currentReturnTo, "calendario");
  const participantsReturnTo = withSection(currentReturnTo, "participantes");
  const matchdayReturnTo =
    selectedMatchday && currentReturnTo.includes("?")
      ? `${currentReturnTo}&jornada=${selectedMatchday.id}`
      : selectedMatchday
        ? `${currentReturnTo}?jornada=${selectedMatchday.id}`
        : currentReturnTo;
  const matchesReturnTo = withSection(matchdayReturnTo, "jogos");
  const unlinkedCompetitions = competitions.filter((competition) => !competitionCountryId(competition));
  const created = oneParam(params, "created");
  const actionError = oneParam(params, "error");
  const clearCalendarErrorDetail = oneParam(params, "clear_calendar_error_detail");
  const rawClubApplySummary = oneParam(params, "club_apply_summary");
  let clubApplySummary: ClubApplySummary | null = null;

  if (rawClubApplySummary) {
    try {
      clubApplySummary = JSON.parse(rawClubApplySummary) as ClubApplySummary;
    } catch {
      clubApplySummary = null;
    }
  }

  const canCreateCompetition = Boolean(selectedCountry);
  const canCreateSeason = Boolean(selectedCompetition);
  const canCreateTeam = Boolean(selectedCountry && participantData?.writeConfigured);
  const canAttachTeam = Boolean(selectedCountry && participantData?.writeConfigured && unassignedTeams.length > 0);
  const canAddParticipant = Boolean(
    selectedCountry && selectedSeason && participantData?.writeConfigured && !participantData.error && teamsAvailableForSeason.length > 0
  );
  const nextMatchdayNumber = matchdaysForSeason.reduce((max, matchday) => Math.max(max, matchday.number), 0) + 1;
  const canCreateMatchday = Boolean(selectedSeason && participantData?.writeConfigured && participantsForSeason.length > 0);
  const canCreateMatch = Boolean(
    selectedCompetition &&
      selectedSeason &&
      selectedMatchday &&
      participantData?.writeConfigured &&
      matchTeamOptions.length >= 2
  );
  const canApplyClubList = Boolean(
    selectedCountry &&
      selectedCompetition &&
      selectedSeason &&
      participantData?.writeConfigured &&
      !participantData.error &&
      rawClubPreviewList.trim() &&
      clubPreview.applicable
  );
  const createdLabels: Record<string, string> = {
    country: "Pais criado. Agora podes escolher esse pais no caminho de trabalho.",
    competition: "Competicao criada e ligada ao pais escolhido.",
    season: "Epoca criada dentro da competicao escolhida.",
    team: "Clube criado e associado ao pais selecionado.",
    attach_team_to_country: "Clube existente associado ao pais selecionado.",
    apply_club_list: "Participantes validados processados nesta epoca.",
    participant: "Participante associado a epoca selecionada.",
    remove_participant: "Participante removido da epoca selecionada.",
    remove_all_participants: "Participantes removidos da epoca selecionada.",
    remove_old_participant: "Ligacao de suporte removida de season_teams.",
    matchday: "Jornada criada dentro da epoca selecionada.",
    remove_matchday: "Jornada removida da epoca selecionada.",
    match: "Jogo criado dentro da jornada selecionada.",
    update_match: "Jogo atualizado na jornada selecionada.",
    remove_match: "Jogo removido da jornada selecionada.",
    clear_season_calendar: "Epoca limpa. Jogos, jornadas e participantes desta epoca foram removidos.",
    finish_match: "Estado do jogo guardado.",
    save_matchday_editorial: "Linha editorial da jornada guardada.",
    save_matchday_highlights: "Destaques guardados e definidos como zona ativa abaixo da manchete.",
    save_matchday_roundup_items: "Resumo da Jornada guardado e definido como zona ativa abaixo da manchete.",
    upload_matchday_editorial_image: "Imagem da manchete carregada.",
    upload_matchday_highlight_image: "Imagem do destaque carregada.",
    remove_country: "Pais removido.",
    remove_competition: "Competicao removida.",
    remove_season: "Epoca removida. Jogos, jornadas, participantes e editoriais desta epoca foram limpos."
  };
  const errorLabels: Record<string, string> = {
    "missing-service": "Liga primeiro a Supabase na Vercel.",
    "missing-fields": "Preenche os campos obrigatorios antes de guardar.",
    "unknown-action": "A acao enviada pelo formulario nao foi reconhecida.",
    "safe-deletion-required": "A remoção segura é obrigatória. Use a gestão de clubes para analisar as dependências.",
    "country-not-found": "Nao foi possivel confirmar o pais selecionado.",
    "competition-country-invalid": "A competicao selecionada nao pertence ao pais escolhido.",
    "season-competition-invalid": "A epoca selecionada nao pertence a competicao escolhida.",
    "invalid-team-country": "O clube escolhido nao esta associado ao pais selecionado.",
    "participant-list-invalid": "A lista de participantes tem erros, ambiguidades, conflitos ou duplicações. Corrige-a e volta a pré-visualizar.",
    "participant-catalog-unavailable": "Não foi possível carregar o catálogo contextual de clubes. Nenhuma associação foi alterada.",
    "participant-aliases-unavailable": "Não foi possível carregar os aliases dos clubes. Nenhuma associação foi alterada.",
    "participant-participants-unavailable": "Não foi possível carregar os participantes atuais da época. Nenhuma associação foi alterada.",
    "team-slug-exists": "Este clube ja existe. Associe-o ao pais em vez de criar outro.",
    "team-not-found": "Nao foi possivel encontrar o clube escolhido.",
    "team-already-linked": "Este clube ja esta associado a outro pais.",
    "country-has-competitions": "Nao e possivel remover este pais porque ainda existem competicoes associadas.",
    "country-has-teams": "Nao e possivel remover este pais porque ainda existem clubes associados.",
    "competition-has-seasons": "Nao e possivel remover esta competicao porque ainda existem epocas associadas.",
    "season-has-data": "Esta época ainda tem dados associados. Use primeiro LIMPAR ÉPOCA.",
    "season-has-participants": "Nao e possivel remover esta epoca porque ainda existem participantes associados.",
    "season-has-matchdays": "Nao e possivel remover esta epoca porque ainda existem jornadas associadas.",
    "season-has-matches": "Nao e possivel remover esta epoca porque ainda existem jogos associados.",
    "team-has-participants": "Este clube ainda esta associado a uma epoca. Remove primeiro o participante da epoca.",
    "team-has-old-participants": "Este clube tem ligacoes de suporte fora da lista principal. Reve esses dados antes de remover o clube.",
    "team-has-matches": "Este clube nao pode ser removido porque ainda existem jogos associados a ele.",
    "old-participant-manual": "Esta associacao pertence a lista principal da epoca e nao pode ser limpa nesta area.",
    "old-participant-not-found": "Nao foi possivel encontrar uma ligacao de suporte para remover.",
    "matchday-needs-participants": "Antes de criar jornadas, define os participantes desta epoca.",
    "season-participants-has-calendar": "Não é possível remover todos os participantes porque esta época já tem jornadas ou jogos associados. Remova primeiro o calendário/jogos.",
    "matchday-duplicate": "Ja existe uma jornada com esse numero nesta epoca.",
    "matchday-has-matches": "Nao e possivel remover esta jornada porque ainda existem jogos associados.",
    "calendar-list-invalid": "A lista do calendario tem linhas invalidas ou conflitos por resolver.",
    "calendar-no-matches": "Nao ha jogos novos validos para criar nesta lista.",
    "match-missing-context": "Escolhe uma competicao, epoca e jornada antes de criar o jogo.",
    "matchday-invalid": "A jornada escolhida nao pertence a epoca selecionada.",
    "roundup-item-invalid": "O item escolhido do Resumo da Jornada nao pertence a esta jornada.",
    "match-team-same": "A equipa da casa e a equipa visitante nao podem ser o mesmo clube.",
    "match-team-not-participant": "As equipas do jogo tem de ser participantes manuais desta epoca.",
    "match-team-already-in-matchday": "Esta equipa ja tem jogo nesta jornada.",
    "match-duplicate-season": "Este jogo ja existe nesta epoca.",
    "match-not-found": "Nao foi possivel encontrar este jogo na jornada selecionada.",
    "match-has-result-edit": "Este jogo ja tem resultado e nao pode ser editado como agenda.",
    "match-has-result-remove": "Este jogo ja tem resultado e nao pode ser removido.",
    "match-not-simple": "Este jogo ja tem dados competitivos associados e nao pode ser alterado nesta area.",
    "match-has-dependencies": "Este jogo ja tem eventos, noticias ou atualizacoes associadas e nao pode ser removido nesta area.",
    "clear-season-calendar-step-failed": clearCalendarErrorDetail ?? "Nao foi possivel limpar o calendario da epoca. O detalhe do passo nao foi devolvido.",
    "clear-season-calendar-fk": "Nao foi possivel limpar o calendario porque ainda existe uma dependencia ligada aos jogos ou jornadas. O detalhe ficou registado no log do servidor.",
    "clear-season-calendar-failed": "Nao foi possivel limpar o calendario da epoca. O detalhe ficou registado no log do servidor.",
    "match-score-invalid": "O resultado deve estar vazio ou ter golos da casa e do fora, com numeros inteiros iguais ou superiores a zero.",
    "match-minute-invalid": "O minuto deve ser um numero entre 0 e 130.",
    "match-status-invalid": "Escolhe um estado valido para o jogo.",
    "editorial-title-required": "Para publicar, indica uma manchete da jornada.",
    "highlight-title-required": "Para publicar um destaque, indica o titulo.",
    "roundup-title-required": "Para publicar um item do Resumo da Jornada, indica o titulo.",
    "editorial-image-type": "O ficheiro tem de ser uma imagem JPG, PNG ou WebP.",
    "editorial-image-size": "A imagem nao pode ter mais de 5MB.",
    "editorial-image-upload": "Nao foi possivel carregar a imagem. Confirma o bucket de Storage.",
    save: "Nao foi possivel guardar. Confirma se a base de dados esta atualizada."
  };
  const sectionMessage = (section: string) => {
    if (messageSection !== section) {
      return null;
    }

    if (created && createdLabels[created]) {
      return <div className="manager-message">{createdLabels[created]}</div>;
    }

    if (actionError) {
      return <div className="manager-message warning">{errorLabels[actionError] ?? errorLabels.save}</div>;
    }

    return null;
  };

  const matchStatusLabel = (status: string) => {
    const normalized = status.trim().toLowerCase();
    if (normalized === "finished") return "Finalizado";
    if (normalized === "live") return "Em direto";
    if (normalized === "halftime") return "Intervalo";
    if (normalized === "scheduled") return "Agendado";
    return status || "Estado por definir";
  };

  const renderMatchListItem = (match: SeasonAgendaMatch) => {
    const homeTeam = participantTeamsById.get(match.home_team_id);
    const awayTeam = participantTeamsById.get(match.away_team_id);
    const hasFinalScore = match.home_score !== null && match.away_score !== null;
    const hasAnyScore = match.home_score !== null || match.away_score !== null;
    const statusKind = match.status.trim().toLowerCase();
    const statusValue = ["scheduled", "live", "halftime", "finished"].includes(statusKind) ? statusKind : "scheduled";
    const statusLabel = matchStatusLabel(match.status);
    const publicMinute = getPublicLiveMinute(match);
    const minuteLabel = publicMinute !== null && statusValue === "live" ? ` · ${publicMinute}'` : "";
    const scoreLabel = hasFinalScore ? ` - ${match.home_score}-${match.away_score}` : "";
    const clockLabel = statusValue === "live" && match.is_clock_running ? "Relogio a correr" : "Relogio parado";
    const baseMinuteLabel = match.live_base_minute !== null ? `Base ${match.live_base_minute}'` : "Base sem minuto";
    const isFinished = match.status === "finished";
    const hasCompetitiveData =
      isFinished ||
      hasAnyScore ||
      match.status !== "scheduled" ||
      match.minute !== null ||
      match.broadcast_channel_id !== null;
    const stateForm = (
      <form className="manager-actions manager-state-actions" action="/api/admin/gestor" method="post">
        <input type="hidden" name="action_type" value="finish_match" />
        <input type="hidden" name="return_to" value={matchesReturnTo} />
        <input type="hidden" name="competition_id" value={selectedCompetition?.id ?? ""} />
        <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
        <input type="hidden" name="matchday_id" value={selectedMatchday?.id ?? ""} />
        <input type="hidden" name="match_id" value={match.id} />
        <label className="manager-score-field">
          <span>Estado</span>
          <select name="status" defaultValue={statusValue}>
            <option value="scheduled">Agendado</option>
            <option value="live">Em direto</option>
            <option value="halftime">Intervalo</option>
            <option value="finished">Finalizado</option>
          </select>
        </label>
        <label className="manager-score-field">
          <span>Minuto</span>
          <input name="minute" type="number" min={0} max={130} step={1} defaultValue={match.minute ?? ""} />
        </label>
        <label className="manager-score-field">
          <span>Minuto base</span>
          <input name="live_base_minute" type="number" min={0} max={130} step={1} defaultValue={match.live_base_minute ?? match.minute ?? ""} />
        </label>
        <label className="manager-score-field">
          <span>Relogio</span>
          <select name="is_clock_running" defaultValue={match.is_clock_running ? "true" : "false"}>
            <option value="false">Parado</option>
            <option value="true">A correr</option>
          </select>
        </label>
        <label className="manager-score-field">
          <span>Casa</span>
          <input name="home_score" type="number" min={0} step={1} defaultValue={match.home_score ?? ""} />
        </label>
        <label className="manager-score-field">
          <span>Fora</span>
          <input name="away_score" type="number" min={0} step={1} defaultValue={match.away_score ?? ""} />
        </label>
        <button className="manager-link-button" type="submit">
          Guardar estado
        </button>
        <button className="manager-link-button" name="clock_action" type="submit" value="start_clock">
          Iniciar/retomar relogio
        </button>
        <button className="manager-link-button" name="clock_action" type="submit" value="pause_clock">
          Pausar relogio
        </button>
      </form>
    );

    if (isFinished) {
      return (
        <li key={match.id} className="manager-match-list-item manager-finished-match">
          <div>
            <b className="manager-finished-score">
              {homeTeam?.name ?? "Casa"} {match.home_score ?? "-"}-{match.away_score ?? "-"} {awayTeam?.name ?? "Fora"}
            </b>
            <small className="manager-match-summary-line">
              {formatLisbonDateTime(match.scheduled_date, match.kickoff_at)} - {match.venue ?? "Sem estadio"} - {statusLabel}
              {minuteLabel}
            </small>
          </div>
          <details className="manager-manual-actions">
            <summary>Corrigir resultado</summary>
            <div className="manager-actions">
              {stateForm}
              <button className="manager-link-button" type="button" disabled>
                Editar agenda
              </button>
              <button className="manager-link-button manager-danger-link" type="button" disabled>
                Remover jogo
              </button>
              <button className="manager-link-button" type="button" data-close-details="true">
                Fechar correcao
              </button>
            </div>
          </details>
        </li>
      );
    }

    return (
      <li key={match.id} className="manager-match-list-item">
        <div>
          <b>
            {homeTeam?.name ?? "Casa"} vs {awayTeam?.name ?? "Fora"}
          </b>
          <small className="manager-match-summary-line">
            <span>{formatLisbonDateTime(match.scheduled_date, match.kickoff_at)}</span>
            <span>{match.venue ?? "Sem estadio"}</span>
            <span>{statusLabel}{minuteLabel}{scoreLabel}</span>
            <span>{baseMinuteLabel}</span>
            <span>{clockLabel}</span>
          </small>
        </div>
        {stateForm}
        <div className="manager-actions manager-match-secondary-actions">
          {hasCompetitiveData ? (
            <button className="manager-link-button" type="button" disabled>
              Editar agenda
            </button>
          ) : (
            <a
              className="manager-link-button"
              href={withQueryAndHash(matchdayReturnTo, { editar_jogo: match.id, section: "jogos" }, "editar-jogo")}
            >
              Editar agenda
            </a>
          )}
          {hasCompetitiveData ? (
            <button className="manager-link-button manager-danger-link" type="button" disabled>
              Remover jogo
            </button>
          ) : (
            <form
              action="/api/admin/gestor"
              data-confirm="Tem a certeza que quer remover este jogo agendado? Esta acao so avanca se o jogo ainda nao tiver resultados, eventos ou outros dados competitivos."
              method="post"
            >
              <input type="hidden" name="action_type" value="remove_match" />
              <input type="hidden" name="return_to" value={matchesReturnTo} />
              <input type="hidden" name="competition_id" value={selectedCompetition?.id ?? ""} />
              <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
              <input type="hidden" name="matchday_id" value={selectedMatchday?.id ?? ""} />
              <input type="hidden" name="match_id" value={match.id} />
              <button className="manager-link-button manager-danger-link" type="submit">
                Remover jogo
              </button>
            </form>
          )}
        </div>
      </li>
    );
  };
  const matchdayEditorialHref = "/admin/editorial/jornada";
  const matchdayCompositionHref = "/admin/editorial/composicao";

  return (
    <main className="manager-shell">
      <style>{managerStyles}</style>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("submit", function (event) {
              var form = event.target;
              if (!(form instanceof HTMLFormElement)) return;
              var message = form.getAttribute("data-confirm");
              if (message && !window.confirm(message)) {
                event.preventDefault();
                return;
              }

              var method = (form.getAttribute("method") || "get").toLowerCase();
              var action = form.getAttribute("action") || "";
              if (method === "get" && action.indexOf("/admin/gestor") !== -1 && action.indexOf("#") === -1) {
                form.setAttribute("action", "/admin/gestor#contexto");
              }
            });

            function syncMatchTeamSelectors(form) {
              var home = form.querySelector('select[name="home_team_id"]');
              var away = form.querySelector('select[name="away_team_id"]');
              var submit = form.querySelector('[data-match-submit="true"]');
              var warning = form.querySelector('[data-match-warning="true"]');
              if (!home || !away || !submit) return;

              var homeValue = home.value;
              Array.prototype.forEach.call(away.options, function (option) {
                option.disabled = Boolean(option.value && option.value === homeValue);
              });

              if (away.value === homeValue) {
                var next = Array.prototype.find.call(away.options, function (option) {
                  return option.value && option.value !== homeValue && !option.disabled;
                });
                if (next) away.value = next.value;
              }

              var sameTeam = Boolean(home.value && away.value && home.value === away.value);
              var canCreate = form.getAttribute("data-can-create-match") === "true";
              submit.disabled = !canCreate || sameTeam;
              if (warning) {
                warning.hidden = !sameTeam;
              }
            }

            document.addEventListener("click", async function (event) {
              var target = event.target;
              if (!(target instanceof HTMLElement)) return;

              var closeDetails = target.closest('[data-close-details="true"]');
              if (closeDetails) {
                var details = closeDetails.closest("details");
                if (details instanceof HTMLDetailsElement) {
                  details.open = false;
                }
                return;
              }

              var pasteTrigger = target.closest("[data-paste-target]");
              if (pasteTrigger) {
                var pasteTargetId = pasteTrigger.getAttribute("data-paste-target");
                var pasteMessageId = pasteTrigger.getAttribute("data-paste-message");
                var pasteTarget = pasteTargetId ? document.getElementById(pasteTargetId) : null;
                var pasteMessage = pasteMessageId ? document.getElementById(pasteMessageId) : null;

                if (pasteMessage instanceof HTMLElement) {
                  pasteMessage.hidden = true;
                }

                try {
                  if (!navigator.clipboard || !navigator.clipboard.readText) {
                    throw new Error("clipboard-unavailable");
                  }

                  var clipboardText = await navigator.clipboard.readText();
                  if (pasteTarget instanceof HTMLTextAreaElement) {
                    pasteTarget.value = clipboardText;
                    pasteTarget.focus();
                  }
                } catch (error) {
                  if (pasteMessage instanceof HTMLElement) {
                    pasteMessage.textContent = "Nao foi possivel aceder automaticamente ao conteudo copiado. Usa Ctrl+V na caixa de texto.";
                    pasteMessage.hidden = false;
                  }
                }
                return;
              }

              var trigger = target.closest('[data-file-trigger]');
              if (!trigger) return;
              var targetName = trigger.getAttribute("data-file-trigger");
              var input = document.querySelector('[data-file-input="' + targetName + '"]');
              if (input instanceof HTMLInputElement) {
                input.click();
              }
            });

            document.addEventListener("change", function (event) {
              var field = event.target;

              if (field instanceof HTMLInputElement && field.hasAttribute("data-file-input")) {
                var file = field.files && field.files[0];
                if (!file) return;

                var fileName = file.name.toLowerCase();
                if (!fileName.endsWith(".txt") && !fileName.endsWith(".csv")) {
                  field.value = "";
                  return;
                }

                var reader = new FileReader();
                reader.onload = function () {
                  var targetId = field.getAttribute("data-file-target");
                  var textarea = targetId ? document.getElementById(targetId) : null;
                  if (textarea instanceof HTMLTextAreaElement) {
                    textarea.value = String(reader.result || "");
                  }
                };
                reader.readAsText(file);
                return;
              }

              if (!(field instanceof HTMLSelectElement)) return;
              var form = field.closest('[data-match-form="true"]');
              if (form) syncMatchTeamSelectors(form);
            });

            document.addEventListener("DOMContentLoaded", function () {
              document.querySelectorAll('[data-match-form="true"]').forEach(syncMatchTeamSelectors);
            });
          `
        }}
      />
      <header className="manager-hero">
        <div>
          <p>Jornada.pt</p>
          <h1>Centro de gestao</h1>
          <span>
            Fluxo principal: Pais - Competicao - Epoca - Preparar participantes - Jornadas - Jogos -
            Resultados - Classificacao. As acoes de suporte ficam separadas em manutencao.
          </span>
        </div>
        <div className="manager-hero-actions">
          <a href="/admin/editorial/home">HOME EDITORIAL</a>
          <a href="/admin/editorial/redacao-automatica">REDAÇÃO AUTOMÁTICA</a>
          <a href="/admin/editorial/artigos">ARTIGOS / NOTÍCIAS</a>
          <a href="/admin/editorial/conteudos">VÍDEO</a>
          {matchdayEditorialHref ? (
            <a href={matchdayEditorialHref}>EDITORIAL DA JORNADA</a>
          ) : (
            <span aria-disabled="true" className="manager-disabled-link" title="Sem jornada disponivel">
              Sem jornada disponivel
            </span>
          )}
          {matchdayCompositionHref ? <a href={matchdayCompositionHref}>COMPOSIÇÃO EDITORIAL</a> : null}
          <a href="/admin">VOLTAR AO BACKOFFICE</a>
        </div>
      </header>

      {!messageSection && created && createdLabels[created] ? <div className="manager-message">{createdLabels[created]}</div> : null}
      {!messageSection && actionError ? (
        <div className="manager-message warning">{errorLabels[actionError] ?? errorLabels.save}</div>
      ) : null}

      {!configured ? (
        <section className="manager-warning">
          <h2>Supabase ainda nao ligada</h2>
          <p>Adiciona as variaveis da Supabase na Vercel antes de usar o gestor.</p>
        </section>
      ) : null}

      {configured && error ? (
        <section className="manager-warning">
          <h2>Leitura incompleta</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {configured && unlinkedCompetitions.length > 0 ? (
        <section className="manager-warning">
          <h2>Competicoes por ligar ao gestor</h2>
          <p>
            Ha {unlinkedCompetitions.length} competicoes fora do gestor porque ainda nao foram ligadas
            manualmente a um pais. Liga-as em /admin/competicoes para aparecerem no caminho certo.
          </p>
        </section>
      ) : null}

      {configured ? (
        <>
          <section className="manager-context" id="contexto" aria-label="Caminho de trabalho">
            <header>
              <h2>Caminho de trabalho</h2>
              <p>
                Primeiro escolhes o pais. Depois so aparecem as competicoes desse pais. Depois so aparecem
                as epocas dessa competicao.
              </p>
            </header>
            <ContextSelector
              countries={selectorCountries}
              competitions={selectorCompetitions}
              seasons={selectorSeasons}
              selectedCountryId={selectedCountry?.id ?? ""}
              selectedCompetitionId={selectedCompetition?.id ?? ""}
              selectedSeasonId={selectedSeason?.id ?? ""}
            />
            <div className="manager-path">
              <article>
                <small>Pais</small>
                <strong>{selectedCountry?.name ?? "Cria um pais"}</strong>
              </article>
              <article>
                <small>Competicao</small>
                <strong>{selectedCompetition?.name ?? "Cria ou liga uma competicao"}</strong>
              </article>
              <article>
                <small>Epoca</small>
                <strong>{selectedSeason?.label ?? "Cria uma epoca"}</strong>
              </article>
            </div>
          </section>

          <div className="manager-workspace">
          <details className="manager-panel manager-section-base manager-support-section" id="base" aria-label="Apoio de estrutura" open={messageSection === "base"}>
            <summary>
              <span>
                <strong>Apoio: pais, competicao e epoca</strong>
                <small>Cria ou ajusta a estrutura base quando precisares; o fluxo operacional comeca na preparacao de participantes.</small>
              </span>
            </summary>
            {sectionMessage("base")}
            <div className="manager-create-grid">
              <article className="manager-create-card">
                <header>
                  <h3>1. Pais</h3>
                  <p>Cria apenas os paises que queres gerir no projeto.</p>
                </header>
                <form className="manager-create-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="country" />
                  <input type="hidden" name="return_to" value={baseReturnTo} />
                  <div className="manager-field">
                    <label htmlFor="new-country-name">Nome</label>
                    <input id="new-country-name" name="name" placeholder="Ex: Portugal" required />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-country-slug">Slug</label>
                    <input id="new-country-slug" name="slug" placeholder="portugal" />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-country-iso">ISO2</label>
                    <input id="new-country-iso" name="iso2" placeholder="PT" maxLength={2} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-country-flag">Flag</label>
                    <input id="new-country-flag" name="flag_emoji" placeholder="PT" />
                  </div>
                  <button className="manager-button" type="submit">
                    Criar pais
                  </button>
                </form>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>2. Competicao</h3>
                  <p>A competicao nasce dentro do pais escolhido no caminho de trabalho.</p>
                </header>
                <form className="manager-create-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="competition" />
                  <input type="hidden" name="return_to" value={baseReturnTo} />
                  <input type="hidden" name="country_id" value={selectedCountry?.id ?? ""} />
                  <div className="manager-field">
                    <label htmlFor="new-competition-country">Pais</label>
                    <input
                      id="new-competition-country"
                      value={selectedCountry?.name ?? "Cria um pais primeiro"}
                      readOnly
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-competition-name">Nome</label>
                    <input
                      id="new-competition-name"
                      name="name"
                      placeholder="Ex: Liga Portugal"
                      disabled={!canCreateCompetition}
                      required={canCreateCompetition}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-competition-slug">Slug</label>
                    <input
                      id="new-competition-slug"
                      name="slug"
                      placeholder="liga-portugal"
                      disabled={!canCreateCompetition}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-competition-color">Cor</label>
                    <input
                      id="new-competition-color"
                      name="accent_color"
                      placeholder="#e5252a"
                      disabled={!canCreateCompetition}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-competition-logo">Logotipo URL</label>
                    <input
                      id="new-competition-logo"
                      name="logo_url"
                      placeholder="https://..."
                      disabled={!canCreateCompetition}
                    />
                  </div>
                  <button className="manager-button" type="submit" disabled={!canCreateCompetition}>
                    Criar competicao
                  </button>
                </form>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>3. Epoca</h3>
                  <p>A epoca fica sempre subordinada a competicao escolhida.</p>
                </header>
                <form className="manager-create-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="season" />
                  <input type="hidden" name="return_to" value={baseReturnTo} />
                  <input type="hidden" name="competition_id" value={selectedCompetition?.id ?? ""} />
                  <div className="manager-field">
                    <label htmlFor="new-season-competition">Competicao</label>
                    <input
                      id="new-season-competition"
                      value={selectedCompetition?.name ?? "Cria uma competicao primeiro"}
                      readOnly
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-season-label">Nome da epoca</label>
                    <input
                      id="new-season-label"
                      name="label"
                      placeholder="Ex: 2024/25"
                      disabled={!canCreateSeason}
                      required={canCreateSeason}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-season-start">Inicio</label>
                    <input id="new-season-start" name="starts_on" type="date" disabled={!canCreateSeason} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-season-end">Fim</label>
                    <input id="new-season-end" name="ends_on" type="date" disabled={!canCreateSeason} />
                  </div>
                  <label className="manager-check">
                    <input type="checkbox" name="is_current" value="1" disabled={!canCreateSeason} />
                    Epoca atual
                  </label>
                  <button className="manager-button" type="submit" disabled={!canCreateSeason}>
                    Criar epoca
                  </button>
                </form>
              </article>
            </div>
          </details>

          <details className="manager-panel manager-section-maintenance manager-support-section" id="manutencao" aria-label="Remocao segura" open={messageSection === "manutencao"}>
            <summary>
              <span>
                <strong>Remocao segura</strong>
                <small>Remove apenas itens sem dados associados. Se existirem dependencias, o gestor bloqueia a acao.</small>
              </span>
            </summary>
            {sectionMessage("manutencao")}
            <div className="manager-summary-grid">
              <article className="manager-create-card">
                <header>
                  <h3>Pais</h3>
                  <p>{selectedCountry?.name ?? "Sem pais selecionado"}</p>
                </header>
                <form
                  action="/api/admin/gestor"
                  data-confirm="Tem a certeza que quer remover este pais? Esta acao so avanca se nao houver competicoes nem clubes associados."
                  method="post"
                >
                  <input type="hidden" name="action_type" value="remove_country" />
                  <input type="hidden" name="return_to" value={maintenanceReturnTo} />
                  <input type="hidden" name="country_id" value={selectedCountry?.id ?? ""} />
                  <button className="manager-link-button" type="submit" disabled={!selectedCountry}>
                    Remover pais
                  </button>
                </form>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>Competicao</h3>
                  <p>{selectedCompetition?.name ?? "Sem competicao selecionada"}</p>
                </header>
                <form
                  action="/api/admin/gestor"
                  data-confirm="Tem a certeza que quer remover esta competicao? Esta acao so avanca se nao houver epocas associadas."
                  method="post"
                >
                  <input type="hidden" name="action_type" value="remove_competition" />
                  <input
                    type="hidden"
                    name="return_to"
                    value={withSection(selectedCountry ? returnTo(selectedCountry, null, null) : "/admin/gestor", "manutencao")}
                  />
                  <input type="hidden" name="competition_id" value={selectedCompetition?.id ?? ""} />
                  <button className="manager-link-button" type="submit" disabled={!selectedCompetition}>
                    Remover competicao
                  </button>
                </form>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>Epoca</h3>
                  <p>{selectedSeason?.label ?? "Sem epoca selecionada"}</p>
                </header>
                <form
                  action="/api/admin/gestor"
                  data-confirm="Tem a certeza que pretende remover esta época? Serão apagados jogos, jornadas, participantes e editoriais desta época. Os clubes continuarão no catálogo do país. Esta ação não pode ser desfeita."
                  method="post"
                >
                  <input type="hidden" name="action_type" value="remove_season" />
                  <input type="hidden" name="return_to" value={withSection(returnTo(selectedCountry, selectedCompetition, null), "manutencao")} />
                  <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
                  <button className="manager-link-button" type="submit" disabled={!selectedSeason}>
                    REMOVER ÉPOCA
                  </button>
                </form>
              </article>

              {selectedSeason ? (
                <article className="manager-create-card manager-wide-card">
                  <header>
                    <h3>Limpar epoca</h3>
                    <p>Remove jogos, jornadas e participantes da epoca selecionada, sem apagar clubes, pais, competicao ou epoca.</p>
                  </header>
                  <form
                    action="/api/admin/gestor"
                    data-confirm="Tem a certeza que pretende limpar esta época? Serão removidos jogos, jornadas e participantes desta época. Os clubes continuarão no catálogo do país. Esta ação não pode ser desfeita."
                    method="post"
                  >
                    <input type="hidden" name="action_type" value="clear_season_calendar" />
                    <input type="hidden" name="return_to" value={maintenanceReturnTo} />
                    <input type="hidden" name="season_id" value={selectedSeason.id} />
                    <button className="manager-link-button" type="submit">
                      LIMPAR ÉPOCA
                    </button>
                  </form>
                </article>
              ) : null}
            </div>
          </details>

          <details className="manager-panel manager-section-maintenance manager-support-section" id="diagnostico-bloqueios" aria-label="Manutencao e diagnostico">
            <summary>
              <span>
                <strong>Manutencao e diagnostico</strong>
                <small>Ferramentas auxiliares para verificar dependencias e bloqueios antes de remover dados.</small>
              </span>
            </summary>
            <div className="manager-summary-grid">
              <article className="manager-create-card">
                <header>
                  <h3>Pais selecionado</h3>
                  <p>{selectedCountry?.name ?? "Sem pais selecionado"}</p>
                </header>
                <ul className="manager-list">
                  <li>
                    <div>
                      <b>{competitionsForCountry.length}</b>
                      <small>competicoes associadas</small>
                    </div>
                  </li>
                  <li>
                    <div>
                      <b>{teamsForCountry.length}</b>
                      <small>clubes associados</small>
                    </div>
                  </li>
                </ul>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>Competicao selecionada</h3>
                  <p>{selectedCompetition?.name ?? "Sem competicao selecionada"}</p>
                </header>
                <ul className="manager-list">
                  <li>
                    <div>
                      <b>{seasonsForCompetition.length}</b>
                      <small>epocas associadas</small>
                    </div>
                  </li>
                </ul>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>Epoca selecionada</h3>
                  <p>{selectedSeason?.label ?? "Sem epoca selecionada"}</p>
                </header>
                <ul className="manager-list">
                  <li>
                    <div>
                      <b>{allParticipantsForSeason.length}</b>
                      <small>participantes em season_teams</small>
                    </div>
                  </li>
                  <li>
                    <div>
                      <b>{blockingMatchdaysForSeason.length}</b>
                      <small>jornadas associadas</small>
                    </div>
                  </li>
                  <li>
                    <div>
                      <b>{blockingMatchesForSeason.length}</b>
                      <small>jogos associados</small>
                    </div>
                  </li>
                </ul>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>Jornada selecionada</h3>
                  <p>{selectedMatchday ? `${selectedMatchday.number}. ${selectedMatchday.label}` : "Sem jornada selecionada"}</p>
                </header>
                <ul className="manager-list">
                  <li>
                    <div>
                      <b>{blockingMatchesForSelectedMatchday.length}</b>
                      <small>jogos associados</small>
                    </div>
                  </li>
                </ul>
              </article>

              <article className="manager-create-card manager-wide-card">
                <header>
                  <h3>Clubes catalogados</h3>
                  <p>Dependencias que podem bloquear a remocao de cada clube.</p>
                </header>
                {teamBlockDiagnostics.length === 0 ? (
                  <div className="manager-empty">Nao ha clubes associados ao pais selecionado.</div>
                ) : (
                  <ul className="manager-list">
                    {teamBlockDiagnostics.map((item) => (
                      <li key={item.team.id}>
                        <div>
                          <b>{item.team.name}</b>
                          <small>
                          participantes da lista principal: {item.manualParticipants} / ligacoes de suporte:{" "}
                            {item.oldParticipants} / jogos casa: {item.homeMatches} / jogos fora: {item.awayMatches}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </details>

          {selectedCountry && selectedCompetition && selectedSeason ? (
            <section className="manager-panel manager-section-prepare" id="preparar-participantes" aria-label="Preparar participantes da época">
              <header>
                <h2>Preparar participantes da época</h2>
                <p>Cole uma lista de clubes para pré-visualizar a preparação dos participantes desta época. A pré-visualização não grava dados; a aplicação da lista acontece apenas depois da confirmação.</p>
                <p><strong>Esta ferramenta associa apenas clubes já existentes. Nunca cria clubes.</strong></p>
              </header>
              {sectionMessage("preparar-participantes")}
              {clubApplySummary ? (
                <div className="manager-message">
                  Lista aplicada: {clubApplySummary.associate} participantes associados, {clubApplySummary.reactivate} reativados e{" "}
                  {clubApplySummary.keep} mantidos.
                </div>
              ) : null}
              <div className="manager-summary-grid">
                <article className="manager-create-card manager-wide-card">
                  <header>
                    <h3>
                      {selectedCountry.name} / {selectedCompetition.name} / {selectedSeason.label}
                    </h3>
                    <p>Formato: Nome;Sigla;Slug;Emblema URL;Cor</p>
                    <p>O cabeçalho exato é opcional e só pode aparecer na primeira linha não vazia.</p>
                    <p>Pode colar a lista manualmente ou carregar um ficheiro .txt/.csv com uma linha por clube.</p>
                  </header>
                  <form className="manager-create-form" action="/admin/gestor#preparar-participantes" method="get">
                    <input type="hidden" name="pais" value={selectedCountry.id} />
                    <input type="hidden" name="competicao" value={selectedCompetition.id} />
                    <input type="hidden" name="epoca" value={selectedSeason.id} />
                    <input type="hidden" name="section" value="preparar-participantes" />
                    <div className="manager-field">
                      <label htmlFor="club-preview-list">Lista de clubes</label>
                      <input
                        type="file"
                        accept=".txt,.csv,text/plain,text/csv"
                        data-file-input="club-list"
                        data-file-target="club-preview-list"
                        hidden
                      />
                      <textarea
                        id="club-preview-list"
                        name="club_preview"
                        placeholder={"Arsenal;ARS;arsenal;https://...;#EF0107\nChelsea;CHE;chelsea;https://...;#034694"}
                        defaultValue={rawClubPreviewList}
                      />
                    </div>
                    <button className="manager-subtle-button" type="button" data-file-trigger="club-list">
                      Carregar .txt/.csv
                    </button>
                    <button className="manager-subtle-button" type="button" data-paste-target="club-preview-list" data-paste-message="club-paste-message">
                      Colar
                    </button>
                    <p className="manager-clipboard-message" id="club-paste-message" hidden>
                      Nao foi possivel aceder automaticamente ao conteudo copiado. Usa Ctrl+V na caixa de texto.
                    </p>
                    <button className="manager-button" type="submit">
                      Pré-visualizar lista
                    </button>
                  </form>
                </article>

                {rawClubPreviewList.trim() ? (
                  <article className="manager-create-card manager-wide-card">
                    <header>
                      <h3>Resultado da pré-visualização</h3>
                      <p>Esta pré-visualização ainda não grava dados. Se os resultados estiverem corretos, podes aplicar a lista validada à época selecionada.</p>
                    </header>
                    <div className="manager-stat-row">
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.totalRows}</strong>
                        <small>Total de linhas</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.associate}</strong>
                        <small>Associar</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.reactivate}</strong>
                        <small>Reativar</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.keep}</strong>
                        <small>Manter</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.reject}</strong>
                        <small>Rejeitadas</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.unresolved}</strong>
                        <small>Desconhecidos</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.ambiguous}</strong>
                        <small>Ambíguos</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.conflicts}</strong>
                        <small>Conflitos</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.duplicates}</strong>
                        <small>Duplicações</small>
                      </article>
                      <article className="manager-stat">
                        <strong>{clubPreview.summary.invalid}</strong>
                        <small>Linhas inválidas</small>
                      </article>
                    </div>
                    <div className="manager-table-wrap">
                      <table className="manager-table">
                        <thead>
                          <tr>
                            <th>Linha</th>
                            <th>Estado</th>
                            <th>Clube resolvido</th>
                            <th>Nome recebido</th>
                            <th>Sigla</th>
                            <th>Slug</th>
                            <th>Emblema URL</th>
                            <th>Cor</th>
                            <th>Sugestões não vinculativas</th>
                            <th>Observação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clubPreview.rows.map((row) => (
                            <tr key={`${row.lineNumber}-${row.slug || row.name}`}>
                              <td>{row.lineNumber > 0 ? row.lineNumber : "-"}</td>
                              <td>{row.actionLabel}</td>
                              <td>{row.teamName || "-"}</td>
                              <td>{row.name || "-"}</td>
                              <td>{row.shortName || "-"}</td>
                              <td>{row.slug || "-"}</td>
                              <td>{row.logoUrl || "-"}</td>
                              <td>{row.color || "-"}</td>
                              <td>
                                {row.suggestions.length > 0 ? (
                                  <ul className="manager-list">
                                    {row.suggestions.map((suggestion) => (
                                      <li key={`${row.lineNumber}-${suggestion.slug}`}>
                                        <div>
                                          <b>{suggestion.teamName}</b>
                                          <small>
                                            {suggestion.shortName ? `${suggestion.shortName} / ` : ""}{suggestion.slug} ·{" "}
                                            {suggestion.reasons
                                              .map((reason) => `${reason.inputField} → ${reason.candidateField}`)
                                              .join(", ")}
                                          </small>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : "-"}
                              </td>
                              <td>{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <form
                      className="manager-create-form"
                      action="/api/admin/gestor"
                      method="post"
                      data-confirm="Associar os participantes validados à época selecionada? Esta ação não cria nem altera clubes."
                    >
                      <input type="hidden" name="action_type" value="apply_club_list" />
                      <input type="hidden" name="return_to" value={prepareParticipantsReturnTo} />
                      <input type="hidden" name="country_id" value={selectedCountry.id} />
                      <input type="hidden" name="competition_id" value={selectedCompetition.id} />
                      <input type="hidden" name="season_id" value={selectedSeason.id} />
                      <textarea name="club_preview" hidden readOnly defaultValue={rawClubPreviewList} />
                      <button className="manager-button" type="submit" disabled={!canApplyClubList}>
                        Associar participantes validados
                      </button>
                    </form>
                  </article>
                ) : null}
              </div>
            </section>
          ) : null}

          <details className="manager-panel manager-section-clubs manager-support-section" id="clubes" aria-label="Gestao manual de clubes" open={messageSection === "clubes"}>
            <summary>
              <span>
                <strong>Gestao manual de clubes</strong>
                <small>Fallback para criar ou ajustar clubes individualmente. Para preparar uma epoca completa, usa a lista de participantes acima.</small>
              </span>
            </summary>
            {sectionMessage("clubes")}
            <div className="manager-create-grid">
              <article className="manager-create-card">
                <header>
                  <h3>Novo clube</h3>
                  <p>{selectedCountry ? `Associado a ${selectedCountry.name}.` : "Escolhe um pais primeiro."}</p>
                </header>
                <form className="manager-create-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="team" />
                  <input type="hidden" name="return_to" value={clubsReturnTo} />
                  <input type="hidden" name="country_id" value={selectedCountry?.id ?? ""} />
                  <div className="manager-field">
                    <label htmlFor="new-team-name">Nome</label>
                    <input id="new-team-name" name="name" placeholder="Ex: F91 Dudelange" disabled={!canCreateTeam} required={canCreateTeam} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-team-short">Sigla</label>
                    <input id="new-team-short" name="short_name" maxLength={6} placeholder="F91" disabled={!canCreateTeam} required={canCreateTeam} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-team-slug">Slug</label>
                    <input id="new-team-slug" name="slug" placeholder="f91-dudelange" disabled={!canCreateTeam} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-team-logo">Emblema URL</label>
                    <input id="new-team-logo" name="logo_url" placeholder="https://..." disabled={!canCreateTeam} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-team-color">Cor</label>
                    <input id="new-team-color" name="primary_color" placeholder="#e5252a" disabled={!canCreateTeam} />
                  </div>
                  <button className="manager-button" type="submit" disabled={!canCreateTeam}>
                    Criar clube
                  </button>
                </form>
              </article>

              <article className="manager-create-card">
                <header>
                  <h3>Associar registo existente</h3>
                  <p>Liga manualmente ao pais selecionado um registo que precisa de confirmacao no catalogo.</p>
                </header>
                <form className="manager-create-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="attach_team_to_country" />
                  <input type="hidden" name="return_to" value={clubsReturnTo} />
                  <input type="hidden" name="country_id" value={selectedCountry?.id ?? ""} />
                  <div className="manager-field">
                    <label htmlFor="attach-team-id">Registo existente</label>
                    <select id="attach-team-id" name="team_id" disabled={!canAttachTeam} required={canAttachTeam}>
                      {unassignedTeams.length === 0 ? <option value="">Nao ha registos por confirmar</option> : null}
                      {unassignedTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="manager-button" type="submit" disabled={!canAttachTeam}>
                    Associar clube
                  </button>
                </form>
              </article>

              <article className="manager-create-card manager-wide-card">
                <header>
                  <h3>{selectedCountry?.name ?? "Sem pais selecionado"}</h3>
                  <p>{teamsForCountry.length} clubes associados manualmente a este pais.</p>
                </header>
                {teamsForCountry.length === 0 ? (
                  <div className="manager-empty">Ainda nao ha clubes associados a este pais.</div>
                ) : (
                  <ul className="manager-list">
                    {teamsForCountry.map((team) => (
                      <li key={team.id}>
                        <div>
                          <b>{team.name}</b>
                          <small>{team.short_name ?? team.slug}</small>
                        </div>
                        <Link
                          className="manager-link-button"
                          href={`/admin/clubes?q=${encodeURIComponent(team.name)}#clubes-existentes`}
                        >
                          Remover em Clubes
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </details>

          <section className="manager-panel manager-section-calendar" id="calendario" aria-label="Preparar calendario da epoca">
            <header>
              <h2>Preparar calendario da epoca</h2>
              <p>Lista as jornadas da epoca selecionada e usa a criacao manual como apoio quando necessario.</p>
            </header>
            {sectionMessage("calendario")}
            <div className="manager-create-grid">
              <CalendarImportTool
                key={selectedSeason?.id ?? "calendar-import-no-season"}
                countryId={selectedCountry?.id ?? ""}
                competitionId={selectedCompetition?.id ?? ""}
                seasonId={selectedSeason?.id ?? ""}
                writeConfigured={participantData?.writeConfigured === true}
              />

              <details className="manager-create-card manager-fallback-card manager-calendar-fallback">
                <summary>
                  <span>
                    <strong>Criar jornada manualmente</strong>
                    <small>
                      {!selectedSeason
                        ? "Escolhe uma epoca primeiro."
                        : participantsForSeason.length === 0
                          ? "Antes de criar jornadas, define os participantes desta epoca."
                          : "Usar apenas para ajustes pontuais."}
                    </small>
                  </span>
                </summary>
                <form className="manager-create-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="matchday" />
                  <input type="hidden" name="return_to" value={calendarReturnTo} />
                  <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
                  <div className="manager-field">
                    <label htmlFor="new-matchday-number">Numero</label>
                    <input
                      id="new-matchday-number"
                      name="number"
                      type="number"
                      min={1}
                      defaultValue={nextMatchdayNumber}
                      disabled={!canCreateMatchday}
                      required={canCreateMatchday}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-matchday-label">Nome</label>
                    <input
                      id="new-matchday-label"
                      name="label"
                      placeholder="Ex: Jornada 01"
                      disabled={!canCreateMatchday}
                      required={canCreateMatchday}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-matchday-start">Inicio</label>
                    <input id="new-matchday-start" name="starts_on" type="date" disabled={!canCreateMatchday} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-matchday-end">Fim</label>
                    <input id="new-matchday-end" name="ends_on" type="date" disabled={!canCreateMatchday} />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-matchday-status">Estado</label>
                    <select id="new-matchday-status" name="status" disabled={!canCreateMatchday}>
                      <option value="scheduled">Planeada</option>
                      <option value="live">Em curso</option>
                      <option value="finished">Terminada</option>
                      <option value="archived">Arquivada</option>
                    </select>
                  </div>
                  <button className="manager-button" type="submit" disabled={!canCreateMatchday}>
                    Criar jornada
                  </button>
                </form>
              </details>

              <article className="manager-create-card manager-wide-card manager-calendar-list">
                <header>
                  <h3>{selectedSeason?.label ?? "Sem epoca selecionada"}</h3>
                  <p>{matchdaysForSeason.length} jornadas no calendario desta epoca.</p>
                </header>
                {matchdaysForSeason.length === 0 ? (
                  <div className="manager-empty">Ainda nao ha jornadas nesta epoca.</div>
                ) : (
                  <ul className="manager-matchday-grid">
                    {matchdaysForSeason.map((matchday) => (
                      <li
                        key={matchday.id}
                        className={`manager-matchday-card${selectedMatchday?.id === matchday.id ? " is-selected" : ""}`}
                      >
                        <div>
                          <code>J{String(matchday.number).padStart(2, "0")}</code>
                          <strong>{matchday.label}</strong>
                          <small>
                            {matchday.starts_on ?? "Sem inicio"} / {matchday.ends_on ?? "Sem fim"} - {matchday.status}
                          </small>
                        </div>
                        <div className="manager-matchday-actions">
                          <a className="manager-link-button" href={buildMatchdayUrl(currentReturnTo, matchday.id, "jogos")}>
                            Abrir
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {matchdaysForSeason.length > 0 ? (
                  <details className="manager-create-card manager-fallback-card">
                    <summary>
                      <span>
                        <strong>Remover jornada</strong>
                        <small>Acao secundaria. So remove jornadas sem jogos associados.</small>
                      </span>
                    </summary>
                    <form
                      className="manager-create-form"
                      action="/api/admin/gestor"
                      data-confirm="Tem a certeza que quer remover esta jornada? Esta acao so avanca se nao houver jogos associados."
                      method="post"
                    >
                      <input type="hidden" name="action_type" value="remove_matchday" />
                      <input type="hidden" name="return_to" value={calendarReturnTo} />
                      <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
                      <div className="manager-field">
                        <label htmlFor="remove-matchday-id">Jornada</label>
                        <select id="remove-matchday-id" name="matchday_id" defaultValue={selectedMatchday?.id ?? matchdaysForSeason[0]?.id ?? ""}>
                          {matchdaysForSeason.map((matchday) => (
                            <option key={matchday.id} value={matchday.id}>
                              {matchday.number}. {matchday.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className="manager-link-button" type="submit">
                        Remover jornada
                      </button>
                    </form>
                  </details>
                ) : null}
              </article>
            </div>
          </section>

          <section className="manager-panel manager-section-matches" id="jogos" aria-label="Jornada atual">
            <header>
              <h2>Jornada atual</h2>
              <p>Organiza os jogos da jornada selecionada, da agenda ao resultado final manual.</p>
            </header>
            {sectionMessage("jogos")}
            <div className="manager-create-grid">
              <article className="manager-create-card manager-jornada-selector">
                <header>
                  <h3>Escolher jornada</h3>
                  <p>
                    {!selectedSeason
                      ? "Escolhe uma epoca primeiro."
                      : matchdaysForSeason.length === 0
                        ? "Prepara o calendario antes de abrir uma jornada."
                        : selectedMatchday
                          ? `Painel aberto: ${selectedMatchday.number}. ${selectedMatchday.label}`
                          : "Escolhe uma jornada para abrir o painel operacional."}
                  </p>
                </header>
                <form className="manager-create-form" action="/admin/gestor#jogos" method="get">
                  <input type="hidden" name="pais" value={selectedCountry?.id ?? ""} />
                  <input type="hidden" name="competicao" value={selectedCompetition?.id ?? ""} />
                  <input type="hidden" name="epoca" value={selectedSeason?.id ?? ""} />
                  <input type="hidden" name="section" value="jogos" />
                  <div className="manager-field">
                    <label htmlFor="selected-matchday">Jornada</label>
                    <select
                      id="selected-matchday"
                      name="jornada"
                      disabled={matchdaysForSeason.length === 0}
                      defaultValue={selectedMatchday?.id ?? ""}
                    >
                      {matchdaysForSeason.length === 0 ? <option value="">Sem jornadas manuais</option> : null}
                      {matchdaysForSeason.map((matchday) => (
                        <option key={matchday.id} value={matchday.id}>
                          {matchday.number}. {matchday.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="manager-button" type="submit" disabled={matchdaysForSeason.length === 0}>
                    Abrir jornada
                  </button>
                </form>
              </article>

              <article className="manager-create-card manager-wide-card manager-match-summary">
                <header>
                  <h3>{selectedMatchday ? `${selectedMatchday.number}. ${selectedMatchday.label}` : "Sem jornada selecionada"}</h3>
                  <p>
                    {selectedMatchday
                      ? "Resumo operacional da jornada selecionada."
                      : "Escolhe uma jornada para ver jogos, resultados e classificacao."}
                  </p>
                </header>
                <div className="manager-stat-row manager-match-stat-row">
                  <article className="manager-stat">
                    <strong>{scheduledMatchesForMatchday.length}</strong>
                    <small>Jogos agendados</small>
                  </article>
                  <article className="manager-stat">
                    <strong>{futureLiveMatchesForMatchday.length}</strong>
                    <small>Jogos em direto</small>
                  </article>
                  <article className="manager-stat">
                    <strong>{finishedMatchesForMatchday.length}</strong>
                    <small>Jogos finalizados</small>
                  </article>
                  <article className="manager-stat">
                    <strong>{matchesForMatchday.length}</strong>
                    <small>Total nesta jornada</small>
                  </article>
                </div>
              </article>

              <details
                id="editar-jogo"
                className="manager-create-card manager-wide-card manager-fallback-card manager-match-form"
                open={Boolean(editingMatch)}
              >
                <summary>
                  <span>
                    <strong>{editingMatch ? "Editar jogo" : "Adicionar jogo manualmente"}</strong>
                    <small>
                      {!selectedMatchday
                        ? "Escolhe uma jornada primeiro."
                        : participantTeamOptions.length < 2
                          ? "E preciso ter pelo menos dois participantes para criar um jogo."
                          : matchTeamOptions.length < 2
                            ? "As equipas disponiveis ja tem jogo nesta jornada."
                          : editingMatch
                            ? "Corrige apenas a agenda deste jogo."
                            : "Usar apenas para correcoes pontuais ou jogos em falta."}
                    </small>
                  </span>
                </summary>
                <form
                  className="manager-create-form"
                  action="/api/admin/gestor"
                  data-can-create-match={canCreateMatch ? "true" : "false"}
                  data-match-form="true"
                  method="post"
                >
                  {editingMatch ? (
                    <input type="hidden" name="action_type" value="update_match" />
                  ) : (
                    <input type="hidden" name="action_type" value="match" />
                  )}
                  <input type="hidden" name="return_to" value={matchesReturnTo} />
                  <input type="hidden" name="competition_id" value={selectedCompetition?.id ?? ""} />
                  <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
                  <input type="hidden" name="matchday_id" value={selectedMatchday?.id ?? ""} />
                  {editingMatch ? <input type="hidden" name="match_id" value={editingMatch.id} /> : null}
                  <div className="manager-field">
                    <label htmlFor="new-match-home">Casa</label>
                    <select
                      id="new-match-home"
                      name="home_team_id"
                      defaultValue={defaultMatchHomeId}
                      disabled={!canCreateMatch}
                      required={canCreateMatch}
                    >
                      {matchTeamOptions.length < 2 ? <option value="">Sem equipas disponiveis</option> : null}
                      {matchTeamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-match-away">Fora</label>
                    <select
                      id="new-match-away"
                      name="away_team_id"
                      defaultValue={defaultMatchAwayId}
                      disabled={!canCreateMatch}
                      required={canCreateMatch}
                    >
                      {matchTeamOptions.length < 2 ? <option value="">Sem equipas disponiveis</option> : null}
                      {matchTeamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="manager-empty" data-match-warning="true" hidden>
                    Casa e Fora nao podem ser o mesmo clube.
                  </p>
                  <div className="manager-field">
                    <label htmlFor="new-match-kickoff">Data e hora</label>
                    <input
                      id="new-match-kickoff"
                      name="kickoff_at"
                      type="datetime-local"
                      defaultValue={toDatetimeLocal(editingMatch?.kickoff_at)}
                      disabled={!canCreateMatch}
                      required={canCreateMatch}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-match-venue">Estadio</label>
                    <input
                      id="new-match-venue"
                      name="venue"
                      placeholder="Opcional"
                      defaultValue={editingMatch?.venue ?? ""}
                      disabled={!canCreateMatch}
                    />
                  </div>
                  <div className="manager-field">
                    <label htmlFor="new-match-status">Estado</label>
                    <select id="new-match-status" name="status" defaultValue="scheduled" disabled={!canCreateMatch}>
                      <option value="scheduled">Agendado</option>
                    </select>
                  </div>
                  <button className="manager-button" type="submit" data-match-submit="true" disabled={!canCreateMatch}>
                    {editingMatch ? "Guardar alteracoes" : "Criar jogo"}
                  </button>
                  {editingMatch ? (
                    <a className="manager-link-button" href={withSection(matchdayReturnTo, "jogos")}>
                      Cancelar edicao
                    </a>
                  ) : null}
                </form>
              </details>

              <article className="manager-create-card manager-wide-card manager-match-scheduled">
                <header>
                  <h3>Jogos agendados</h3>
                  <p>
                    {selectedMatchday
                      ? `${scheduledMatchesForMatchday.length} jogos ainda tratados como agenda nesta jornada.`
                      : "Escolhe uma jornada para ver os jogos agendados."}
                  </p>
                </header>
                {!selectedMatchday ? (
                  <div className="manager-empty">Escolhe uma jornada para ver os jogos.</div>
                ) : scheduledMatchesForMatchday.length === 0 ? (
                  <div className="manager-empty">Nao ha jogos agendados nesta jornada.</div>
                ) : (
                  <ul className="manager-list">{scheduledMatchesForMatchday.map(renderMatchListItem)}</ul>
                )}
              </article>

              <article className="manager-create-card manager-wide-card manager-future-card manager-match-live">
                <header>
                  <h3>Jogos em direto</h3>
                  <p>
                    {selectedMatchday
                      ? `${futureLiveMatchesForMatchday.length} jogos em direto ou intervalo nesta jornada.`
                      : "Escolhe uma jornada para ver jogos em direto."}
                  </p>
                </header>
                {!selectedMatchday ? (
                  <div className="manager-empty">Escolhe uma jornada para ver jogos em direto.</div>
                ) : futureLiveMatchesForMatchday.length === 0 ? (
                  <div className="manager-empty">Nao ha jogos em direto nesta jornada.</div>
                ) : (
                  <ul className="manager-list">{futureLiveMatchesForMatchday.map(renderMatchListItem)}</ul>
                )}
              </article>

              <article className="manager-create-card manager-wide-card manager-match-finished">
                <header>
                  <h3>Jogos finalizados</h3>
                  <p>
                    {selectedMatchday
                      ? `${finishedMatchesForMatchday.length} jogos com resultado final nesta jornada.`
                      : "Escolhe uma jornada para ver os jogos finalizados."}
                  </p>
                </header>
                {!selectedMatchday ? (
                  <div className="manager-empty">Escolhe uma jornada para ver os resultados.</div>
                ) : finishedMatchesForMatchday.length === 0 ? (
                  <div className="manager-empty">Ainda nao ha jogos finalizados nesta jornada.</div>
                ) : (
                  <ul className="manager-list">{finishedMatchesForMatchday.map(renderMatchListItem)}</ul>
                )}
              </article>
            </div>
          </section>

          <section className="manager-panel manager-section-standings" id="classificacao" aria-label="Classificacao acumulada da jornada">
            <header>
              <h2>Classificacao da jornada</h2>
              <p>
                {selectedMatchday
                  ? `Tabela acumulada da epoca ate a ${selectedMatchday.label}, usando apenas jogos finalizados.`
                  : "Escolhe uma jornada para calcular a classificacao acumulada."}
            </p>
          </header>
          <div className="manager-summary-grid">
            <article className="manager-create-card manager-wide-card">
                <header>
                  <h3>{selectedSeason?.label ?? "Sem epoca selecionada"}</h3>
                  <p>{classificationRows.length} participantes contabilizados.</p>
                </header>
                {!selectedMatchday ? (
                  <div className="manager-empty">Escolhe uma jornada para ver a classificacao.</div>
                ) : classificationRows.length === 0 ? (
                  <div className="manager-empty">Ainda nao ha participantes para calcular a classificacao.</div>
                ) : (
                  <div className="manager-table-wrap">
                    <table className="manager-table manager-classification-table">
                      <thead>
                        <tr>
                          <th rowSpan={2}>Pos</th>
                          <th rowSpan={2}>Clube</th>
                          <th className="manager-table-group manager-table-group-total manager-table-divider-left" colSpan={STAT_COLUMNS.length}>Total</th>
                          <th className="manager-table-group manager-table-divider-left" colSpan={STAT_COLUMNS.length}>Casa</th>
                          <th className="manager-table-group manager-table-divider-left" colSpan={STAT_COLUMNS.length}>Fora</th>
                        </tr>
                        <tr>
                          {renderClassificationStatHeaders("total")}
                          {renderClassificationStatHeaders("home")}
                          {renderClassificationStatHeaders("away")}
                        </tr>
                      </thead>
                      <tbody>
                        {classificationRows.map((row, index) => (
                          <tr key={row.teamId}>
                            <td>{index + 1}</td>
                            <td>
                              <span className="manager-classification-club-cell">
                                <span className="manager-classification-club-name">{row.name}</span>
                                <span className="manager-classification-club-form">
                                  <span>Ultimos:</span>
                                  {row.recentForm.length > 0 ? (
                                    <span className="manager-form-list">
                                      {row.recentForm.map((result, resultIndex) => (
                                        <span
                                          key={`${row.teamId}-${resultIndex}-${result.label}`}
                                          title={result.title}
                                          aria-label={result.title}
                                          className={
                                            result.label.startsWith("V")
                                              ? "manager-form-win"
                                              : result.label.startsWith("D")
                                                ? "manager-form-loss"
                                                : "manager-form-draw"
                                          }
                                        >
                                          {result.label}
                                        </span>
                                      ))}
                                    </span>
                                  ) : (
                                    "-"
                                  )}
                                </span>
                              </span>
                            </td>
                            {renderClassificationStatCells(totalClassificationStats(row), {
                              divider: true,
                              emphasizePoints: true,
                              group: "total"
                            })}
                            {renderClassificationStatCells(row.home, { divider: true, group: "home" })}
                            {renderClassificationStatCells(row.away, { divider: true, group: "away" })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>
          </section>

          <section className="manager-panel manager-section-editorial" id="linha-editorial" aria-label="Linha editorial da jornada">
            <header>
              <h2>Linha editorial da jornada</h2>
              <p>
                A edicao editorial foi separada do gestor, mas continua ligada a jornada selecionada.
              </p>
            </header>
            {sectionMessage("linha-editorial")}
            {!selectedMatchday ? (
              <div className="manager-empty">Escolhe uma jornada para abrir a edicao editorial.</div>
            ) : (
              <div className="manager-create-grid">
                <article className="manager-create-card manager-wide-card">
                  <header>
                    <h3>1.ª página editorial desta jornada</h3>
                    <p>
                      {selectedCountry?.name ?? "Pais"} / {selectedCompetition?.name ?? "Competicao"} / {selectedSeason?.label ?? "Epoca"} /{" "}
                      {selectedMatchday.label}
                    </p>
                  </header>
                  <div className="manager-editorial-page">
                    <header>
                      <h3>Editar camada editorial</h3>
                      <p>
                        A jornada continua a ser criada e gerida aqui. A primeira pagina editorial desta jornada passa
                        a ser editada numa pagina propria, sempre ligada ao mesmo matchday_id.
                      </p>
                    </header>
                    <section className="manager-editorial-block manager-editorial-placeholder">
                      <header>
                        <span className="manager-editorial-block-number">J</span>
                        <div>
                          <h4>{selectedMatchday.label}</h4>
                          <p>Esta ligacao abre a edicao da manchete, destaques e espacos editoriais da jornada.</p>
                        </div>
                      </header>
                      <a className="manager-link-button" href={`/admin/editorial/jornada/${selectedMatchday.id}`}>
                        Editar 1.ª página editorial desta jornada
                      </a>
                    </section>
                    <section className="manager-editorial-block">
                      <header>
                        <span className="manager-editorial-block-number">A</span>
                        <div>
                          <h4>Blocos automaticos desta pagina</h4>
                          <p>Continuam a ser alimentados pelos dados competitivos desta mesma jornada.</p>
                        </div>
                      </header>
                      <ul className="manager-editorial-note-list">
                        <li>Onde ver: vem dos jogos agendados e canais TV.</li>
                        <li>Placard dos jogos: vem dos jogos da jornada.</li>
                        <li>Classificacao: calculada automaticamente.</li>
                        <li>Data da jornada: vem de matches.kickoff_at.</li>
                      </ul>
                    </section>
                  </div>
                </article>
              </div>
            )}
          </section>
          <section className="manager-panel manager-section-participants" id="participantes" aria-label="Participantes da epoca">
            <header>
              <h2>Participantes da epoca</h2>
              <p>Clubes inscritos na epoca selecionada. Podes adicionar manualmente ou aplicar uma lista validada na secao anterior.</p>
            </header>
            {sectionMessage("participantes")}
            <div className="manager-stat-row">
              <article className="manager-stat">
                <strong>{participantsForSeason.length}</strong>
                <small>Participantes nesta epoca</small>
              </article>
              <article className="manager-stat">
                <strong>{selectedCompetition ? 1 : 0}</strong>
                <small>Competicao selecionada</small>
              </article>
              <article className="manager-stat">
                <strong>{selectedSeason ? 1 : 0}</strong>
                <small>Epoca selecionada</small>
              </article>
            </div>
            <div className="manager-summary-grid">
              <article className="manager-create-card manager-wide-card manager-primary-card">
                <header>
                  <h3>{selectedSeason?.label ?? "Sem epoca selecionada"}</h3>
                  <p>{selectedCompetition?.name ?? "Escolhe uma competicao e uma epoca"}</p>
                </header>
                {participantData?.error ? (
                  <div className="manager-empty">Nao foi possivel ler os participantes: {participantData.error}</div>
                ) : !selectedSeason ? (
                  <div className="manager-empty">Escolhe ou cria uma epoca para ver os participantes.</div>
                ) : participantsForSeason.length === 0 ? (
                  <div className="manager-empty">Ainda nao ha participantes associados a esta epoca.</div>
                ) : (
                  <ul className="manager-compact-participants">
                    {participantsForSeason.map((participant) => (
                      <li key={participant.id}>{participant.team?.name ?? "Clube sem nome"}</li>
                    ))}
                  </ul>
                )}
              </article>

              <details className="manager-create-card manager-wide-card manager-fallback-card">
                <summary>
                  <span>
                    <strong>Gerir participantes</strong>
                    <small>Abre para adicionar manualmente ou remover participantes pontuais.</small>
                  </span>
                </summary>

                <div className="manager-summary-grid">
                  <article className="manager-create-card manager-wide-card manager-fallback-card">
                    <header>
                      <h3>Adicionar participante manualmente</h3>
                      <p>{selectedSeason ? "Fallback para ajustes pontuais. Para preparar a epoca completa, usa a lista validada acima." : "Escolhe uma epoca primeiro."}</p>
                    </header>
                    <form className="manager-create-form" action="/api/admin/gestor" method="post">
                      <input type="hidden" name="action_type" value="participant" />
                      <input type="hidden" name="return_to" value={participantsReturnTo} />
                      <input type="hidden" name="country_id" value={selectedCountry?.id ?? ""} />
                      <input type="hidden" name="season_id" value={selectedSeason?.id ?? ""} />
                      <input type="hidden" name="display_order" value={participantsForSeason.length + 1} />
                      <div className="manager-field">
                        <label htmlFor="new-participant-team">Clube</label>
                        <select id="new-participant-team" name="team_id" disabled={!canAddParticipant} required={canAddParticipant}>
                          {teamsAvailableForSeason.length === 0 ? (
                            <option value="">{unavailableTeamMessage}</option>
                          ) : null}
                          {teamsAvailableForSeason.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className="manager-button" type="submit" disabled={!canAddParticipant}>
                        Adicionar participante
                      </button>
                    </form>
                  </article>

                  <article className="manager-create-card manager-wide-card">
                    <header>
                      <div className="manager-card-heading-row">
                        <div>
                          <h3>Lista completa</h3>
                          <p>Usa apenas quando precisares de remover participantes individualmente.</p>
                        </div>
                        {selectedSeason && participantsForSeason.length > 0 ? (
                          <form
                            action="/api/admin/gestor"
                            data-confirm="Tem a certeza que pretende remover todos os participantes desta época? Os clubes não serão apagados."
                            method="post"
                          >
                            <input type="hidden" name="action_type" value="remove_all_participants" />
                            <input type="hidden" name="return_to" value={participantsReturnTo} />
                            <input type="hidden" name="season_id" value={selectedSeason.id} />
                            <button className="manager-link-button" type="submit">
                              REMOVER TODOS
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </header>
                    {participantData?.error ? (
                      <div className="manager-empty">Nao foi possivel ler os participantes: {participantData.error}</div>
                    ) : !selectedSeason ? (
                      <div className="manager-empty">Escolhe ou cria uma epoca para ver os participantes.</div>
                    ) : participantsForSeason.length === 0 ? (
                      <div className="manager-empty">Ainda nao ha participantes associados a esta epoca.</div>
                    ) : (
                      <ul className="manager-list">
                        {participantsForSeason.map((participant) => (
                          <li key={participant.id}>
                            <div>
                              <b>{participant.team?.name ?? "Clube sem nome"}</b>
                              <small>{participant.team?.short_name ?? participant.team?.slug ?? "Sem sigla"}</small>
                            </div>
                            <form
                              action="/api/admin/gestor"
                              data-confirm="Tem a certeza que quer remover este participante desta epoca?"
                              method="post"
                            >
                              <input type="hidden" name="action_type" value="remove_participant" />
                              <input type="hidden" name="return_to" value={participantsReturnTo} />
                              <input type="hidden" name="participant_id" value={participant.id} />
                              <input type="hidden" name="season_id" value={selectedSeason.id} />
                              <button className="manager-link-button" type="submit">
                                Remover
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                </div>
              </details>
            </div>
          </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
