"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import MatchdayVideoSummarySync from "@/components/admin/MatchdayVideoSummarySync";

import MatchdayEditorialContextSelector, {
  type MatchdayEditorialContextSelectorData,
} from "./MatchdayEditorialContextSelector";

import {
  EDITORIAL_PROFILES,
  EDITORIAL_VISUAL_FAMILIES,
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
  editorialProfileWithZoneLayouts,
  type EditorialProfileZoneKey,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskDiagnostic,
  MatchdayEditorialProfileDeskSnapshot,
} from "@/lib/editorial-matchday-profile-desk";
import {
  fixMatchdayEditorialItemsAtPosition,
  moveMatchdayEditorialItemsToBank,
  moveMatchdayEditorialItemsToFaixa,
  reconcileMatchdayEditorialProfileDeskSnapshot,
  releaseMatchdayEditorialFixedPositions,
  returnMatchdayEditorialItemsToAutomatic,
  compactMatchdayEditorialProfileManualOverridesForLayoutChange,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileEffectiveItem,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS,
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS,
  matchdayEditorialProfileOpeningSourceIds,
  matchdayEditorialProfileThematicZoneOrderFromBlockOrder,
  moveMatchdayEditorialProfileItemToOpening,
  moveMatchdayEditorialProfileThematicBlock,
  reconcileMatchdayEditorialProfileWorkspace,
  removeMatchdayEditorialProfileItemFromOpening,
  withoutMatchdayEditorialProfileOpeningOverrides,
  type MatchdayEditorialProfileOpening,
  type MatchdayEditorialProfileOpeningSlotKey,
  type MatchdayEditorialProfilePageControls,
  type MatchdayEditorialProfileThematicBlockKey,
} from "@/lib/editorial-matchday-profile-workspace";
import {
  MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS,
  matchdayEditorialProfileSelectionBankItemByIdentity,
  parseMatchdayEditorialProfileSelectionDrag,
  promoteMatchdayEditorialProfileSelection,
  removeMatchdayEditorialProfileSelection,
  serializeMatchdayEditorialProfileSelectionDrag,
  type MatchdayEditorialProfileSelectionPosition,
} from "@/lib/editorial-matchday-profile-selection";

type EditorialSelectionCandidate =
  Readonly<{
    bankItemId: string;
    sourceType: string | null;
    sourceId: string | null;
    label: string | null;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
  }>;

type EditorialSelectionItem =
  Readonly<{
    position: number;
    liveItemId: string;
    bankItemId: string | null;
    sourceType: string | null;
    sourceId: string | null;
    label: string | null;
    title: string | null;
    subtitle: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
  }>;

type EditorialSelectionResponse =
  Readonly<{
    ok?: boolean;
    error?: string;
    message?: string;
    candidates?: readonly EditorialSelectionCandidate[];
    items?: readonly EditorialSelectionItem[];
  }>;

type VideoHighlightDraft = Readonly<{
  action: "preserve" | "remove" | "replace";
  bankItemId: string | null;
}>;

type VideoModuleDraft = Readonly<{
  active: boolean;
  highlight: VideoHighlightDraft;
}>;

const FAIXA_INITIAL_VISIBLE = 30;
const FAIXA_PAGE_SIZE = 30;
const RESERVOIR_INITIAL_VISIBLE = 30;
const RESERVOIR_PAGE_SIZE = 30;

type ActiveWorkspaceKey =
  | "opening"
  | "latest"
  | "highlight"
  | EditorialProfileZoneKey;

type SourceViewKey = "available" | "faixa";

const styles = `
  body { margin: 0; background: #edf1f5; color: #111820; font-family: Arial, Helvetica, sans-serif; }
  * { box-sizing: border-box; }
  button, input, select { font: inherit; }
  .thematic-shell { min-height: 100vh; padding: 7px 8px 68px; }
  .thematic-content { display: grid; gap: 6px; width: min(1920px, 100%); margin: 0 auto; }
  .thematic-hero { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 48px; padding: 6px 10px; border-radius: 7px; background: #101820; color: #fff; box-shadow: 0 5px 16px rgba(12,22,34,.12); }
  .thematic-hero-main { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
  .thematic-hero h1, .thematic-hero p { margin: 0; }
  .thematic-eyebrow { color: #ff5c65; font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .thematic-hero h1 { font-size: clamp(18px,2vw,23px); }
  .thematic-context { color: #cbd5e1; font-size: 11px; }
  .thematic-status { display: inline-flex; align-items: center; min-height: 23px; padding: 3px 8px; border: 1px solid #4ade80; border-radius: 999px; color: #bbf7d0; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .thematic-status.pending { border-color: #fbbf24; color: #fde68a; }
  .thematic-hero nav { display: flex; flex-wrap: wrap; gap: 5px; }
  .thematic-hero a { padding: 6px 9px; border: 1px solid rgba(255,255,255,.25); border-radius: 5px; color: #fff; font-size: 10px; font-weight: 800; text-decoration: none; }
  .thematic-panel { border: 1px solid #d7e0e9; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgba(12,22,34,.035); }
  .thematic-editorial-selection { display: grid; gap: 4px; padding: 0 7px 7px; }
  .thematic-selection-slot[data-drag-active="true"] { border-color: #e43e48; background: #fff2f3; }
  .thematic-card.thematic-selection-card { width: 100%; grid-template-columns: 50px minmax(0,1fr) 24px; }
  .thematic-selection-card .thematic-card-copy small { overflow: hidden; color: #657487; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
  .thematic-movements summary { padding: 9px 10px; cursor: pointer; font-size: 11px; font-weight: 900; }
  .thematic-field { display: grid; gap: 3px; color: #5f6e80; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .thematic-field select { min-height: 31px; padding: 5px 7px; border: 1px solid #c8d3df; border-radius: 5px; background: #fff; color: #111820; }
  .thematic-button { min-height: 28px; padding: 4px 7px; border: 1px solid #bac7d4; border-radius: 5px; background: #fff; color: #243244; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-button:hover:not(:disabled) { background: #edf3f8; }
  .thematic-button:disabled { cursor: default; opacity: .4; }
  .thematic-button.dark { border-color: #101820; background: #101820; color: #fff; }
  .thematic-dropbar[data-drag-active="true"] { border-color: #e43e48; background: #fff2f3; }
  .thematic-slot-label { display: block; margin-bottom: 4px; color: #5e6d7d; font-size: 8px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  .thematic-empty { display: grid; place-items: center; min-height: 55px; margin: 0; color: #8a98a8; font-size: 9px; font-weight: 700; text-align: center; }
  .thematic-position { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 999px; background: #172331; color: #fff; font-size: 8px; font-weight: 900; }
  .thematic-dropbar { margin: 0 7px 7px; padding: 6px; border: 1px dashed #b9c6d4; border-radius: 5px; color: #69788a; font-size: 8px; font-weight: 800; text-align: center; }
  .thematic-card { position: relative; display: grid; grid-template-columns: 18px 50px minmax(0,1fr) 24px; gap: 5px; align-items: center; min-width: 0; min-height: 58px; padding: 4px; border: 1px solid #dfe6ee; border-radius: 5px; background: #fff; cursor: grab; box-shadow: 0 1px 4px rgba(15,23,42,.04); }
  .thematic-card:active { cursor: grabbing; }
  .thematic-card.selected { border-color: #e43e48; box-shadow: inset 3px 0 0 #e43e48; }
  .thematic-card input[type="checkbox"] { width: 14px; height: 14px; accent-color: #e43e48; }
  .thematic-image, .thematic-image-placeholder { display: block; width: 50px; height: 40px; border-radius: 4px; background: #dce4ed; object-fit: cover; }
  .thematic-card-copy { display: grid; min-width: 0; gap: 1px; }
  .thematic-card-top { display: flex; min-width: 0; flex-wrap: wrap; gap: 3px; align-items: center; }
  .thematic-card-label { overflow: hidden; color: #cc2732; font-size: 7px; font-weight: 900; letter-spacing: .03em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .thematic-manual { padding: 1px 4px; border-radius: 999px; background: #fff0b8; color: #765000; font-size: 7px; font-weight: 900; }
  .thematic-card-title { display: -webkit-box; overflow: hidden; font-size: 10px; line-height: 1.14; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .thematic-card time { color: #6c7a8b; font-size: 7px; }
  .thematic-card-menu { position: relative; align-self: start; }
  .thematic-card-menu summary { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid #d7e0e9; border-radius: 4px; cursor: pointer; list-style: none; font-weight: 900; }
  .thematic-card-menu summary::-webkit-details-marker { display: none; }
  .thematic-card-menu[open] { z-index: 15; }
  .thematic-card-actions { position: absolute; top: 22px; right: 0; display: grid; gap: 3px; width: 158px; padding: 5px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; box-shadow: 0 8px 20px rgba(15,23,42,.16); }
  .thematic-card-actions button { width: 100%; text-align: left; }
  .thematic-more { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 0 8px 8px; color: #64748b; font-size: 9px; }
  .thematic-bulk-context { position: sticky; z-index: 25; top: 44px; display: grid; gap: 7px; padding: 8px 10px; border: 1px solid #9fb2c5; border-radius: 8px; background: rgba(255,255,255,.98); box-shadow: 0 8px 22px rgba(15,23,42,.14); backdrop-filter: blur(10px); }
  .thematic-bulk-context-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .thematic-bulk-context-copy { display: grid; gap: 1px; }
  .thematic-bulk-context-copy strong { font-size: 11px; }
  .thematic-bulk-context-actions { display: flex; flex-wrap: wrap; gap: 7px; align-items: end; }
  .thematic-bulk-group { display: flex; flex-wrap: wrap; gap: 5px; align-items: end; padding-right: 7px; border-right: 1px solid #d7e0e9; }
  .thematic-bulk-group:last-child { padding-right: 0; border-right: 0; }
  .thematic-bulk-context .thematic-field { min-width: 128px; }
  .thematic-bulk-context .thematic-field.zone { min-width: 170px; }
  .thematic-message { margin: 0; padding: 7px 9px; border-radius: 5px; background: #eef5ff; color: #25456e; font-size: 10px; font-weight: 700; }
  .thematic-message.error { background: #fff0f1; color: #a61f29; }
  .thematic-message.feedback { position: sticky; z-index: 26; top: 8px; box-shadow: 0 5px 16px rgba(15,23,42,.12); }
  .thematic-zone-alert { margin: 0 7px 7px; padding: 7px 9px; border: 1px solid #f2b8bd; border-radius: 5px; background: #fff0f1; color: #a61f29; font-size: 9px; font-weight: 800; line-height: 1.35; }
  .thematic-movement-list, .thematic-diagnostics { display: grid; gap: 3px; margin: 0; padding: 0 10px 10px 26px; font-size: 9px; }
  .thematic-pending { position: fixed; z-index: 30; right: 10px; bottom: 8px; left: 10px; display: flex; align-items: center; gap: 6px; width: min(1900px,calc(100% - 20px)); min-height: 48px; margin: 0 auto; padding: 7px 9px; border: 1px solid #c5d0dc; border-radius: 8px; background: rgba(255,255,255,.97); box-shadow: 0 10px 28px rgba(15,23,42,.18); backdrop-filter: blur(10px); }
  .thematic-pending-copy { display: grid; gap: 1px; margin-right: auto; }
  .thematic-pending-copy strong { font-size: 11px; }
  .thematic-workspace { display: grid; gap: 5px; }
  .thematic-zone-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-bottom: 1px solid #dce3eb; background: #f7f9fb; }
  .thematic-zone-tabs button { min-height: 28px; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 9px; font-weight: 850; cursor: pointer; }
  .thematic-zone-tabs button.active { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
  .thematic-workspace-body { display: grid; gap: 5px; padding: 5px; }
  .thematic-zone-editor { display: grid; grid-template-columns: minmax(220px,1fr) minmax(210px,.55fr) auto; gap: 5px; align-items: center; padding: 4px 5px; border: 1px solid #dce3eb; border-radius: 6px; background: #fbfcfd; }
  .thematic-zone-editor label { min-width: 0; }
  .thematic-zone-editor input, .thematic-zone-editor select { width: 100%; min-height: 29px; padding: 0 7px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 10px; }
  .thematic-zone-editor-count { min-width: 34px; font-size: 11px; font-weight: 900; text-align: right; white-space: nowrap; }
  .thematic-slots { display: grid; gap: 4px; }
  .thematic-slots-4 { grid-template-columns: repeat(4,minmax(0,1fr)); }
  .thematic-slots-5 { grid-template-columns: repeat(5,minmax(0,1fr)); }
  .thematic-slots-6 { grid-template-columns: repeat(6,minmax(0,1fr)); }
  .thematic-workspace-slot { min-width: 0; min-height: 64px; padding: 4px; border: 1px dashed #b8c4d2; border-radius: 5px; background: #fff; }
  .thematic-workspace-slot[data-drag-active="true"] { border-color: #2563eb; background: #eff6ff; }
  .thematic-workspace-slot .thematic-card { grid-template-columns: 16px 44px minmax(0,1fr) 22px; min-height: 52px; }
  .thematic-workspace-slot .thematic-card.thematic-selection-card { grid-template-columns: 44px minmax(0,1fr) 22px; }
  .thematic-workspace-slot .thematic-image, .thematic-workspace-slot .thematic-image-placeholder { width: 44px; height: 34px; }
  .thematic-highlight-row { display: grid; grid-template-columns: minmax(120px,160px) minmax(0,520px); gap: 5px; align-items: end; justify-content: start; }
  .thematic-highlight-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 7px; min-width: 0; }
  .thematic-highlight-card { display: grid; grid-template-columns: 50px minmax(0,1fr) auto; gap: 7px; align-items: center; min-height: 58px; padding: 6px; border: 1px solid #dfe6ee; border-radius: 6px; background: #fff; }
  .thematic-highlight-card strong { font-size: 11px; line-height: 1.2; }
  .thematic-sources { min-width: 0; border: 1px solid #d7e0e9; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgba(12,22,34,.035); }
  .thematic-sources-toolbar { display: flex; flex-wrap: nowrap; gap: 5px; align-items: center; min-width: 0; padding: 5px 6px; border-bottom: 1px solid #e5ebf1; background: #f7f9fb; }
  .thematic-sources-toolbar h2 { flex: 0 0 auto; margin: 0 3px 0 0; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
  .thematic-sources-toolbar nav { display: flex; flex: 0 0 auto; gap: 4px; }
  .thematic-sources-toolbar nav button { min-height: 27px; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 9px; font-weight: 850; cursor: pointer; }
  .thematic-sources-toolbar nav button.active { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
  .thematic-reservoir-filters { display: flex; flex: 0 0 auto; flex-wrap: nowrap; gap: 4px; align-items: center; padding: 0; }
  .thematic-reservoir-search { flex: 1 1 220px; min-width: 170px; min-height: 29px; padding: 0 7px; border: 1px solid #cbd5df; border-radius: 5px; }
  .thematic-reservoir-count { color: #64748b; font-size: 10px; font-weight: 850; white-space: nowrap; }
  .thematic-sources-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; padding: 6px; }
  .thematic-sources-list .thematic-card { min-height: 60px; }
  .thematic-sources-list[data-drag-active="true"] { background: #fff8f8; box-shadow: inset 0 0 0 1px #e43e48; }
  .thematic-faixa-item { display: grid; grid-template-columns: 22px minmax(0,1fr); gap: 5px; align-items: start; min-width: 0; }
  .thematic-global-tools { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px; }
  .thematic-global-tool { min-width: 0; border: 1px solid #d7e0e9; border-radius: 7px; background: #fff; box-shadow: 0 3px 10px rgba(12,22,34,.03); }
  .thematic-global-tool[open] { grid-column: 1 / -1; }
  .thematic-global-tool > summary { min-height: 30px; padding: 7px 9px; cursor: pointer; color: #243244; font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
  .thematic-global-tool-body { padding: 0 6px 6px; }
  .thematic-global-tool-body .video-summary-sync { margin: 0; padding: 7px; }
  .thematic-page-structure { display: grid; gap: 5px; padding: 0 6px 6px; }
  .thematic-page-structure-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .thematic-top-tools, .thematic-top-tools label { display: flex; align-items: center; gap: 5px; }
  .thematic-top-tools span { color: #64748b; font-size: 9px; font-weight: 800; }
  .thematic-top-tools input[type="color"] { width: 36px; height: 28px; padding: 2px; border: 1px solid #cbd5df; border-radius: 5px; }
  .thematic-page-structure-list { display: grid; gap: 3px; }
  .thematic-page-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; min-height: 32px; padding: 3px 5px; border: 1px solid #e0e6ed; border-radius: 5px; background: #f8fafc; color: #10151b; font: inherit; text-align: left; }
  button.thematic-page-row { grid-template-columns: 56px minmax(0,1fr) auto; cursor: pointer; }
  .thematic-page-row.active { border-color: #1d4ed8; box-shadow: inset 3px 0 #1d4ed8; }
  .thematic-page-row-main { display: grid; grid-template-columns: 56px minmax(170px,1fr) minmax(190px,1fr); gap: 8px; align-items: center; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .thematic-page-row > span, .thematic-page-row-main > span { color: #64748b; font-size: 9px; font-weight: 850; text-transform: uppercase; }
  .thematic-page-row strong, .thematic-page-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thematic-page-row strong { font-size: 10px; }
  .thematic-page-row small { color: #64748b; font-size: 9px; }
  .thematic-page-row-actions { display: flex; gap: 3px; }
  .thematic-page-row-actions button { width: 26px; min-height: 25px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; cursor: pointer; }
  .thematic-page-row-actions button:disabled { opacity: .35; cursor: not-allowed; }
  .thematic-reservoir-filters label { display: inline-flex; gap: 4px; align-items: center; min-height: 27px; padding: 3px 7px; border: 1px solid #d7dee7; border-radius: 999px; color: #334155; font-size: 10px; font-weight: 800; cursor: pointer; }
  .thematic-reservoir-filters input { width: 13px; height: 13px; margin: 0; accent-color: #1d4ed8; }
  .thematic-reservoir-search { display: grid; grid-template-columns: auto minmax(140px,1fr); gap: 6px; align-items: center; padding: 0 7px; background: #fff; }
  .thematic-reservoir-search span { color: #64748b; font-size: 9px; font-weight: 800; }
  .thematic-reservoir-search input { min-width: 0; min-height: 28px; border: 0; outline: 0; font: inherit; font-size: 10px; }
  .thematic-reservoir-count { display: inline-flex; align-items: baseline; gap: 3px; line-height: 1.1; }
  .thematic-highlight-controls label { display: grid; width: 100%; gap: 3px; color: #526173; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .thematic-highlight-controls select { min-height: 30px; padding: 0 8px; border: 1px solid #cbd5df; border-radius: 6px; background: #fff; }
  .thematic-highlight-slot { min-width: 0; max-width: none; }
  .thematic-highlight-card { grid-template-columns: 80px minmax(0,1fr); }
  .thematic-highlight-card img { width: 80px; height: 58px; border-radius: 5px; object-fit: cover; }
  .thematic-highlight-card > div { display: grid; gap: 5px; }
  .thematic-highlight-card span { color: #64748b; font-size: 9px; }
  @media (max-width: 1180px) { .thematic-sources-toolbar, .thematic-reservoir-filters { flex-wrap: wrap; } .thematic-slots-5, .thematic-slots-6, .thematic-sources-list { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media (max-width: 760px) { .thematic-global-tools, .thematic-page-row, .thematic-page-row-main, .thematic-zone-editor, .thematic-highlight-row, .thematic-slots-4, .thematic-slots-5, .thematic-slots-6, .thematic-sources-list { grid-template-columns: 1fr; } .thematic-page-row-actions { justify-content: flex-start; } }
`;

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Lisbon",
});

type WorkspaceEditorState = Readonly<{
  persistedOverrides: readonly MatchdayEditorialProfileManualOverride[];
  draftOverrides: readonly MatchdayEditorialProfileManualOverride[];
  persistedOpening: MatchdayEditorialProfileOpening;
  draftOpening: MatchdayEditorialProfileOpening;
  persistedPageControls: MatchdayEditorialProfilePageControls;
  draftPageControls: MatchdayEditorialProfilePageControls;
  persistedVideoModuleActive: boolean;
  draftVideoModule: VideoModuleDraft;
  selectedIdentities: readonly string[];
}>;

type WorkspaceDraft = Readonly<{
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  pageControls: MatchdayEditorialProfilePageControls;
  editorialSelection: readonly (string | null)[];
  videoModule: VideoModuleDraft;
}>;

type Placement = Readonly<{
  kind: "opening" | "zone" | "faixa" | "bank";
  zoneKey?: EditorialProfileZoneKey;
}>;

function imageLoader({ src }: ImageLoaderProps): string { return src; }

function formattedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

function renderableImageUrl(value: string | null): value is string {
  if (!value) return false;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

function identity(item: Pick<MatchdayEditorialProfileEffectiveItem, "sourceType" | "sourceId">): string {
  return thematicEditorialIdentity(item.sourceType, item.sourceId);
}

function sameJson(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

function manualLabel(mode: MatchdayEditorialProfileEffectiveItem["manualOverride"]): string | null {
  if (mode === "bank") return "manual · Banco";
  if (mode === "zone") return "manual · zona";
  if (mode === "position") return "manual · posição";
  if (mode === "faixa") return "manual · Faixa";
  return null;
}

function ArticleCard({ item, placement, selected, dragging, onToggle, onDragStart, onDragEnd, onAutomatic, onFaixa, onBank, onFixPosition, onReleasePosition, onProtectZone }: Readonly<{
  item: MatchdayEditorialProfileEffectiveItem;
  placement: Placement;
  selected: boolean;
  dragging: boolean;
  onToggle: (itemIdentity: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, itemIdentity: string) => void;
  onDragEnd: () => void;
  onAutomatic: () => void;
  onFaixa: () => void;
  onBank: () => void;
  onFixPosition: (() => void) | null;
  onReleasePosition: (() => void) | null;
  onProtectZone: (() => void) | null;
}>) {
  const itemIdentity = identity(item);
  const publishedAt = formattedDate(item.publishedAt);
  const manual = placement.kind === "opening" ? "manual · Abertura" : manualLabel(item.manualOverride);
  return (
    <article aria-grabbed={dragging} className={`thematic-card${selected ? " selected" : ""}`} draggable onDragEnd={onDragEnd} onDragStart={(event) => onDragStart(event, itemIdentity)}>
      <input aria-label={`Marcar para operação em lote: ${item.title ?? item.sourceId}`} checked={selected} onChange={() => onToggle(itemIdentity)} onClick={(event) => event.stopPropagation()} type="checkbox" />
      {renderableImageUrl(item.imageUrl) ? (
        <Image alt="" className="thematic-image" height={40} loader={imageLoader} loading="lazy" src={item.imageUrl} unoptimized width={50} />
      ) : <span aria-hidden="true" className="thematic-image-placeholder" />}
      <div className="thematic-card-copy">
        <div className="thematic-card-top">
          {item.label ? <span className="thematic-card-label">{item.label}</span> : null}
          {manual ? <span className="thematic-manual">{manual}</span> : null}
        </div>
        <strong className="thematic-card-title">{item.title ?? "Artigo sem título"}</strong>
        {publishedAt ? <time dateTime={item.publishedAt ?? undefined}>{publishedAt}</time> : null}
      </div>
      <details
        className="thematic-card-menu"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            event.currentTarget.open = false;
          }
        }}
        onClick={(event) => event.stopPropagation()}
        onMouseLeave={(event) => {
          const details = event.currentTarget;

          window.setTimeout(() => {
            if (
              !details.matches(":hover")
              && !details.contains(document.activeElement)
            ) {
              details.open = false;
            }
          }, 220);
        }}
      >
        <summary aria-label={`Ações de ${item.title ?? item.sourceId}`}>···</summary>
        <div
          className="thematic-card-actions"
          onClick={(event) => {
            const details = event.currentTarget.closest("details");
            if (details instanceof HTMLDetailsElement) {
              details.open = false;
            }
          }}
        >
          {onFixPosition ? <button className="thematic-button" onClick={onFixPosition} type="button">Fixar nesta posição</button> : null}
          {onProtectZone ? <button className="thematic-button" onClick={onProtectZone} type="button">Proteger na zona</button> : null}
          {onReleasePosition ? <button className="thematic-button" onClick={onReleasePosition} type="button">Libertar posição</button> : null}
          {placement.kind !== "faixa" ? <button className="thematic-button" onClick={onFaixa} type="button">Mover para Faixa</button> : null}
          {placement.kind !== "bank" ? <button className="thematic-button" onClick={onBank} type="button">Mover para Banco</button> : null}
          {(manual || placement.kind === "opening") ? <button className="thematic-button" onClick={onAutomatic} type="button">Devolver ao automático</button> : null}
        </div>
      </details>
    </article>
  );
}

function EditorialSelectionCard({
  candidate,
  dragging,
  onDragEnd,
  onDragStart,
  onRemove,
  position,
}: Readonly<{
  candidate: EditorialSelectionCandidate;
  dragging: boolean;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onRemove: () => void;
  position: MatchdayEditorialProfileSelectionPosition;
}>) {
  return (
    <article
      aria-grabbed={dragging}
      className="thematic-card thematic-selection-card"
      draggable
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;

        if (target.closest("button,summary,details")) {
          event.preventDefault();
          return;
        }

        onDragStart(event);
      }}
    >
      {renderableImageUrl(candidate.imageUrl) ? (
        <Image
          alt=""
          className="thematic-image"
          height={40}
          loader={imageLoader}
          loading="lazy"
          src={candidate.imageUrl}
          unoptimized
          width={50}
        />
      ) : (
        <span aria-hidden="true" className="thematic-image-placeholder" />
      )}

      <div className="thematic-card-copy">
        <div className="thematic-card-top">
          {candidate.label ? (
            <span className="thematic-card-label">{candidate.label}</span>
          ) : null}
          <span className="thematic-manual">manual · independente</span>
        </div>
        <strong className="thematic-card-title">{candidate.title}</strong>
        <small>
          {candidate.sourceType === "editorial_content"
            ? "Conteúdo editorial"
            : "Artigo editorial"}
          {candidate.subtitle ? ` · ${candidate.subtitle}` : ""}
        </small>
      </div>

      <details
        className="thematic-card-menu"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            event.currentTarget.open = false;
          }
        }}
        onClick={(event) => event.stopPropagation()}
        onMouseLeave={(event) => {
          const details = event.currentTarget;

          window.setTimeout(() => {
            if (
              !details.matches(":hover")
              && !details.contains(document.activeElement)
            ) {
              details.open = false;
            }
          }, 220);
        }}
      >
        <summary aria-label={`Ações da Seleção ${position}: ${candidate.title}`}>
          ···
        </summary>
        <div
          className="thematic-card-actions"
          onClick={(event) => {
            const details = event.currentTarget.closest("details");

            if (details instanceof HTMLDetailsElement) {
              details.open = false;
            }
          }}
        >
          <button
            className="thematic-button"
            onClick={onRemove}
            type="button"
          >
            Retirar da Seleção
          </button>
        </div>
      </details>
    </article>
  );
}

function Diagnostics({ diagnostics }: Readonly<{ diagnostics: readonly MatchdayEditorialProfileDeskDiagnostic[] }>) {
  if (diagnostics.length === 0) return null;
  return (
    <details className="thematic-panel thematic-movements">
      <summary>Diagnósticos · {diagnostics.length}</summary>
      <ul className="thematic-diagnostics">
        {diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}:${diagnostic.sourceId ?? ""}:${index}`}><code>{diagnostic.code}</code> · {diagnostic.message}</li>)}
      </ul>
    </details>
  );
}

export default function MatchdayEditorialThematicDeskClient({ contextSelector, desk }: Readonly<{
  contextSelector: MatchdayEditorialContextSelectorData;
  desk: MatchdayEditorialProfileDeskSnapshot;
}>) {
  const router = useRouter();
  const profile = EDITORIAL_PROFILES[desk.profileKey];
  const incomingProfile = editorialProfileWithZoneLayouts(
    profile,
    desk.pageControls.thematicZoneLayouts,
  );
  const [editorState, setEditorState] = useState<WorkspaceEditorState>(() => ({
    persistedOverrides: desk.manualOverrides,
    draftOverrides: withoutMatchdayEditorialProfileOpeningOverrides(
      incomingProfile,
      desk.manualOverrides,
      desk.opening,
    ),
    persistedOpening: desk.opening,
    draftOpening: desk.opening,
    persistedPageControls: desk.pageControls,
    draftPageControls: desk.pageControls,
    persistedVideoModuleActive: desk.videoModule.active,
    draftVideoModule: {
      active: desk.videoModule.active,
      highlight: {
        action: "preserve",
        bankItemId: null,
      },
    },
    selectedIdentities: [],
  }));
  const [history, setHistory] = useState<readonly WorkspaceDraft[]>([]);
  const [draggingIdentity, setDraggingIdentity] = useState<string | null>(null);
  const [draggingEditorialSelectionPosition, setDraggingEditorialSelectionPosition] =
    useState<MatchdayEditorialProfileSelectionPosition | null>(null);
  const [activeWorkspaceKey, setActiveWorkspaceKey] =
    useState<ActiveWorkspaceKey>("opening");
  const [activeSourceView, setActiveSourceView] =
    useState<SourceViewKey>("available");
  const pageStructureRef = useRef<HTMLDetailsElement>(null);
  const [destinationZone, setDestinationZone] = useState<EditorialProfileZoneKey>(profile.zones[0].key);
  const [startPosition, setStartPosition] = useState(1);
  const [faixaPosition, setFaixaPosition] = useState(1);
  const [faixaQuery, setFaixaQuery] = useState("");
  const [faixaZoneFilters, setFaixaZoneFilters] = useState<
    readonly EditorialProfileZoneKey[]
  >([]);
  const [faixaVisibleCount, setFaixaVisibleCount] = useState(FAIXA_INITIAL_VISIBLE);
  const [reservoirQuery, setReservoirQuery] = useState("");
  const [reservoirZoneFilters, setReservoirZoneFilters] = useState<
    readonly EditorialProfileZoneKey[]
  >([]);
  const [reservoirVisibleCount, setReservoirVisibleCount] = useState(
    RESERVOIR_INITIAL_VISIBLE,
  );
  const [applyState, setApplyState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [
    editorialSelectionCandidates,
    setEditorialSelectionCandidates,
  ] = useState<
    readonly EditorialSelectionCandidate[]
  >([]);
  const [
    persistedEditorialSelection,
    setPersistedEditorialSelection,
  ] = useState<
    readonly (string | null)[]
  >([null, null, null, null]);
  const [
    draftEditorialSelection,
    setDraftEditorialSelection,
  ] = useState<
    readonly (string | null)[]
  >([null, null, null, null]);
  const [zoneLayoutError, setZoneLayoutError] = useState<Readonly<{
    zoneKey: EditorialProfileZoneKey;
    message: string;
  }> | null>(null);

  async function loadEditorialSelection() {
    try {
      const response =
        await fetch(
          `/api/admin/editorial/jornada/${desk.matchdayId}/organizar/tematico`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

      const payload =
        await response.json().catch(
          () => null,
        ) as
          | EditorialSelectionResponse
          | null;

      if (
        !response.ok
        || !payload?.ok
      ) {
        throw new Error(
          payload?.message
          ?? "Não foi possível ler a Seleção editorial.",
        );
      }

      setEditorialSelectionCandidates(
        payload.candidates ?? [],
      );

      const nextSelection = [1, 2, 3, 4].map(
        (position) =>
          payload.items?.find(
            (item) => item.position === position,
          )?.bankItemId ?? null,
      );

      setPersistedEditorialSelection(nextSelection);
      setDraftEditorialSelection(nextSelection);
    } catch (error) {
      setApplyState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível ler a Seleção editorial.",
      );
    }
  }

  function changeEditorialSelection(
    position: MatchdayEditorialProfileSelectionPosition,
    bankItemId: string,
  ) {
    const nextSelection =
      promoteMatchdayEditorialProfileSelection(
        draftEditorialSelection,
        position,
        bankItemId,
      );

    commitDraft(
      {
        ...currentDraft(),
        editorialSelection: nextSelection,
      },
      "Seleção editorial alterada em preview. Clique em Aplicar para publicar a alteração.",
    );
  }

  function removeEditorialSelection(
    position: MatchdayEditorialProfileSelectionPosition,
  ) {
    commitDraft(
      {
        ...currentDraft(),
        editorialSelection:
          removeMatchdayEditorialProfileSelection(
            draftEditorialSelection,
            position,
          ),
      },
      "Promoção retirada da Seleção; a colocação original foi preservada.",
    );
  }

  function dropOnEditorialSelection(
    event: DragEvent<HTMLElement>,
    position: MatchdayEditorialProfileSelectionPosition,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const selectionDrag =
      parseMatchdayEditorialProfileSelectionDrag(
        event.dataTransfer.getData("text/plain"),
      );

    if (selectionDrag) {
      changeEditorialSelection(
        position,
        selectionDrag.bankItemId,
      );
      setDraggingEditorialSelectionPosition(null);
      return;
    }

    const itemIdentity = dragged(event);
    const bankItemId = itemIdentity
      ? bankItemIdByIdentity.get(itemIdentity) ?? null
      : null;

    if (!bankItemId) {
      setApplyState("error");
      setMessage(
        "A notícia já não tem uma identidade canónica disponível para a Seleção.",
      );
      setDraggingIdentity(null);
      return;
    }

    changeEditorialSelection(position, bankItemId);
    setDraggingIdentity(null);
  }

  function changeVideoModuleActive(active: boolean) {
    commitDraft(
      {
        ...currentDraft(),
        videoModule: {
          ...editorState.draftVideoModule,
          active,
        },
      },
      active
        ? "Destaque visível em preview."
        : "Destaque oculto em preview.",
    );
  }

  function changeVideoHighlight(value: string) {
    const highlight: VideoHighlightDraft =
      value === "remove"
        ? {
            action: "remove",
            bankItemId: null,
          }
        : value.startsWith("replace:")
          ? {
              action: "replace",
              bankItemId: value.slice("replace:".length),
            }
          : {
              action: "preserve",
              bankItemId: null,
            };

    commitDraft(
      {
        ...currentDraft(),
        videoModule: {
          ...editorState.draftVideoModule,
          highlight,
        },
      },
      highlight.action === "preserve"
        ? "Destaque reposto para o estado aplicado."
        : highlight.action === "remove"
          ? "Destaque retirado em preview."
          : "Destaque atualizado em preview.",
    );
  }

  useEffect(() => {
    void loadEditorialSelection();
  }, [desk.matchdayId]);

  useEffect(() => {
    setEditorState((current) => {
      const reconciledOverrides = reconcileMatchdayEditorialProfileDeskSnapshot(incomingProfile, {
        persistedOverrides: current.persistedOverrides,
        draftOverrides: current.draftOverrides,
        selectedIdentities: current.selectedIdentities,
      }, desk.manualOverrides, desk.automaticDistribution.activeItems);
      const openingDirty = !sameJson(current.persistedOpening, current.draftOpening);
      const controlsDirty = !sameJson(current.persistedPageControls, current.draftPageControls);
      const videoModuleDirty =
        current.draftVideoModule.active
          !== current.persistedVideoModuleActive
        || current.draftVideoModule.highlight.action !== "preserve";
      const draftOpening = openingDirty ? current.draftOpening : desk.opening;
      return {
        persistedOverrides: reconciledOverrides.persistedOverrides,
        draftOverrides: withoutMatchdayEditorialProfileOpeningOverrides(incomingProfile, reconciledOverrides.draftOverrides, draftOpening),
        persistedOpening: desk.opening,
        draftOpening,
        persistedPageControls: desk.pageControls,
        draftPageControls: controlsDirty ? current.draftPageControls : desk.pageControls,
        persistedVideoModuleActive: desk.videoModule.active,
        draftVideoModule: videoModuleDirty
          ? current.draftVideoModule
          : {
              active: desk.videoModule.active,
              highlight: {
                action: "preserve",
                bankItemId: null,
              },
            },
        selectedIdentities: reconciledOverrides.selectedIdentities,
      };
    });
  }, [desk, profile]);

  const activeItems = desk.automaticDistribution.activeItems;
  const activeByIdentity = useMemo(() => new Map(activeItems.map((item) => [identity(item), item] as const)), [activeItems]);
  const activeIdentities = useMemo(() => new Set(activeByIdentity.keys()), [activeByIdentity]);
  const bankItemIdByIdentity = useMemo(
    () =>
      matchdayEditorialProfileSelectionBankItemByIdentity(
        editorialSelectionCandidates,
      ),
    [editorialSelectionCandidates],
  );
  const editorialSelectionCandidateById = useMemo(
    () => new Map(
      editorialSelectionCandidates.map(
        (candidate) => [candidate.bankItemId, candidate] as const,
      ),
    ),
    [editorialSelectionCandidates],
  );
  const effectiveProfile = useMemo(() => editorialProfileWithZoneLayouts(
    profile,
    editorState.draftPageControls.thematicZoneLayouts,
  ), [editorState.draftPageControls.thematicZoneLayouts, profile]);
  const persistedProfile = useMemo(() => editorialProfileWithZoneLayouts(
    profile,
    editorState.persistedPageControls.thematicZoneLayouts,
  ), [editorState.persistedPageControls.thematicZoneLayouts, profile]);
  const operationalOverrides = useMemo(() => withoutMatchdayEditorialProfileOpeningOverrides(
    effectiveProfile,
    editorState.draftOverrides.filter((override) => activeIdentities.has(identity(override))),
    editorState.draftOpening,
  ), [activeIdentities, editorState.draftOpening, editorState.draftOverrides, effectiveProfile]);
  const persistedOperationalOverrides = useMemo(() => withoutMatchdayEditorialProfileOpeningOverrides(
    persistedProfile,
    editorState.persistedOverrides.filter((override) => activeIdentities.has(identity(override))),
    editorState.persistedOpening,
  ), [activeIdentities, editorState.persistedOpening, editorState.persistedOverrides, persistedProfile]);
  const reconcile = useMemo(() => reconcileMatchdayEditorialProfileWorkspace(
    effectiveProfile,
    activeItems,
    operationalOverrides,
    editorState.draftOpening,
    desk.appliedZoneItems,
    desk.hasAppliedSnapshot,
    desk.currentFaixa,
  ), [activeItems, desk.appliedZoneItems, desk.currentFaixa, desk.hasAppliedSnapshot, editorState.draftOpening, effectiveProfile, operationalOverrides]);
  const pending = reconcile.hasChanges
    || !sameJson(operationalOverrides, persistedOperationalOverrides)
    || !sameJson(editorState.draftOpening, editorState.persistedOpening)
    || !sameJson(editorState.draftPageControls, editorState.persistedPageControls)
    || editorState.draftVideoModule.active
      !== editorState.persistedVideoModuleActive
    || editorState.draftVideoModule.highlight.action !== "preserve"
    || !sameJson(draftEditorialSelection, persistedEditorialSelection);
  const zoneByKey = new Map(
    reconcile.zonesAfter.map(
      (zone) => [zone.key, zone] as const,
    ),
  );

  const selected = useMemo(() => new Set(editorState.selectedIdentities.filter((itemIdentity) => activeIdentities.has(itemIdentity))), [activeIdentities, editorState.selectedIdentities]);
  const selectedIdentities = [...selected];
  const destination = effectiveProfile.zones.find((zone) => zone.key === destinationZone) ?? effectiveProfile.zones[0];

  useEffect(() => {
    setStartPosition((current) => Math.min(current, destination.capacity));
  }, [destination.capacity]);
  const normalizedFaixaQuery = faixaQuery.trim().toLocaleLowerCase("pt-PT");
  const faixaZoneFilterSet = useMemo(
    () => new Set(faixaZoneFilters),
    [faixaZoneFilters],
  );
  const filteredFaixa = reconcile.faixaAfter.filter((item) => {
    const classifiedZoneKey =
      activeByIdentity.get(identity(item))?.classifiedZoneKey
      ?? null;
    const zoneMatches =
      faixaZoneFilterSet.size === 0
      || (
        classifiedZoneKey !== null
        && faixaZoneFilterSet.has(classifiedZoneKey)
      );
    const queryMatches =
      !normalizedFaixaQuery
      || [item.label, item.title, item.subtitle].some(
        (value) =>
          value
            ?.toLocaleLowerCase("pt-PT")
            .includes(normalizedFaixaQuery),
      );

    return zoneMatches && queryMatches;
  });
  const visibleFaixa = filteredFaixa.slice(0, faixaVisibleCount);

  function toggleFaixaZoneFilter(
    zoneKey: EditorialProfileZoneKey,
  ) {
    setFaixaZoneFilters((current) =>
      current.includes(zoneKey)
        ? current.filter((candidate) => candidate !== zoneKey)
        : [...current, zoneKey],
    );
    setFaixaVisibleCount(FAIXA_INITIAL_VISIBLE);
  }
  const normalizedReservoirQuery = reservoirQuery
    .trim()
    .toLocaleLowerCase("pt-PT");
  const reservoirZoneFilterSet = useMemo(
    () => new Set(reservoirZoneFilters),
    [reservoirZoneFilters],
  );
  const filteredReservoir = reconcile.bankAfter.filter((item) => {
    const classifiedZoneKey =
      activeByIdentity.get(identity(item))?.classifiedZoneKey
      ?? null;
    const zoneMatches =
      reservoirZoneFilterSet.size === 0
      || (
        classifiedZoneKey !== null
        && reservoirZoneFilterSet.has(classifiedZoneKey)
      );
    const queryMatches =
      !normalizedReservoirQuery
      || [item.label, item.title, item.subtitle].some(
        (value) =>
          value
            ?.toLocaleLowerCase("pt-PT")
            .includes(normalizedReservoirQuery),
      );

    return zoneMatches && queryMatches;
  });
  const visibleReservoir = filteredReservoir.slice(
    0,
    reservoirVisibleCount,
  );

  function toggleReservoirZoneFilter(
    zoneKey: EditorialProfileZoneKey,
  ) {
    setReservoirZoneFilters((current) =>
      current.includes(zoneKey)
        ? current.filter((candidate) => candidate !== zoneKey)
        : [...current, zoneKey],
    );
    setReservoirVisibleCount(RESERVOIR_INITIAL_VISIBLE);
  }
  const currentVideoHighlightDefined =
    desk.videoModule.highlight.isPublished
    && Boolean(
      desk.videoModule.highlight.title
      || desk.videoModule.highlight.text
      || desk.videoModule.highlight.imageUrl
      || desk.videoModule.highlight.linkUrl
    );
  const draftVideoHighlightCandidate =
    editorState.draftVideoModule.highlight.action === "replace"
    && editorState.draftVideoModule.highlight.bankItemId
      ? editorialSelectionCandidates.find(
          (candidate) =>
            candidate.bankItemId
            === editorState.draftVideoModule.highlight.bankItemId,
        ) ?? null
      : null;
  const draftVideoHighlightDefined =
    editorState.draftVideoModule.highlight.action === "remove"
      ? false
      : editorState.draftVideoModule.highlight.action === "replace"
        ? draftVideoHighlightCandidate !== null
        : currentVideoHighlightDefined;
  const openingOccupied = MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.filter(
    (slot) => Boolean(editorState.draftOpening[slot]),
  ).length;
  const editorialSelectionOccupied = draftEditorialSelection.filter(Boolean).length;
  const pendingCount = pending
    ? Math.max(1, history.length)
    : 0;

  function currentDraft(): WorkspaceDraft {
    return {
      overrides: operationalOverrides,
      opening: editorState.draftOpening,
      pageControls: editorState.draftPageControls,
      editorialSelection: draftEditorialSelection,
      videoModule: editorState.draftVideoModule,
    };
  }

  function commitDraft(next: WorkspaceDraft, successMessage: string) {
    setHistory((current) => [...current, currentDraft()]);
    setEditorState((current) => ({
      ...current,
      draftOverrides: next.overrides,
      draftOpening: next.opening,
      draftPageControls: next.pageControls,
      draftVideoModule: next.videoModule,
      selectedIdentities: [],
    }));
    setDraftEditorialSelection(next.editorialSelection);
    setApplyState("idle");
    setZoneLayoutError(null);
    setMessage(successMessage);
  }

  function changeZoneLayout(
    zoneKey: EditorialProfileZoneKey,
    visualFamily: EditorialVisualFamily,
  ) {
    const thematicZoneLayouts = {
      ...editorState.draftPageControls.thematicZoneLayouts,
      [zoneKey]: visualFamily,
    };

    const nextProfile = editorialProfileWithZoneLayouts(
      profile,
      thematicZoneLayouts,
    );

    let nextOverrides:
      readonly MatchdayEditorialProfileManualOverride[];

    try {
      nextOverrides =
        compactMatchdayEditorialProfileManualOverridesForLayoutChange(
          effectiveProfile,
          nextProfile,
          operationalOverrides,
          zoneKey,
        );
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "";

      const layoutError =
        code.endsWith(
          "layout-compaction-manual-conflict",
        )
          ? "Não é possível reduzir este layout porque a última posição disponível já está fixa manualmente. Liberte ou mova uma das decisões manuais primeiro."
          : code.endsWith(
              "zone-capacity-exceeded",
            )
            ? "Não é possível reduzir este layout porque existem mais notícias protegidas manualmente na zona do que posições disponíveis."
            : "Não é possível reduzir este layout sem violar decisões manuais existentes.";

      setApplyState("error");
      setMessage(null);
      setZoneLayoutError({
        zoneKey,
        message: layoutError,
      });
      return;
    }

    const compactedManualPosition =
      !sameJson(
        nextOverrides,
        operationalOverrides,
      );

    const nextCapacity =
      nextProfile.zones.find(
        (zone) => zone.key === zoneKey,
      )?.capacity;

    commitDraft(
      {
        ...currentDraft(),
        overrides: nextOverrides,
        pageControls: {
          ...editorState.draftPageControls,
          thematicZoneLayouts,
        },
      },
      compactedManualPosition
        ? `${profile.zones.find((zone) => zone.key === zoneKey)?.label ?? zoneKey}: layout alterado para ${EDITORIAL_VISUAL_FAMILY_DEFINITIONS[visualFamily].label}; a posição manual exterior foi compactada para ${nextCapacity ?? "a última posição disponível"}.`
        : `${profile.zones.find((zone) => zone.key === zoneKey)?.label ?? zoneKey}: layout alterado em preview para ${EDITORIAL_VISUAL_FAMILY_DEFINITIONS[visualFamily].label}.`,
    );
  }

  function moveContentBlock(
    block: MatchdayEditorialProfilePageControls["thematicBlockOrder"][number],
    direction: "up" | "down",
  ) {
    const thematicBlockOrder =
      moveMatchdayEditorialProfileThematicBlock(
        editorState.draftPageControls.thematicBlockOrder,
        block,
        direction,
      );

    const thematicZoneOrder =
      matchdayEditorialProfileThematicZoneOrderFromBlockOrder(
        thematicBlockOrder,
      );

    commitDraft(
      {
        ...currentDraft(),
        pageControls: {
          ...editorState.draftPageControls,
          thematicBlockOrder,
          thematicZoneOrder,
        },
      },
      "Ordem dos blocos editoriais alterada em preview.",
    );
  }

  function localOperation(operation: () => WorkspaceDraft, successMessage: string) {
    try { commitDraft(operation(), successMessage); }
    catch (error) {
      setApplyState("error");
      if (error instanceof Error && error.message.endsWith("selection-exceeds-capacity")) {
        setMessage("O bloco selecionado não cabe a partir dessa posição. Escolha uma posição anterior ou reduza a seleção.");
        return;
      }
      if (error instanceof Error && error.message.endsWith("manual-insertion-exceeds-capacity")) {
        setMessage("A operação foi recusada porque não há posições suficientes para inserir estas notícias e conservar todas as decisões manuais já existentes na zona. Mova ou liberte uma decisão manual, reduza a seleção ou escolha outra posição.");
        return;
      }
      setMessage(error instanceof Error ? error.message : "A operação local foi recusada.");
    }
  }

  function toggleSelection(itemIdentity: string) {
    setEditorState((current) => ({ ...current, selectedIdentities: current.selectedIdentities.includes(itemIdentity)
      ? current.selectedIdentities.filter((candidate) => candidate !== itemIdentity)
      : [...current.selectedIdentities, itemIdentity] }));
  }

  function sourceIdForIdentity(itemIdentity: string): string {
    const item = activeByIdentity.get(itemIdentity);
    if (!item) throw new Error("A notícia arrastada já não está ativa.");
    return item.sourceId;
  }

  function openingWithoutMany(
    itemIdentities: readonly string[],
  ): MatchdayEditorialProfileOpening {
    return itemIdentities.reduce(
      (opening, itemIdentity) =>
        removeMatchdayEditorialProfileItemFromOpening(
          opening,
          sourceIdForIdentity(itemIdentity),
        ),
      editorState.draftOpening,
    );
  }

  function activeItemsOutside(opening: MatchdayEditorialProfileOpening) {
    const excluded = new Set(matchdayEditorialProfileOpeningSourceIds(opening).map((sourceId) => thematicEditorialIdentity("editorial_article", sourceId)));
    return activeItems.filter((item) => !excluded.has(identity(item)));
  }

  function prepareExclusivePlacementTransition(
    itemIdentities: readonly string[],
  ) {
    const opening = openingWithoutMany(itemIdentities);
    const overrides =
      returnMatchdayEditorialItemsToAutomatic(
        effectiveProfile,
        operationalOverrides,
        itemIdentities,
      );

    return {
      opening,
      overrides,
      candidates: activeItemsOutside(opening),
    };
  }

  function placeInOpening(itemIdentity: string, slot: MatchdayEditorialProfileOpeningSlotKey) {
    localOperation(() => {
      const movement = moveMatchdayEditorialProfileItemToOpening(
        editorState.draftOpening,
        sourceIdForIdentity(itemIdentity),
        slot,
      );

      const incomingOverrides =
        returnMatchdayEditorialItemsToAutomatic(
          effectiveProfile,
          operationalOverrides,
          [itemIdentity],
        );

      if (!movement.displacedSourceId) {
        return {
          ...currentDraft(),
          overrides: incomingOverrides,
          opening: movement.opening,
        };
      }

      const displacedIdentity =
        thematicEditorialIdentity(
          "editorial_article",
          movement.displacedSourceId,
        );

      const displacedItem =
        activeByIdentity.get(displacedIdentity);

      if (!displacedItem) {
        throw new Error(
          "A not\u00edcia desalojada j\u00e1 n\u00e3o est\u00e1 ativa.",
        );
      }

      if (!displacedItem.classifiedZoneKey) {
        throw new Error(
          "A not\u00edcia desalojada n\u00e3o tem zona tem\u00e1tica classificada para regressar \u00e0 posi\u00e7\u00e3o 1.",
        );
      }

      const overridesWithoutDisplaced =
        returnMatchdayEditorialItemsToAutomatic(
          effectiveProfile,
          incomingOverrides,
          [displacedIdentity],
        );

      const candidates =
        activeItemsOutside(movement.opening);

      return {
        ...currentDraft(),
        overrides: fixMatchdayEditorialItemsAtPosition(
          effectiveProfile,
          candidates,
          overridesWithoutDisplaced,
          [displacedIdentity],
          displacedItem.classifiedZoneKey,
          1,
        ),
        opening: movement.opening,
      };
    }, `${MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS[slot]} atualizada em preview; eventual not\u00edcia substitu\u00edda regressou \u00e0 sua zona natural na posi\u00e7\u00e3o 1.`);
  }

  function placeInZone(itemIdentity: string, zoneKey: EditorialProfileZoneKey, position: number) {
    localOperation(() => {
      const transition =
        prepareExclusivePlacementTransition(
          [itemIdentity],
        );

      return {
        ...currentDraft(),
        overrides: fixMatchdayEditorialItemsAtPosition(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          [itemIdentity],
          zoneKey,
          position,
        ),
        opening: transition.opening,
      };
    }, `Notícia inserida em ${zoneKey}, posição ${position}; decisões manuais existentes são preservadas e deslocadas quando necessário.`);
  }

  function placeInFaixa(itemIdentity: string, position: number | null) {
    localOperation(() => {
      const transition =
        prepareExclusivePlacementTransition(
          [itemIdentity],
        );

      return {
        ...currentDraft(),
        overrides: moveMatchdayEditorialItemsToFaixa(effectiveProfile, transition.candidates, transition.overrides, [itemIdentity], position === null ? null : Math.max(1, position)),
        opening: transition.opening,
      };
    }, "Notícia enviada para a Faixa; sem posição fixa, a atualidade decide a ordem.");
  }

  function placeInBank(itemIdentity: string) {
    localOperation(() => {
      const transition =
        prepareExclusivePlacementTransition(
          [itemIdentity],
        );

      return {
        ...currentDraft(),
        overrides: moveMatchdayEditorialItemsToBank(effectiveProfile, transition.candidates, transition.overrides, [itemIdentity]),
        opening: transition.opening,
      };
    }, "Notícia enviada explicitamente para o Banco.");
  }

  function returnToAutomatic(itemIdentity: string) {
    localOperation(() => {
      const transition =
        prepareExclusivePlacementTransition(
          [itemIdentity],
        );

      return {
        ...currentDraft(),
        overrides: transition.overrides,
        opening: transition.opening,
      };
    }, "Decisão manual removida; classificação e atualidade voltaram a decidir.");
  }

  function releasePosition(itemIdentity: string) {
    localOperation(() => ({
      ...currentDraft(),
      overrides: releaseMatchdayEditorialFixedPositions(
        effectiveProfile,
        operationalOverrides,
        [itemIdentity],
      ),
    }), "Posição manual libertada; na zona regressa ao automático e na Faixa mantém apenas a pertença por atualidade.");
  }

  function dragged(event: DragEvent<HTMLElement>): string | null {
    const candidate = draggingIdentity ?? event.dataTransfer.getData("text/plain");
    return candidate && activeByIdentity.has(candidate) ? candidate : null;
  }

  function dragStart(event: DragEvent<HTMLElement>, itemIdentity: string) {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,summary,details")) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", itemIdentity);
    setDraggingIdentity(itemIdentity);
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setEditorState((current) => ({
      ...current,
      draftOverrides: previous.overrides,
      draftOpening: previous.opening,
      draftPageControls: previous.pageControls,
      draftVideoModule: previous.videoModule,
      selectedIdentities: [],
    }));
    setDraftEditorialSelection(previous.editorialSelection);
    setHistory((current) => current.slice(0, -1));
    setApplyState("idle");
    setMessage("Última alteração local desfeita.");
  }

  function resetLocal() {
    if (!pending) return;
    setHistory((current) => [...current, currentDraft()]);
    setEditorState((current) => ({
      ...current,
      draftOverrides: persistedOperationalOverrides,
      draftOpening: current.persistedOpening,
      draftPageControls: current.persistedPageControls,
      draftVideoModule: {
        active: current.persistedVideoModuleActive,
        highlight: {
          action: "preserve",
          bankItemId: null,
        },
      },
      selectedIdentities: [],
    }));
    setDraftEditorialSelection(persistedEditorialSelection);
    setApplyState("idle");
    setMessage("Preview reposto para o último estado aplicado.");
  }

  async function applyChanges() {
    if (!pending || applyState === "saving") return;
    setApplyState("saving");
    setMessage("A validar e aplicar numa única transação…");
    try {
      const response = await fetch(`/api/admin/editorial/jornada/${desk.matchdayId}/organizar/tematico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileKey: desk.profileKey,
          expectedRevision: desk.reconcileRevision,
          expectedStateToken: desk.reconcileStateToken,
          overrides: operationalOverrides,
          opening: editorState.draftOpening,
          pageControls: editorState.draftPageControls,
          selectionBankItemIds: draftEditorialSelection,
          videoModule: {
            active: editorState.draftVideoModule.active,
            highlightAction:
              editorState.draftVideoModule.highlight.action,
            highlightBankItemId:
              editorState.draftVideoModule.highlight.bankItemId,
          },
        }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || payload.ok !== true) throw new Error(payload.message ?? "O Apply temático foi recusado integralmente.");
      setEditorState((current) => ({
        ...current,
        persistedOverrides: operationalOverrides,
        draftOverrides: operationalOverrides,
        persistedOpening: current.draftOpening,
        persistedPageControls: current.draftPageControls,
        persistedVideoModuleActive: current.draftVideoModule.active,
        draftVideoModule: {
          active: current.draftVideoModule.active,
          highlight: {
            action: "preserve",
            bankItemId: null,
          },
        },
        selectedIdentities: [],
      }));
      setPersistedEditorialSelection(draftEditorialSelection);
      setHistory([]);
      setApplyState("saved");
      setMessage("Aplicado. A confirmar o estado autoritativo do servidor…");
      router.refresh();
    } catch (error) {
      setApplyState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível aplicar as alterações.");
    }
  }

  function cardFor(item: MatchdayEditorialProfileEffectiveItem, placement: Placement) {
    const itemIdentity = identity(item);
    const itemSortOrder = item.sortOrder;
    return (
      <ArticleCard
        dragging={draggingIdentity === itemIdentity}
        item={item}
        onAutomatic={() => returnToAutomatic(itemIdentity)}
        onBank={() => placeInBank(itemIdentity)}
        onDragEnd={() => setDraggingIdentity(null)}
        onDragStart={dragStart}
        onFaixa={() => placeInFaixa(itemIdentity, null)}
        onFixPosition={
          placement.kind === "zone"
          && placement.zoneKey
          && itemSortOrder !== null
          && item.manualOverride !== "position"
            ? () => placeInZone(
                itemIdentity,
                placement.zoneKey!,
                itemSortOrder,
              )
            : null
        }
        onProtectZone={null}
        onReleasePosition={
          item.manualOverride === "position"
          || (
            placement.kind === "faixa"
            && operationalOverrides.some(
              (override) =>
                thematicEditorialIdentity(
                  override.sourceType,
                  override.sourceId,
                ) === itemIdentity
                && override.placementTarget === "faixa"
                && override.sortOrder !== null,
            )
          )
            ? () => releasePosition(itemIdentity)
            : null
        }
        onToggle={toggleSelection}
        placement={placement}
        selected={selected.has(itemIdentity)}
      />
    );
  }

  function renderFaixaItem(
    item: MatchdayEditorialProfileEffectiveItem,
  ) {
    return (
      <div
        className="thematic-faixa-item"
        data-drag-active={draggingIdentity !== null}
        key={identity(item)}
        onDragOver={allowDrop}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          const itemIdentity = dragged(event);

          if (itemIdentity) {
            placeInFaixa(
              itemIdentity,
              item.sortOrder,
            );
          }

          setDraggingIdentity(null);
        }}
      >
        <span className="thematic-position">
          {item.sortOrder}
        </span>

        {cardFor(
          item,
          { kind: "faixa" },
        )}
      </div>
    );
  }

  function renderZonePanel(
    zoneKey: EditorialProfileZoneKey,
  ) {
    const zone = zoneByKey.get(zoneKey);

    if (!zone) {
      return null;
    }

    return (
      <article className="thematic-workspace-body" key={zone.key}>
        <div className="thematic-zone-editor">
          <label>
            <input
              aria-label={`Título público de ${zone.label}`}
              disabled={applyState === "saving"}
              maxLength={120}
              onBlur={() =>
                setMessage(
                  editorState.draftPageControls.thematicZoneTitles[zone.key].trim()
                    ? `${zone.label}: título público alterado em preview.`
                    : `${zone.label}: título público limpo em preview.`,
                )
              }
              onChange={(event) => {
                const value = event.target.value;

                setEditorState((current) => ({
                  ...current,
                  draftPageControls: {
                    ...current.draftPageControls,
                    thematicZoneTitles: {
                      ...current.draftPageControls.thematicZoneTitles,
                      [zone.key]: value,
                    },
                  },
                }));
                setApplyState("idle");
              }}
              placeholder={zone.label}
              type="text"
              value={editorState.draftPageControls.thematicZoneTitles[zone.key]}
            />
          </label>

          <label>
            <select
              aria-label={`Layout de ${zone.label}`}
              disabled={applyState === "saving"}
              onChange={(event) =>
                changeZoneLayout(
                  zone.key,
                  event.target.value as EditorialVisualFamily,
                )
              }
              value={editorState.draftPageControls.thematicZoneLayouts[zone.key]}
            >
              {EDITORIAL_VISUAL_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].label}
                </option>
              ))}
            </select>
          </label>
          <strong className="thematic-zone-editor-count">
            {zone.items.length}/{zone.capacity}
          </strong>
        </div>

        {zoneLayoutError?.zoneKey === zone.key ? (
          <p
            className="thematic-zone-alert"
            role="alert"
          >
            {zoneLayoutError.message}
          </p>
        ) : null}

        <div className={`thematic-slots thematic-slots-${zone.capacity}`}>
          {Array.from(
            { length: zone.capacity },
            (_, index) => index + 1,
          ).map((position) => {
            const item =
              zone.items.find(
                (candidate) =>
                  candidate.sortOrder === position,
              );

            return (
              <div
                className="thematic-workspace-slot"
                data-drag-active={
                  draggingIdentity !== null
                }
                key={position}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  const itemIdentity =
                    dragged(event);

                  if (itemIdentity) {
                    placeInZone(
                      itemIdentity,
                      zone.key,
                      position,
                    );
                  }

                  setDraggingIdentity(null);
                }}
              >
                <span className="thematic-position">
                  {String(position).padStart(2, "0")}
                </span>

                {item
                  ? cardFor(
                      item,
                      {
                        kind: "zone",
                        zoneKey: zone.key,
                      },
                    )
                    : (
                      <p className="thematic-empty">
                        Posição livre
                      </p>
                    )}
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  function renderEditorialSelectionPanel() {
    const latestPlacement =
      editorState.draftPageControls.latestZonePlacement;

    return (
      <article className="thematic-workspace-body">
        <div className="thematic-zone-editor">
          <label>
            <input
              aria-label="Título público de Últimas"
              disabled={applyState === "saving"}
              maxLength={120}
              onChange={(event) => {
                const value = event.target.value;

                setEditorState((current) => ({
                  ...current,
                  draftPageControls: {
                    ...current.draftPageControls,
                    latestZoneTitle: value,
                  },
                }));
                setApplyState("idle");
              }}
              placeholder="Últimas"
              type="text"
              value={editorState.draftPageControls.latestZoneTitle}
            />
          </label>

          <label>
            <select
              aria-label="Apresentação de Últimas"
              disabled={applyState === "saving"}
              onChange={(event) =>
                commitDraft(
                  {
                    ...currentDraft(),
                    pageControls: {
                      ...editorState.draftPageControls,
                      latestZonePlacement: event.target.value as
                        | "top"
                        | "four_news"
                        | "hidden",
                    },
                  },
                  "Últimas alterada em preview.",
                )
              }
              value={latestPlacement}
            >
              <option value="top">Topo</option>
              <option value="four_news">Seleção editorial + Últimas</option>
              <option value="hidden">Oculto</option>
            </select>
          </label>
          <strong className="thematic-zone-editor-count">
            {editorialSelectionOccupied}/4
          </strong>
        </div>

        <div
          aria-label="Seleção editorial manual"
          className="thematic-slots thematic-slots-4 thematic-editorial-selection"
        >
          {MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS.map(
            (position) => {
              const bankItemId =
                draftEditorialSelection[position - 1] ?? null;
              const candidate = bankItemId
                ? editorialSelectionCandidateById.get(bankItemId) ?? null
                : null;

              return (
                <div
                  aria-label={`Seleção editorial ${position}`}
                  className="thematic-workspace-slot thematic-selection-slot"
                  data-drag-active={
                    draggingIdentity !== null
                    || draggingEditorialSelectionPosition !== null
                  }
                  key={position}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect =
                      draggingEditorialSelectionPosition === null
                        ? "copy"
                        : "move";
                  }}
                  onDrop={(event) =>
                    dropOnEditorialSelection(event, position)
                  }
                >
                  <span className="thematic-position">
                    {String(position).padStart(2, "0")}
                  </span>

                  {candidate ? (
                    <EditorialSelectionCard
                      candidate={candidate}
                      dragging={
                        draggingEditorialSelectionPosition === position
                      }
                      onDragEnd={() =>
                        setDraggingEditorialSelectionPosition(null)
                      }
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          serializeMatchdayEditorialProfileSelectionDrag({
                            bankItemId: candidate.bankItemId,
                            sourcePosition: position,
                          }),
                        );
                        setDraggingIdentity(null);
                        setDraggingEditorialSelectionPosition(position);
                      }}
                      onRemove={() =>
                        removeEditorialSelection(position)
                      }
                      position={position}
                    />
                  ) : (
                    <p className="thematic-empty">
                      Posição livre
                    </p>
                  )}
                </div>
              );
            },
          )}
        </div>
      </article>
    );
  }

  function activateWorkspaceFromStructure(workspaceKey: ActiveWorkspaceKey) {
    setActiveWorkspaceKey(workspaceKey);
    pageStructureRef.current?.removeAttribute("open");
  }

  function activateFaixaFromStructure() {
    setActiveSourceView("faixa");
    pageStructureRef.current?.removeAttribute("open");
  }

  function workspaceKeyForBlock(
    block: MatchdayEditorialProfileThematicBlockKey,
  ): ActiveWorkspaceKey {
    return block === "video" ? "highlight" : block;
  }

  function isZoneWorkspaceKey(
    workspaceKey: ActiveWorkspaceKey,
  ): workspaceKey is EditorialProfileZoneKey {
    return effectiveProfile.zones.some((zone) => zone.key === workspaceKey);
  }

  function publicZoneTitle(zoneKey: EditorialProfileZoneKey) {
    return editorState.draftPageControls.thematicZoneTitles[zoneKey].trim()
      || effectiveProfile.zones.find((zone) => zone.key === zoneKey)?.label
      || zoneKey;
  }

  function blockLabel(block: MatchdayEditorialProfileThematicBlockKey) {
    if (block === "video") return "Destaque";
    if (block === "latest") {
      return editorState.draftPageControls.latestZonePlacement === "four_news"
        ? "Seleção editorial + Últimas"
        : "Últimas";
    }
    return publicZoneTitle(block);
  }

  function blockCount(block: MatchdayEditorialProfileThematicBlockKey) {
    if (block === "video") return `${draftVideoHighlightDefined ? 1 : 0}/1`;
    if (block === "latest") {
      return editorState.draftPageControls.latestZonePlacement === "hidden"
        ? `${editorialSelectionOccupied}/4 · oculto`
        : `${editorialSelectionOccupied}/4`;
    }
    const zone = zoneByKey.get(block);
    return zone ? `${zone.items.length}/${zone.capacity}` : "0/0";
  }

  function dropOnHighlight(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();

    const selectionDrag = parseMatchdayEditorialProfileSelectionDrag(
      event.dataTransfer.getData("text/plain"),
    );
    const itemIdentity = dragged(event);
    const bankItemId = selectionDrag?.bankItemId
      || (itemIdentity ? bankItemIdByIdentity.get(itemIdentity) : null);
    const candidate = bankItemId
      ? editorialSelectionCandidateById.get(bankItemId) ?? null
      : null;

    if (
      !bankItemId
      || candidate?.sourceType?.trim().toLowerCase() !== "editorial_article"
    ) {
      setApplyState("error");
      setMessage("O Destaque aceita apenas artigos editoriais disponíveis.");
      setDraggingIdentity(null);
      setDraggingEditorialSelectionPosition(null);
      return;
    }

    changeVideoHighlight(`replace:${bankItemId}`);
    setDraggingIdentity(null);
    setDraggingEditorialSelectionPosition(null);
  }

  function renderOpeningWorkspace() {
    return (
      <article className="thematic-workspace-body">
        <div
          className={`thematic-slots thematic-slots-${MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.length}`}
        >
          {MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.map((slot) => {
            const sourceId = editorState.draftOpening[slot];
            const item = sourceId
              ? activeByIdentity.get(
                  thematicEditorialIdentity("editorial_article", sourceId),
                )
              : null;

            return (
              <div
                className="thematic-workspace-slot"
                data-drag-active={draggingIdentity !== null}
                key={slot}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault();
                  const itemIdentity = dragged(event);
                  if (itemIdentity) placeInOpening(itemIdentity, slot);
                  setDraggingIdentity(null);
                }}
              >
                <span className="thematic-slot-label">
                  {MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS[slot]}
                </span>
                {item
                  ? cardFor(
                      { ...item, manualOverride: null },
                      { kind: "opening" },
                    )
                  : <p className="thematic-empty">Posição livre</p>}
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  function renderHighlightWorkspace() {
    const highlightTitle = draftVideoHighlightCandidate?.title
      ?? desk.videoModule.highlight.title
      ?? "Destaque";
    const highlightSubtitle = draftVideoHighlightCandidate?.subtitle
      ?? desk.videoModule.highlight.text;
    const highlightImageUrl = draftVideoHighlightCandidate?.imageUrl
      ?? desk.videoModule.highlight.imageUrl;

    return (
      <article className="thematic-workspace-body">
        <div className="thematic-highlight-row">
        <div className="thematic-highlight-controls">
          <label>
            <span>Visibilidade</span>
            <select
              disabled={applyState === "saving"}
              onChange={(event) =>
                changeVideoModuleActive(event.target.value === "active")
              }
              value={editorState.draftVideoModule.active ? "active" : "hidden"}
            >
              <option value="active">Ativo</option>
              <option value="hidden">Oculto</option>
            </select>
          </label>
        </div>

        <div
          aria-label="Destaque editorial"
          className="thematic-workspace-slot thematic-highlight-slot"
          data-drag-active={draggingIdentity !== null}
          onDragOver={allowDrop}
          onDrop={dropOnHighlight}
        >
          {draftVideoHighlightDefined ? (
            <article className="thematic-highlight-card">
              {renderableImageUrl(highlightImageUrl) ? (
                <Image
                  alt=""
                  height={220}
                  loader={imageLoader}
                  src={highlightImageUrl!}
                  unoptimized
                  width={420}
                />
              ) : null}
              <div>
                <strong>{highlightTitle}</strong>
                {highlightSubtitle ? <span>{highlightSubtitle}</span> : null}
                <button
                  className="thematic-button danger"
                  disabled={applyState === "saving"}
                  onClick={() => changeVideoHighlight("remove")}
                  type="button"
                >
                  Retirar
                </button>
              </div>
            </article>
          ) : (
            <p className="thematic-empty">Posição livre</p>
          )}
        </div>
        </div>

      </article>
    );
  }

  function renderSources() {
    const sourceZoneFilters = activeSourceView === "available"
      ? reservoirZoneFilters
      : faixaZoneFilters;
    const sourceQuery = activeSourceView === "available"
      ? reservoirQuery
      : faixaQuery;
    const filteredCount = activeSourceView === "available"
      ? filteredReservoir.length
      : filteredFaixa.length;
    const visibleCount = activeSourceView === "available"
      ? visibleReservoir.length
      : visibleFaixa.length;

    function toggleSourceZoneFilter(zoneKey: EditorialProfileZoneKey) {
      if (activeSourceView === "available") {
        toggleReservoirZoneFilter(zoneKey);
        return;
      }
      toggleFaixaZoneFilter(zoneKey);
    }

    function changeSourceQuery(value: string) {
      if (activeSourceView === "available") {
        setReservoirQuery(value);
        setReservoirVisibleCount(RESERVOIR_INITIAL_VISIBLE);
        return;
      }
      setFaixaQuery(value);
      setFaixaVisibleCount(FAIXA_INITIAL_VISIBLE);
    }

    function showMoreSources() {
      if (activeSourceView === "available") {
        setReservoirVisibleCount((count) => count + RESERVOIR_PAGE_SIZE);
        return;
      }
      setFaixaVisibleCount((count) => count + FAIXA_PAGE_SIZE);
    }

    function dropOnActiveSource(event: DragEvent<HTMLElement>) {
      event.preventDefault();
      const itemIdentity = dragged(event);
      if (itemIdentity) {
        if (activeSourceView === "available") placeInBank(itemIdentity);
        else placeInFaixa(itemIdentity, null);
      }
      setDraggingIdentity(null);
    }

    return (
      <section className="thematic-sources" aria-label="Fontes editoriais">
        <div className="thematic-sources-toolbar">
          <h2>Fontes</h2>
          <nav aria-label="Escolher fonte editorial">
            <button
              className={activeSourceView === "available" ? "active" : ""}
              onClick={() => setActiveSourceView("available")}
              type="button"
            >
              Banco {reconcile.bankAfter.length}
            </button>
            <button
              className={activeSourceView === "faixa" ? "active" : ""}
              onClick={() => setActiveSourceView("faixa")}
              type="button"
            >
              Faixa {reconcile.faixaAfter.length}
            </button>
          </nav>
          <div className="thematic-reservoir-filters" aria-label="Filtrar fonte por zona natural">
            {profile.zones.map((zone) => (
              <label key={zone.key}>
                <input
                  checked={sourceZoneFilters.includes(zone.key)}
                  onChange={() => toggleSourceZoneFilter(zone.key)}
                  type="checkbox"
                />
                <span>{zone.label}</span>
              </label>
            ))}
          </div>
          <div className="thematic-reservoir-count">
            <strong>{selected.size}</strong>
            <span>selecionadas</span>
          </div>
          {selected.size > 0 ? (
            <button
              className="thematic-button"
              onClick={() =>
                setEditorState((current) => ({ ...current, selectedIdentities: [] }))
              }
              type="button"
            >
              Limpar seleção
            </button>
          ) : null}
          <label className="thematic-reservoir-search">
            <span>Pesquisa</span>
            <input
              aria-label={`Pesquisar em ${activeSourceView === "available" ? "Banco" : "Faixa"}`}
              onChange={(event) => changeSourceQuery(event.target.value)}
              placeholder="Título ou antetítulo"
              type="search"
              value={sourceQuery}
            />
          </label>
          <div className="thematic-reservoir-count">
            <strong>{filteredCount}</strong>
            <span>encontradas</span>
          </div>
        </div>

        <div
          className="thematic-sources-list"
          data-drag-active={draggingIdentity !== null}
          data-source-view={activeSourceView}
          onDragOver={allowDrop}
          onDrop={dropOnActiveSource}
        >
          {activeSourceView === "available"
            ? visibleReservoir.length > 0
              ? visibleReservoir.map((item) => cardFor(item, { kind: "bank" }))
              : <p className="thematic-empty">Banco vazio.</p>
            : visibleFaixa.length > 0
              ? visibleFaixa.map(renderFaixaItem)
              : <p className="thematic-empty">Sem resultados.</p>}
        </div>

        {visibleCount < filteredCount ? (
          <div className="thematic-more">
            <button
              className="thematic-button"
              onClick={showMoreSources}
              type="button"
            >
              Mostrar mais
            </button>
            <span>{filteredCount - visibleCount} por mostrar</span>
          </div>
        ) : null}
      </section>
    );
  }

  function renderActiveWorkspace() {
    if (activeWorkspaceKey === "opening") return renderOpeningWorkspace();
    if (activeWorkspaceKey === "latest") return renderEditorialSelectionPanel();
    if (activeWorkspaceKey === "highlight") return renderHighlightWorkspace();
    if (isZoneWorkspaceKey(activeWorkspaceKey)) {
      return renderZonePanel(activeWorkspaceKey);
    }
    return null;
  }

  return (
    <main className="thematic-shell">
      <style>{styles}</style>
      <div className="thematic-content">
        <header className="thematic-hero">
          <div className="thematic-hero-main">
            <p className="thematic-eyebrow">Mesa viva</p>
            <h1>{desk.profileDisplayName}</h1>
            <span className="thematic-context">{desk.competitionName} · {desk.seasonLabel} · {desk.matchdayLabel}</span>
            <span className={`thematic-status${pending ? " pending" : ""}`}>{pending ? "Preview · alterações pendentes" : "Estado aplicado · sem pendentes"}</span>
          </div>
          <nav><a href="/admin">Backoffice</a></nav>
        </header>

        <MatchdayEditorialContextSelector
          currentCompetitionId={desk.competitionId}
          currentMatchdayId={desk.matchdayId}
          currentSeasonId={desk.seasonId}
          data={contextSelector}
        />

        {message ? (
          <p
            aria-live={applyState === "error" ? "assertive" : "polite"}
            className={`thematic-message feedback${applyState === "error" ? " error" : ""}`}
          >
            {message}
          </p>
        ) : null}

        {selected.size > 0 ? (
          <section className="thematic-bulk-context" aria-label="Operação em lote">
            <div className="thematic-bulk-context-head">
              <div className="thematic-bulk-context-copy">
                <strong>Operação em lote · {selected.size} notícia(s)</strong>
              </div>
              <button
                className="thematic-button"
                onClick={() => setEditorState((current) => ({ ...current, selectedIdentities: [] }))}
                type="button"
              >
                Limpar marcação
              </button>
            </div>

            <div className="thematic-bulk-context-actions">
              <div className="thematic-bulk-group">
                <label className="thematic-field zone">
                  Zona de destino
                  <select
                    value={destinationZone}
                    onChange={(event) => {
                      setDestinationZone(event.target.value as EditorialProfileZoneKey);
                      setStartPosition(1);
                    }}
                  >
                    {profile.zones.map((zone) => (
                      <option key={zone.key} value={zone.key}>{zone.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    return {
                      ...currentDraft(),
                      overrides: fixMatchdayEditorialItemsAtPosition(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                        destinationZone,
                        startPosition,
                      ),
                      opening: transition.opening,
                    };
                  }, "Operação em lote inserida na zona; decisões manuais existentes foram preservadas.")}
                  type="button"
                >
                  Mover para zona
                </button>
              </div>

              <div className="thematic-bulk-group">
                <label className="thematic-field">
                  Posição na zona
                  <select value={startPosition} onChange={(event) => setStartPosition(Number(event.target.value))}>
                    {Array.from({ length: destination.capacity }, (_, index) => index + 1).map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    return {
                      ...currentDraft(),
                      overrides: fixMatchdayEditorialItemsAtPosition(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                        destinationZone,
                        startPosition,
                      ),
                      opening: transition.opening,
                    };
                  }, "Operação em lote inserida a partir da posição escolhida; decisões manuais existentes foram preservadas.")}
                  type="button"
                >
                  Fixar posição
                </button>
              </div>

              <div className="thematic-bulk-group">
                <label className="thematic-field">
                  Posição na Faixa
                  <select value={faixaPosition} onChange={(event) => setFaixaPosition(Number(event.target.value))}>
                    {Array.from({ length: Math.max(1, reconcile.faixaAfter.length + 1) }, (_, index) => index + 1).map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    return {
                      ...currentDraft(),
                      overrides: moveMatchdayEditorialItemsToFaixa(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                        null,
                      ),
                      opening: transition.opening,
                    };
                  }, "Operação em lote enviada para a Faixa; a atualidade decide a ordem.")}
                  type="button"
                >
                  Mover para Faixa
                </button>
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    return {
                      ...currentDraft(),
                      overrides: moveMatchdayEditorialItemsToFaixa(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                        faixaPosition,
                      ),
                      opening: transition.opening,
                    };
                  }, "Operação em lote fixada na Faixa a partir da posição escolhida.")}
                  type="button"
                >
                  Fixar na Faixa
                </button>
              </div>

              <div className="thematic-bulk-group">
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    return {
                      ...currentDraft(),
                      overrides: moveMatchdayEditorialItemsToBank(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                      ),
                      opening: transition.opening,
                    };
                  }, "Operação em lote movida para o Banco.")}
                  type="button"
                >
                  Mover para Banco
                </button>
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    return {
                      ...currentDraft(),
                      overrides: transition.overrides,
                      opening: transition.opening,
                    };
                  }, "Operação em lote devolvida ao automático.")}
                  type="button"
                >
                  Automático
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="thematic-global-tools">
          <details className="thematic-global-tool" ref={pageStructureRef}>
            <summary>Página e blocos</summary>
            <section className="thematic-page-structure" aria-label="Página e blocos">
              <div className="thematic-page-structure-head">
                <div className="thematic-top-tools">
                  <label>
                    <span>Cor da Manchete</span>
                    <input
                      aria-label="Cor do texto da Manchete"
                      onChange={(event) =>
                        commitDraft(
                          {
                            ...currentDraft(),
                            pageControls: {
                              ...editorState.draftPageControls,
                              headlineTitleColor: event.target.value.toUpperCase(),
                            },
                          },
                          "Cor da Manchete alterada em preview.",
                        )
                      }
                      type="color"
                      value={editorState.draftPageControls.headlineTitleColor ?? "#FFFFFF"}
                    />
                  </label>
                  <button
                    className="thematic-button"
                    disabled={editorState.draftPageControls.headlineTitleColor === null}
                    onClick={() =>
                      commitDraft(
                        {
                          ...currentDraft(),
                          pageControls: {
                            ...editorState.draftPageControls,
                            headlineTitleColor: null,
                          },
                        },
                        "Cor da Manchete devolvida ao valor automático.",
                      )
                    }
                    type="button"
                  >
                    Automática
                  </button>
                </div>
              </div>

              <div className="thematic-page-structure-list">
                <button
                  className={`thematic-page-row${activeWorkspaceKey === "opening" ? " active" : ""}`}
                  onClick={() => activateWorkspaceFromStructure("opening")}
                  type="button"
                >
                  <span>Fixo</span>
                  <strong>Abertura</strong>
                  <small>{openingOccupied}/{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.length}</small>
                </button>

                {editorState.draftPageControls.thematicBlockOrder.map((block, index) => {
                  const workspaceKey = workspaceKeyForBlock(block);
                  const zone = block === "latest" || block === "video"
                    ? null
                    : zoneByKey.get(block);

                  return (
                    <div className={`thematic-page-row${activeWorkspaceKey === workspaceKey ? " active" : ""}`} key={block}>
                      <button
                        className="thematic-page-row-main"
                        onClick={() => activateWorkspaceFromStructure(workspaceKey)}
                        type="button"
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{blockLabel(block)}</strong>
                        <small>
                          {zone
                            ? `${EDITORIAL_VISUAL_FAMILY_DEFINITIONS[zone.visualFamily].label} · `
                            : null}
                          {blockCount(block)}
                        </small>
                      </button>
                      <div className="thematic-page-row-actions">
                        <button
                          aria-label={`Subir ${blockLabel(block)}`}
                          disabled={index === 0}
                          onClick={() => moveContentBlock(block, "up")}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Descer ${blockLabel(block)}`}
                          disabled={index === editorState.draftPageControls.thematicBlockOrder.length - 1}
                          onClick={() => moveContentBlock(block, "down")}
                          type="button"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  className={`thematic-page-row${activeSourceView === "faixa" ? " active" : ""}`}
                  onClick={activateFaixaFromStructure}
                  type="button"
                >
                  <span>Fixo</span>
                  <strong>Faixa</strong>
                  <small>{reconcile.faixaAfter.length}</small>
                </button>
              </div>
            </section>
          </details>

          <details className="thematic-global-tool thematic-video-tool">
            <summary>Vídeos</summary>
            <div className="thematic-global-tool-body">
              <MatchdayVideoSummarySync
                matchdayId={desk.matchdayId}
                reloadOnMutation={false}
              />
            </div>
          </details>
        </div>

        <section className="thematic-panel thematic-workspace">
          <nav className="thematic-zone-tabs" aria-label="Blocos da Mesa viva">
            <button
              className={activeWorkspaceKey === "opening" ? "active" : ""}
              onClick={() => setActiveWorkspaceKey("opening")}
              type="button"
            >
              Abertura {openingOccupied}/{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.length}
            </button>
            {editorState.draftPageControls.thematicBlockOrder.map((block) => {
              const workspaceKey = workspaceKeyForBlock(block);
              return (
                <button
                  className={activeWorkspaceKey === workspaceKey ? "active" : ""}
                  key={block}
                  onClick={() => setActiveWorkspaceKey(workspaceKey)}
                  type="button"
                >
                  {blockLabel(block)} {blockCount(block)}
                </button>
              );
            })}
          </nav>

          {renderActiveWorkspace()}
        </section>

        {renderSources()}

        {reconcile.movements.length > 0 ? <details className="thematic-panel thematic-movements"><summary>Movimentos em preview · {reconcile.movements.length}</summary><ul className="thematic-movement-list">{reconcile.movements.map((movement) => <li key={thematicEditorialIdentity(movement.sourceType, movement.sourceId)}>{movement.title ?? movement.sourceId} · {movement.from.kind} → {movement.to.kind}</li>)}</ul></details> : null}
        {desk.inactiveHistoricalCount > 0 ? <p className="thematic-message">Estado histórico inativo: {desk.inactiveHistoricalCount}</p> : null}
        <Diagnostics diagnostics={desk.diagnostics} />

      </div>

      <footer className="thematic-pending" aria-live="polite">
        <div className="thematic-pending-copy"><strong>{pendingCount} alterações pendentes</strong></div>
        <button className="thematic-button" disabled={history.length === 0} onClick={undo} type="button">Desfazer última</button>
        <button className="thematic-button" disabled={!pending} onClick={resetLocal} type="button">Limpar alterações</button>
        <button className="thematic-button dark" disabled={!pending || applyState === "saving"} onClick={applyChanges} type="button">{applyState === "saving" ? "A aplicar…" : "Aplicar alterações"}</button>
      </footer>
    </main>
  );
}
