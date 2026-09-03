"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import MatchdayVideoSummarySync from "@/components/admin/MatchdayVideoSummarySync";
import { readAdminJsonResponse } from "@/lib/admin-json-response";

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
import {
  selectMatchdayEditorialExplicitBankItems,
  selectMatchdayEditorialTrackingItems,
  type MatchdayEditorialTrackingClassFilter,
  type MatchdayEditorialSelectionCandidate,
  type MatchdayEditorialProfileDeskDiagnostic,
  type MatchdayEditorialProfileDeskSnapshot,
  type MatchdayEditorialTrackingState,
} from "@/lib/editorial-matchday-profile-desk";
import {
  moveMatchdayEditorialItemsToBank,
  placeMatchdayEditorialItemAtFaixaTop,
  placeMatchdayEditorialItemsInFaixaWithoutCascade,
  placeMatchdayEditorialItemsInZoneWithoutCascade,
  replaceMatchdayEditorialItemInFaixa,
  swapMatchdayEditorialItemsInFaixa,
  swapMatchdayEditorialItemsInZone,
  reconcileMatchdayEditorialProfileDeskSnapshot,

  returnMatchdayEditorialItemsToAutomatic,
  compactMatchdayEditorialProfileManualOverridesForLayoutChange,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileEffectiveItem,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  applyMatchdayEditorialMovementPreview,
  type MatchdayEditorialMovementPreviewState,
  type MatchdayEditorialPreviewMovement,
  type MatchdayEditorialPreviewPlacement,
  type MatchdayEditorialVacantZoneSlot,
} from "@/lib/editorial-matchday-movement-preview";
import {
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS,
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS,
  matchdayEditorialProfileOpeningSourceIds,
  matchdayEditorialProfileThematicZoneOrderFromBlockOrder,
  moveMatchdayEditorialProfileItemToOpening,
  moveMatchdayEditorialProfileThematicBlock,
  swapMatchdayEditorialProfileOpeningItems,
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
  matchdayEditorialProfileSelectionIdentities,
  parseMatchdayEditorialProfileSelectionDrag,
  prepareExclusiveMatchdayEditorialProfileSelection,
  prepareExclusiveMatchdayEditorialProfileSelectionState,
  removeExclusiveMatchdayEditorialProfileSelection,
  serializeMatchdayEditorialProfileSelectionDrag,
  withoutMatchdayEditorialProfileSelectionBankItems,
  type MatchdayEditorialProfileSelectionPosition,
} from "@/lib/editorial-matchday-profile-selection";

type EditorialSelectionCandidate = MatchdayEditorialSelectionCandidate;

type VideoHighlightDraft = Readonly<{
  action: "preserve" | "remove" | "replace";
  bankItemId: string | null;
}>;

type VideoModuleDraft = Readonly<{
  active: boolean;
  highlight: VideoHighlightDraft;
}>;

const TRACKING_INITIAL_VISIBLE = 30;
const TRACKING_PAGE_SIZE = 30;
const TRACKING_STATES = ["NOVA", "FAIXA", "DESALOJADA"] as const;

type ActiveWorkspaceKey =
  | "opening"
  | "latest"
  | "highlight"
  | EditorialProfileZoneKey;

type AgendaTvPreviewStatus =
  | "update"
  | "unchanged"
  | "source_not_found"
  | "source_conflict"
  | "channel_not_found";

type AgendaTvPreviewRow = Readonly<{
  matchId: string;
  label: string;
  status: AgendaTvPreviewStatus;
  note: string;
  currentDate: string | null;
  currentKickoffAt: string | null;
  currentChannel: string | null;
  nextDate: string | null;
  nextKickoffAt: string | null;
  nextChannel: string | null;
}>;

type AgendaTvPreview = Readonly<{
  rows: readonly AgendaTvPreviewRow[];
  summary: Readonly<{
    total: number;
    update: number;
    unchanged: number;
    blockers: number;
  }>;
  canApply: boolean;
}>;

type AgendaTvResponse = Readonly<{
  ok?: boolean;
  preview?: AgendaTvPreview;
  applied?: number;
  code?: string;
  message?: string;
}>;

type AgendaTvPanelState =
  | "inactive"
  | "searching"
  | "no_changes"
  | "changes"
  | "blocked"
  | "unavailable"
  | "error"
  | "applied";

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
  .thematic-editorial-selection { display: grid; align-items: stretch; gap: 4px; padding: 0; }
  .thematic-editorial-selection .thematic-workspace-slot { display: grid; grid-template-rows: auto minmax(0,1fr); gap: 4px; }
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

  .thematic-card-title { display: -webkit-box; overflow: hidden; font-size: 10px; line-height: 1.14; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .thematic-card time { color: #6c7a8b; font-size: 7px; }
  .thematic-card-menu { position: relative; align-self: start; }
  .thematic-card-menu summary { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid #d7e0e9; border-radius: 4px; cursor: pointer; list-style: none; font-weight: 900; }
  .thematic-card-menu summary::-webkit-details-marker { display: none; }
  .thematic-card-menu[open] { z-index: 15; }
  .thematic-card-actions { position: absolute; top: 22px; right: 0; display: grid; gap: 3px; width: 158px; padding: 5px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; box-shadow: 0 8px 20px rgba(15,23,42,.16); }
  .thematic-card-actions button { width: 100%; text-align: left; }
  .thematic-more { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 0 8px 8px; color: #64748b; font-size: 9px; }
  .thematic-selection-controls { display: flex; min-width: 0; min-height: 30px; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; padding: 1px 0 1px 8px; }
  .thematic-selection-controls strong { font-size: 10px; }
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
  .thematic-workspace { display: grid; grid-template-columns: minmax(0,1fr); gap: 5px; align-items: start; }
  .thematic-zone-tabs { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px; padding: 4px; border-bottom: 1px solid #dce3eb; background: #f7f9fb; }
  .thematic-zone-tabs button { min-height: 28px; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 9px; font-weight: 850; cursor: pointer; }
  .thematic-zone-tabs button.active { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
  .thematic-opening-pin { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; margin-left: auto; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #10151b; font-size: 9px; font-weight: 850; cursor: pointer; }
  .thematic-opening-pin input { margin: 0; accent-color: #1d4ed8; }
  .thematic-workspace-body { display: grid; min-width: 0; gap: 5px; padding: 5px; }
  .thematic-zone-editor { display: grid; grid-template-columns: minmax(320px,1.2fr) minmax(260px,.8fr) auto; gap: 7px; align-items: center; padding: 4px 5px; border: 1px solid #dce3eb; border-radius: 6px; background: #fbfcfd; }
  .thematic-zone-editor label { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 5px; align-items: center; min-width: 0; }
  .thematic-zone-editor label > span { color: #526173; font-size: 9px; font-weight: 850; text-transform: uppercase; white-space: nowrap; }
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
  .thematic-tracking-rows { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); align-items: start; gap: 6px; padding: 6px; }
  .thematic-tracking-row { min-width: 0; overflow: hidden; border: 1px solid #dfe6ee; border-radius: 6px; background: #fff; }
  .thematic-tracking-row-label { display: flex; gap: 5px; align-items: center; min-height: 22px; padding: 3px 6px 1px; }
  .thematic-tracking-row-label strong { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  .thematic-tracking-row-label span { color: #64748b; font-size: 9px; font-weight: 900; }
  .thematic-tracking-row-label .thematic-button { min-height: 24px; margin-left: auto; padding: 2px 6px; }
  .thematic-tracking-row .thematic-sources-list { grid-template-columns: 1fr; align-content: start; }
  .thematic-tracking-row .thematic-empty { min-height: 44px; }
  .thematic-bank-access { display: flex; flex: 0 0 auto; align-items: center; padding-left: 5px; border-left: 1px solid #d7e0e9; }
  .thematic-bank-access .thematic-button.active { border-color: #334155; background: #334155; color: #fff; }
  .thematic-bank-pool { margin: 6px 6px 0; overflow: hidden; border: 1px solid #dfe6ee; border-radius: 6px; background: #fff; }
  .thematic-bank-class-filters { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 5px 6px 0; }
  .thematic-bank-class-filters nav { display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: 4px; }
  .thematic-bank-class-filters nav button { min-height: 25px; padding: 2px 7px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 9px; font-weight: 850; cursor: pointer; }
  .thematic-bank-class-filters nav button.active { border-color: #334155; background: #334155; color: #fff; }
  .thematic-bank-class-filters > .thematic-button { flex: 0 0 auto; margin-left: auto; }
  .thematic-bank-pool .thematic-empty { min-height: 44px; }
  .thematic-faixa-item { display: grid; grid-template-columns: 22px minmax(0,1fr); gap: 5px; align-items: start; min-width: 0; }
  .thematic-tracking-drop-target { margin: 0 6px 6px; padding: 7px 8px; border: 1px dashed #9aaabc; border-radius: 6px; background: #f8fafc; color: #526173; font-size: 9px; font-weight: 900; text-align: center; }
  .thematic-tracking-drop-target[data-drag-active="true"] { border-color: #e43e48; background: #fff2f3; color: #9f1d27; }
  .thematic-global-tools { display: grid; grid-template-columns: max-content max-content max-content minmax(0,1fr); align-items: start; gap: 5px; }
  .thematic-global-tool { min-width: 0; border: 1px solid #d7e0e9; border-radius: 7px; background: #fff; box-shadow: 0 3px 10px rgba(12,22,34,.03); }
  .thematic-global-tool[open] { grid-column: 1 / -1; }
  .thematic-global-tool > summary { min-height: 30px; padding: 7px 9px; cursor: pointer; color: #243244; font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
  .thematic-global-tool-body { padding: 0 6px 6px; }
  .thematic-global-tool-body .video-summary-sync { margin: 0; padding: 7px; }
  .agenda-tv-sync { display: grid; gap: 7px; padding: 7px; border: 1px solid #d8e0e9; border-radius: 7px; background: #f8fafc; }
  .agenda-tv-sync-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 7px; }
  .agenda-tv-sync-copy { display: grid; gap: 2px; }
  .agenda-tv-sync-copy strong { font-size: 12px; }
  .agenda-tv-sync-copy span { color: #607086; font-size: 10px; font-weight: 700; }
  .agenda-tv-sync-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
  .agenda-tv-sync-message { margin: 0; padding: 6px 8px; border-radius: 5px; background: #eef6ff; color: #1e3a8a; font-size: 10px; font-weight: 700; }
  .agenda-tv-sync-message.warning { background: #fff8e6; color: #684b0e; }
  .agenda-tv-sync-message.error { background: #fff1f2; color: #9f1239; }
  .agenda-tv-sync-rows { display: grid; gap: 4px; }
  .agenda-tv-sync-row { display: grid; grid-template-columns: minmax(180px,.8fr) repeat(2,minmax(180px,1fr)); gap: 7px; align-items: center; padding: 6px 7px; border: 1px solid #e3e8ee; border-radius: 5px; background: #fff; }
  .agenda-tv-sync-row.blocked { border-color: #ead7a2; background: #fffdf5; }
  .agenda-tv-sync-row > strong { min-width: 0; font-size: 10px; overflow-wrap: anywhere; }
  .agenda-tv-sync-value { display: grid; min-width: 0; gap: 2px; }
  .agenda-tv-sync-value span { color: #64748b; font-size: 8px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  .agenda-tv-sync-value p { margin: 0; color: #243244; font-size: 10px; font-weight: 700; overflow-wrap: anywhere; }
  .agenda-tv-sync-note { grid-column: 1 / -1; margin: 0; color: #765000; font-size: 9px; font-weight: 800; }
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
  @media (max-width: 900px) { .thematic-tracking-rows { grid-template-columns: 1fr; } }
  @media (max-width: 760px) { .thematic-global-tools, .thematic-page-row, .thematic-page-row-main, .thematic-zone-editor, .thematic-highlight-row, .thematic-slots-4, .thematic-slots-5, .thematic-slots-6, .thematic-sources-list, .agenda-tv-sync-row { grid-template-columns: 1fr; } .thematic-zone-editor label { grid-template-columns: 1fr; } .thematic-page-row-actions, .agenda-tv-sync-actions { justify-content: flex-start; } }
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
  workedIdentities: readonly string[];
  persistedDisplacedIdentities: readonly string[];
  draftDisplacedIdentities: readonly string[];
  draftFaixaArrivalIdentities: readonly string[];
  draftDisplacedArrivalIdentities: readonly string[];
  persistedVacantZoneSlots: readonly MatchdayEditorialVacantZoneSlot[];
  draftVacantZoneSlots: readonly MatchdayEditorialVacantZoneSlot[];
  persistedVacantFaixaSlots: readonly number[];
  draftVacantFaixaSlots: readonly number[];
}>;

type WorkspaceDraft = Readonly<{
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  pageControls: MatchdayEditorialProfilePageControls;
  editorialSelection: readonly (string | null)[];
  videoModule: VideoModuleDraft;
  workedIdentities: readonly string[];
  displacedIdentities: readonly string[];
  faixaArrivalIdentities: readonly string[];
  displacedArrivalIdentities: readonly string[];
  vacantZoneSlots: readonly MatchdayEditorialVacantZoneSlot[];
  vacantFaixaSlots: readonly number[];
}>;

type Placement = Readonly<{
  kind: "new" | "opening" | "zone" | "faixa" | "bank" | "displaced";
  zoneKey?: EditorialProfileZoneKey;
}>;

function displacedIdentitiesFromDesk(
  desk: MatchdayEditorialProfileDeskSnapshot,
): readonly string[] {
  return desk.tracking.items
    .filter((item) => item.editorialState === "DESALOJADA")
    .map((item) => thematicEditorialIdentity(item.sourceType, item.sourceId));
}

function vacantZoneSlotsFromDesk(
  profile: ReturnType<typeof editorialProfileWithZoneLayouts>,
  desk: MatchdayEditorialProfileDeskSnapshot,
): readonly MatchdayEditorialVacantZoneSlot[] {
  return profile.zones.flatMap((zone) => {
    const occupied = new Set(
      desk.appliedZoneItems
        .filter((item) => item.zoneKey === zone.key)
        .map((item) => item.sortOrder),
    );
    return Array.from({ length: zone.capacity }, (_, index) => index + 1)
      .filter((slotPosition) => !occupied.has(slotPosition))
      .map((slotPosition) => ({ zoneKey: zone.key, slotPosition }));
  });
}

function vacantFaixaSlotsFromDesk(
  _desk: MatchdayEditorialProfileDeskSnapshot,
): readonly number[] {
  return [];
}

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

function prependRecentIdentity(
  values: readonly string[],
  itemIdentity: string,
): readonly string[] {
  return [
    itemIdentity,
    ...values.filter((candidate) => candidate !== itemIdentity),
  ];
}

function withoutRecentIdentity(
  values: readonly string[],
  itemIdentity: string,
): readonly string[] {
  return values.filter((candidate) => candidate !== itemIdentity);
}


function ArticleCard({ item, placement, selected, dragging, onToggle, onDragStart, onDragEnd, onFaixa, onBank }: Readonly<{
  item: MatchdayEditorialProfileEffectiveItem;
  placement: Placement;
  selected: boolean;
  dragging: boolean;
  onToggle: (itemIdentity: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, itemIdentity: string) => void;
  onDragEnd: () => void;
  onFaixa: () => void;
  onBank: () => void;
}>) {
  const itemIdentity = identity(item);
  const publishedAt = formattedDate(item.publishedAt);

  return (
    <article aria-grabbed={dragging} className={`thematic-card${selected ? " selected" : ""}`} draggable onDragEnd={onDragEnd} onDragStart={(event) => onDragStart(event, itemIdentity)}>
      <input aria-label={`Marcar para operação em lote: ${item.title ?? item.sourceId}`} checked={selected} onChange={() => onToggle(itemIdentity)} onClick={(event) => event.stopPropagation()} type="checkbox" />
      {renderableImageUrl(item.imageUrl) ? (
        <Image alt="" className="thematic-image" height={40} loader={imageLoader} loading="lazy" src={item.imageUrl} unoptimized width={50} />
      ) : <span aria-hidden="true" className="thematic-image-placeholder" />}
      <div className="thematic-card-copy">
        <div className="thematic-card-top">
          {item.label ? <span className="thematic-card-label">{item.label}</span> : null}

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

          {placement.kind !== "faixa" ? <button className="thematic-button" onClick={onFaixa} type="button">Mover para Faixa</button> : null}
          {placement.kind !== "bank" ? <button className="thematic-button" onClick={onBank} type="button">Mover para Banco</button> : null}
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
  onFaixa,
  onBank,
  onRemove,
  position,
}: Readonly<{
  candidate: EditorialSelectionCandidate;
  dragging: boolean;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onFaixa: () => void;
  onBank: () => void;
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
        <summary aria-label={`Ações das quatro ${position}: ${candidate.title}`}>
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
            onClick={onFaixa}
            type="button"
          >
            Mover para Faixa
          </button>
          <button
            className="thematic-button"
            onClick={onBank}
            type="button"
          >
            Mover para Banco
          </button>
          <button
            className="thematic-button"
            onClick={onRemove}
            type="button"
          >
            Retirar das quatro
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

function agendaTvValue(
  date: string | null,
  kickoffAt: string | null,
  channel: string | null,
) {
  return [
    formattedDate(kickoffAt) ?? date ?? "Data e hora por definir",
    channel ?? "Canal por definir",
  ].join(" · ");
}

function MatchdayAgendaTvSyncPanel({ matchdayId }: Readonly<{ matchdayId: string }>) {
  const router = useRouter();
  const [panelState, setPanelState] = useState<AgendaTvPanelState>("inactive");
  const [preview, setPreview] = useState<AgendaTvPreview | null>(null);
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<"preview" | "apply" | null>(null);

  const relevantRows = preview?.rows.filter((row) => row.status !== "unchanged") ?? [];

  async function runAgendaTvAction(action: "preview" | "apply") {
    if (busyAction) return;

    setBusyAction(action);
    setPanelState("searching");
    setMessage(action === "preview" ? "A procurar atualizações…" : "A confirmar alterações…");

    try {
      const response = await fetch(
        `/api/admin/editorial/jornada/${encodeURIComponent(matchdayId)}/agenda-tv`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const result = await response.json() as AgendaTvResponse;

      if (result.preview) setPreview(result.preview);

      if (!response.ok || !result.ok || !result.preview) {
        if (result.code === "source-unavailable") {
          setPanelState("unavailable");
          setMessage(
            result.message
            ?? "Agenda externa indisponível neste momento. Nenhuma alteração foi efetuada.",
          );
          return;
        }

        setPanelState(result.preview?.summary.blockers ? "blocked" : "error");
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }

      if (action === "apply" && (result.applied ?? 0) > 0) {
        setPanelState("applied");
        setMessage(result.message ?? "Alterações confirmadas com sucesso.");
        router.refresh();
        return;
      }

      if (result.preview.summary.blockers > 0) {
        setPanelState("blocked");
        setMessage(
          `${result.preview.summary.blockers} ${result.preview.summary.blockers === 1 ? "problema impede" : "problemas impedem"} a confirmação.`,
        );
        return;
      }

      if (result.preview.summary.update > 0) {
        setPanelState("changes");
        setMessage(
          `${result.preview.summary.update} ${result.preview.summary.update === 1 ? "alteração segura encontrada" : "alterações seguras encontradas"}.`,
        );
        return;
      }

      setPanelState("no_changes");
      setMessage(result.message ?? "A agenda e os canais já estão atualizados.");
    } catch {
      setPanelState("error");
      setMessage("Não foi possível contactar a atualização da Agenda e TV.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section
      aria-busy={busyAction !== null}
      aria-label="Atualização da Agenda e TV"
      className="agenda-tv-sync"
    >
      <div className="agenda-tv-sync-head">
        <div className="agenda-tv-sync-copy">
          <strong>Agenda e TV</strong>
          <span>
            {panelState === "inactive"
              ? "Procurar diferenças de data, hora e canal."
              : panelState === "searching"
                ? "A consultar a agenda da jornada…"
                : panelState === "unavailable"
                  ? "Origem externa temporariamente indisponível."
                : preview
                  ? `${preview.summary.update} alterações · ${preview.summary.blockers} problemas`
                  : "Não foi possível concluir a operação."}
          </span>
        </div>
        <div className="agenda-tv-sync-actions">
          <button
            className="thematic-button"
            disabled={busyAction !== null}
            onClick={() => runAgendaTvAction("preview")}
            type="button"
          >
            {busyAction === "preview" ? "A procurar…" : "Procurar atualizações"}
          </button>
          {preview?.canApply ? (
            <button
              className="thematic-button dark"
              disabled={busyAction !== null}
              onClick={() => runAgendaTvAction("apply")}
              type="button"
            >
              {busyAction === "apply" ? "A confirmar…" : "Confirmar alterações"}
            </button>
          ) : null}
        </div>
      </div>

      {message && panelState !== "searching" ? (
        <p
          aria-live={panelState === "error" ? "assertive" : "polite"}
          className={`agenda-tv-sync-message${panelState === "blocked" ? " warning" : panelState === "error" ? " error" : ""}`}
        >
          {message}
        </p>
      ) : null}

      {relevantRows.length > 0 ? (
        <div className="agenda-tv-sync-rows">
          {relevantRows.map((row) => {
            const blocked = row.status !== "update";

            return (
              <article
                className={`agenda-tv-sync-row${blocked ? " blocked" : ""}`}
                key={row.matchId}
              >
                <strong>{row.label}</strong>
                <div className="agenda-tv-sync-value">
                  <span>Atual</span>
                  <p>{agendaTvValue(row.currentDate, row.currentKickoffAt, row.currentChannel)}</p>
                </div>
                <div className="agenda-tv-sync-value">
                  <span>Proposto</span>
                  <p>
                    {row.nextDate || row.nextKickoffAt || row.nextChannel
                      ? agendaTvValue(row.nextDate, row.nextKickoffAt, row.nextChannel)
                      : "Sem proposta segura"}
                  </p>
                </div>
                {blocked ? <p className="agenda-tv-sync-note">{row.note}</p> : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
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
    workedIdentities: [],
    persistedDisplacedIdentities: displacedIdentitiesFromDesk(desk),
    draftDisplacedIdentities: displacedIdentitiesFromDesk(desk),
    draftFaixaArrivalIdentities: [],
    draftDisplacedArrivalIdentities: [],
    persistedVacantZoneSlots: vacantZoneSlotsFromDesk(incomingProfile, desk),
    draftVacantZoneSlots: vacantZoneSlotsFromDesk(incomingProfile, desk),
    persistedVacantFaixaSlots: vacantFaixaSlotsFromDesk(desk),
    draftVacantFaixaSlots: vacantFaixaSlotsFromDesk(desk),
  }));
  const [history, setHistory] = useState<readonly WorkspaceDraft[]>([]);
  const [draggingIdentity, setDraggingIdentity] = useState<string | null>(null);
  const [draggingEditorialSelectionPosition, setDraggingEditorialSelectionPosition] =
    useState<MatchdayEditorialProfileSelectionPosition | null>(null);
  const [activeWorkspaceKey, setActiveWorkspaceKey] =
    useState<ActiveWorkspaceKey>("opening");
  const [openingPinned, setOpeningPinned] = useState(false);
  const pageStructureRef = useRef<HTMLDetailsElement>(null);
  const selectionBootstrapMatchdayRef = useRef<string | null>(null);
  const [editorialSelectionLoadedMatchdayId, setEditorialSelectionLoadedMatchdayId] =
    useState<string | null>(desk.matchdayId);
  const [destinationZone, setDestinationZone] = useState<EditorialProfileZoneKey>(profile.zones[0].key);
  const [zonePosition, setZonePosition] = useState(1);
  const [faixaPosition, setFaixaPosition] = useState(1);
  const [trackingClassFilter, setTrackingClassFilter] =
    useState<MatchdayEditorialTrackingClassFilter>("all");
  const [bankClassFilter, setBankClassFilter] =
    useState<MatchdayEditorialTrackingClassFilter>("all");
  const [trackingQuery, setTrackingQuery] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankVisibleCount, setBankVisibleCount] = useState(TRACKING_INITIAL_VISIBLE);
  const [trackingVisibleCounts, setTrackingVisibleCounts] = useState<
    Readonly<Record<MatchdayEditorialTrackingState, number>>
  >({
    NOVA: TRACKING_INITIAL_VISIBLE,
    FAIXA: TRACKING_INITIAL_VISIBLE,
    DESALOJADA: TRACKING_INITIAL_VISIBLE,
  });
  const [applyState, setApplyState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [
    editorialSelectionCandidates,
    setEditorialSelectionCandidates,
  ] = useState<
    readonly EditorialSelectionCandidate[]
  >(desk.selectionCandidates);
  const [
    persistedEditorialSelection,
    setPersistedEditorialSelection,
  ] = useState<
    readonly (string | null)[]
  >([1, 2, 3, 4].map((position) => (
    desk.editorialSelection.find((item) => item.position === position)?.bankItemId ?? null
  )));
  const [
    draftEditorialSelection,
    setDraftEditorialSelection,
  ] = useState<
    readonly (string | null)[]
  >([1, 2, 3, 4].map((position) => (
    desk.editorialSelection.find((item) => item.position === position)?.bankItemId ?? null
  )));
  const [zoneLayoutError, setZoneLayoutError] = useState<Readonly<{
    zoneKey: EditorialProfileZoneKey;
    message: string;
  }> | null>(null);

  function changeEditorialSelection(
    position: MatchdayEditorialProfileSelectionPosition,
    bankItemId: string,
  ) {
    const incomingIdentity = identityForBankItemId(bankItemId);
    const displacedIdentity = identityForBankItemId(
      draftEditorialSelection[position - 1] ?? null,
    );
    const source = incomingIdentity
      ? previewPlacementForIdentity(incomingIdentity)
      : null;
    const transition = prepareExclusiveMatchdayEditorialProfileSelection({
      profile: effectiveProfile,
      activeItems,
      overrides: operationalOverrides,
      opening: editorState.draftOpening,
      selection: draftEditorialSelection,
      candidates: editorialSelectionCandidates,
      targetPosition: position,
      bankItemId,
    });

    const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: transition.overrides,
        opening: transition.opening,
        editorialSelection: transition.selection,
      }, [
        ...(transition.workedIdentity ? [transition.workedIdentity] : []),
        ...(displacedIdentity && displacedIdentity !== incomingIdentity
          ? [displacedIdentity]
          : []),
      ]);

    const previewDraft =
      incomingIdentity
      && source?.kind === "selection"
      && source.slotPosition !== position
      && displacedIdentity
      && displacedIdentity !== incomingIdentity
        ? withPreviewMovements(nextDraft, [
            {
              incomingIdentity,
              source,
              target: {
                kind: "selection",
                slotPosition: position,
              },
              displacedIdentity: null,
            },
            {
              incomingIdentity: displacedIdentity,
              source: {
                kind: "selection",
                slotPosition: position,
              },
              target: source,
              displacedIdentity: null,
            },
          ])
        : incomingIdentity
          ? withPreviewMovements(nextDraft, [{
              incomingIdentity,
              source,
              target: {
                kind: "selection",
                slotPosition: position,
              },
              displacedIdentity:
                displacedIdentity !== incomingIdentity
                  ? displacedIdentity
                  : null,
            }])
          : nextDraft;

    commitDraft(
      previewDraft,
      source?.kind === "selection"
        && source.slotPosition !== position
        && displacedIdentity
        && displacedIdentity !== incomingIdentity
        ? "As duas notícias trocaram de posição nas quatro ao lado das Últimas."
        : "As quatro ao lado das Últimas foram alteradas em preview. Clique em Aplicar para publicar a alteração.",
    );
  }

  function removeEditorialSelection(
    position: MatchdayEditorialProfileSelectionPosition,
  ) {
    const transition =
      removeExclusiveMatchdayEditorialProfileSelection({
        profile: effectiveProfile,
        overrides: operationalOverrides,
        selection: draftEditorialSelection,
        candidates: editorialSelectionCandidates,
        position,
      });
    const removedIdentity = transition.workedIdentity;
    const source = removedIdentity
      ? previewPlacementForIdentity(removedIdentity)
      : null;
    const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: transition.overrides,
        editorialSelection: transition.selection,
      }, removedIdentity ? [removedIdentity] : []);

    commitDraft(
      removedIdentity
        ? withPreviewMovements(nextDraft, [{
            incomingIdentity: removedIdentity,
            source,
            target: { kind: "displaced" },
            displacedIdentity: null,
          }])
        : nextDraft,
      "Notícia retirada das quatro ao lado das Últimas; fica em Desalojadas.",
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
      setDraggingIdentity(null);
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
        "A notícia já não tem uma identidade canónica disponível para as quatro ao lado das Últimas.",
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
    const previousHighlightIdentity = draftVideoHighlightIdentity;
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

    const highlightCandidate =
      highlight.action === "replace" && highlight.bankItemId
        ? editorialSelectionCandidates.find(
            (candidate) => candidate.bankItemId === highlight.bankItemId,
          ) ?? null
        : null;
    const highlightSourceId =
      highlightCandidate?.sourceId?.trim().toLowerCase() ?? "";
    const highlightWorkedIdentity =
      highlightCandidate?.sourceType?.trim().toLowerCase() === "editorial_article"
      && highlightSourceId
        ? thematicEditorialIdentity(
            "editorial_article",
            highlightSourceId,
          )
        : null;

    const transition = highlightWorkedIdentity
      ? prepareExclusivePlacementTransition([highlightWorkedIdentity])
      : null;
    const displacedIdentity =
      highlight.action !== "preserve"
      && previousHighlightIdentity !== highlightWorkedIdentity
        ? previousHighlightIdentity
        : null;
    const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        ...(transition
          ? {
              overrides: transition.overrides,
              opening: transition.opening,
              editorialSelection: transition.editorialSelection,
            }
          : {}),
        videoModule: {
          ...editorState.draftVideoModule,
          highlight,
        },
      }, [
        ...(highlightWorkedIdentity ? [highlightWorkedIdentity] : []),
        ...(displacedIdentity ? [displacedIdentity] : []),
      ]);
    const previewDraft = highlightWorkedIdentity
      ? withPreviewMovements(nextDraft, [{
          incomingIdentity: highlightWorkedIdentity,
          source: previewPlacementForIdentity(highlightWorkedIdentity),
          target: { kind: "video_highlight", slotPosition: 1 },
          displacedIdentity,
        }])
      : displacedIdentity
        ? {
            ...nextDraft,
            displacedIdentities: Array.from(new Set([
              ...nextDraft.displacedIdentities,
              displacedIdentity,
            ])).sort(),
          }
        : nextDraft;
    commitDraft(
      previewDraft,
      highlight.action === "preserve"
        ? "Destaque reposto para o estado aplicado."
        : highlight.action === "remove"
          ? "Destaque retirado em preview."
          : "Destaque atualizado em preview.",
    );
  }

  useEffect(() => {
    selectionBootstrapMatchdayRef.current = null;
    const nextSelection = [1, 2, 3, 4].map((position) => (
      desk.editorialSelection.find((item) => item.position === position)?.bankItemId ?? null
    ));
    setEditorialSelectionCandidates(desk.selectionCandidates);
    setPersistedEditorialSelection(nextSelection);
    setDraftEditorialSelection(nextSelection);
    setEditorialSelectionLoadedMatchdayId(desk.matchdayId);
  }, [desk.editorialSelection, desk.matchdayId, desk.selectionCandidates]);

  useEffect(() => {
    setEditorState((current) => {
      const reconciledOverrides = reconcileMatchdayEditorialProfileDeskSnapshot(incomingProfile, {
        persistedOverrides: current.persistedOverrides,
        draftOverrides: current.draftOverrides,
        selectedIdentities: current.selectedIdentities,
      }, desk.manualOverrides, desk.automaticDistribution.activeItems);
      const openingDirty = !sameJson(current.persistedOpening, current.draftOpening);
      const controlsDirty = !sameJson(current.persistedPageControls, current.draftPageControls);
      const displacementDirty =
        !sameJson(
          current.persistedDisplacedIdentities,
          current.draftDisplacedIdentities,
        )
        || !sameJson(
          current.persistedVacantZoneSlots,
          current.draftVacantZoneSlots,
        )
        || !sameJson(
          current.persistedVacantFaixaSlots,
          current.draftVacantFaixaSlots,
        );
      const videoModuleDirty =
        current.draftVideoModule.active
          !== current.persistedVideoModuleActive
        || current.draftVideoModule.highlight.action !== "preserve";
      const draftOpening = openingDirty ? current.draftOpening : desk.opening;
      const nextDisplacedIdentities = displacedIdentitiesFromDesk(desk);
      const nextVacantZoneSlots = vacantZoneSlotsFromDesk(incomingProfile, desk);
      const nextVacantFaixaSlots = vacantFaixaSlotsFromDesk(desk);
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
        workedIdentities: current.workedIdentities.filter((itemIdentity) =>
          desk.automaticDistribution.activeItems.some((item) => identity(item) === itemIdentity)),
        draftFaixaArrivalIdentities:
          current.workedIdentities.length > 0
            ? current.draftFaixaArrivalIdentities
            : [],
        draftDisplacedArrivalIdentities:
          current.workedIdentities.length > 0
            ? current.draftDisplacedArrivalIdentities
            : [],
        persistedDisplacedIdentities: nextDisplacedIdentities,
        draftDisplacedIdentities: displacementDirty
          ? current.draftDisplacedIdentities.filter((itemIdentity) =>
              desk.automaticDistribution.activeItems.some((item) => identity(item) === itemIdentity))
          : nextDisplacedIdentities,
        persistedVacantZoneSlots: nextVacantZoneSlots,
        draftVacantZoneSlots: displacementDirty
          ? current.draftVacantZoneSlots
          : nextVacantZoneSlots,
        persistedVacantFaixaSlots: nextVacantFaixaSlots,
        draftVacantFaixaSlots: displacementDirty
          ? current.draftVacantFaixaSlots
          : nextVacantFaixaSlots,
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
  const draftSelectionIdentities = useMemo(
    () => matchdayEditorialProfileSelectionIdentities(
      draftEditorialSelection,
      editorialSelectionCandidates,
    ),
    [draftEditorialSelection, editorialSelectionCandidates],
  );
  const draftVideoHighlightIdentity = useMemo(() => {
    if (editorState.draftVideoModule.highlight.action === "remove") {
      return null;
    }
    if (editorState.draftVideoModule.highlight.action === "preserve") {
      const placement = desk.videoModule.highlight.placement;
      return placement?.sourceType === "editorial_article"
        ? thematicEditorialIdentity(placement.sourceType, placement.sourceId)
        : null;
    }
    const bankItemId = editorState.draftVideoModule.highlight.bankItemId;
    const candidate = bankItemId
      ? editorialSelectionCandidateById.get(bankItemId)
      : null;
    const sourceId = candidate?.sourceId?.trim().toLowerCase() ?? "";
    return candidate?.sourceType?.trim().toLowerCase() === "editorial_article"
      && sourceId
      ? thematicEditorialIdentity("editorial_article", sourceId)
      : null;
  }, [
    desk.videoModule.highlight.placement,
    editorState.draftVideoModule.highlight,
    editorialSelectionCandidateById,
  ]);
  const independentPlacementIdentities = useMemo(
    () => draftVideoHighlightIdentity ? [draftVideoHighlightIdentity] : [],
    [draftVideoHighlightIdentity],
  );
  const activeDraftOverrides = useMemo(
    () => editorState.draftOverrides.filter(
      (override) => activeIdentities.has(identity(override)),
    ),
    [activeIdentities, editorState.draftOverrides],
  );
  const operationalOverrides = useMemo(() => withoutMatchdayEditorialProfileOpeningOverrides(
    effectiveProfile,
    returnMatchdayEditorialItemsToAutomatic(
      effectiveProfile,
      activeDraftOverrides,
      draftSelectionIdentities,
    ),
    editorState.draftOpening,
  ), [activeDraftOverrides, draftSelectionIdentities, editorState.draftOpening, effectiveProfile]);
  const persistedOperationalOverrides = useMemo(() => withoutMatchdayEditorialProfileOpeningOverrides(
    persistedProfile,
    editorState.persistedOverrides.filter((override) => activeIdentities.has(identity(override))),
    editorState.persistedOpening,
  ), [activeIdentities, editorState.persistedOpening, editorState.persistedOverrides, persistedProfile]);

  useEffect(() => {
    if (
      editorialSelectionLoadedMatchdayId !== desk.matchdayId
      || selectionBootstrapMatchdayRef.current === desk.matchdayId
    ) {
      return;
    }

    try {
      const exclusive =
        prepareExclusiveMatchdayEditorialProfileSelectionState({
          profile: effectiveProfile,
          activeItems,
          overrides: activeDraftOverrides,
          opening: editorState.draftOpening,
          selection: draftEditorialSelection,
          candidates: editorialSelectionCandidates,
        });

      selectionBootstrapMatchdayRef.current = desk.matchdayId;

      const changed =
        !sameJson(exclusive.overrides, activeDraftOverrides)
        || !sameJson(exclusive.opening, editorState.draftOpening)
        || !sameJson(exclusive.selection, draftEditorialSelection);

      if (!changed) return;

      setEditorState((current) => ({
        ...current,
        draftOverrides: exclusive.overrides,
        draftOpening: exclusive.opening,
      }));
      setDraftEditorialSelection(exclusive.selection);
      setApplyState("idle");
      setMessage(
        "As quatro ao lado das Últimas já existentes foram preparadas para colocação exclusiva. Clique em Aplicar para consolidar a normalização.",
      );
    } catch (error) {
      selectionBootstrapMatchdayRef.current = desk.matchdayId;
      setApplyState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível normalizar as quatro ao lado das Últimas existentes.",
      );
    }
  }, [
    activeItems,
    activeDraftOverrides,
    desk.matchdayId,
    draftEditorialSelection,
    editorState.draftOpening,
    editorialSelectionCandidates,
    editorialSelectionLoadedMatchdayId,
    effectiveProfile,
  ]);

  const reconcile = useMemo(() => reconcileMatchdayEditorialProfileWorkspace(
    effectiveProfile,
    activeItems,
    operationalOverrides,
    editorState.draftOpening,
    desk.appliedZoneItems,
    desk.hasAppliedSnapshot,
    desk.currentFaixa,
    {
      selectionIdentities: draftSelectionIdentities,
      workedIdentities: editorState.workedIdentities,
      independentPlacementIdentities,
      displacedIdentities: editorState.draftDisplacedIdentities,
      vacantZoneSlots: editorState.draftVacantZoneSlots,
      vacantFaixaSlots: editorState.draftVacantFaixaSlots,
      allowAutomaticPlacement: false,
    },
  ), [activeItems, desk.appliedZoneItems, desk.currentFaixa, desk.hasAppliedSnapshot, draftSelectionIdentities, editorState.draftDisplacedIdentities, editorState.draftOpening, editorState.draftVacantFaixaSlots, editorState.draftVacantZoneSlots, editorState.workedIdentities, effectiveProfile, independentPlacementIdentities, operationalOverrides]);
  const pending = reconcile.hasChanges
    || !sameJson(operationalOverrides, persistedOperationalOverrides)
    || !sameJson(editorState.draftOpening, editorState.persistedOpening)
    || !sameJson(editorState.draftPageControls, editorState.persistedPageControls)
    || editorState.draftVideoModule.active
      !== editorState.persistedVideoModuleActive
    || editorState.draftVideoModule.highlight.action !== "preserve"
    || !sameJson(draftEditorialSelection, persistedEditorialSelection)
    || !sameJson(
      editorState.draftDisplacedIdentities,
      editorState.persistedDisplacedIdentities,
    )
    || !sameJson(
      editorState.draftVacantZoneSlots,
      editorState.persistedVacantZoneSlots,
    )
    || !sameJson(
      editorState.draftVacantFaixaSlots,
      editorState.persistedVacantFaixaSlots,
    )
    || editorState.workedIdentities.length > 0
    || editorState.draftFaixaArrivalIdentities.length > 0
    || editorState.draftDisplacedArrivalIdentities.length > 0;
  const zoneByKey = new Map(
    reconcile.zonesAfter.map(
      (zone) => [zone.key, zone] as const,
    ),
  );

  const selected = useMemo(() => new Set(editorState.selectedIdentities.filter((itemIdentity) => activeIdentities.has(itemIdentity))), [activeIdentities, editorState.selectedIdentities]);
  const selectedIdentities = [...selected];
  const destinationZoneCapacity = effectiveProfile.zones.find(
    (zone) => zone.key === destinationZone,
  )?.capacity ?? 1;
  const maxZoneStartPosition = Math.max(
    1,
    destinationZoneCapacity - Math.max(1, selectedIdentities.length) + 1,
  );
  const effectiveZonePosition = Math.min(
    zonePosition,
    maxZoneStartPosition,
  );
  const effectiveItemByIdentity = useMemo(() => new Map([
    ...reconcile.zonesAfter.flatMap((zone) => zone.items),
    ...reconcile.faixaAfter,
    ...reconcile.bankAfter,
  ].map((item) => [identity(item), item] as const)), [reconcile]);
  const normalizedTrackingQuery = trackingQuery
    .trim()
    .toLocaleLowerCase("pt-PT");
  const matchesTrackingQuery = (
    item: Pick<MatchdayEditorialProfileEffectiveItem, "label" | "title" | "subtitle">,
  ) => (
    !normalizedTrackingQuery
    || [item.label, item.title, item.subtitle].some((value) =>
      value?.toLocaleLowerCase("pt-PT").includes(normalizedTrackingQuery))
  );
  const explicitBankEntries = useMemo(() => {
    const entries = reconcile.bankAfter.flatMap((item) => {
      const itemIdentity = identity(item);
      const bankItemId = bankItemIdByIdentity.get(itemIdentity)
        ?.trim()
        .toLowerCase();
      if (!bankItemId) return [];

      return [{
        bankItemId,
        classifiedZoneKey:
          activeByIdentity.get(itemIdentity)?.classifiedZoneKey ?? null,
        item,
      }];
    });

    return selectMatchdayEditorialExplicitBankItems(entries, "all");
  }, [activeByIdentity, bankItemIdByIdentity, reconcile.bankAfter]);
  const classBankEntries = selectMatchdayEditorialExplicitBankItems(
    explicitBankEntries,
    bankClassFilter,
  );
  const filteredBankEntries = classBankEntries.filter(({ item }) => (
    matchesTrackingQuery(item)
  ));
  const visibleBankEntries = filteredBankEntries.slice(0, bankVisibleCount);
  const draftExplicitBankIdentities = useMemo(() => new Set(
    reconcile.bankAfter.map(identity),
  ), [reconcile.bankAfter]);
  const draftPlacedOutsideTrackingIdentities = useMemo(() => new Set([
    ...matchdayEditorialProfileOpeningSourceIds(editorState.draftOpening).map(
      (sourceId) => thematicEditorialIdentity("editorial_article", sourceId),
    ),
    ...reconcile.zonesAfter.flatMap((zone) => zone.items.map(identity)),
    ...draftSelectionIdentities,
    ...independentPlacementIdentities,
  ]), [draftSelectionIdentities, editorState.draftOpening, independentPlacementIdentities, reconcile.zonesAfter]);
  const uniqueTrackingItems = useMemo(() => {
    const persisted = selectMatchdayEditorialTrackingItems(
      desk.tracking.items,
      "all",
    );
    const byBankItemId = new Map(
      persisted.map((item) => [item.bankItemId.trim().toLowerCase(), item] as const),
    );

    for (const faixaItem of reconcile.faixaAfter) {
      const itemIdentity = identity(faixaItem);
      const activeItem = activeByIdentity.get(itemIdentity);
      const bankItemId = bankItemIdByIdentity.get(itemIdentity)?.trim().toLowerCase();
      if (!activeItem?.classifiedZoneKey || !bankItemId) continue;
      const previousTrackingItem = byBankItemId.get(bankItemId);
      byBankItemId.set(bankItemId, {
        ...activeItem,
        bankItemId,
        classifiedZoneKey: activeItem.classifiedZoneKey,
        classificationSource: "preview",
        classifiedAt: "",
        editorialState: "FAIXA",
        memoryKind: null,
        placementCreatedAt:
          previousTrackingItem?.editorialState === "FAIXA"
            ? previousTrackingItem.placementCreatedAt
            : new Date().toISOString(),
        stateRecordedAt: null,
      });
    }

    for (const itemIdentity of editorState.draftDisplacedIdentities) {
      const activeItem = activeByIdentity.get(itemIdentity);
      const bankItemId = bankItemIdByIdentity.get(itemIdentity)?.trim().toLowerCase();
      if (!activeItem?.classifiedZoneKey || !bankItemId) continue;
      const previousTrackingItem = byBankItemId.get(bankItemId);
      byBankItemId.set(bankItemId, {
        ...activeItem,
        bankItemId,
        classifiedZoneKey: activeItem.classifiedZoneKey,
        classificationSource: "preview",
        classifiedAt: "",
        editorialState: "DESALOJADA",
        memoryKind: "displaced",
        placementCreatedAt: null,
        stateRecordedAt:
          previousTrackingItem?.editorialState === "DESALOJADA"
            ? previousTrackingItem.stateRecordedAt
            : new Date().toISOString(),
      });
    }

    return selectMatchdayEditorialTrackingItems(
      Array.from(byBankItemId.values()),
      "all",
    );
  }, [activeByIdentity, bankItemIdByIdentity, desk.tracking.items, editorState.draftDisplacedIdentities, reconcile.faixaAfter]);
  const trackableItems = useMemo(() => uniqueTrackingItems.filter((item) => {
    const itemIdentity = identity(item);
    return activeByIdentity.has(itemIdentity)
      && !draftExplicitBankIdentities.has(itemIdentity)
      && !draftPlacedOutsideTrackingIdentities.has(itemIdentity)
      && (
        item.editorialState !== "DESALOJADA"
        || editorState.draftDisplacedIdentities.includes(itemIdentity)
      );
  }), [activeByIdentity, draftExplicitBankIdentities, draftPlacedOutsideTrackingIdentities, editorState.draftDisplacedIdentities, uniqueTrackingItems]);
  const classTrackingItems = useMemo(() => (
    trackingClassFilter === "all"
      ? trackableItems
      : trackableItems.filter((item) => (
          item.classifiedZoneKey === trackingClassFilter
        ))
  ), [trackableItems, trackingClassFilter]);
  const trackingEntries = useMemo(() => classTrackingItems.flatMap((trackingItem) => {
    const itemIdentity = identity(trackingItem);
    const activeItem = activeByIdentity.get(itemIdentity);
    if (!activeItem) return [];
    const effectiveItem = effectiveItemByIdentity.get(itemIdentity) ?? {
      ...activeItem,
      sortOrder: null,
      manualOverride: null,
    };
    return [{ trackingItem, item: effectiveItem }];
  }), [activeByIdentity, classTrackingItems, effectiveItemByIdentity]);
  const filteredTrackingEntries = trackingEntries.filter(({ trackingItem }) => (
    matchesTrackingQuery(trackingItem)
  ));
  const filteredSourceItems = filteredTrackingEntries.map(({ item }) => item);

  function trackingEntriesForState(state: MatchdayEditorialTrackingState) {
    const entries = filteredTrackingEntries.filter(({ trackingItem }) => (
      trackingItem.editorialState === state
    ));

    if (state === "FAIXA") {
      return [...entries].sort((left, right) => (
        (left.item.sortOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.item.sortOrder ?? Number.MAX_SAFE_INTEGER)
      ));
    }

    const recent = state === "DESALOJADA"
      ? editorState.draftDisplacedArrivalIdentities
      : [];

    if (recent.length === 0) return entries;

    const rank = new Map(
      recent.map((itemIdentity, index) => [itemIdentity, index] as const),
    );

    return [...entries].sort((left, right) => {
      const leftRank = rank.get(identity(left.item));
      const rightRank = rank.get(identity(right.item));
      if (leftRank === undefined && rightRank === undefined) return 0;
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    });
  }

  function showMoreTracking(state: MatchdayEditorialTrackingState) {
    setTrackingVisibleCounts((current) => ({
      ...current,
      [state]: current[state] + TRACKING_PAGE_SIZE,
    }));
  }

  function trackingPlacement(state: MatchdayEditorialTrackingState): Placement {
    if (state === "NOVA") return { kind: "new" };
    if (state === "FAIXA") return { kind: "faixa" };
    return { kind: "displaced" };
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
      workedIdentities: editorState.workedIdentities,
      displacedIdentities: editorState.draftDisplacedIdentities,
      vacantZoneSlots: editorState.draftVacantZoneSlots,
      vacantFaixaSlots: editorState.draftVacantFaixaSlots,
      faixaArrivalIdentities: editorState.draftFaixaArrivalIdentities,
      displacedArrivalIdentities:
        editorState.draftDisplacedArrivalIdentities,
    };
  }

  function withWorkedIdentities(
    draft: WorkspaceDraft,
    itemIdentities: readonly string[],
  ): WorkspaceDraft {
    return {
      ...draft,
      workedIdentities: Array.from(new Set([
        ...draft.workedIdentities,
        ...itemIdentities,
      ])),
    };
  }

  function previewPlacementForIdentity(
    itemIdentity: string,
  ): MatchdayEditorialPreviewPlacement | null {
    const sourceId = activeByIdentity.get(itemIdentity)?.sourceId ?? null;
    if (sourceId) {
      const openingIndex = MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.findIndex(
        (slot) => editorState.draftOpening[slot] === sourceId,
      );
      if (openingIndex >= 0) {
        return { kind: "opening", slotPosition: openingIndex + 1 };
      }
    }

    for (const zone of reconcile.zonesAfter) {
      const item = zone.items.find((candidate) => identity(candidate) === itemIdentity);
      if (item) {
        return {
          kind: "zone",
          zoneKey: zone.key,
          slotPosition: item.sortOrder,
        };
      }
    }

    const faixaItem = reconcile.faixaAfter.find(
      (candidate) => identity(candidate) === itemIdentity,
    );
    if (faixaItem) {
      return { kind: "faixa", slotPosition: faixaItem.sortOrder };
    }

    const selectionBankItemId = bankItemIdByIdentity.get(itemIdentity);
    const selectionPosition = selectionBankItemId
      ? draftEditorialSelection.findIndex((value) => value === selectionBankItemId)
      : -1;
    if (selectionPosition >= 0) {
      return { kind: "selection", slotPosition: selectionPosition + 1 };
    }

    if (draftVideoHighlightIdentity === itemIdentity) {
      return { kind: "video_highlight", slotPosition: 1 };
    }

    if (editorState.draftDisplacedIdentities.includes(itemIdentity)) {
      return { kind: "displaced" };
    }

    if (reconcile.bankAfter.some((item) => identity(item) === itemIdentity)) {
      return { kind: "bank" };
    }

    return { kind: "tracking" };
  }

  function withPreviewMovements(
    draft: WorkspaceDraft,
    movements: readonly MatchdayEditorialPreviewMovement[],
  ): WorkspaceDraft {
    const next = applyMatchdayEditorialMovementPreview(
      {
        displacedIdentities: draft.displacedIdentities,
        vacantZoneSlots: draft.vacantZoneSlots,
        vacantFaixaSlots: draft.vacantFaixaSlots,
      },
      movements,
    );
    let faixaArrivalIdentities = [
      ...draft.faixaArrivalIdentities,
    ];
    let displacedArrivalIdentities = [
      ...draft.displacedArrivalIdentities,
    ];

    for (const movement of movements) {
      const incomingIdentity = movement.incomingIdentity;

      if (
        movement.source?.kind === "faixa"
        && movement.target.kind !== "faixa"
      ) {
        faixaArrivalIdentities = [
          ...withoutRecentIdentity(
            faixaArrivalIdentities,
            incomingIdentity,
          ),
        ];
      }

      if (
        movement.target.kind === "faixa"
        && movement.source?.kind !== "faixa"
      ) {
        faixaArrivalIdentities = [
          ...prependRecentIdentity(
            faixaArrivalIdentities,
            incomingIdentity,
          ),
        ];
      }

      if (
        movement.source?.kind === "displaced"
        && movement.target.kind !== "displaced"
      ) {
        displacedArrivalIdentities = [
          ...withoutRecentIdentity(
            displacedArrivalIdentities,
            incomingIdentity,
          ),
        ];
      }

      if (movement.target.kind === "displaced") {
        displacedArrivalIdentities = [
          ...prependRecentIdentity(
            displacedArrivalIdentities,
            incomingIdentity,
          ),
        ];
      }

      if (movement.displacedIdentity) {
        displacedArrivalIdentities = [
          ...prependRecentIdentity(
            displacedArrivalIdentities,
            movement.displacedIdentity,
          ),
        ];

        if (movement.target.kind === "faixa") {
          faixaArrivalIdentities = [
            ...withoutRecentIdentity(
              faixaArrivalIdentities,
              movement.displacedIdentity,
            ),
          ];
        }
      }
    }

    return {
      ...draft,
      displacedIdentities: next.displacedIdentities,
      vacantZoneSlots: next.vacantZoneSlots,
      vacantFaixaSlots: [],
      faixaArrivalIdentities,
      displacedArrivalIdentities,
    };
  }

  function identityForBankItemId(bankItemId: string | null): string | null {
    if (!bankItemId) return null;
    const candidate = editorialSelectionCandidateById.get(bankItemId);
    const sourceId = candidate?.sourceId?.trim().toLowerCase() ?? "";
    return candidate?.sourceType?.trim().toLowerCase() === "editorial_article"
      && sourceId
      ? thematicEditorialIdentity("editorial_article", sourceId)
      : null;
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
      workedIdentities: next.workedIdentities,
      draftDisplacedIdentities: next.displacedIdentities,
      draftFaixaArrivalIdentities: next.faixaArrivalIdentities,
      draftDisplacedArrivalIdentities:
        next.displacedArrivalIdentities,
      draftVacantZoneSlots: next.vacantZoneSlots,
      draftVacantFaixaSlots: next.vacantFaixaSlots,
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
      editorialSelection: withoutMatchdayEditorialProfileSelectionBankItems(
        draftEditorialSelection,
        itemIdentities.flatMap((itemIdentity) => {
          const bankItemId = bankItemIdByIdentity.get(itemIdentity);
          return bankItemId ? [bankItemId] : [];
        }),
      ),
    };
  }

  function placeInOpening(
    itemIdentity: string,
    slot: MatchdayEditorialProfileOpeningSlotKey,
  ) {
    const source = previewPlacementForIdentity(itemIdentity);
    const targetSlotPosition =
      MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.indexOf(slot) + 1;
    const targetSourceId = editorState.draftOpening[slot];
    const targetIdentity = targetSourceId
      ? thematicEditorialIdentity(
          "editorial_article",
          targetSourceId,
        )
      : null;

    if (
      source?.kind === "opening"
      && targetIdentity
      && targetIdentity !== itemIdentity
    ) {
      localOperation(() => {
        const opening = swapMatchdayEditorialProfileOpeningItems(
          editorState.draftOpening,
          sourceIdForIdentity(itemIdentity),
          slot,
        );
        const nextDraft = withWorkedIdentities(
          {
            ...currentDraft(),
            opening,
          },
          [itemIdentity, targetIdentity],
        );

        return withPreviewMovements(nextDraft, [
          {
            incomingIdentity: itemIdentity,
            source,
            target: {
              kind: "opening",
              slotPosition: targetSlotPosition,
            },
            displacedIdentity: null,
          },
          {
            incomingIdentity: targetIdentity,
            source: {
              kind: "opening",
              slotPosition: targetSlotPosition,
            },
            target: source,
            displacedIdentity: null,
          },
        ]);
      }, "As duas notícias trocaram de posição na Abertura.");
      return;
    }

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
          [
            itemIdentity,
            ...(movement.displacedSourceId
              ? [thematicEditorialIdentity(
                  "editorial_article",
                  movement.displacedSourceId,
                )]
              : []),
          ],
        );
      const incomingSelection =
        withoutMatchdayEditorialProfileSelectionBankItems(
          draftEditorialSelection,
          [bankItemIdByIdentity.get(itemIdentity) ?? ""],
        );

      const displacedIdentity = movement.displacedSourceId
        ? thematicEditorialIdentity(
            "editorial_article",
            movement.displacedSourceId,
          )
        : null;
      const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: incomingOverrides,
        opening: movement.opening,
        editorialSelection: incomingSelection,
      }, [
        itemIdentity,
        ...(displacedIdentity && displacedIdentity !== itemIdentity
          ? [displacedIdentity]
          : []),
      ]);

      return withPreviewMovements(nextDraft, [{
        incomingIdentity: itemIdentity,
        source,
        target: {
          kind: "opening",
          slotPosition: targetSlotPosition,
        },
        displacedIdentity:
          displacedIdentity !== itemIdentity ? displacedIdentity : null,
      }]);
    }, `${MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS[slot]} atualizada em preview. Se o destino estava ocupado, a notícia substituída fica desalojada.`);
  }

  function placeInZone(
    itemIdentity: string,
    zoneKey: EditorialProfileZoneKey,
    position: number,
  ) {
    const source = previewPlacementForIdentity(itemIdentity);
    const targetZone = reconcile.zonesAfter.find(
      (zone) => zone.key === zoneKey,
    );
    const targetItem = targetZone?.items.find(
      (item) => item.sortOrder === position,
    );
    const targetIdentity = targetItem
      ? identity(targetItem)
      : null;

    if (
      source?.kind === "zone"
      && source.zoneKey === zoneKey
      && targetIdentity
      && targetIdentity !== itemIdentity
    ) {
      localOperation(() => {
        const transition = prepareExclusivePlacementTransition(
          [itemIdentity, targetIdentity],
        );
        const overrides = swapMatchdayEditorialItemsInZone(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          itemIdentity,
          targetIdentity,
          zoneKey,
          targetZone?.items ?? [],
        );
        const nextDraft = withWorkedIdentities({
          ...currentDraft(),
          overrides,
          opening: transition.opening,
          editorialSelection: transition.editorialSelection,
        }, [itemIdentity, targetIdentity]);

        return withPreviewMovements(nextDraft, [
          {
            incomingIdentity: itemIdentity,
            source,
            target: {
              kind: "zone",
              zoneKey,
              slotPosition: position,
            },
            displacedIdentity: null,
          },
          {
            incomingIdentity: targetIdentity,
            source: {
              kind: "zone",
              zoneKey,
              slotPosition: position,
            },
            target: source,
            displacedIdentity: null,
          },
        ]);
      }, `As notícias trocaram de posição em ${zoneKey}.`);
      return;
    }

    localOperation(() => {
      const transition = prepareExclusivePlacementTransition(
        [itemIdentity],
      );
      const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: placeMatchdayEditorialItemsInZoneWithoutCascade(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          [itemIdentity],
          zoneKey,
          position,
          targetZone?.items ?? [],
        ),
        opening: transition.opening,
        editorialSelection: transition.editorialSelection,
      }, [
        itemIdentity,
        ...(targetIdentity && targetIdentity !== itemIdentity
          ? [targetIdentity]
          : []),
      ]);

      return withPreviewMovements(nextDraft, [{
        incomingIdentity: itemIdentity,
        source,
        target: {
          kind: "zone",
          zoneKey,
          slotPosition: position,
        },
        displacedIdentity:
          targetIdentity !== itemIdentity ? targetIdentity : null,
      }]);
    }, `Notícia colocada em ${zoneKey}, posição ${position}. Se o destino estava ocupado, a notícia substituída fica desalojada.`);
  }

  function placeAtFaixaTop(itemIdentity: string) {
    const source = previewPlacementForIdentity(itemIdentity);

    localOperation(() => {
      const transition = prepareExclusivePlacementTransition(
        [itemIdentity],
      );
      const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: placeMatchdayEditorialItemAtFaixaTop(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          itemIdentity,
          reconcile.faixaAfter,
        ),
        opening: transition.opening,
        editorialSelection: transition.editorialSelection,
      }, [itemIdentity]);

      return withPreviewMovements(nextDraft, [{
        incomingIdentity: itemIdentity,
        source,
        target: { kind: "faixa", slotPosition: 1 },
        displacedIdentity: null,
      }]);
    }, "Notícia colocada no topo da Faixa. Nenhuma notícia foi desalojada.");
  }

  function placeInFaixa(
    itemIdentity: string,
    position: number,
  ) {
    const targetPosition = Math.max(1, position);
    const source = previewPlacementForIdentity(itemIdentity);
    const targetItem = reconcile.faixaAfter.find(
      (item) => item.sortOrder === targetPosition,
    );
    const targetIdentity = targetItem
      ? identity(targetItem)
      : null;

    if (!targetIdentity || targetIdentity === itemIdentity) {
      if (!targetIdentity) placeAtFaixaTop(itemIdentity);
      return;
    }

    if (source?.kind === "faixa") {
      localOperation(() => {
        const transition = prepareExclusivePlacementTransition(
          [itemIdentity, targetIdentity],
        );
        const overrides = swapMatchdayEditorialItemsInFaixa(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          itemIdentity,
          targetIdentity,
          reconcile.faixaAfter,
        );
        const nextDraft = withWorkedIdentities({
          ...currentDraft(),
          overrides,
          opening: transition.opening,
          editorialSelection: transition.editorialSelection,
        }, [itemIdentity, targetIdentity]);

        return withPreviewMovements(nextDraft, [
          {
            incomingIdentity: itemIdentity,
            source,
            target: {
              kind: "faixa",
              slotPosition: targetPosition,
            },
            displacedIdentity: null,
          },
          {
            incomingIdentity: targetIdentity,
            source: {
              kind: "faixa",
              slotPosition: targetPosition,
            },
            target: source,
            displacedIdentity: null,
          },
        ]);
      }, "As duas notícias trocaram de posição na Faixa.");
      return;
    }

    localOperation(() => {
      const transition = prepareExclusivePlacementTransition(
        [itemIdentity],
      );
      const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: replaceMatchdayEditorialItemInFaixa(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          itemIdentity,
          targetIdentity,
          reconcile.faixaAfter,
        ),
        opening: transition.opening,
        editorialSelection: transition.editorialSelection,
      }, [itemIdentity, targetIdentity]);

      return withPreviewMovements(nextDraft, [{
        incomingIdentity: itemIdentity,
        source,
        target: {
          kind: "faixa",
          slotPosition: targetPosition,
        },
        displacedIdentity: targetIdentity,
      }]);
    }, `Notícia colocada na Faixa na posição ${targetPosition}; a notícia substituída passou para Desalojadas.`);
  }

  function placeInDisplaced(itemIdentity: string) {
    const source = previewPlacementForIdentity(itemIdentity);

    localOperation(() => {
      const transition = prepareExclusivePlacementTransition(
        [itemIdentity],
      );
      const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: transition.overrides,
        opening: transition.opening,
        editorialSelection: transition.editorialSelection,
      }, [itemIdentity]);

      return withPreviewMovements(nextDraft, [{
        incomingIdentity: itemIdentity,
        source,
        target: { kind: "displaced" },
        displacedIdentity: null,
      }]);
    }, "Notícia enviada para Desalojadas.");
  }

  function placeInBank(itemIdentity: string) {
    localOperation(() => {
      const source = previewPlacementForIdentity(itemIdentity);
      const transition =
        prepareExclusivePlacementTransition(
          [itemIdentity],
        );

      const nextDraft = withWorkedIdentities({
        ...currentDraft(),
        overrides: moveMatchdayEditorialItemsToBank(
          effectiveProfile,
          transition.candidates,
          transition.overrides,
          [itemIdentity],
        ),
        opening: transition.opening,
        editorialSelection: transition.editorialSelection,
      }, [itemIdentity]);

      return withPreviewMovements(nextDraft, [{
        incomingIdentity: itemIdentity,
        source,
        target: { kind: "bank" },
        displacedIdentity: null,
      }]);
    }, "Notícia enviada explicitamente para o Banco.");
  }


  function dragged(event: DragEvent<HTMLElement>): string | null {
    if (
      draggingIdentity
      && activeByIdentity.has(draggingIdentity)
    ) {
      return draggingIdentity;
    }

    const raw = event.dataTransfer.getData("text/plain");

    if (raw && activeByIdentity.has(raw)) {
      return raw;
    }

    const selectionDrag =
      parseMatchdayEditorialProfileSelectionDrag(raw);

    if (!selectionDrag) {
      return null;
    }

    const selectionIdentity =
      identityForBankItemId(selectionDrag.bankItemId);

    return selectionIdentity
      && activeByIdentity.has(selectionIdentity)
        ? selectionIdentity
        : null;
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
      workedIdentities: previous.workedIdentities,
      draftDisplacedIdentities: previous.displacedIdentities,
      draftFaixaArrivalIdentities: previous.faixaArrivalIdentities,
      draftDisplacedArrivalIdentities:
        previous.displacedArrivalIdentities,
      draftVacantZoneSlots: previous.vacantZoneSlots,
      draftVacantFaixaSlots: previous.vacantFaixaSlots,
    }));
    setDraftEditorialSelection(previous.editorialSelection);
    setHistory((current) => current.slice(0, -1));
    setApplyState("idle");
    setMessage("Última alteração local desfeita.");
  }

  function resetLocal() {
    if (!pending) return;

    const exclusive =
      prepareExclusiveMatchdayEditorialProfileSelectionState({
        profile: persistedProfile,
        activeItems,
        overrides: persistedOperationalOverrides,
        opening: editorState.persistedOpening,
        selection: persistedEditorialSelection,
        candidates: editorialSelectionCandidates,
      });

    setHistory((current) => [...current, currentDraft()]);
    setEditorState((current) => ({
      ...current,
      draftOverrides: exclusive.overrides,
      draftOpening: exclusive.opening,
      draftPageControls: current.persistedPageControls,
      draftVideoModule: {
        active: current.persistedVideoModuleActive,
        highlight: {
          action: "preserve",
          bankItemId: null,
        },
      },
      selectedIdentities: [],
      workedIdentities: [],
      draftDisplacedIdentities: current.persistedDisplacedIdentities,
      draftFaixaArrivalIdentities: [],
      draftDisplacedArrivalIdentities: [],
      draftVacantZoneSlots: current.persistedVacantZoneSlots,
      draftVacantFaixaSlots: current.persistedVacantFaixaSlots,
    }));
    setDraftEditorialSelection(exclusive.selection);
    setApplyState("idle");
    setMessage(
      sameJson(exclusive.overrides, persistedOperationalOverrides)
        && sameJson(exclusive.opening, editorState.persistedOpening)
        && sameJson(exclusive.selection, persistedEditorialSelection)
        ? "Preview reposto para o último estado aplicado."
        : "Preview reposto; as quatro ao lado das Últimas continuam preparadas para colocação exclusiva e requerem Aplicar.",
    );
  }

  async function applyChanges() {
    if (!pending || applyState === "saving") return;
    setApplyState("saving");
    setMessage("A validar e aplicar numa única transação…");
    try {
      const workedSourceIds = editorState.workedIdentities.flatMap((itemIdentity) => {
        const item = activeByIdentity.get(itemIdentity);
        return item ? [item.sourceId] : [];
      });
      const displacedBankItemIds = editorState.draftDisplacedIdentities.map(
        (itemIdentity) => {
          const bankItemId = bankItemIdByIdentity.get(itemIdentity);
          if (!bankItemId) {
            throw new Error(
              "Uma notícia desalojada já não tem identidade canónica no Bank.",
            );
          }
          return bankItemId;
        },
      );
      const faixaArrivalBankItemIds =
        editorState.draftFaixaArrivalIdentities.map(
          (itemIdentity) => {
            const bankItemId = bankItemIdByIdentity.get(itemIdentity);
            if (!bankItemId) {
              throw new Error(
                "Uma chegada à Faixa já não tem identidade canónica no Bank.",
              );
            }
            return bankItemId;
          },
        );
      const displacedArrivalBankItemIds =
        editorState.draftDisplacedArrivalIdentities.map(
          (itemIdentity) => {
            const bankItemId = bankItemIdByIdentity.get(itemIdentity);
            if (!bankItemId) {
              throw new Error(
                "Uma chegada a Desalojadas já não tem identidade canónica no Bank.",
              );
            }
            return bankItemId;
          },
        );
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
          workedSourceIds,
          displacedBankItemIds,
          faixaArrivalBankItemIds,
          displacedArrivalBankItemIds,
          vacantZoneSlots: editorState.draftVacantZoneSlots,
          vacantFaixaSlots: editorState.draftVacantFaixaSlots,
          videoModule: {
            active: editorState.draftVideoModule.active,
            highlightAction:
              editorState.draftVideoModule.highlight.action,
            highlightBankItemId:
              editorState.draftVideoModule.highlight.bankItemId,
          },
        }),
      });
      const payload = await readAdminJsonResponse<{
        ok?: boolean;
        message?: string;
      }>(response);
      if (payload.ok !== true) throw new Error(payload.message ?? "O Apply temático foi recusado integralmente.");
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
        workedIdentities: [],
        persistedDisplacedIdentities: current.draftDisplacedIdentities,
        draftDisplacedIdentities: current.draftDisplacedIdentities,
        draftFaixaArrivalIdentities: [],
        draftDisplacedArrivalIdentities: [],
        persistedVacantZoneSlots: current.draftVacantZoneSlots,
        draftVacantZoneSlots: current.draftVacantZoneSlots,
        persistedVacantFaixaSlots: current.draftVacantFaixaSlots,
        draftVacantFaixaSlots: current.draftVacantFaixaSlots,
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
    return (
      <ArticleCard
        dragging={draggingIdentity === itemIdentity}
        item={item}
        onBank={() => placeInBank(itemIdentity)}
        onDragEnd={() => setDraggingIdentity(null)}
        onDragStart={dragStart}
        onFaixa={() => placeAtFaixaTop(itemIdentity)}
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
              item.sortOrder ?? 1,
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
            <span>Título público</span>
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
            <span>Apresentação</span>
            <select
              aria-label={`Apresentação de ${zone.label}`}
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
            <span>Título público</span>
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
            <span>Apresentação</span>
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
              <option value="four_news">Últimas + quatro ao lado</option>
              <option value="hidden">Oculto</option>
            </select>
          </label>
          <strong className="thematic-zone-editor-count">
            {editorialSelectionOccupied}/4
          </strong>
        </div>

        <div
          aria-label="Quatro ao lado das Últimas"
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
                  aria-label={`Quatro ao lado das Últimas ${position}`}
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
                      onDragEnd={() => {
                        setDraggingIdentity(null);
                        setDraggingEditorialSelectionPosition(null);
                      }}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        const itemIdentity =
                          identityForBankItemId(candidate.bankItemId);

                        if (!itemIdentity) {
                          event.preventDefault();
                          setApplyState("error");
                          setMessage(
                            "A notícia das quatro já não tem identidade editorial canónica.",
                          );
                          return;
                        }

                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          serializeMatchdayEditorialProfileSelectionDrag({
                            bankItemId: candidate.bankItemId,
                            sourcePosition: position,
                          }),
                        );
                        setDraggingIdentity(itemIdentity);
                        setDraggingEditorialSelectionPosition(position);
                      }}
                      onFaixa={() => {
                        const itemIdentity =
                          identityForBankItemId(candidate.bankItemId);
                        if (itemIdentity) {
                          placeAtFaixaTop(itemIdentity);
                        }
                      }}
                      onBank={() => {
                        const itemIdentity =
                          identityForBankItemId(candidate.bankItemId);
                        if (itemIdentity) {
                          placeInBank(itemIdentity);
                        }
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
        ? "Últimas + quatro ao lado"
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
    function dropOnTrackingState(
      event: DragEvent<HTMLElement>,
      state: MatchdayEditorialTrackingState,
    ) {
      event.preventDefault();
      const itemIdentity = dragged(event);
      if (itemIdentity) {
        if (state === "DESALOJADA") {
          placeInDisplaced(itemIdentity);
        } else if (state === "FAIXA") {
          placeAtFaixaTop(itemIdentity);
        }
      }
      setDraggingIdentity(null);
    }

    return (
      <section className="thematic-sources" aria-label="Tracking editorial por classe">
        <div className="thematic-sources-toolbar">
          <h2>Tracking</h2>
          <nav aria-label="Escolher classe contextual">
            <button
              className={trackingClassFilter === "all" ? "active" : ""}
              onClick={() => {
                setTrackingClassFilter("all");
                setTrackingVisibleCounts({
                  NOVA: TRACKING_INITIAL_VISIBLE,
                  FAIXA: TRACKING_INITIAL_VISIBLE,
                  DESALOJADA: TRACKING_INITIAL_VISIBLE,
                });
              }}
              type="button"
            >
              Todas {trackableItems.length}
            </button>
            {profile.zones.map((zone) => (
              <button
                className={trackingClassFilter === zone.key ? "active" : ""}
                key={zone.key}
                onClick={() => {
                  setTrackingClassFilter(zone.key);
                  setTrackingVisibleCounts({
                    NOVA: TRACKING_INITIAL_VISIBLE,
                    FAIXA: TRACKING_INITIAL_VISIBLE,
                    DESALOJADA: TRACKING_INITIAL_VISIBLE,
                  });
                }}
                type="button"
              >
                {zone.label} {trackableItems.filter((item) => (
                  item.classifiedZoneKey === zone.key
                )).length}
              </button>
            ))}
          </nav>
          <div className="thematic-bank-access">
            <button
              aria-controls="thematic-bank-pool"
              aria-expanded={bankOpen}
              className={`thematic-button${bankOpen ? " active" : ""}`}
              onClick={() => setBankOpen((current) => !current)}
              type="button"
            >
              Banco {explicitBankEntries.length}
            </button>
          </div>
          <label className="thematic-reservoir-search">
            <span>Pesquisa</span>
            <input
              aria-label="Pesquisar Tracking e Banco"
              onChange={(event) => {
                setTrackingQuery(event.target.value);
                setTrackingVisibleCounts({
                  NOVA: TRACKING_INITIAL_VISIBLE,
                  FAIXA: TRACKING_INITIAL_VISIBLE,
                  DESALOJADA: TRACKING_INITIAL_VISIBLE,
                });
                setBankVisibleCount(TRACKING_INITIAL_VISIBLE);
              }}
              placeholder="Título ou antetítulo"
              type="search"
              value={trackingQuery}
            />
          </label>
          <div className="thematic-reservoir-count">
            <strong>{filteredSourceItems.length}</strong>
            <span>em tracking</span>
          </div>
        </div>

        {bankOpen ? (
          <section
            aria-label="Banco editorial"
            className="thematic-bank-pool"
            id="thematic-bank-pool"
          >
            <div className="thematic-bank-class-filters">
              <nav aria-label="Filtrar Banco por classe contextual">
                <button
                  className={bankClassFilter === "all" ? "active" : ""}
                  onClick={() => {
                    setBankClassFilter("all");
                    setBankVisibleCount(TRACKING_INITIAL_VISIBLE);
                  }}
                  type="button"
                >
                  Todas {explicitBankEntries.length}
                </button>
                {profile.zones.map((zone) => (
                  <button
                    className={bankClassFilter === zone.key ? "active" : ""}
                    key={zone.key}
                    onClick={() => {
                      setBankClassFilter(zone.key);
                      setBankVisibleCount(TRACKING_INITIAL_VISIBLE);
                    }}
                    type="button"
                  >
                    {zone.label} {explicitBankEntries.filter((entry) => (
                      entry.classifiedZoneKey === zone.key
                    )).length}
                  </button>
                ))}
              </nav>
              <button
                className="thematic-button"
                disabled={filteredBankEntries.length === 0}
                onClick={() => setEditorState((current) => ({
                  ...current,
                  selectedIdentities: Array.from(new Set([
                    ...current.selectedIdentities,
                    ...filteredBankEntries.map(({ item }) => identity(item)),
                  ])),
                }))}
                type="button"
              >
                Selecionar Banco
              </button>
            </div>
            <div className="thematic-sources-list">
              {visibleBankEntries.length > 0
                ? visibleBankEntries.map(({ bankItemId, item }) => (
                    <Fragment key={bankItemId}>
                      {cardFor(item, { kind: "bank" })}
                    </Fragment>
                  ))
                : <p className="thematic-empty">Sem notícias estacionadas no Banco.</p>}
            </div>
            {visibleBankEntries.length < filteredBankEntries.length ? (
              <div className="thematic-more">
                <button
                  className="thematic-button"
                  onClick={() => setBankVisibleCount((current) => (
                    current + TRACKING_PAGE_SIZE
                  ))}
                  type="button"
                >
                  Mostrar mais {Math.min(
                    TRACKING_PAGE_SIZE,
                    filteredBankEntries.length - visibleBankEntries.length,
                  )}
                </button>
                <span>{visibleBankEntries.length}/{filteredBankEntries.length}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="thematic-tracking-rows">
          {TRACKING_STATES.map((state) => {
            const entries = trackingEntriesForState(state);
            const visibleEntries = entries.slice(0, trackingVisibleCounts[state]);
            const label = state === "NOVA"
              ? "Novas"
              : state === "FAIXA"
                ? "Faixa"
                : "Desalojadas";
            const emptyLabel = state === "NOVA"
              ? "Sem notícias novas nesta classe."
              : state === "FAIXA"
                ? "Sem notícias na Faixa nesta classe."
                : "Sem notícias desalojadas nesta classe.";

            return (
              <section
                aria-label={`${label} · ${trackingClassFilter === "all" ? "todas" : trackingClassFilter}`}
                className="thematic-tracking-row"
                data-tracking-state={state}
                key={state}
              >
                <div className="thematic-tracking-row-label">
                  <strong>{label}</strong>
                  <span>{entries.length}</span>
                  {entries.length > 0 ? (
                    <button
                      className="thematic-button"
                      onClick={() => setEditorState((current) => ({
                        ...current,
                        selectedIdentities: Array.from(new Set([
                          ...current.selectedIdentities,
                          ...entries.map(({ item }) => identity(item)),
                        ])),
                      }))}
                      type="button"
                    >
                      Selecionar linha
                    </button>
                  ) : null}
                </div>
                {state !== "NOVA" ? (
                  <div
                    className="thematic-tracking-drop-target"
                    data-drag-active={draggingIdentity !== null}
                    onDragOver={allowDrop}
                    onDrop={(event) =>
                      dropOnTrackingState(event, state)
                    }
                  >
                    {state === "FAIXA"
                      ? "Largar aqui · entra no topo da Faixa"
                      : "Largar aqui · passa para Desalojadas"}
                  </div>
                ) : null}
                <div
                  className="thematic-sources-list"
                  data-drag-active={draggingIdentity !== null}
                  onDragOver={state === "NOVA" ? undefined : allowDrop}
                  onDrop={state === "NOVA"
                    ? undefined
                    : (event) => dropOnTrackingState(event, state)}
                >
                  {visibleEntries.length > 0
                    ? visibleEntries.map(({ item }) => (
                        state === "FAIXA"
                          ? renderFaixaItem(item)
                          : cardFor(item, trackingPlacement(state))
                      ))
                    : <p className="thematic-empty">{emptyLabel}</p>}
                </div>
                {visibleEntries.length < entries.length ? (
                  <div className="thematic-more">
                    <button
                      className="thematic-button"
                      onClick={() => showMoreTracking(state)}
                      type="button"
                    >
                      Mostrar mais
                    </button>
                    <span>{entries.length - visibleEntries.length} por mostrar</span>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
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
                <strong>
                  Operação em lote · {selected.size === 1
                    ? "1 notícia selecionada"
                    : `${selected.size} notícias selecionadas`}
                </strong>
              </div>
            </div>

            <div className="thematic-bulk-context-actions">
              <div className="thematic-bulk-group">
                <label className="thematic-field zone">
                  Zona de destino
                  <select
                    value={destinationZone}
                    onChange={(event) => {
                      setDestinationZone(event.target.value as EditorialProfileZoneKey);
                    }}
                  >
                    {profile.zones.map((zone) => (
                      <option key={zone.key} value={zone.key}>{zone.label}</option>
                    ))}
                  </select>
                </label>
                <label className="thematic-field">
                  Posição na zona
                  <select
                    value={effectiveZonePosition}
                    onChange={(event) => setZonePosition(Number(event.target.value))}
                  >
                    {Array.from({ length: maxZoneStartPosition }, (_, index) => index + 1).map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    const targetZone = reconcile.zonesAfter.find(
                      (zone) => zone.key === destinationZone,
                    );
                    const selectedSet = new Set(selectedIdentities);
                    const movements = selectedIdentities.map((itemIdentity, index) => {
                      const targetPosition = effectiveZonePosition + index;
                      const targetItem = targetZone?.items.find(
                        (item) => item.sortOrder === targetPosition,
                      );
                      const displacedIdentity = targetItem
                        ? identity(targetItem)
                        : null;
                      return {
                        incomingIdentity: itemIdentity,
                        source: previewPlacementForIdentity(itemIdentity),
                        target: {
                          kind: "zone" as const,
                          zoneKey: destinationZone,
                          slotPosition: targetPosition,
                        },
                        displacedIdentity:
                          displacedIdentity && !selectedSet.has(displacedIdentity)
                            ? displacedIdentity
                            : null,
                      };
                    });
                    const displacedIdentities = movements.flatMap((movement) => (
                      movement.displacedIdentity ? [movement.displacedIdentity] : []
                    ));
                    const nextDraft = withWorkedIdentities({
                      ...currentDraft(),
                      overrides: placeMatchdayEditorialItemsInZoneWithoutCascade(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                        destinationZone,
                        effectiveZonePosition,
                        targetZone?.items ?? [],
                      ),
                      opening: transition.opening,
                      editorialSelection: transition.editorialSelection,
                    }, [...selectedIdentities, ...displacedIdentities]);
                    return withPreviewMovements(nextDraft, movements);
                  }, "Operação em lote colocada diretamente nos destinos; notícias substituídas ficam desalojadas.")}
                  type="button"
                >
                  Mover para zona
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
                    const selectedSet = new Set(selectedIdentities);
                    const movements = selectedIdentities.map((itemIdentity, index) => {
                      const targetPosition = faixaPosition + index;
                      const targetItem = reconcile.faixaAfter.find(
                        (item) => item.sortOrder === targetPosition,
                      );
                      const displacedIdentity = targetItem
                        ? identity(targetItem)
                        : null;
                      return {
                        incomingIdentity: itemIdentity,
                        source: previewPlacementForIdentity(itemIdentity),
                        target: {
                          kind: "faixa" as const,
                          slotPosition: targetPosition,
                        },
                        displacedIdentity:
                          displacedIdentity && !selectedSet.has(displacedIdentity)
                            ? displacedIdentity
                            : null,
                      };
                    });
                    const displacedIdentities = movements.flatMap((movement) => (
                      movement.displacedIdentity ? [movement.displacedIdentity] : []
                    ));
                    const nextDraft = withWorkedIdentities({
                      ...currentDraft(),
                      overrides: placeMatchdayEditorialItemsInFaixaWithoutCascade(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                        faixaPosition,
                        reconcile.faixaAfter,
                      ),
                      opening: transition.opening,
                      editorialSelection: transition.editorialSelection,
                    }, [...selectedIdentities, ...displacedIdentities]);
                    return withPreviewMovements(nextDraft, movements);
                  }, "Operação em lote colocada diretamente na Faixa; notícias substituídas ficam desalojadas.")}
                  type="button"
                >
                  Mover para Faixa
                </button>
              </div>

              <div className="thematic-bulk-group">
                <button
                  className="thematic-button"
                  onClick={() => localOperation(() => {
                    const transition = prepareExclusivePlacementTransition(selectedIdentities);
                    const nextDraft = withWorkedIdentities({
                      ...currentDraft(),
                      overrides: moveMatchdayEditorialItemsToBank(
                        effectiveProfile,
                        transition.candidates,
                        transition.overrides,
                        selectedIdentities,
                      ),
                      opening: transition.opening,
                      editorialSelection: transition.editorialSelection,
                    }, selectedIdentities);
                    return withPreviewMovements(
                      nextDraft,
                      selectedIdentities.map((itemIdentity) => ({
                        incomingIdentity: itemIdentity,
                        source: previewPlacementForIdentity(itemIdentity),
                        target: { kind: "bank" },
                        displacedIdentity: null,
                      })),
                    );
                  }, "Operação em lote movida para o Banco.")}
                  type="button"
                >
                  Mover para Banco
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
                  className="thematic-page-row"
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

          <details className="thematic-global-tool thematic-agenda-tv-tool">
            <summary>Agenda e TV</summary>
            <div className="thematic-global-tool-body">
              <MatchdayAgendaTvSyncPanel matchdayId={desk.matchdayId} />
            </div>
          </details>

          <section className="thematic-selection-controls" aria-label="Controlos de seleção">
            <strong>
              {selected.size === 1
                ? "1 notícia selecionada"
                : `${selected.size} notícias selecionadas`}
            </strong>
            <button
              className="thematic-button"
              disabled={filteredSourceItems.length === 0}
              onClick={() => setEditorState((current) => ({
                ...current,
                selectedIdentities: filteredSourceItems.map(identity),
              }))}
              type="button"
            >
              Selecionar todos
            </button>
            <button
              className="thematic-button"
              disabled={selected.size === 0}
              onClick={() => setEditorState((current) => ({ ...current, selectedIdentities: [] }))}
              type="button"
            >
              Limpar marcação
            </button>
          </section>
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
            <label className="thematic-opening-pin">
              <input
                checked={openingPinned}
                onChange={(event) => setOpeningPinned(event.target.checked)}
                type="checkbox"
              />
              <span>Fixar abertura</span>
            </label>
          </nav>

          {openingPinned && activeWorkspaceKey !== "opening"
            ? renderOpeningWorkspace()
            : null}
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
