"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

import MatchdayVideoSummarySync from "@/components/admin/MatchdayVideoSummarySync";
import { readAdminJsonResponse } from "@/lib/admin-json-response";

import MatchdayEditorialContextSelector, {
  type MatchdayEditorialContextSelectorData,
} from "./MatchdayEditorialContextSelector";
import MatchdayContextualClassificationCorrectionPanel from "./MatchdayContextualClassificationCorrectionPanel";

import {
  EDITORIAL_PROFILES,
} from "@/lib/editorial-profiles";
import {
  EDITORIAL_VISUAL_FAMILIES,
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
  type EditorialVisualFamily,
} from "@/lib/editorial-visual-families";
import {
  selectMatchdayEditorialExplicitBankItems,
  selectMatchdayEditorialTrackingItems,
  type MatchdayEditorialTrackingClassFilter,
  type MatchdayEditorialTrackingItem,
  type MatchdayEditorialSelectionCandidate,
  type MatchdayEditorialProfileDeskDiagnostic,
  type MatchdayEditorialProfileDeskSnapshot,
  type MatchdayEditorialTrackingState,
} from "@/lib/editorial-matchday-profile-desk";
import {
  thematicEditorialIdentity,
  type MatchdayEditorialProfileEffectiveItem,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  bulkMovePhysicalDeskItemsToBank,
  bulkMovePhysicalDeskItemsToFaixa,
  bulkMovePhysicalDeskItemsToZone,
  changePhysicalDeskLatestCompanion,
  changePhysicalDeskPresentation,
  changePhysicalDeskZone,
  createPhysicalDeskZone,
  createPhysicalDeskState,
  deletePhysicalDeskZone,
  movePhysicalDeskBlock,
  movePhysicalDeskItemToBank,
  movePhysicalDeskItemToDisplaced,
  movePhysicalDeskItemToFaixaTop,
  movePhysicalDeskItemToSlot,
  physicalDeskHasChanges,
  physicalDeskPlacementForBankItem,
  physicalDeskPlacementsOfType,
  physicalDeskZoneSlots,
  resetPhysicalDeskState,
  selectPhysicalDeskItems,
  togglePhysicalDeskSelection,
  undoPhysicalDeskState,
  type PhysicalDeskState,
} from "@/lib/editorial-matchday-live-layout-desk-state";
import {
  buildPhysicalDeskApplyPayload,
} from "@/lib/editorial-matchday-live-layout-physical-apply";
import type { LiveLayoutZoneId } from "@/lib/editorial-matchday-live-layout-physical";
import {
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS,
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS,
} from "@/lib/editorial-matchday-profile-workspace";
import {
  MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS,
  parseMatchdayEditorialProfileSelectionDrag,
  serializeMatchdayEditorialProfileSelectionDrag,
  type MatchdayEditorialProfileSelectionPosition,
} from "@/lib/editorial-matchday-profile-selection";

type EditorialSelectionCandidate = MatchdayEditorialSelectionCandidate;

const TRACKING_INITIAL_VISIBLE = 30;
const TRACKING_PAGE_SIZE = 30;
const TRACKING_STATES = ["NOVA", "FAIXA", "DESALOJADA"] as const;
const PERSISTABLE_PHYSICAL_LAYOUTS = EDITORIAL_VISUAL_FAMILIES.map((id) => (
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS[id]
));

type ActiveWorkspaceKey =
  | "opening"
  | "latest"
  | "highlight"
  | LiveLayoutZoneId;

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
  .thematic-editorial-selection .thematic-workspace-slot { display: grid; grid-template-rows: minmax(0,1fr); gap: 0; }
  .thematic-selection-slot[data-drag-active="true"] { border-color: #e43e48; background: #fff2f3; }
  .thematic-card.thematic-selection-card { width: 100%; grid-template-columns: 18px 50px minmax(0,1fr) 24px; }
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
  .thematic-global-actions { position: relative; display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 0; }
  .thematic-global-actions > .thematic-classification-tool { flex: 0 0 auto; }
  .thematic-global-actions > .thematic-selection-controls { flex: 1 1 auto; }
  .thematic-selection-controls { display: flex; min-width: 0; min-height: 30px; flex-wrap: nowrap; align-items: center; justify-content: flex-end; gap: 2px; padding: 0 3px 0 10px; }
  .thematic-selection-controls strong { color: #657487; font-size: 9px; white-space: nowrap; }
  .thematic-selection-controls .thematic-button { min-height: 24px; padding: 3px 7px; border: 0; border-radius: 4px; background: transparent; }
  .thematic-selection-controls .thematic-button + .thematic-button { border-left: 1px solid #dce3eb; border-radius: 0 4px 4px 0; }
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
  .thematic-workspace-slot .thematic-card.thematic-selection-card { grid-template-columns: 16px 44px minmax(0,1fr) 22px; }
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
  .thematic-faixa-item { min-width: 0; }
  .thematic-tracking-drop-target { margin: 0 6px 6px; padding: 7px 8px; border: 1px dashed #9aaabc; border-radius: 6px; background: #f8fafc; color: #526173; font-size: 9px; font-weight: 900; text-align: center; }
  .thematic-tracking-drop-target[data-drag-active="true"] { border-color: #e43e48; background: #fff2f3; color: #9f1d27; }
  .thematic-global-tools { position: relative; z-index: 20; display: grid; grid-template-columns: max-content max-content max-content minmax(0,1fr); align-items: center; min-height: 38px; gap: 0; padding: 3px; border: 1px solid #d7e0e9; border-radius: 7px; background: #fff; }
  .thematic-global-tool { position: relative; min-width: 0; border: 0; background: transparent; }
  .thematic-global-tool[open] { z-index: 2; }
  .thematic-global-tool > summary { display: flex; min-height: 30px; align-items: center; gap: 7px; padding: 0 10px; border-radius: 4px; cursor: pointer; list-style: none; color: #334155; font-size: 9px; font-weight: 900; letter-spacing: .055em; text-transform: uppercase; user-select: none; white-space: nowrap; }
  .thematic-global-tool > summary::-webkit-details-marker { display: none; }
  .thematic-global-tool > summary::after { width: 5px; height: 5px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; content: ""; opacity: .6; transform: rotate(45deg) translateY(-1px); transition: transform .14s ease; }
  .thematic-global-tool[open] > summary { background: #edf2f6; color: #172331; box-shadow: inset 0 -2px 0 #526173; }
  .thematic-global-tool[open] > summary::after { transform: rotate(225deg) translate(-1px,-1px); }
  .thematic-global-tools > .thematic-global-tool + .thematic-global-tool > summary, .thematic-global-actions > .thematic-classification-tool > summary { border-left: 1px solid #e1e7ed; }
  .thematic-global-tool > .thematic-global-tool-body, .thematic-global-tool > .thematic-page-structure { position: absolute; z-index: 40; top: calc(100% + 5px); left: 0; max-height: min(72vh,720px); overflow: auto; overscroll-behavior: contain; border: 1px solid #ccd6e0; border-radius: 7px; background: #fff; box-shadow: 0 9px 24px rgba(15,23,42,.11); }
  .thematic-global-tool-body { padding: 7px; }
  .thematic-global-tools > .thematic-global-tool:first-child > .thematic-page-structure { width: clamp(660px,50vw,760px); max-width: calc(100vw - 24px); }
  .thematic-video-tool > .thematic-global-tool-body { width: clamp(420px,50vw,720px); max-width: calc(100vw - 170px); }
  .thematic-agenda-tv-tool > .thematic-global-tool-body { width: clamp(500px,56vw,860px); max-width: calc(100vw - 250px); }
  .thematic-classification-tool > .thematic-global-tool-body { width: clamp(560px,52vw,700px); max-width: calc(100vw - 310px); }
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
  .thematic-page-structure { display: grid; gap: 5px; padding: 8px; }
  .thematic-page-structure-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .thematic-top-tools, .thematic-top-tools label { display: flex; align-items: center; gap: 5px; }
  .thematic-top-tools span { color: #64748b; font-size: 9px; font-weight: 800; }
  .thematic-top-tools input[type="color"] { width: 36px; height: 28px; padding: 2px; border: 1px solid #cbd5df; border-radius: 5px; }
  .thematic-new-zone-form { display: grid; grid-template-columns: minmax(300px,1.55fr) minmax(150px,.72fr) auto; gap: 6px; align-items: end; padding: 6px; border: 1px solid #cbd9e6; border-radius: 6px; background: #f4f8fc; }
  .thematic-new-zone-form label, .thematic-page-zone-field { display: grid; min-width: 0; gap: 2px; }
  .thematic-new-zone-form label > span, .thematic-page-zone-field > span { color: #64748b; font-size: 8px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
  .thematic-new-zone-form input, .thematic-new-zone-form select, .thematic-page-zone-field input, .thematic-page-zone-field select { width: 100%; min-width: 0; min-height: 27px; padding: 3px 6px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 9px; }
  .thematic-new-zone-actions { display: flex; gap: 4px; }
  .thematic-page-structure-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; align-items: start; }
  .thematic-page-structure-grid.has-zone-editor { grid-template-columns: minmax(0,1fr) 228px; }
  .thematic-page-map { min-width: 0; }
  .thematic-page-zone-editor-panel { display: grid; gap: 8px; padding: 9px; border: 1px solid #d7e0e9; border-radius: 7px; background: #fbfcfd; }
  .thematic-page-zone-editor-panel > strong { font-size: 13px; }
  .thematic-page-zone-editor-panel .thematic-page-zone-field > span { font-size: 8px; }
  .thematic-page-zone-editor-panel .thematic-page-zone-field input,
  .thematic-page-zone-editor-panel .thematic-page-zone-field select { min-height: 30px; font-size: 10px; }
  .thematic-page-zone-delete-trigger { min-height: 30px; border: 1px solid #e8b4b8; border-radius: 5px; background: #fff; color: #a61f29; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-page-delete-confirm { display: grid; gap: 7px; padding: 8px; border: 1px solid #f0b8bd; border-radius: 6px; background: #fff4f5; color: #8f1d26; }
  .thematic-page-delete-confirm p { margin: 0; font-size: 9px; line-height: 1.35; }
  .thematic-page-delete-confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .thematic-page-delete-confirm-actions button { min-height: 28px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-page-delete-confirm-actions button:last-child { border-color: #d92f3b; background: #d92f3b; color: #fff; }
  @media (max-width: 760px) { .thematic-page-structure-grid.has-zone-editor { grid-template-columns: 1fr; } }
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
  @media (max-width: 760px) { .thematic-global-tools { display: flex; flex-wrap: wrap; } .thematic-global-tools > .thematic-global-tool { flex: 0 0 auto; } .thematic-global-actions { flex: 1 1 100%; min-width: 100%; border-top: 1px solid #e1e7ed; } .thematic-selection-controls { flex-wrap: wrap; } .thematic-global-tool { position: static; } .thematic-global-actions > .thematic-classification-tool > summary { border-left: 0; } .thematic-global-tool > .thematic-global-tool-body, .thematic-global-tool > .thematic-page-structure { top: calc(100% + 5px); right: 3px; left: 3px; width: auto; max-width: none; max-height: calc(100vh - 80px); } .thematic-new-zone-form, .thematic-page-row, .thematic-page-row-main, .thematic-zone-editor, .thematic-highlight-row, .thematic-slots-4, .thematic-slots-5, .thematic-slots-6, .thematic-sources-list, .agenda-tv-sync-row { grid-template-columns: 1fr; } .thematic-zone-editor label { grid-template-columns: 1fr; } .thematic-page-row-actions, .agenda-tv-sync-actions { justify-content: flex-start; } }
`;

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Lisbon",
});

type Placement = Readonly<{
  kind: "new" | "opening" | "zone" | "faixa" | "bank" | "displaced";
  zoneId?: LiveLayoutZoneId;
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

function ArticleCard({ bankItemId, item, placement, selected, dragging, onToggle, onDragStart, onDragEnd, onFaixa, onBank }: Readonly<{
  bankItemId: string;
  item: MatchdayEditorialProfileEffectiveItem;
  placement: Placement;
  selected: boolean;
  dragging: boolean;
  onToggle: (bankItemId: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, bankItemId: string) => void;
  onDragEnd: () => void;
  onFaixa: () => void;
  onBank: () => void;
}>) {
  const publishedAt = formattedDate(item.publishedAt);

  return (
    <article aria-grabbed={dragging} className={`thematic-card${selected ? " selected" : ""}`} draggable onDragEnd={onDragEnd} onDragStart={(event) => onDragStart(event, bankItemId)}>
      <input aria-label={`Marcar para operação em lote: ${item.title ?? item.sourceId}`} checked={selected} onChange={() => onToggle(bankItemId)} onClick={(event) => event.stopPropagation()} type="checkbox" />
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
  onToggle,
  position,
  selected,
}: Readonly<{
  candidate: EditorialSelectionCandidate;
  dragging: boolean;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onFaixa: () => void;
  onBank: () => void;
  onRemove: () => void;
  onToggle: () => void;
  position: MatchdayEditorialProfileSelectionPosition;
  selected: boolean;
}>) {
  return (
    <article
      aria-grabbed={dragging}
      className={`thematic-card thematic-selection-card${selected ? " selected" : ""}`}
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
      <input aria-label={`Marcar para operação em lote: ${candidate.title}`} checked={selected} onChange={onToggle} onClick={(event) => event.stopPropagation()} type="checkbox" />
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
  const physicalPresentation = useMemo(() => ({
    headlineTitleColor: desk.pageControls.headlineTitleColor,
    latestZonePlacement: desk.pageControls.latestZonePlacement,
    latestZoneTitle: desk.pageControls.latestZoneTitle,
    videoModuleActive: desk.videoModule.active,
  }), [
    desk.pageControls.headlineTitleColor,
    desk.pageControls.latestZonePlacement,
    desk.pageControls.latestZoneTitle,
    desk.videoModule.active,
  ]);
  const [physicalDesk, setPhysicalDesk] = useState<PhysicalDeskState>(() => (
    createPhysicalDeskState(desk.physicalWorkspace, physicalPresentation)
  ));
  const [draggingBankItemId, setDraggingBankItemId] = useState<string | null>(null);
  const [draggingEditorialSelectionPosition, setDraggingEditorialSelectionPosition] =
    useState<MatchdayEditorialProfileSelectionPosition | null>(null);
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<ActiveWorkspaceKey>("opening");
  const [openingPinned, setOpeningPinned] = useState(false);
  const [newZoneFormOpen, setNewZoneFormOpen] = useState(false);
  const [newZoneTitle, setNewZoneTitle] = useState("");
  const [newZoneVisualFamily, setNewZoneVisualFamily] =
    useState<EditorialVisualFamily>(EDITORIAL_VISUAL_FAMILIES[0]);
  const [deleteZoneId, setDeleteZoneId] = useState<LiveLayoutZoneId | null>(null);
  const [destinationZoneId, setDestinationZoneId] = useState<LiveLayoutZoneId | null>(
    desk.physicalWorkspace.zones[0]?.id ?? null,
  );
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
  >({ NOVA: TRACKING_INITIAL_VISIBLE, FAIXA: TRACKING_INITIAL_VISIBLE, DESALOJADA: TRACKING_INITIAL_VISIBLE });
  const [applyState, setApplyState] = useState<"idle" | "saving" | "refreshing" | "error">("idle");
  const [awaitedPhysicalStateToken, setAwaitedPhysicalStateToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pageStructureRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setPhysicalDesk((current) => {
      if (current.physicalStateToken === desk.physicalWorkspace.stateToken) return current;
      return createPhysicalDeskState(desk.physicalWorkspace, physicalPresentation);
    });
    if (awaitedPhysicalStateToken === desk.physicalWorkspace.stateToken) {
      setAwaitedPhysicalStateToken(null);
      setApplyState("idle");
      setMessage("Estado físico autoritativo confirmado pelo servidor.");
    } else if (awaitedPhysicalStateToken === null) {
      setApplyState("idle");
    }
  }, [awaitedPhysicalStateToken, desk.physicalWorkspace, physicalPresentation]);

  const current = physicalDesk.current;
  const bankItemById = useMemo(
    () => new Map(current.bankItems.map((item) => [item.id, item] as const)),
    [current.bankItems],
  );
  const activeByIdentity = useMemo(() => new Map(
    desk.automaticDistribution.activeItems.map((item) => [identity(item), item] as const),
  ), [desk.automaticDistribution.activeItems]);
  const placementByBankItemId = useMemo(
    () => new Map(current.placements.map((placement) => [placement.bankItemId, placement] as const)),
    [current.placements],
  );
  const zoneById = useMemo(
    () => new Map(current.zones.map((zone) => [zone.id, zone] as const)),
    [current.zones],
  );
  const activeZone =
    zoneById.get(activeWorkspaceKey as LiveLayoutZoneId) ?? null;
  const activeLatest = activeWorkspaceKey === "latest";
  const activeStructureEditorOpen = activeZone !== null || activeLatest;
  const activeZonePlacedArticleCount = activeZone
    ? current.placements.filter((placement) => (
        placement.placementType === "zone"
        && placement.zoneId === activeZone.id
      )).length
    : 0;

  const activeStructureTitle = activeLatest
    ? current.presentation.latestZoneTitle
    : activeZone?.publicTitle ?? "";
  const activeStructureLabel = activeStructureTitle
    || (activeLatest ? "Últimas" : "Zona sem título");
  const selected = useMemo(
    () => new Set(physicalDesk.selectedBankItemIds),
    [physicalDesk.selectedBankItemIds],
  );
  const selectedBankItemIds = [...selected];
  const pending = physicalDeskHasChanges(physicalDesk);
  const mutationBlocked = applyState === "saving" || applyState === "refreshing";

  useEffect(() => {
    if (destinationZoneId && zoneById.has(destinationZoneId)) return;
    setDestinationZoneId(current.zones[0]?.id ?? null);
  }, [current.zones, destinationZoneId, zoneById]);

  useEffect(() => {
    if (
      activeWorkspaceKey === "opening"
      || activeWorkspaceKey === "latest"
      || activeWorkspaceKey === "highlight"
      || zoneById.has(activeWorkspaceKey)
    ) {
      return;
    }
    setActiveWorkspaceKey("opening");
  }, [activeWorkspaceKey, zoneById]);

  function effectiveItem(bankItemId: string, sortOrder: number | null = null): MatchdayEditorialProfileEffectiveItem {
    const bankItem = bankItemById.get(bankItemId);
    if (!bankItem) throw new Error("A notícia já não existe no workspace físico.");
    const active = activeByIdentity.get(
      thematicEditorialIdentity(bankItem.sourceType, bankItem.sourceId),
    );
    return {
      sourceType: bankItem.sourceType,
      sourceId: bankItem.sourceId,
      sortOrder,
      label: bankItem.label,
      title: bankItem.title,
      subtitle: bankItem.subtitle,
      imageUrl: bankItem.imageUrl,
      publishedAt: active?.publishedAt ?? null,
      updatedAt: active?.updatedAt ?? null,
      isNew: active?.isNew,
      circuitOrder: active?.circuitOrder ?? null,
      manualOverride: null,
    };
  }

  function candidateForBankItem(bankItemId: string): EditorialSelectionCandidate {
    const item = bankItemById.get(bankItemId);
    if (!item) throw new Error("A notícia já não existe no workspace físico.");
    return {
      bankItemId: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      label: item.label,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl,
      linkUrl: item.linkUrl,
    };
  }

  function runPhysicalOperation(
    operation: (state: PhysicalDeskState) => PhysicalDeskState,
    successMessage: string,
  ): PhysicalDeskState | null {
    if (mutationBlocked) {
      setApplyState("error");
      setMessage("A Mesa está a confirmar o Apply físico; aguarde a reconstrução pelo servidor.");
      return null;
    }
    try {
      const nextState = operation(physicalDesk);
      setPhysicalDesk(nextState);
      setApplyState("idle");
      setMessage(successMessage);
      return nextState;
    } catch (error) {
      setApplyState("error");
      const errorMessage = error instanceof Error
        ? error.message
        : "A operação física foi recusada.";
      setMessage(
        errorMessage.includes("zone-layout-shrink-occupied")
          ? "Este layout não comporta as posições atualmente ocupadas. Mova primeiro os artigos dessas posições."
          : errorMessage.includes("latest-companion-host-invalid")
            ? "Desassocie primeiro as Últimas desta zona."
            : errorMessage,
      );
      return null;
    }
  }

  function createZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextState = runPhysicalOperation(
      (state) => createPhysicalDeskZone(state, {
        publicTitle: newZoneTitle,
        visualFamily: newZoneVisualFamily,
      }),
      `${newZoneTitle.trim() || "Zona sem título"}: zona física criada em preview.`,
    );
    if (!nextState) return;
    const createdZone = nextState.current.zones.find((zone) => (
      !physicalDesk.current.zones.some((candidate) => candidate.id === zone.id)
    ));
    if (createdZone) setActiveWorkspaceKey(createdZone.id);
    setNewZoneTitle("");
    setNewZoneVisualFamily(EDITORIAL_VISUAL_FAMILIES[0]);
    setNewZoneFormOpen(false);
  }

  function cancelNewZone() {
    setNewZoneTitle("");
    setNewZoneVisualFamily(EDITORIAL_VISUAL_FAMILIES[0]);
    setNewZoneFormOpen(false);
  }

  function deleteZone(zoneId: LiveLayoutZoneId) {
    const zone = zoneById.get(zoneId);
    if (!zone) return;

    const nextState = runPhysicalOperation(
      (state) => deletePhysicalDeskZone(state, zoneId),
      `${zone.publicTitle || "Zona sem título"}: zona física apagada em preview.`,
    );

    if (!nextState) return;

    setDeleteZoneId(null);

    if (activeWorkspaceKey === zoneId) {
      setActiveWorkspaceKey("opening");
    }
  }

  function toggleSelection(bankItemId: string) {
    setPhysicalDesk((state) => togglePhysicalDeskSelection(state, bankItemId));
  }

  function selectItems(bankItemIds: readonly string[]) {
    setPhysicalDesk((state) => selectPhysicalDeskItems(state, bankItemIds));
  }

  function placeInZone(bankItemId: string, zoneId: LiveLayoutZoneId, position: number) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
        placementType: "zone", zoneId, slotPosition: position,
      }),
      `Notícia colocada na zona física ${zoneId}, posição ${position}.`,
    );
  }

  function placeInOpening(bankItemId: string, slotPosition: number) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
        placementType: "opening", zoneId: null, slotPosition,
      }),
      "Abertura atualizada em preview físico.",
    );
  }

  function placeInSelection(bankItemId: string, slotPosition: number) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
        placementType: "selection", zoneId: null, slotPosition,
      }),
      "Quatro ao lado das Últimas atualizadas em preview físico.",
    );
  }

  function placeAtFaixaTop(bankItemId: string) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToFaixaTop(state, bankItemId),
      "Notícia colocada no topo da Faixa. Nenhuma notícia foi desalojada.",
    );
  }

  function placeInFaixa(bankItemId: string, slotPosition: number) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
        placementType: "faixa", zoneId: null, slotPosition,
      }),
      "Faixa atualizada em preview físico.",
    );
  }

  function placeInDisplaced(bankItemId: string) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToDisplaced(state, bankItemId),
      "Notícia enviada para Desalojadas.",
    );
  }

  function placeInBank(bankItemId: string) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToBank(state, bankItemId),
      "Notícia enviada explicitamente para o Banco.",
    );
  }

  function dragged(event: DragEvent<HTMLElement>): string | null {
    if (draggingBankItemId && bankItemById.has(draggingBankItemId)) return draggingBankItemId;
    const raw = event.dataTransfer.getData("text/plain");
    if (bankItemById.has(raw)) return raw;
    const selectionDrag = parseMatchdayEditorialProfileSelectionDrag(raw);
    return selectionDrag && bankItemById.has(selectionDrag.bankItemId)
      ? selectionDrag.bankItemId
      : null;
  }

  function dragStart(event: DragEvent<HTMLElement>, bankItemId: string) {
    if (mutationBlocked) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button,input,summary,details")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", bankItemId);
    setDraggingBankItemId(bankItemId);
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (mutationBlocked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function cardFor(bankItemId: string, placement: Placement) {
    const physicalPlacement = placementByBankItemId.get(bankItemId);
    return (
      <ArticleCard
        bankItemId={bankItemId}
        dragging={draggingBankItemId === bankItemId}
        item={effectiveItem(bankItemId, physicalPlacement?.slotPosition ?? null)}
        onBank={() => placeInBank(bankItemId)}
        onDragEnd={() => setDraggingBankItemId(null)}
        onDragStart={dragStart}
        onFaixa={() => placeAtFaixaTop(bankItemId)}
        onToggle={toggleSelection}
        placement={placement}
        selected={selected.has(bankItemId)}
      />
    );
  }

  const explicitBankEntries = useMemo(() => current.explicitBankItemIds.flatMap((bankItemId) => {
    const item = bankItemById.get(bankItemId);
    return item ? [{
      bankItemId,
      classifiedZoneKey: item.classification?.key ?? null,
      item: effectiveItem(bankItemId),
    }] : [];
  }), [bankItemById, current.explicitBankItemIds]);
  const classBankEntries = selectMatchdayEditorialExplicitBankItems(explicitBankEntries, bankClassFilter);

  const normalizedTrackingQuery = trackingQuery.trim().toLocaleLowerCase("pt-PT");
  function matchesTrackingQuery(item: Pick<MatchdayEditorialProfileEffectiveItem, "label" | "title" | "subtitle">) {
    return !normalizedTrackingQuery
      || [item.label, item.title, item.subtitle].some((value) => (
        value?.toLocaleLowerCase("pt-PT").includes(normalizedTrackingQuery)
      ));
  }

  const trackingEntries = useMemo(() => current.bankItems.flatMap<MatchdayEditorialTrackingItem>((bankItem) => {
    if (!bankItem.classification || current.explicitBankItemIds.includes(bankItem.id)) return [];
    const placement = placementByBankItemId.get(bankItem.id);
    if (placement && placement.placementType !== "faixa") return [];
    const editorialState: MatchdayEditorialTrackingState = placement?.placementType === "faixa"
      ? "FAIXA"
      : current.displacedBankItemIds.includes(bankItem.id)
        ? "DESALOJADA"
        : "NOVA";
    return [{
      ...effectiveItem(bankItem.id, placement?.slotPosition ?? null),
      bankItemId: bankItem.id,
      classifiedZoneKey: bankItem.classification.key,
      classificationSource: bankItem.classification.source,
      classifiedAt: bankItem.classification.classifiedAt,
      editorialState,
      memoryKind: editorialState === "DESALOJADA" ? "displaced" : null,
      placementCreatedAt: desk.physicalWorkspace.placements.find((candidate) => candidate.bankItemId === bankItem.id)?.createdAt ?? null,
      stateRecordedAt: current.memory.find((candidate) => candidate.bankItemId === bankItem.id)?.recordedAt ?? null,
    }];
  }), [activeByIdentity, current.bankItems, current.displacedBankItemIds, current.explicitBankItemIds, current.memory, desk.physicalWorkspace.placements, placementByBankItemId]);
  const classTrackingEntries = trackingEntries.filter((entry) => (
    trackingClassFilter === "all" || entry.classifiedZoneKey === trackingClassFilter
  ));
  const filteredTrackingEntries = classTrackingEntries.filter(matchesTrackingQuery);
  const filteredBankEntries = classBankEntries.filter(({ item }) => matchesTrackingQuery(item));
  const visibleBankEntries = filteredBankEntries.slice(0, bankVisibleCount);

  function trackingEntriesForState(state: MatchdayEditorialTrackingState) {
    const entries = filteredTrackingEntries.filter((entry) => entry.editorialState === state);
    if (state === "NOVA") return selectMatchdayEditorialTrackingItems(entries, trackingClassFilter);
    if (state === "FAIXA") return [...entries].sort((left, right) => (
      (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    ));
    if (state !== "DESALOJADA") return entries;
    const rank = new Map(current.displacedArrivalBankItemIds.map((id, index) => [id, index] as const));
    return [...entries].sort((left, right) => (
      (rank.get(left.bankItemId) ?? Number.MAX_SAFE_INTEGER)
      - (rank.get(right.bankItemId) ?? Number.MAX_SAFE_INTEGER)
    ));
  }

  const openingPlacements = physicalDeskPlacementsOfType(physicalDesk, "opening");
  const selectionPlacements = physicalDeskPlacementsOfType(physicalDesk, "selection");
  const faixaPlacements = physicalDeskPlacementsOfType(physicalDesk, "faixa");
  const highlightPlacement = physicalDeskPlacementsOfType(physicalDesk, "video_highlight")[0] ?? null;
  const openingOccupied = openingPlacements.length;
  const editorialSelectionOccupied = selectionPlacements.length;
  const pendingCount = pending ? Math.max(1, physicalDesk.history.length) : 0;
  const destinationZoneCapacity = destinationZoneId
    ? zoneById.get(destinationZoneId)?.capacity ?? 1
    : 1;
  const maxZoneStartPosition = Math.max(
    1,
    destinationZoneCapacity - Math.max(1, selectedBankItemIds.length) + 1,
  );
  const effectiveZonePosition = Math.min(zonePosition, maxZoneStartPosition);

  function renderZonePanel(zoneId: LiveLayoutZoneId) {
    const zone = zoneById.get(zoneId);
    if (!zone) return null;
    const slots = physicalDeskZoneSlots(physicalDesk, zoneId);
    const additional = desk.physicalCompatibility.additionalPhysicalZoneIds.includes(zoneId);
    const zoneLabel = zone.publicTitle || "Zona sem título";
    return (
      <article className="thematic-workspace-body" key={zone.id} data-zone-id={zone.id}>
        <div className="thematic-zone-editor">
          <label>
            <span>Título público</span>
            <input
              aria-label={`Título público de ${zoneLabel}`}
              defaultValue={zone.publicTitle}
              disabled={mutationBlocked}
              key={`${zone.id}:${zone.publicTitle}`}
              maxLength={120}
              onBlur={(event) => runPhysicalOperation(
                (state) => changePhysicalDeskZone(state, zone.id, { publicTitle: event.target.value }),
                `${zoneLabel}: título físico alterado em preview.`,
              )}
              type="text"
            />
          </label>
          <label>
            <span>Apresentação</span>
            <select
              aria-label={`Apresentação de ${zoneLabel}`}
              disabled={mutationBlocked}
              onChange={(event) => runPhysicalOperation(
                (state) => changePhysicalDeskZone(state, zone.id, {
                  visualFamily: event.target.value as EditorialVisualFamily,
                }),
                `${zoneLabel}: layout físico alterado em preview.`,
              )}
              value={zone.visualFamily}
            >
              {EDITORIAL_VISUAL_FAMILIES.map((family) => (
                <option key={family} value={family}>{EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].label}</option>
              ))}
            </select>
          </label>
          <strong className="thematic-zone-editor-count">
            {slots.filter((slot) => slot.placement !== null).length}/{zone.capacity}
          </strong>
        </div>
        {additional ? (
          <p className="thematic-zone-alert" role="alert">
            Zona física adicional. Continua visível, mas todo o Apply v12 está bloqueado.
          </p>
        ) : null}
        <div className={`thematic-slots thematic-slots-${zone.capacity}`}>
          {slots.map((slot) => (
            <div
              className="thematic-workspace-slot"
              data-drag-active={draggingBankItemId !== null && !mutationBlocked}
              key={slot.slotPosition}
              onDragOver={allowDrop}
              onDrop={(event) => {
                event.preventDefault();
                const bankItemId = dragged(event);
                if (bankItemId) placeInZone(bankItemId, zone.id, slot.slotPosition);
                setDraggingBankItemId(null);
              }}
            >
              {slot.placement
                ? cardFor(slot.placement.bankItemId, { kind: "zone", zoneId: zone.id })
                : <p className="thematic-empty">Posição livre</p>}
            </div>
          ))}
        </div>
      </article>
    );
  }

  function renderOpeningWorkspace() {
    return (
      <article className="thematic-workspace-body">
        <div className="thematic-slots thematic-slots-5">
          {MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.map((slot, index) => {
            const position = index + 1;
            const placement = openingPlacements.find((candidate) => candidate.slotPosition === position);
            return (
              <div
                className="thematic-workspace-slot"
                data-drag-active={draggingBankItemId !== null && !mutationBlocked}
                key={slot}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault();
                  const bankItemId = dragged(event);
                  if (bankItemId) placeInOpening(bankItemId, position);
                  setDraggingBankItemId(null);
                }}
              >
                <span className="thematic-slot-label">{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS[slot]}</span>
                {placement
                  ? cardFor(placement.bankItemId, { kind: "opening" })
                  : <p className="thematic-empty">Posição livre</p>}
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  function renderEditorialSelectionPanel() {
    return (
      <article className="thematic-workspace-body">
        <div className="thematic-zone-editor">
          <label>
            <span>Título público</span>
            <input
              aria-label="Título público de Últimas"
              defaultValue={current.presentation.latestZoneTitle}
              disabled={mutationBlocked}
              key={current.presentation.latestZoneTitle}
              maxLength={120}
              onBlur={(event) => runPhysicalOperation(
                (state) => changePhysicalDeskPresentation(state, { latestZoneTitle: event.target.value.trim() }),
                "Título de Últimas alterado em preview.",
              )}
              type="text"
            />
          </label>
          <label>
            <span>Apresentação</span>
            <select
              aria-label="Apresentação de Últimas"
              disabled={mutationBlocked}
              onChange={(event) => runPhysicalOperation(
                (state) => changePhysicalDeskPresentation(state, {
                  latestZonePlacement: event.target.value === "four_news"
                    ? "four_news"
                    : event.target.value === "hidden"
                      ? "hidden"
                      : "top",
                }),
                "Últimas alterada em preview.",
              )}
              value={current.presentation.latestZonePlacement}
            >
              <option value="top">Topo</option>
              <option value="four_news">Últimas + quatro ao lado</option>
              <option value="hidden">Oculto</option>
            </select>
          </label>
          <strong className="thematic-zone-editor-count">{editorialSelectionOccupied}/4</strong>
        </div>
        <div aria-label="Quatro ao lado das Últimas" className="thematic-slots thematic-slots-4 thematic-editorial-selection">
          {MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS.map((position) => {
            const placement = selectionPlacements.find((candidate) => candidate.slotPosition === position);
            const candidate = placement ? candidateForBankItem(placement.bankItemId) : null;
            return (
              <div
                aria-label={`Quatro ao lado das Últimas ${position}`}
                className="thematic-workspace-slot thematic-selection-slot"
                data-drag-active={(draggingBankItemId !== null || draggingEditorialSelectionPosition !== null) && !mutationBlocked}
                key={position}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault();
                  const bankItemId = dragged(event);
                  if (bankItemId) placeInSelection(bankItemId, position);
                  setDraggingBankItemId(null);
                  setDraggingEditorialSelectionPosition(null);
                }}
              >
                {candidate ? (
                  <EditorialSelectionCard
                    candidate={candidate}
                    dragging={draggingEditorialSelectionPosition === position}
                    onBank={() => placeInBank(candidate.bankItemId)}
                    onDragEnd={() => {
                      setDraggingBankItemId(null);
                      setDraggingEditorialSelectionPosition(null);
                    }}
                    onDragStart={(event) => {
                      if (mutationBlocked) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", serializeMatchdayEditorialProfileSelectionDrag({
                        bankItemId: candidate.bankItemId,
                        sourcePosition: position,
                      }));
                      setDraggingBankItemId(candidate.bankItemId);
                      setDraggingEditorialSelectionPosition(position);
                    }}
                    onFaixa={() => placeAtFaixaTop(candidate.bankItemId)}
                    onRemove={() => placeInDisplaced(candidate.bankItemId)}
                    onToggle={() => toggleSelection(candidate.bankItemId)}
                    position={position}
                    selected={selected.has(candidate.bankItemId)}
                  />
                ) : <p className="thematic-empty">Posição livre</p>}
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  function renderHighlightWorkspace() {
    const highlighted = highlightPlacement ? bankItemById.get(highlightPlacement.bankItemId) : null;
    return (
      <article className="thematic-workspace-body">
        <div className="thematic-highlight-row">
          <div className="thematic-highlight-controls">
            <label className="thematic-field">
              Módulo
              <select
                disabled={mutationBlocked}
                onChange={(event) => runPhysicalOperation(
                  (state) => changePhysicalDeskPresentation(state, {
                    videoModuleActive: event.target.value === "active",
                  }),
                  "Visibilidade do Destaque alterada em preview.",
                )}
                value={current.presentation.videoModuleActive ? "active" : "hidden"}
              >
                <option value="active">Ativo</option>
                <option value="hidden">Oculto</option>
              </select>
            </label>
          </div>
          <div
            aria-label="Destaque editorial"
            className="thematic-highlight-slot"
            data-drag-active={draggingBankItemId !== null && !mutationBlocked}
            onDragOver={allowDrop}
            onDrop={(event) => {
              event.preventDefault();
              const bankItemId = dragged(event);
              if (bankItemId) runPhysicalOperation(
                (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
                  placementType: "video_highlight", zoneId: null, slotPosition: 1,
                }),
                "Destaque atualizado em preview físico.",
              );
              setDraggingBankItemId(null);
            }}
          >
            {highlighted ? (
              <article className="thematic-highlight-card">
                {renderableImageUrl(highlighted.imageUrl) ? (
                  <Image alt="" height={220} loader={imageLoader} src={highlighted.imageUrl} unoptimized width={420} />
                ) : null}
                <div>
                  <strong>{highlighted.title}</strong>
                  {highlighted.subtitle ? <span>{highlighted.subtitle}</span> : null}
                  <button
                    className="thematic-button danger"
                    disabled={mutationBlocked}
                    onClick={() => placeInDisplaced(highlighted.id)}
                    type="button"
                  >
                    Retirar
                  </button>
                </div>
              </article>
            ) : <p className="thematic-empty">Posição livre</p>}
          </div>
        </div>
      </article>
    );
  }

  function renderSources() {
    return (
      <section className="thematic-sources" aria-label="Tracking editorial por classe">
        <div className="thematic-sources-toolbar">
          <h2>Tracking</h2>
          <nav aria-label="Escolher classe contextual">
            <button className={trackingClassFilter === "all" ? "active" : ""} onClick={() => setTrackingClassFilter("all")} type="button">
              Todas {filteredTrackingEntries.length}
            </button>
            {profile.zones.map((zone) => (
              <button className={trackingClassFilter === zone.key ? "active" : ""} key={zone.key} onClick={() => setTrackingClassFilter(zone.key)} type="button">
                {zone.label} {trackingEntries.filter((item) => item.classifiedZoneKey === zone.key).length}
              </button>
            ))}
          </nav>
          <div className="thematic-bank-access">
            <button aria-controls="thematic-bank-pool" aria-expanded={bankOpen} className={`thematic-button${bankOpen ? " active" : ""}`} onClick={() => setBankOpen((value) => !value)} type="button">
              Banco {explicitBankEntries.length}
            </button>
          </div>
          <label className="thematic-reservoir-search">
            <span>Pesquisa</span>
            <input aria-label="Pesquisar Tracking e Banco" onChange={(event) => setTrackingQuery(event.target.value)} placeholder="Título ou antetítulo" type="search" value={trackingQuery} />
          </label>
        </div>
        {bankOpen ? (
          <section aria-label="Banco editorial" className="thematic-bank-pool" id="thematic-bank-pool">
            <div className="thematic-bank-class-filters">
              <nav aria-label="Filtrar Banco por classe contextual">
                <button className={bankClassFilter === "all" ? "active" : ""} onClick={() => setBankClassFilter("all")} type="button">Todas {explicitBankEntries.length}</button>
                {profile.zones.map((zone) => (
                  <button className={bankClassFilter === zone.key ? "active" : ""} key={zone.key} onClick={() => setBankClassFilter(zone.key)} type="button">
                    {zone.label} {explicitBankEntries.filter((entry) => entry.classifiedZoneKey === zone.key).length}
                  </button>
                ))}
              </nav>
              <button className="thematic-button" disabled={filteredBankEntries.length === 0} onClick={() => selectItems(filteredBankEntries.map((entry) => entry.bankItemId))} type="button">Selecionar Banco</button>
            </div>
            <div className="thematic-sources-list">
              {visibleBankEntries.length > 0
                ? visibleBankEntries.map((entry) => <Fragment key={entry.bankItemId}>{cardFor(entry.bankItemId, { kind: "bank" })}</Fragment>)
                : <p className="thematic-empty">Sem notícias estacionadas no Banco.</p>}
            </div>
            {visibleBankEntries.length < filteredBankEntries.length ? (
              <div className="thematic-more"><button className="thematic-button" onClick={() => setBankVisibleCount((value) => value + TRACKING_PAGE_SIZE)} type="button">Mostrar mais</button></div>
            ) : null}
          </section>
        ) : null}
        <div className="thematic-tracking-rows">
          {TRACKING_STATES.map((state) => {
            const entries = trackingEntriesForState(state);
            const visible = entries.slice(0, trackingVisibleCounts[state]);
            const label = state === "NOVA" ? "Novas" : state === "FAIXA" ? "Faixa" : "Desalojadas";
            return (
              <section aria-label={`${label} · ${trackingClassFilter}`} className="thematic-tracking-row" data-tracking-state={state} key={state}>
                <div className="thematic-tracking-row-label">
                  <strong>{label}</strong><span>{entries.length}</span>
                  {entries.length > 0 ? <button className="thematic-button" onClick={() => selectItems(entries.map((entry) => entry.bankItemId))} type="button">Selecionar linha</button> : null}
                </div>
                {state !== "NOVA" ? (
                  <div
                    className="thematic-tracking-drop-target"
                    data-drag-active={draggingBankItemId !== null && !mutationBlocked}
                    onDragOver={allowDrop}
                    onDrop={(event) => {
                      event.preventDefault();
                      const bankItemId = dragged(event);
                      if (bankItemId) {
                        if (state === "FAIXA") placeAtFaixaTop(bankItemId);
                        else placeInDisplaced(bankItemId);
                      }
                      setDraggingBankItemId(null);
                    }}
                  >
                    {state === "FAIXA" ? "Largar aqui · entra no topo da Faixa" : "Largar aqui · passa para Desalojadas"}
                  </div>
                ) : null}
                <div className="thematic-sources-list">
                  {visible.length > 0
                    ? visible.map((entry) => (
                        <Fragment key={entry.bankItemId}>
                          {cardFor(entry.bankItemId, state === "FAIXA" ? { kind: "faixa" } : state === "DESALOJADA" ? { kind: "displaced" } : { kind: "new" })}
                        </Fragment>
                      ))
                    : <p className="thematic-empty">Sem notícias neste estado.</p>}
                </div>
                {visible.length < entries.length ? (
                  <div className="thematic-more"><button className="thematic-button" onClick={() => setTrackingVisibleCounts((values) => ({ ...values, [state]: values[state] + TRACKING_PAGE_SIZE }))} type="button">Mostrar mais</button></div>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>
    );
  }

  function isZoneWorkspaceKey(workspaceKey: ActiveWorkspaceKey): workspaceKey is LiveLayoutZoneId {
    return current.zones.some((zone) => zone.id === workspaceKey);
  }

  function workspaceKeyForBlock(block: PhysicalDeskState["current"]["blocks"][number]): ActiveWorkspaceKey {
    return block.kind === "zone" ? block.zoneId : block.kind === "video" ? "highlight" : "latest";
  }

  function blockLabel(block: PhysicalDeskState["current"]["blocks"][number]) {
    if (block.kind === "latest") {
      return current.presentation.latestZoneTitle || "Últimas";
    }
    if (block.kind === "video") return "Destaque";
    const zone = zoneById.get(block.zoneId);
    return zone
      ? zone.publicTitle || "Zona sem título"
      : "Zona física inválida";
  }

  function blockCount(block: PhysicalDeskState["current"]["blocks"][number]) {
    if (block.kind === "latest") return `${editorialSelectionOccupied}/4`;
    if (block.kind === "video") return `${highlightPlacement ? 1 : 0}/1`;
    const zone = zoneById.get(block.zoneId);
    if (!zone) return "0/0";
    return `${physicalDeskZoneSlots(physicalDesk, zone.id).filter((slot) => slot.placement).length}/${zone.capacity}`;
  }

  function activateWorkspaceFromStructure(workspaceKey: ActiveWorkspaceKey) {
    setActiveWorkspaceKey(workspaceKey);
    pageStructureRef.current?.removeAttribute("open");
  }

  function renderActiveWorkspace() {
    if (activeWorkspaceKey === "opening") return renderOpeningWorkspace();
    if (activeWorkspaceKey === "latest") return renderEditorialSelectionPanel();
    if (activeWorkspaceKey === "highlight") return renderHighlightWorkspace();
    if (isZoneWorkspaceKey(activeWorkspaceKey)) return renderZonePanel(activeWorkspaceKey);
    return null;
  }

  function undo() {
    if (mutationBlocked) return;
    setPhysicalDesk((state) => undoPhysicalDeskState(state));
    setApplyState("idle");
    setMessage("Última alteração física desfeita.");
  }

  function resetLocal() {
    if (mutationBlocked) return;
    setPhysicalDesk((state) => resetPhysicalDeskState(state));
    setApplyState("idle");
    setMessage("Preview físico reposto para o último estado aplicado.");
  }

  async function applyChanges() {
    if (!pending || mutationBlocked) return;
    setApplyState("saving");
    setMessage("A aplicar o workspace físico numa única transação…");
    try {
      const payload = buildPhysicalDeskApplyPayload(desk.profileKey, physicalDesk);
      const response = await fetch(`/api/admin/editorial/jornada/${desk.matchdayId}/organizar/tematico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readAdminJsonResponse<{
        ok?: boolean;
        message?: string;
        stateToken?: string;
      }>(response);
      if (
        result.ok !== true
        || typeof result.stateToken !== "string"
        || !/^[0-9a-f]{32}$/.test(result.stateToken)
      ) {
        throw new Error(result.message ?? "O Apply físico foi recusado integralmente.");
      }
      setAwaitedPhysicalStateToken(result.stateToken);
      setApplyState("refreshing");
      setMessage("Aplicado. A reconstruir a Mesa pelo reader físico…");
      router.refresh();
    } catch (error) {
      setApplyState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível aplicar as alterações.");
    }
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

        <MatchdayEditorialContextSelector currentCompetitionId={desk.competitionId} currentMatchdayId={desk.matchdayId} currentSeasonId={desk.seasonId} data={contextSelector} />

        {message ? <p aria-live={applyState === "error" ? "assertive" : "polite"} className={`thematic-message feedback${applyState === "error" ? " error" : ""}`}>{message}</p> : null}

        {selected.size > 0 ? (
          <section className="thematic-bulk-context" aria-label="Operação em lote">
            <div className="thematic-bulk-context-head"><strong>Operação em lote · {selected.size} notícias selecionadas</strong></div>
            <div className="thematic-bulk-context-actions">
              <div className="thematic-bulk-group">
                <label className="thematic-field zone">
                  Zona de destino
                  <select disabled={mutationBlocked} value={destinationZoneId ?? ""} onChange={(event) => {
                    const next = current.zones.find((zone) => zone.id === event.target.value);
                    setDestinationZoneId(next?.id ?? null);
                  }}>
                    {current.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.publicTitle || "Zona sem título"}</option>)}
                  </select>
                </label>
                <label className="thematic-field">Posição na zona<select disabled={mutationBlocked} value={effectiveZonePosition} onChange={(event) => setZonePosition(Number(event.target.value))}>{Array.from({ length: maxZoneStartPosition }, (_, index) => index + 1).map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
                <button className="thematic-button" disabled={mutationBlocked || !destinationZoneId} onClick={() => {
                  if (!destinationZoneId) return;
                  runPhysicalOperation(
                    (state) => bulkMovePhysicalDeskItemsToZone(state, selectedBankItemIds, destinationZoneId, effectiveZonePosition),
                    "Operação em lote aplicada ao draft físico.",
                  );
                }} type="button">Mover para zona</button>
              </div>
              <div className="thematic-bulk-group">
                <label className="thematic-field">Posição na Faixa<select disabled={mutationBlocked} value={faixaPosition} onChange={(event) => setFaixaPosition(Number(event.target.value))}>{Array.from({ length: current.faixaSlotCount + 1 }, (_, index) => index + 1).map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
                <button className="thematic-button" disabled={mutationBlocked} onClick={() => runPhysicalOperation(
                  (state) => bulkMovePhysicalDeskItemsToFaixa(state, selectedBankItemIds, faixaPosition),
                  "Operação em lote aplicada à Faixa física.",
                )} type="button">Mover para Faixa</button>
                <button className="thematic-button" disabled={mutationBlocked} onClick={() => runPhysicalOperation(
                  (state) => bulkMovePhysicalDeskItemsToBank(state, selectedBankItemIds),
                  "Operação em lote enviada para o Banco.",
                )} type="button">Mover para Banco</button>
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
                  <label><span>Cor da Manchete</span><input aria-label="Cor do texto da Manchete" disabled={mutationBlocked} onChange={(event) => runPhysicalOperation((state) => changePhysicalDeskPresentation(state, { headlineTitleColor: event.target.value.toUpperCase() }), "Cor da Manchete alterada em preview.")} type="color" value={current.presentation.headlineTitleColor ?? "#FFFFFF"} /></label>
                </div>
                <button
                  className="thematic-button"
                  disabled={mutationBlocked}
                  onClick={() => {
                    setDeleteZoneId(null);
                    setNewZoneFormOpen((open) => !open);
                  }}
                  type="button"
                >
                  + Nova zona
                </button>
              </div>

              {newZoneFormOpen ? (
                <form className="thematic-new-zone-form" onSubmit={createZone}>
                  <label>
                    <span>Nome</span>
                    <input
                      autoFocus
                      disabled={mutationBlocked}
                      onChange={(event) => setNewZoneTitle(event.target.value)}
                      placeholder="Ex.: Mercado"
                      value={newZoneTitle}
                    />
                  </label>
                  <label>
                    <span>Layout</span>
                    <select
                      disabled={mutationBlocked}
                      onChange={(event) => setNewZoneVisualFamily(event.target.value as EditorialVisualFamily)}
                      value={newZoneVisualFamily}
                    >
                      {PERSISTABLE_PHYSICAL_LAYOUTS.map((layout) => (
                        <option key={layout.id} value={layout.id}>{layout.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="thematic-new-zone-actions">
                    <button className="thematic-button dark" disabled={mutationBlocked} type="submit">Criar</button>
                    <button className="thematic-button" disabled={mutationBlocked} onClick={cancelNewZone} type="button">Cancelar</button>
                  </div>
                </form>
              ) : null}

              <div className={"thematic-page-structure-grid" + (activeStructureEditorOpen ? " has-zone-editor" : "")}>
                <div className="thematic-page-map">
                  <div className="thematic-page-structure-list">
                    <button className={"thematic-page-row" + (activeWorkspaceKey === "opening" ? " active" : "")} onClick={() => activateWorkspaceFromStructure("opening")} type="button"><span>Fixo</span><strong>Abertura</strong><small>{openingOccupied}/{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.length}</small></button>
                    {current.blocks.map((block, index) => {
                      const workspaceKey = workspaceKeyForBlock(block);
                      const editableInStructure =
                        block.kind === "zone" || block.kind === "latest";

                      return (
                        <div className={"thematic-page-row" + (activeWorkspaceKey === workspaceKey ? " active" : "")} key={block.kind === "zone" ? block.zoneId : block.kind}>
                          <button
                            className="thematic-page-row-main"
                            onClick={() => {
                              if (editableInStructure) {
                                setDeleteZoneId(null);
                                setActiveWorkspaceKey(workspaceKey);
                                return;
                              }
                              activateWorkspaceFromStructure(workspaceKey);
                            }}
                            type="button"
                          >
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{blockLabel(block)}</strong>
                            <small>{blockCount(block)}</small>
                          </button>
                          <div className="thematic-page-row-actions">
                            <button aria-label={"Subir " + blockLabel(block)} disabled={mutationBlocked || index === 0} onClick={() => runPhysicalOperation((state) => movePhysicalDeskBlock(state, block, "up"), "Ordem física dos blocos alterada.")} type="button">↑</button>
                            <button aria-label={"Descer " + blockLabel(block)} disabled={mutationBlocked || index === current.blocks.length - 1} onClick={() => runPhysicalOperation((state) => movePhysicalDeskBlock(state, block, "down"), "Ordem física dos blocos alterada.")} type="button">↓</button>
                          </div>
                        </div>
                      );
                    })}
                    <button className="thematic-page-row" type="button"><span>Fixo</span><strong>Faixa</strong><small>{faixaPlacements.length}</small></button>
                  </div>
                </div>

                {activeStructureEditorOpen ? (
                  <aside
                    className="thematic-page-zone-editor-panel"
                    aria-label={"Editar zona " + activeStructureLabel}
                  >
                    <strong>Editar zona</strong>

                    <label className="thematic-page-zone-field">
                      <span>Nome público</span>
                      <input
                        aria-label={"Nome público de " + activeStructureLabel}
                        defaultValue={activeStructureTitle}
                        disabled={mutationBlocked}
                        key={
                          activeLatest
                            ? "latest:" + current.presentation.latestZoneTitle
                            : activeZone!.id + ":" + activeZone!.publicTitle
                        }
                        onBlur={(event) => {
                          const value = event.currentTarget.value.trim();


                          if (value === activeStructureTitle) return;

                          if (activeLatest) {
                            runPhysicalOperation(
                              (state) => changePhysicalDeskPresentation(state, {
                                latestZoneTitle: value,
                              }),
                              activeStructureLabel
                                + ": título alterado em preview.",
                            );
                            return;
                          }

                          if (!activeZone) return;

                          runPhysicalOperation(
                            (state) => changePhysicalDeskZone(
                              state,
                              activeZone.id,
                              { publicTitle: value },
                            ),
                            activeStructureLabel
                              + ": título físico alterado em preview.",
                          );
                        }}
                      />
                    </label>

                    <label className="thematic-page-zone-field">
                      <span>
                        {activeLatest ? "Últimas ao lado de" : "Layout"}
                      </span>

                      {activeLatest ? (
                        <select
                          aria-label={"Últimas ao lado de " + activeStructureLabel}
                          disabled={mutationBlocked}
                          onChange={(event) => {
                            const requestedZoneId = event.target.value;

                            if (!requestedZoneId) {
                              runPhysicalOperation(
                                (state) => changePhysicalDeskLatestCompanion(
                                  state,
                                  null,
                                ),
                                "Últimas sem zona associada em preview.",
                              );
                              return;
                            }

                            const nextZone = current.zones.find((zone) => (
                              zone.id === requestedZoneId
                              && zone.visualFamily === "four_news"
                            ));

                            if (!nextZone) return;

                            runPhysicalOperation(
                              (state) => changePhysicalDeskLatestCompanion(
                                state,
                                nextZone.id,
                              ),
                              "Associação das Últimas alterada em preview.",
                            );
                          }}
                          value={current.latestCompanionZoneId ?? ""}
                        >
                          <option value="">Sem zona associada</option>

                          {current.zones
                            .filter((zone) => zone.visualFamily === "four_news")
                            .map((zone) => (
                              <option key={zone.id} value={zone.id}>
                                {zone.publicTitle || "Zona sem título"}
                              </option>
                            ))}
                        </select>
                      ) : activeZone ? (
                        <select
                          aria-label={"Layout de " + activeStructureLabel}
                          disabled={mutationBlocked}
                          onChange={(event) => runPhysicalOperation(
                            (state) => changePhysicalDeskZone(
                              state,
                              activeZone.id,
                              {
                                visualFamily:
                                  event.target.value as EditorialVisualFamily,
                              },
                            ),
                            activeStructureLabel
                              + ": layout físico alterado em preview.",
                          )}
                          value={activeZone.visualFamily}
                        >
                          {PERSISTABLE_PHYSICAL_LAYOUTS.map((layout) => (
                            <option key={layout.id} value={layout.id}>
                              {layout.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </label>

                    <small>
                      {activeLatest
                        ? current.latestCompanionZoneId
                          ? "Zona associada"
                          : "Sem zona associada"
                        : activeZone
                          ? activeZonePlacedArticleCount
                            + "/" + activeZone.capacity
                          : ""}
                    </small>

                    {activeZone ? (
                      <>
                        <button
                          className="thematic-page-zone-delete-trigger"
                          disabled={mutationBlocked}
                          onClick={() => setDeleteZoneId(activeZone.id)}
                          type="button"
                        >
                          Apagar zona
                        </button>

                        {deleteZoneId === activeZone.id ? (
                          <div
                            className="thematic-page-delete-confirm"
                            role="alert"
                          >
                            <p>
                              Esta zona contém{" "}
                              <strong>{activeZonePlacedArticleCount}</strong>{" "}
                              {activeZonePlacedArticleCount === 1
                                ? "artigo"
                                : "artigos"}.
                            </p>
                            <p>
                              Os artigos sem outro destino passam para{" "}
                              <strong>Desalojadas</strong>.
                            </p>
                            <div className="thematic-page-delete-confirm-actions">
                              <button
                                disabled={mutationBlocked}
                                onClick={() => setDeleteZoneId(null)}
                                type="button"
                              >
                                Cancelar
                              </button>
                              <button
                                disabled={mutationBlocked}
                                onClick={() => deleteZone(activeZone.id)}
                                type="button"
                              >
                                Apagar zona
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </aside>
                ) : null}
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

          <div className="thematic-global-actions">
            <details className="thematic-global-tool thematic-classification-tool">
              <summary>Corrigir classificação</summary>
              <div className="thematic-global-tool-body">
                <MatchdayContextualClassificationCorrectionPanel
                  activeItems={desk.automaticDistribution.activeItems}
                  candidates={desk.selectionCandidates}
                  matchdayId={desk.matchdayId}
                  zones={profile.zones}
                />
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
                disabled={trackingEntries.length === 0}
                onClick={() => selectItems(trackingEntries.map((entry) => entry.bankItemId))}
                type="button"
              >
                Selecionar todos
              </button>
              <button
                className="thematic-button"
                disabled={selected.size === 0}
                onClick={() => selectItems([])}
                type="button"
              >
                Limpar marcação
              </button>
            </section>
          </div>
        </div>

        <section className="thematic-panel thematic-workspace" aria-label="Workspace editorial físico">
          <nav className="thematic-zone-tabs" aria-label="Foco da Mesa">
            <button className={activeWorkspaceKey === "opening" ? "active" : ""} onClick={() => setActiveWorkspaceKey("opening")} type="button">Abertura {openingOccupied}</button>
            {current.blocks.map((block) => {
              const workspaceKey = workspaceKeyForBlock(block);
              return <button className={activeWorkspaceKey === workspaceKey ? "active" : ""} key={block.kind === "zone" ? block.zoneId : block.kind} onClick={() => setActiveWorkspaceKey(workspaceKey)} type="button">{blockLabel(block)} {blockCount(block)}</button>;
            })}
            <label className="thematic-opening-pin"><input checked={openingPinned} onChange={(event) => setOpeningPinned(event.target.checked)} type="checkbox" /><span>Fixar abertura</span></label>
          </nav>
          {openingPinned && activeWorkspaceKey !== "opening" ? renderOpeningWorkspace() : null}
          {renderActiveWorkspace()}
        </section>

        {renderSources()}
        {physicalDesk.history.length > 0 ? <details className="thematic-panel thematic-movements"><summary>Movimentos em preview · {physicalDesk.history.length}</summary><p className="thematic-message">O histórico contém checkpoints físicos; nenhuma projection legacy é armazenada.</p></details> : null}
        {desk.inactiveHistoricalCount > 0 ? <p className="thematic-message">Estado histórico inativo: {desk.inactiveHistoricalCount}</p> : null}
        <Diagnostics diagnostics={desk.diagnostics} />
      </div>

      <footer className="thematic-pending" aria-live="polite">
        <div className="thematic-pending-copy"><strong>{pendingCount} alterações pendentes</strong>{applyState === "refreshing" ? <span>A reconstruir pelo estado físico autoritativo</span> : null}</div>
        <button className="thematic-button" disabled={mutationBlocked || physicalDesk.history.length === 0} onClick={undo} type="button">Desfazer última</button>
        <button className="thematic-button" disabled={mutationBlocked || !pending} onClick={resetLocal} type="button">Limpar alterações</button>
        <button className="thematic-button dark" disabled={!pending || mutationBlocked} onClick={applyChanges} type="button">{applyState === "saving" ? "A aplicar…" : applyState === "refreshing" ? "A reconstruir…" : "Aplicar alterações"}</button>
      </footer>
    </main>
  );
}
