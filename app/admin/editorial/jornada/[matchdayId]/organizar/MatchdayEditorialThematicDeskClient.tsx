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
import { articleClassificationLabel, type ArticleClassificationKey } from "@/lib/editorial-classifications";

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
  changePhysicalDeskLatestPlacement,
  changePhysicalDeskPresentation,
  changePhysicalDeskZone,
  createPhysicalDeskZone,
  createPhysicalDeskState,
  deletePhysicalDeskZone,
  movePhysicalDeskItemToBank,
  movePhysicalDeskItemToDisplaced,
  movePhysicalDeskItemToFaixaTop,
  movePhysicalDeskItemToSlot,
  movePhysicalDeskZone,
  physicalDeskFaixaSlots,
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
  resolveMatchdayLatestPlacement,
} from "@/lib/editorial-matchday-latest-placement";
import {
  buildPhysicalDeskApplyPayload,
} from "@/lib/editorial-matchday-live-layout-physical-apply";
import type { LiveLayoutZoneId } from "@/lib/editorial-matchday-live-layout-physical";
import {
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS,
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS,
} from "@/lib/editorial-matchday-profile-workspace";

type EditorialSelectionCandidate = MatchdayEditorialSelectionCandidate;

const TRACKING_INITIAL_VISIBLE = 30;
const TRACKING_PAGE_SIZE = 30;
const PERSISTABLE_PHYSICAL_LAYOUTS = EDITORIAL_VISUAL_FAMILIES.map((id) => (
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS[id]
));

type ActiveWorkspaceKey =
  | "latest"
  | "highlight"
  | "faixa"
  | LiveLayoutZoneId;

type CandidateUniverse = "new" | "displaced" | "bank";

const CANDIDATE_UNIVERSES: readonly CandidateUniverse[] = [
  "new",
  "displaced",
  "bank",
];

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
  .thematic-focus-toggle { flex-shrink: 0; min-height: 26px; padding: 4px 9px; border: 1px solid #657588; border-radius: 5px; background: #253241; color: #fff; font-size: 10px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .thematic-focus-toggle:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .thematic-focus-bar { display: flex; min-width: 0; min-height: 34px; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 8px; border-radius: 7px; background: #101820; color: #fff; }
  .thematic-focus-bar[hidden] { display: none; }
  .thematic-focus-bar h1 { overflow: hidden; min-width: 0; margin: 0; font-size: 12px; line-height: 1.4; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .thematic-shell[data-focus-mode="true"] .thematic-hero,
  .thematic-shell[data-focus-mode="true"] .thematic-context-selector,
  .thematic-shell[data-focus-mode="true"] .thematic-global-tools { display: none; }
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
  .thematic-card { position: relative; display: grid; grid-template-columns: 18px minmax(0,1fr) 26px; gap: 7px; align-content: start; align-items: start; min-width: 0; padding: 8px; border: 1px solid #dfe6ee; border-radius: 7px; background: #fff; cursor: grab; box-shadow: 0 1px 4px rgba(15,23,42,.04); }
  .thematic-card:active { cursor: grabbing; }
  .thematic-card.selected { border-color: #e43e48; box-shadow: inset 3px 0 0 #e43e48; }
  .thematic-card input[type="checkbox"] { grid-column: 1; grid-row: 1; z-index: 1; width: 18px; height: 18px; margin: 3px 0 0; accent-color: #e43e48; outline: 2px solid #fff; outline-offset: 1px; box-shadow: 0 0 0 4px rgba(15,23,42,.45); }
  :is(.thematic-faixa-slots, .thematic-candidates-grid) .thematic-card input[type="checkbox"]:focus-visible { outline: revert; }
  .thematic-image, .thematic-image-placeholder { grid-column: 1 / -1; grid-row: 1; display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; border-radius: 5px; background: #dce4ed; object-fit: cover; }
  /* Preserve the former centre-column image height while reclaiming its side gutters. */
  :is(.thematic-faixa-slots, .thematic-candidates-grid) .thematic-card::before { content: ""; grid-column: 2; grid-row: 1; width: 100%; aspect-ratio: 16 / 9; }
  :is(.thematic-faixa-slots, .thematic-candidates-grid) .thematic-image,
  :is(.thematic-faixa-slots, .thematic-candidates-grid) .thematic-image-placeholder { position: absolute; grid-row: 1 / 2; inset: 0; height: 100%; }
  .thematic-card-copy { display: grid; min-width: 0; gap: 1px; }
  .thematic-card > .thematic-card-copy { grid-column: 1 / -1; grid-row: 2; gap: 5px; }
  .thematic-card-top { position: relative; display: flex; min-width: 0; flex-wrap: nowrap; gap: 3px; align-items: center; }
  .thematic-card-label { min-width: 0; overflow: hidden; color: #b21f2a; font-size: 9px; font-weight: 900; letter-spacing: .03em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .thematic-classification-badge { display: inline-flex; flex: 0 0 auto; height: 13px; align-items: center; padding: 0 4px; border: 1px solid transparent; border-radius: 2px; background: #e2e8f0; color: #000; font-size: 9px; font-weight: 800; line-height: 11px; white-space: nowrap; }
  .thematic-classification-badge[data-classification="unclassified"] { background: #fde047; }
  .thematic-classification-badge[data-classification="benfica"] { background: #ef4444; }
  .thematic-classification-badge[data-classification="sporting"] { background: #15803d; color: #fff; }
  .thematic-classification-badge[data-classification="fc_porto"] { background: #1d4ed8; color: #fff; }
  .thematic-classification-badge[data-classification="other_liga_clubs"] { border-color: #000; background: #fff; }
  /* Without an antetitle, keep the existing empty row at zero height. */
  .thematic-card-top[data-without-label="true"] .thematic-classification-badge { position: absolute; z-index: 2; bottom: 100%; left: 0; }

  .thematic-card-title { display: -webkit-box; overflow: hidden; font-size: 14px; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
  .thematic-card time { color: #5c6a7a; font-size: 10px; }
  .thematic-card-menu { grid-column: 3; grid-row: 1; position: relative; z-index: 1; align-self: start; }
  .thematic-card-menu summary { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid #d7e0e9; border-radius: 4px; background: #fff; cursor: pointer; list-style: none; font-weight: 900; }
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
  .thematic-movement-list, .thematic-diagnostics { display: grid; gap: 3px; margin: 0; padding: 0 10px 10px 26px; font-size: 9px; }
  .thematic-pending { position: fixed; z-index: 30; right: 10px; bottom: 8px; left: 10px; display: flex; align-items: center; gap: 6px; width: min(1900px,calc(100% - 20px)); min-height: 48px; margin: 0 auto; padding: 7px 9px; border: 1px solid #c5d0dc; border-radius: 8px; background: rgba(255,255,255,.97); box-shadow: 0 10px 28px rgba(15,23,42,.18); backdrop-filter: blur(10px); }
  .thematic-pending-copy { display: grid; gap: 1px; margin-right: auto; }
  .thematic-pending-copy strong { font-size: 11px; }
  .thematic-desk-grid { display: grid; grid-template-columns: minmax(0,1.15fr) minmax(460px,.85fr); gap: 6px; align-items: start; }
  .thematic-workspace { display: grid; grid-template-columns: 178px minmax(0,1fr); gap: 0; align-items: stretch; min-width: 0; overflow: visible; }
  .thematic-zone-rail { display: grid; align-content: start; gap: 7px; min-width: 0; padding: 7px; border-right: 1px solid #273444; background: #101820; color: #fff; }
  .thematic-opening-toggle { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 35px; padding: 6px 8px; border: 1px solid #536274; border-radius: 6px; background: #1b2734; color: #fff; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-opening-toggle.active { border-color: #ff5c65; background: #8f1f29; }
  .thematic-zone-rail-heading { display: flex; align-items: center; justify-content: space-between; gap: 5px; color: #aebdcb; font-size: 8px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; }
  .thematic-zone-list { display: grid; gap: 4px; }
  .thematic-zone-row { display: grid; grid-template-columns: 22px minmax(0,1fr); min-width: 0; overflow: hidden; border: 1px solid #3a4858; border-radius: 6px; background: #18232f; }
  .thematic-zone-row.active { border-color: #ff5c65; box-shadow: inset 3px 0 #ff5c65; }
  .thematic-zone-select { display: grid; place-items: center; border-right: 1px solid #3a4858; cursor: pointer; }
  .thematic-zone-select input { width: 13px; height: 13px; margin: 0; accent-color: #ff5c65; }
  .thematic-zone-focus { display: grid; min-width: 0; gap: 1px; padding: 6px 7px; border: 0; background: transparent; color: #fff; text-align: left; cursor: pointer; }
  .thematic-zone-focus strong, .thematic-zone-focus small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thematic-zone-focus strong { font-size: 12px; }
  .thematic-zone-row:has(input:checked) .thematic-zone-select { background: #455970; }
  .thematic-zone-focus small { color: #9fb0c0; font-size: 8px; }
  .thematic-zone-move-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .thematic-zone-move-controls button { display: grid; min-height: 46px; place-items: center; gap: 1px; border: 1px solid #657588; border-radius: 7px; background: #253241; color: #fff; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-zone-move-controls button span { font-size: 18px; line-height: 1; }
  .thematic-zone-move-controls button:disabled { cursor: default; opacity: .32; }
  .thematic-secondary-workspaces { display: grid; gap: 3px; padding-top: 3px; border-top: 1px solid #344252; }
  .thematic-secondary-workspaces button { min-height: 29px; padding: 4px 7px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #cbd5e1; font-size: 9px; font-weight: 850; text-align: left; cursor: pointer; }
  .thematic-secondary-workspaces button.active { border-color: #718197; background: #263443; color: #fff; }
  .thematic-workspace-stack { display: grid; min-width: 0; align-content: start; gap: 5px; padding: 5px; }
  .thematic-workspace-stack[data-opening-only="true"] > :not(#thematic-opening-workspace) { display: none; }
  .thematic-opening-only-toggle { width: 100%; min-height: 26px; margin-top: 4px; padding: 4px 6px; border: 1px solid #526174; border-radius: 5px; background: #253241; color: #fff; font-size: 10px; cursor: pointer; }
  .thematic-workspace-section { min-width: 0; overflow: visible; border: 1px solid #d7e0e9; border-radius: 7px; background: #fff; }
  .thematic-workspace-heading { display: flex; align-items: center; justify-content: space-between; min-height: 29px; gap: 8px; padding: 4px 7px; border-bottom: 1px solid #dfe6ee; border-radius: 6px 6px 0 0; background: #101820; color: #fff; }
  .thematic-workspace-heading strong { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
  .thematic-workspace-heading span { color: #bac8d5; font-size: 8px; font-weight: 800; }
  .thematic-workspace-body { display: grid; min-width: 0; gap: 5px; padding: 5px; }
  .thematic-zone-editor { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,.8fr) auto; gap: 6px; align-items: center; padding: 4px; border: 1px solid #dce3eb; border-radius: 6px; background: #fbfcfd; }
  .thematic-zone-editor label { display: grid; min-width: 0; }
  .thematic-zone-editor input, .thematic-zone-editor select { width: 100%; min-width: 0; min-height: 30px; padding: 0 7px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 12px; }
  .thematic-zone-editor-count { min-width: 34px; font-size: 11px; font-weight: 900; text-align: right; white-space: nowrap; }
  .thematic-slots { display: grid; gap: 4px; }
  .thematic-slots-4, .thematic-slots-5, .thematic-slots-6 { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .thematic-workspace-slot { display: flex; flex-direction: column; min-width: 0; min-height: 64px; padding: 4px; border: 1px dashed #b8c4d2; border-radius: 5px; background: #fff; }
  .thematic-workspace-slot[data-drag-active="true"] { border-color: #2563eb; background: #eff6ff; }
  .thematic-workspace-slot .thematic-card { flex: 1; }
  .thematic-workspace-slot > .thematic-empty { flex: 1; width: 100%; }
  .thematic-workspace-section:is([data-zone-id], #thematic-opening-workspace) .thematic-card { gap: 4px; padding: 6px; }
  .thematic-workspace-section:is([data-zone-id], #thematic-opening-workspace) .thematic-card > .thematic-card-copy { gap: 3px; }
  .thematic-workspace-section:is([data-zone-id], #thematic-opening-workspace) .thematic-card-title { -webkit-line-clamp: 3; }
  .thematic-workspace-slot .thematic-card.thematic-selection-card { grid-template-columns: 16px 44px minmax(0,1fr) 22px; }
  .thematic-highlight-row { display: grid; grid-template-columns: minmax(120px,160px) minmax(0,520px); gap: 5px; align-items: end; justify-content: start; }
  .thematic-highlight-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 7px; min-width: 0; }
  .thematic-highlight-card { display: grid; grid-template-columns: 50px minmax(0,1fr) auto; gap: 7px; align-items: center; min-height: 58px; padding: 6px; border: 1px solid #dfe6ee; border-radius: 6px; background: #fff; }
  .thematic-highlight-card strong { font-size: 11px; line-height: 1.2; }
  .thematic-sources { display: grid; min-width: 0; overflow: visible; border: 1px solid #263342; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgba(12,22,34,.06); }
  .thematic-sources-toolbar { display: grid; gap: 6px; min-width: 0; padding: 7px; border-bottom: 1px solid #263342; border-radius: 7px 7px 0 0; background: #101820; color: #fff; }
  .thematic-candidate-tabs { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 4px; }
  .thematic-candidate-tabs button { min-height: 31px; padding: 4px 7px; border: 1px solid #526174; border-radius: 5px; background: #1b2734; color: #dce5ed; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-candidate-tabs button.active { border-color: #ff5c65; background: #a52530; color: #fff; }
  .thematic-candidate-tabs button[data-drag-active="true"] { outline: 1px dashed #ff5c65; outline-offset: -3px; }
  .thematic-candidate-filters { display: flex; min-width: 0; gap: 4px; align-items: center; }
  .thematic-candidate-filters nav { display: flex; flex: 1; min-width: 0; gap: 2px; overflow-x: auto; scrollbar-width: none; }
  .thematic-candidate-filters nav button { flex: 0 0 auto; min-height: 25px; padding: 3px 2px; border: 1px solid #465669; border-radius: 999px; background: transparent; color: #cbd5e1; font-size: 8px; font-weight: 850; white-space: nowrap; cursor: pointer; }
  .thematic-candidate-filters nav button.active { border-color: #fff; background: #fff; color: #101820; }
  .thematic-candidate-actions { display: flex; flex: 0 0 auto; gap: 4px; align-items: center; }
  .thematic-candidate-actions .thematic-button { min-height: 28px; padding: 4px 5px; white-space: nowrap; }
  .thematic-candidate-search-toggle { display: grid; place-items: center; width: 28px; padding: 0; }
  .thematic-candidate-search-toggle[data-query-active="true"] { border-color: #ff5c65; background: #a52530; color: #fff; }
  .thematic-reservoir-search { display: flex; flex: 1; min-width: 0; height: 28px; align-items: center; padding: 0 7px; border: 1px solid #4b5b6e; border-radius: 5px; background: #fff; color: #101820; }
  .thematic-reservoir-search:focus-within { outline: 2px solid #94a3b8; outline-offset: 1px; }
  .thematic-reservoir-search input { width: 100%; min-width: 0; height: 26px; border: 0; outline: 0; font-size: 10px; }
  .thematic-candidates-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-content: start; gap: 5px; padding: 6px; }
  .thematic-candidates-grid .thematic-card { min-height: 60px; }
  .thematic-candidates-grid .thematic-empty { grid-column: 1 / -1; min-height: 90px; }
  .thematic-faixa-slots { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 4px; }
  .thematic-faixa-drop-target { padding: 9px; border: 1px dashed #9aaabc; border-radius: 5px; background: #f8fafc; color: #526173; font-size: 9px; font-weight: 900; text-align: center; }
  .thematic-faixa-drop-target[data-drag-active="true"] { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
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
  .thematic-highlight-controls label { display: grid; width: 100%; gap: 3px; color: #526173; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .thematic-highlight-controls select { min-height: 30px; padding: 0 8px; border: 1px solid #cbd5df; border-radius: 6px; background: #fff; }
  .thematic-highlight-slot { min-width: 0; max-width: none; }
  .thematic-highlight-card { grid-template-columns: 80px minmax(0,1fr); }
  .thematic-highlight-card img { width: 80px; height: 58px; border-radius: 5px; object-fit: cover; }
  .thematic-highlight-card > div { display: grid; gap: 5px; }
  .thematic-highlight-card span { color: #64748b; font-size: 9px; }
  @media (min-width: 1121px) {
    /* Flex deducts the actual height of headers, feedback and batch controls. Only shell/footer padding is reserved. */
    .thematic-content { display: flex; flex-direction: column; height: calc(100dvh - 75px); min-height: 0; }
    .thematic-content > :not(.thematic-desk-grid) { flex-shrink: 0; }
    .thematic-content > .thematic-movements { max-height: 25vh; overflow: auto; }
    .thematic-desk-grid { flex: 1; min-height: 0; align-items: stretch; }
    .thematic-workspace { min-height: 0; overflow: hidden; }
    .thematic-zone-rail { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
    .thematic-workspace-stack { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .thematic-sources { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .thematic-sources > :not(.thematic-candidates-grid) { flex-shrink: 0; }
    .thematic-candidates-grid { flex: 1; min-height: 0; grid-auto-rows: max-content; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .thematic-workspace-stack:focus-visible, .thematic-candidates-grid:focus-visible { outline: 2px solid #526174; outline-offset: -2px; }
  }
  @media (min-width: 1121px) and (min-height: 800px) {
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] { display: flex; flex-direction: column; }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] > .thematic-workspace-section { display: flex; flex: 1; flex-direction: column; min-height: 0; }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-workspace-heading,
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-zone-editor { flex-shrink: 0; }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-workspace-body { display: flex; flex: 1; flex-direction: column; min-height: 0; }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-slots { flex: 1; min-height: 0; grid-auto-rows: minmax(0,1fr); }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-workspace-slot { min-height: 0; }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-card { min-height: 0; grid-template-rows: minmax(0,1fr) auto; }
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-image,
    .thematic-shell[data-focus-mode="true"] .thematic-workspace-stack[data-composition-mode$="-only"] .thematic-image-placeholder { height: 100%; min-height: 0; aspect-ratio: auto; }
  }
  @media (max-width: 1120px) { .thematic-desk-grid { grid-template-columns: 1fr; } }
  @media (max-width: 760px) { .thematic-global-tools { display: flex; flex-wrap: wrap; } .thematic-global-tools > .thematic-global-tool { flex: 0 0 auto; } .thematic-global-actions { flex: 1 1 100%; min-width: 100%; border-top: 1px solid #e1e7ed; } .thematic-selection-controls { flex-wrap: wrap; } .thematic-global-tool { position: static; } .thematic-global-actions > .thematic-classification-tool > summary { border-left: 0; } .thematic-global-tool > .thematic-global-tool-body, .thematic-global-tool > .thematic-page-structure { top: calc(100% + 5px); right: 3px; left: 3px; width: auto; max-width: none; max-height: calc(100vh - 80px); } .thematic-workspace { grid-template-columns: 1fr; } .thematic-zone-rail { border-right: 0; border-bottom: 1px solid #273444; } .thematic-zone-list { grid-template-columns: repeat(2,minmax(0,1fr)); } .thematic-new-zone-form, .thematic-page-row, .thematic-page-row-main, .thematic-zone-editor, .thematic-highlight-row, .thematic-slots-4, .thematic-slots-5, .thematic-slots-6, .thematic-candidates-grid, .agenda-tv-sync-row { grid-template-columns: 1fr; } .thematic-zone-editor label { grid-template-columns: 1fr; } .agenda-tv-sync-actions { justify-content: flex-start; } }
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

type CandidateEntry = Readonly<{
  bankItemId: string;
  classifiedZoneKey: string | null;
  item: MatchdayEditorialProfileEffectiveItem;
  placement: Placement;
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

function ArticleCard({ bankItemId, item, classificationKey, placement, selected, dragging, onToggle, onDragStart, onDragEnd, onFaixa, onBank, onDisplaced }: Readonly<{
  bankItemId: string;
  item: MatchdayEditorialProfileEffectiveItem;
  classificationKey: ArticleClassificationKey | null;
  placement: Placement;
  selected: boolean;
  dragging: boolean;
  onToggle: (bankItemId: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, bankItemId: string) => void;
  onDragEnd: () => void;
  onFaixa: () => void;
  onBank: () => void;
  onDisplaced: () => void;
}>) {
  const publishedAt = formattedDate(item.publishedAt);
  const classificationLabel = classificationKey === null
    ? "Sem classificação"
    : classificationKey === "fc_porto" ? "Porto"
      : classificationKey === "other_liga_clubs" ? "Primeira Liga"
        : articleClassificationLabel(classificationKey);
  const canMoveToDisplaced = placement.kind === "zone"
    || placement.kind === "opening"
    || placement.kind === "new"
    || (placement.kind === "bank" && classificationKey !== null);

  return (
    <article aria-grabbed={dragging} className={`thematic-card${selected ? " selected" : ""}`} draggable onDragEnd={onDragEnd} onDragStart={(event) => onDragStart(event, bankItemId)}>
      <input aria-label={`Marcar para operação em lote: ${item.title ?? item.sourceId}`} checked={selected} onChange={() => onToggle(bankItemId)} onClick={(event) => event.stopPropagation()} type="checkbox" />
      {renderableImageUrl(item.imageUrl) ? (
        <Image alt="" className="thematic-image" height={180} loader={imageLoader} loading="lazy" src={item.imageUrl} unoptimized width={320} />
      ) : <span aria-hidden="true" className="thematic-image-placeholder" />}
      <div className="thematic-card-copy">
        <div className="thematic-card-top" data-without-label={!item.label}>
          {item.label ? <span className="thematic-card-label">{item.label}</span> : null}
          <span className="thematic-classification-badge" data-classification={classificationKey ?? "unclassified"} title={`Classificação editorial: ${classificationLabel}`}>{classificationLabel}</span>
        </div>
        <strong className="thematic-card-title" title={item.title ?? undefined}>{item.title ?? "Artigo sem título"}</strong>
        {publishedAt ? <time dateTime={item.publishedAt ?? undefined}>{publishedAt}</time> : null}
      </div>
      <details
        className="thematic-card-menu"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            event.currentTarget.querySelector<HTMLElement>(".thematic-card-actions")?.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }}
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
          {canMoveToDisplaced ? <button className="thematic-button" onClick={onDisplaced} type="button">Mover para Desalojadas</button> : null}
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
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<ActiveWorkspaceKey>(
    () => {
      const firstZoneBlock = physicalDesk.current.blocks.find((block) => block.kind === "zone");
      return firstZoneBlock?.kind === "zone" ? firstZoneBlock.zoneId : "latest";
    },
  );
  const [openingVisible, setOpeningVisible] = useState(false);
  const [activeWorkspaceVisible, setActiveWorkspaceVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedReorderZoneId, setSelectedReorderZoneId] =
    useState<LiveLayoutZoneId | null>(null);
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
  const [activeCandidateUniverse, setActiveCandidateUniverse] =
    useState<CandidateUniverse>("new");
  const [candidateClassFilter, setCandidateClassFilter] =
    useState<MatchdayEditorialTrackingClassFilter>("all");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateSearchOpen, setCandidateSearchOpen] = useState(false);
  const candidateSearchToggleRef = useRef<HTMLButtonElement>(null);
  const [candidateVisibleCounts, setCandidateVisibleCounts] = useState<
    Readonly<Record<CandidateUniverse, number>>
  >({
    new: TRACKING_INITIAL_VISIBLE,
    displaced: TRACKING_INITIAL_VISIBLE,
    bank: TRACKING_INITIAL_VISIBLE,
  });
  const [applyState, setApplyState] = useState<"idle" | "saving" | "refreshing" | "error">("idle");
  const [awaitedPhysicalStateToken, setAwaitedPhysicalStateToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pageStructureRef = useRef<HTMLDetailsElement>(null);
  const enterFocusButtonRef = useRef<HTMLButtonElement>(null);
  const exitFocusButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPhysicalDesk((current) => {
      if (current.physicalStateToken === desk.physicalWorkspace.stateToken) return current;
      return createPhysicalDeskState(desk.physicalWorkspace, physicalPresentation);
    });
    if (awaitedPhysicalStateToken === desk.physicalWorkspace.stateToken) {
      setAwaitedPhysicalStateToken(null);
      setApplyState("idle");
      setMessage("Alterações aplicadas.");
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
  const orderedZoneBlocks = current.blocks.filter((block) => block.kind === "zone");
  const orderedZones = orderedZoneBlocks.flatMap((block) => {
    const zone = zoneById.get(block.zoneId);
    return zone ? [zone] : [];
  });
  const selectedReorderZoneIndex = orderedZoneBlocks.findIndex(
    (block) => block.zoneId === selectedReorderZoneId,
  );
  const latestDestination = resolveMatchdayLatestPlacement(
    current.presentation.latestZonePlacement,
    current.latestCompanionZoneId,
  );
  const latestDestinationSelectValue = latestDestination.kind === "zone"
    ? `zone:${latestDestination.zoneId}`
    : latestDestination.kind === "headline" || latestDestination.kind === "hidden"
      ? latestDestination.kind
      : "legacy_incomplete";
  const activeZone =
    zoneById.get(activeWorkspaceKey as LiveLayoutZoneId) ?? null;
  const activeLatest = activeWorkspaceKey === "latest";
  const activeWorkspaceLabel = activeZone?.publicTitle || (
    activeLatest ? current.presentation.latestZoneTitle || "Últimas"
      : activeWorkspaceKey === "faixa" ? "Faixa"
        : activeWorkspaceKey === "highlight" ? "Destaque" : "Zona sem título"
  );
  const openingOnly = openingVisible && !activeWorkspaceVisible;
  const compositionMode = openingVisible
    ? openingOnly ? "opening-only" : "stacked"
    : activeZone ? "zone-only" : "other";
  const focusContext = `${desk.matchdayLabel} · ${openingOnly ? "Só Abertura" : activeWorkspaceLabel} · Abertura ${openingVisible ? "aberta" : "fechada"}`;
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
      activeWorkspaceKey === "latest"
      || activeWorkspaceKey === "highlight"
      || activeWorkspaceKey === "faixa"
      || zoneById.has(activeWorkspaceKey)
    ) {
      return;
    }
    setActiveWorkspaceKey(current.zones[0]?.id ?? "latest");
  }, [activeWorkspaceKey, current.zones, zoneById]);

  useEffect(() => {
    if (
      selectedReorderZoneId === null
      || zoneById.has(selectedReorderZoneId)
    ) {
      return;
    }
    setSelectedReorderZoneId(null);
  }, [selectedReorderZoneId, zoneById]);

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
      setMessage("A Mesa está a guardar; aguarde.");
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
        : "Não foi possível concluir a alteração.";
      setMessage(
        errorMessage.includes("zone-layout-shrink-occupied")
          ? "Este layout não comporta as posições atualmente ocupadas. Mova primeiro os artigos dessas posições."
          : errorMessage.includes("latest-companion-zone-associated")
            ? "Escolha Manchete, Ocultas ou outra zona para as Últimas antes de apagar esta zona."
            : errorMessage.includes("latest-companion-host-invalid")
              ? "A zona escolhida para as Últimas já não existe."
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
      `${newZoneTitle.trim() || "Zona sem título"}: zona criada.`,
    );
    if (!nextState) return;
    const createdZone = nextState.current.zones.find((zone) => (
      !physicalDesk.current.zones.some((candidate) => candidate.id === zone.id)
    ));
    if (createdZone) {
      setActiveWorkspaceKey(createdZone.id);
      setActiveWorkspaceVisible(true);
    }
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
      `${zone.publicTitle || "Zona sem título"}: zona removida.`,
    );

    if (!nextState) return;

    setDeleteZoneId(null);
    if (selectedReorderZoneId === zoneId) setSelectedReorderZoneId(null);

    if (activeWorkspaceKey === zoneId) {
      const nextZoneBlock = nextState.current.blocks.find(
        (block) => block.kind === "zone",
      );
      setActiveWorkspaceKey(nextZoneBlock?.zoneId ?? "latest");
    }
  }

  function toggleSelection(bankItemId: string) {
    setPhysicalDesk((state) => togglePhysicalDeskSelection(state, bankItemId));
  }

  function selectItems(bankItemIds: readonly string[]) {
    setPhysicalDesk((state) => selectPhysicalDeskItems(state, bankItemIds));
  }

  function moveSelectedZone(direction: "up" | "down") {
    if (selectedReorderZoneId === null) return;
    const zone = zoneById.get(selectedReorderZoneId);
    if (!zone) return;
    runPhysicalOperation(
      (state) => movePhysicalDeskZone(state, selectedReorderZoneId, direction),
      `${zone.publicTitle || "Zona sem título"}: ordem alterada.`,
    );
  }

  function placeInZone(bankItemId: string, zoneId: LiveLayoutZoneId, position: number) {
    const source = physicalDeskPlacementForBankItem(physicalDesk, bankItemId);
    if (
      source?.placementType === "zone"
      && source.zoneId !== zoneId
    ) {
      setApplyState("error");
      setMessage(
        "Não é permitido arrastar diretamente entre zonas. Largue primeiro em Desalojadas.",
      );
      return;
    }
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
        placementType: "zone", zoneId, slotPosition: position,
      }),
      `Notícia colocada em ${zoneById.get(zoneId)?.publicTitle || "Zona sem título"}, posição ${position}.`,
    );
  }

  function placeInOpening(bankItemId: string, slotPosition: number) {
    runPhysicalOperation(
      (state) => movePhysicalDeskItemToSlot(state, bankItemId, {
        placementType: "opening", zoneId: null, slotPosition,
      }),
      "Abertura atualizada.",
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
      "Faixa atualizada.",
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
    return null;
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

  function canDropInZone(zoneId: LiveLayoutZoneId) {
    if (mutationBlocked || draggingBankItemId === null) return false;
    const source = physicalDeskPlacementForBankItem(physicalDesk, draggingBankItemId);
    return source?.placementType !== "zone" || source.zoneId === zoneId;
  }

  function cardFor(bankItemId: string, placement: Placement) {
    const physicalPlacement = placementByBankItemId.get(bankItemId);
    return (
      <ArticleCard
        bankItemId={bankItemId}
        classificationKey={bankItemById.get(bankItemId)?.classification?.key ?? null}
        dragging={draggingBankItemId === bankItemId}
        item={effectiveItem(bankItemId, physicalPlacement?.slotPosition ?? null)}
        onBank={() => placeInBank(bankItemId)}
        onDisplaced={() => placeInDisplaced(bankItemId)}
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

  const normalizedCandidateQuery = candidateQuery.trim().toLocaleLowerCase("pt-PT");
  function matchesCandidateQuery(item: Pick<MatchdayEditorialProfileEffectiveItem, "label" | "title" | "subtitle">) {
    return !normalizedCandidateQuery
      || [item.label, item.title, item.subtitle].some((value) => (
        value?.toLocaleLowerCase("pt-PT").includes(normalizedCandidateQuery)
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

  const newCandidateEntries = selectMatchdayEditorialTrackingItems(
    trackingEntries.filter((entry) => entry.editorialState === "NOVA"),
    "all",
  );
  const displacedCandidateEntries = (() => {
    const entries = trackingEntries.filter(
      (entry) => entry.editorialState === "DESALOJADA",
    );
    const rank = new Map(current.displacedArrivalBankItemIds.map((id, index) => [id, index] as const));
    return [...entries].sort((left, right) => (
      (rank.get(left.bankItemId) ?? Number.MAX_SAFE_INTEGER)
      - (rank.get(right.bankItemId) ?? Number.MAX_SAFE_INTEGER)
    ));
  })();
  const bankCandidateEntries = selectMatchdayEditorialExplicitBankItems(
    explicitBankEntries,
    "all",
  );
  const candidateEntriesByUniverse: Readonly<
    Record<CandidateUniverse, readonly CandidateEntry[]>
  > = {
    new: newCandidateEntries.map((entry) => ({
      bankItemId: entry.bankItemId,
      classifiedZoneKey: entry.classifiedZoneKey,
      item: effectiveItem(entry.bankItemId, entry.sortOrder),
      placement: { kind: "new" },
    })),
    displaced: displacedCandidateEntries.map((entry) => ({
      bankItemId: entry.bankItemId,
      classifiedZoneKey: entry.classifiedZoneKey,
      item: effectiveItem(entry.bankItemId, entry.sortOrder),
      placement: { kind: "displaced" },
    })),
    bank: bankCandidateEntries.map((entry) => ({
      bankItemId: entry.bankItemId,
      classifiedZoneKey: entry.classifiedZoneKey,
      item: entry.item,
      placement: { kind: "bank" },
    })),
  };
  const activeUniverseEntries = candidateEntriesByUniverse[activeCandidateUniverse];
  const classCandidateEntries = activeUniverseEntries.filter((entry) => (
    candidateClassFilter === "all"
    || entry.classifiedZoneKey === candidateClassFilter
  ));
  const filteredCandidateEntries = classCandidateEntries.filter(({ item }) => (
    matchesCandidateQuery(item)
  ));
  const visibleCandidateEntries = filteredCandidateEntries.slice(
    0,
    candidateVisibleCounts[activeCandidateUniverse],
  );

  const openingPlacements = physicalDeskPlacementsOfType(physicalDesk, "opening");
  const faixaPlacements = physicalDeskPlacementsOfType(physicalDesk, "faixa");
  const highlightPlacement = physicalDeskPlacementsOfType(physicalDesk, "video_highlight")[0] ?? null;
  const openingOccupied = openingPlacements.length;
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
    const zoneLabel = zone.publicTitle || "Zona sem título";
    const dropEnabled = canDropInZone(zoneId);
    return (
      <article className="thematic-workspace-section" key={zone.id} data-zone-id={zone.id}>
        <header className="thematic-workspace-heading">
          <strong>{zoneLabel}</strong>
          <span>Zona ativa</span>
        </header>
        <div className="thematic-workspace-body">
          <div className="thematic-zone-editor">
          <label>
            <input
              aria-label={`Título público de ${zoneLabel}`}
              defaultValue={zone.publicTitle}
              disabled={mutationBlocked}
              key={`${zone.id}:${zone.publicTitle}`}
              maxLength={120}
              onBlur={(event) => runPhysicalOperation(
                (state) => changePhysicalDeskZone(state, zone.id, { publicTitle: event.target.value }),
                `${zoneLabel}: título alterado.`,
              )}
              type="text"
            />
          </label>
          <label>
            <select
              aria-label={`Apresentação de ${zoneLabel}`}
              disabled={mutationBlocked}
              onChange={(event) => runPhysicalOperation(
                (state) => changePhysicalDeskZone(state, zone.id, {
                  visualFamily: event.target.value as EditorialVisualFamily,
                }),
                `${zoneLabel}: apresentação alterada.`,
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
          <div className={`thematic-slots thematic-slots-${zone.capacity}`}>
            {slots.map((slot) => (
              <div
                className="thematic-workspace-slot"
                data-drag-active={dropEnabled}
                key={slot.slotPosition}
                onDragOver={dropEnabled ? allowDrop : undefined}
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
        </div>
      </article>
    );
  }

  function renderOpeningWorkspace() {
    return (
      <article className="thematic-workspace-section" id="thematic-opening-workspace">
        <header className="thematic-workspace-heading">
          <strong>Abertura</strong>
          <span>{openingOccupied}/{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.length}</span>
        </header>
        <div className="thematic-workspace-body">
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
        </div>
      </article>
    );
  }

  function renderFaixaWorkspace() {
    const slots = physicalDeskFaixaSlots(physicalDesk);
    return (
      <article className="thematic-workspace-section">
        <header className="thematic-workspace-heading">
          <strong>Faixa</strong>
          <span>{faixaPlacements.length} artigos</span>
        </header>
        <div className="thematic-workspace-body">
          <div
            className="thematic-faixa-drop-target"
            data-drag-active={draggingBankItemId !== null && !mutationBlocked}
            onDragOver={allowDrop}
            onDrop={(event) => {
              event.preventDefault();
              const bankItemId = dragged(event);
              if (bankItemId) placeAtFaixaTop(bankItemId);
              setDraggingBankItemId(null);
            }}
          >
            Largar aqui · entra no topo da Faixa
          </div>
          {slots.length > 0 ? (
            <div className="thematic-faixa-slots">
              {slots.map((slot) => (
                <div
                  className="thematic-workspace-slot"
                  data-drag-active={draggingBankItemId !== null && !mutationBlocked}
                  key={slot.slotPosition}
                  onDragOver={allowDrop}
                  onDrop={(event) => {
                    event.preventDefault();
                    const bankItemId = dragged(event);
                    if (bankItemId) placeInFaixa(bankItemId, slot.slotPosition);
                    setDraggingBankItemId(null);
                  }}
                >
                  <span className="thematic-slot-label">Posição {slot.slotPosition}</span>
                  {slot.placement
                    ? cardFor(slot.placement.bankItemId, { kind: "faixa" })
                    : <p className="thematic-empty">Posição livre</p>}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function renderLatestBlockPanel() {
    const companionZone =
      latestDestination.kind === "zone"
        ? zoneById.get(latestDestination.zoneId as LiveLayoutZoneId) ?? null
        : null;

    return (
      <article
        className="thematic-workspace-section"
        data-latest-block="presentation"
      >
        <header className="thematic-workspace-heading">
          <strong>Últimas</strong>
          <span>Apresentação</span>
        </header>
        <div className="thematic-workspace-body">
          <div className="thematic-zone-editor">
          <div className="thematic-card-copy">
            <strong>Últimas</strong>
            <small>
              Escolha onde apresentar as Últimas.
            </small>
          </div>

          <strong className="thematic-zone-editor-count">
            {latestDestination.kind === "headline"
              ? "Manchete"
              : latestDestination.kind === "hidden"
                ? "Ocultas"
                : latestDestination.kind === "zone"
                  ? "Zona física"
                  : "Associação necessária"}
          </strong>
          </div>

          <p className="thematic-message">
            {latestDestination.kind === "legacy_incomplete"
              ? "Escolha uma posição para as Últimas."
              : companionZone
                ? `Zona associada: ${companionZone.publicTitle || "Zona sem título"}.`
                : latestDestination.kind === "headline"
                  ? "As Últimas aparecem junto da manchete."
                  : "As Últimas não aparecem na página pública."}
          </p>
        </div>
      </article>
    );
  }

  function renderHighlightWorkspace() {
    const highlighted = highlightPlacement ? bankItemById.get(highlightPlacement.bankItemId) : null;
    return (
      <article className="thematic-workspace-section">
        <header className="thematic-workspace-heading">
          <strong>Destaque</strong>
          <span>{highlighted ? "1/1" : "0/1"}</span>
        </header>
        <div className="thematic-workspace-body">
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
                  "Visibilidade do Destaque alterada.",
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
                "Destaque atualizado.",
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
        </div>
      </article>
    );
  }

  function renderCandidates() {
    const universeLabels: Readonly<Record<CandidateUniverse, string>> = {
      new: "Novas",
      displaced: "Desalojadas",
      bank: "Bank",
    };

    return (
      <section className="thematic-sources" aria-label="Artigos candidatos">
        <div className="thematic-sources-toolbar">
          <nav className="thematic-candidate-tabs" aria-label="Universo de candidatas">
            {CANDIDATE_UNIVERSES.map((universe) => (
              <button
                aria-pressed={activeCandidateUniverse === universe}
                className={activeCandidateUniverse === universe ? "active" : ""}
                key={universe}
                onClick={() => setActiveCandidateUniverse(universe)}
                data-drag-active={universe === "displaced" && draggingBankItemId !== null && !mutationBlocked}
                onDragOver={universe === "displaced" ? allowDrop : undefined}
                onDrop={universe === "displaced" ? (event) => {
                  event.preventDefault();
                  const bankItemId = dragged(event);
                  if (bankItemId) placeInDisplaced(bankItemId);
                  setDraggingBankItemId(null);
                } : undefined}
                type="button"
              >
                {universeLabels[universe]} {candidateEntriesByUniverse[universe].length}
              </button>
            ))}
          </nav>
          <div className="thematic-candidate-filters">
            {candidateSearchOpen ? (
              <label className="thematic-reservoir-search">
                <input
                  aria-label="Pesquisar artigos candidatos"
                  autoFocus
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCandidateSearchOpen(false);
                      candidateSearchToggleRef.current?.focus();
                    }
                  }}
                  placeholder="Título ou antetítulo"
                  type="search"
                  value={candidateQuery}
                />
              </label>
            ) : <nav aria-label="Filtrar candidatas por classificação">
              <button
                className={candidateClassFilter === "all" ? "active" : ""}
                onClick={() => setCandidateClassFilter("all")}
                type="button"
              >
                Todas {activeUniverseEntries.length}
              </button>
              {profile.zones.map((zone) => (
                <button
                  className={candidateClassFilter === zone.key ? "active" : ""}
                  key={zone.key}
                  onClick={() => setCandidateClassFilter(zone.key)}
                  type="button"
                >
                  {articleClassificationLabel(zone.key)}{" "}
                  {activeUniverseEntries.filter(
                    (entry) => entry.classifiedZoneKey === zone.key,
                  ).length}
                </button>
              ))}
            </nav>}
            <div className="thematic-candidate-actions">
              <button
                aria-label={candidateSearchOpen ? "Fechar pesquisa" : "Pesquisar artigos candidatos"}
                aria-expanded={candidateSearchOpen}
                className="thematic-button thematic-candidate-search-toggle"
                data-query-active={normalizedCandidateQuery.length > 0}
                onClick={() => setCandidateSearchOpen((open) => !open)}
                ref={candidateSearchToggleRef}
                title={candidateSearchOpen ? "Fechar pesquisa" : candidateQuery ? `Pesquisa ativa: ${candidateQuery}` : "Pesquisar artigos candidatos"}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
                  {candidateSearchOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
                </svg>
              </button>
              <button
                className="thematic-button"
                disabled={visibleCandidateEntries.length === 0}
                onClick={() => selectItems(
                  visibleCandidateEntries.map((entry) => entry.bankItemId),
                )}
                type="button"
              >
                Selecionar visíveis
              </button>
            </div>
          </div>
        </div>
        <div
          className="thematic-candidates-grid"
          data-candidate-universe={activeCandidateUniverse}
          aria-label="Lista de artigos candidatos"
          role="region"
          tabIndex={0}
        >
          {visibleCandidateEntries.length > 0
            ? visibleCandidateEntries.map((entry) => (
                <Fragment key={entry.bankItemId}>
                  {cardFor(entry.bankItemId, entry.placement)}
                </Fragment>
              ))
            : <p className="thematic-empty">{activeUniverseEntries.length > 0 ? "Nenhum artigo corresponde aos filtros." : "Sem artigos neste universo."}</p>}
        </div>
        {visibleCandidateEntries.length < filteredCandidateEntries.length ? (
          <div className="thematic-more">
            <button
              className="thematic-button"
              onClick={() => setCandidateVisibleCounts((values) => ({
                ...values,
                [activeCandidateUniverse]:
                  values[activeCandidateUniverse] + TRACKING_PAGE_SIZE,
              }))}
              type="button"
            >
              Mostrar mais
            </button>
          </div>
        ) : null}
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
    if (block.kind === "latest") {
      if (latestDestination.kind === "hidden") return "Ocultas";
      if (latestDestination.kind === "headline") return "Manchete";
      if (latestDestination.kind === "zone") return "Zona física";
      return "Associação necessária";
    }
    if (block.kind === "video") return `${highlightPlacement ? 1 : 0}/1`;
    const zone = zoneById.get(block.zoneId);
    if (!zone) return "0/0";
    return `${physicalDeskZoneSlots(physicalDesk, zone.id).filter((slot) => slot.placement).length}/${zone.capacity}`;
  }

  function activateWorkspaceFromStructure(workspaceKey: ActiveWorkspaceKey) {
    setActiveWorkspaceKey(workspaceKey);
    setActiveWorkspaceVisible(true);
    pageStructureRef.current?.removeAttribute("open");
  }

  function renderActiveWorkspace() {
    if (activeWorkspaceKey === "latest") return renderLatestBlockPanel();
    if (activeWorkspaceKey === "highlight") return renderHighlightWorkspace();
    if (activeWorkspaceKey === "faixa") return renderFaixaWorkspace();
    if (isZoneWorkspaceKey(activeWorkspaceKey)) return renderZonePanel(activeWorkspaceKey);
    return null;
  }

  function renderZoneRail() {
    return (
      <aside className="thematic-zone-rail" aria-label="Zonas da Mesa">
        <button
          aria-controls="thematic-opening-workspace"
          aria-expanded={openingVisible}
          className={`thematic-opening-toggle${openingVisible ? " active" : ""}`}
          onClick={() => setOpeningVisible((visible) => !visible)}
          type="button"
        >
          <span>{openingVisible ? "Fechar Abertura" : "Mostrar Abertura"}</span>
          <strong>{openingOccupied}/5</strong>
        </button>
        {openingVisible ? (
          <button
            aria-pressed={openingOnly}
            className="thematic-opening-only-toggle"
            onClick={() => setActiveWorkspaceVisible((visible) => !visible)}
            type="button"
          >
            {openingOnly ? "Mostrar composição" : "Ver só Abertura"}
          </button>
        ) : null}
        <div className="thematic-zone-rail-heading">
          <span>Zonas</span>
          <span>{orderedZoneBlocks.length}</span>
        </div>
        <nav className="thematic-zone-list" aria-label="Lista vertical de zonas">
          {orderedZoneBlocks.map((block) => {
            const zone = zoneById.get(block.zoneId);
            if (!zone) return null;
            const zoneLabel = zone.publicTitle || "Zona sem título";
            return (
              <div
                className={`thematic-zone-row${activeWorkspaceKey === zone.id ? " active" : ""}`}
                key={zone.id}
              >
                <label className="thematic-zone-select">
                  <input
                    aria-label={`Selecionar ${zoneLabel} para mover`}
                    checked={selectedReorderZoneId === zone.id}
                    onChange={(event) => setSelectedReorderZoneId(
                      event.target.checked ? zone.id : null,
                    )}
                    type="checkbox"
                  />
                </label>
                <button
                  className="thematic-zone-focus"
                  onClick={() => {
                    setActiveWorkspaceKey(zone.id);
                    setActiveWorkspaceVisible(true);
                  }}
                  type="button"
                >
                  <strong>{zoneLabel}</strong>
                  <small>{blockCount(block)}</small>
                </button>
              </div>
            );
          })}
        </nav>
        <div className="thematic-zone-move-controls" aria-label="Mover zona selecionada">
          <button
            aria-label="Subir zona selecionada"
            disabled={
              mutationBlocked
              || selectedReorderZoneIndex <= 0
            }
            onClick={() => moveSelectedZone("up")}
            type="button"
          >
            <span aria-hidden="true">↑</span>
            Subir
          </button>
          <button
            aria-label="Descer zona selecionada"
            disabled={
              mutationBlocked
              || selectedReorderZoneIndex < 0
              || selectedReorderZoneIndex >= orderedZoneBlocks.length - 1
            }
            onClick={() => moveSelectedZone("down")}
            type="button"
          >
            <span aria-hidden="true">↓</span>
            Descer
          </button>
        </div>
        <div className="thematic-secondary-workspaces" aria-label="Outros blocos">
          <button
            className={activeWorkspaceKey === "faixa" ? "active" : ""}
            onClick={() => {
              setActiveWorkspaceKey("faixa");
              setActiveWorkspaceVisible(true);
            }}
            type="button"
          >
            Faixa · {faixaPlacements.length}
          </button>
          <button
            className={activeWorkspaceKey === "latest" ? "active" : ""}
            onClick={() => {
              setActiveWorkspaceKey("latest");
              setActiveWorkspaceVisible(true);
            }}
            type="button"
          >
            {current.presentation.latestZoneTitle || "Últimas"}
          </button>
          <button
            className={activeWorkspaceKey === "highlight" ? "active" : ""}
            onClick={() => {
              setActiveWorkspaceKey("highlight");
              setActiveWorkspaceVisible(true);
            }}
            type="button"
          >
            Destaque · {highlightPlacement ? 1 : 0}/1
          </button>
        </div>
      </aside>
    );
  }

  function undo() {
    if (mutationBlocked) return;
    setPhysicalDesk((state) => undoPhysicalDeskState(state));
    setApplyState("idle");
    setMessage("Última alteração desfeita.");
  }

  function changeFocusMode(nextFocusMode: boolean) {
    setFocusMode(nextFocusMode);
    requestAnimationFrame(() => {
      (nextFocusMode ? exitFocusButtonRef : enterFocusButtonRef).current?.focus();
    });
  }

  function resetLocal() {
    if (mutationBlocked) return;
    setPhysicalDesk((state) => resetPhysicalDeskState(state));
    setApplyState("idle");
    setMessage("Alterações locais anuladas.");
  }

  async function applyChanges() {
    if (!pending || mutationBlocked) return;
    setApplyState("saving");
    setMessage("A aplicar alterações…");
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
        throw new Error(result.message ?? "Não foi possível aplicar as alterações.");
      }
      setAwaitedPhysicalStateToken(result.stateToken);
      setApplyState("refreshing");
      setMessage("Alterações aplicadas. A atualizar a Mesa…");
      router.refresh();
    } catch (error) {
      setApplyState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível aplicar as alterações.");
    }
  }

  return (
    <main className="thematic-shell" data-focus-mode={focusMode}>
      <style>{styles}</style>
      <div className="thematic-content">
        <header className="thematic-focus-bar" hidden={!focusMode}>
          <h1 title={focusContext}>{focusContext}</h1>
          <button className="thematic-focus-toggle" onClick={() => changeFocusMode(false)} ref={exitFocusButtonRef} title="Sair do modo foco" type="button">Mostrar controlos</button>
        </header>
        <header className="thematic-hero">
          <div className="thematic-hero-main">
            <p className="thematic-eyebrow">Mesa viva</p>
            <h1>{desk.profileDisplayName}</h1>
            <span className="thematic-context">{desk.competitionName} · {desk.seasonLabel} · {desk.matchdayLabel}</span>
            <span className={`thematic-status${pending ? " pending" : ""}`}>{pending ? "Alterações por aplicar" : "Estado aplicado · sem pendentes"}</span>
          </div>
          <nav>
            <button className="thematic-focus-toggle" onClick={() => changeFocusMode(true)} ref={enterFocusButtonRef} type="button">Modo foco</button>
            <a href="/admin">Backoffice</a>
          </nav>
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
                    {orderedZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.publicTitle || "Zona sem título"}</option>)}
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
                    <button
                      className={"thematic-page-row" + (openingVisible ? " active" : "")}
                      onClick={() => {
                        setOpeningVisible(true);
                        pageStructureRef.current?.removeAttribute("open");
                      }}
                      type="button"
                    >
                      <span>Fixo</span>
                      <strong>Abertura</strong>
                      <small>{openingOccupied}/{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.length}</small>
                    </button>
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
                                setActiveWorkspaceVisible(true);
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
                        </div>
                      );
                    })}
                    <button
                      className={"thematic-page-row" + (activeWorkspaceKey === "faixa" ? " active" : "")}
                      onClick={() => activateWorkspaceFromStructure("faixa")}
                      type="button"
                    >
                      <span>Fixo</span>
                      <strong>Faixa</strong>
                      <small>{faixaPlacements.length}</small>
                    </button>
                  </div>
                </div>

                {activeStructureEditorOpen ? (
                  <aside
                    className="thematic-page-zone-editor-panel"
                    aria-label={(activeLatest ? "Editar bloco " : "Editar zona ") + activeStructureLabel}
                  >
                    <strong>{activeLatest ? "Editar Últimas" : "Editar zona"}</strong>

                    <label className="thematic-page-zone-field">
                      <span>{activeLatest ? "Título das Últimas" : "Nome público"}</span>
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
                        {activeLatest ? "Posição das Últimas" : "Layout"}
                      </span>

                      {activeLatest ? (
                        <select
                          aria-label="Posição das Últimas"
                          disabled={mutationBlocked}
                          onChange={(event) => {
                            const requestedDestination = event.target.value;

                            if (requestedDestination === "headline") {
                              runPhysicalOperation(
                                (state) => changePhysicalDeskLatestPlacement(
                                  state,
                                  { kind: "headline" },
                                ),
                                "Últimas colocadas junto da manchete em preview.",
                              );
                              return;
                            }
                            if (requestedDestination === "hidden") {
                              runPhysicalOperation(
                                (state) => changePhysicalDeskLatestPlacement(
                                  state,
                                  { kind: "hidden" },
                                ),
                                "Últimas ocultadas em preview.",
                              );
                              return;
                            }

                            const requestedZoneId = requestedDestination.startsWith("zone:")
                              ? requestedDestination.slice("zone:".length)
                              : "";
                            const nextZone = current.zones.find((zone) => (
                              zone.id === requestedZoneId
                            ));

                            if (!nextZone) return;

                            runPhysicalOperation(
                              (state) => changePhysicalDeskLatestPlacement(
                                state,
                                { kind: "zone", zoneId: nextZone.id },
                              ),
                              "Associação das Últimas alterada em preview.",
                            );
                          }}
                          value={latestDestinationSelectValue}
                        >
                          {latestDestination.kind === "legacy_incomplete" ? (
                            <option disabled value="legacy_incomplete">
                              Sem associação válida — escolha uma posição
                            </option>
                          ) : null}
                          <option value="headline">Manchete</option>
                          <option value="hidden">Ocultas</option>

                          <optgroup label="Zona física">
                            {orderedZones.map((zone) => (
                              <option key={zone.id} value={`zone:${zone.id}`}>
                                {zone.publicTitle || "Zona sem título"}
                              </option>
                            ))}
                          </optgroup>
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

                    {!activeLatest ? (
                      <small>
                        {activeZone
                          ? activeZonePlacedArticleCount
                            + "/" + activeZone.capacity
                          : ""}
                      </small>
                    ) : null}

                    {activeZone ? (
                      <>
                        {current.latestCompanionZoneId === activeZone.id ? (
                          <p className="thematic-message" role="alert">
                            Esta zona recebe as Últimas. Escolha outra posição antes de a apagar.
                          </p>
                        ) : null}
                        <button
                          className="thematic-page-zone-delete-trigger"
                          disabled={
                            mutationBlocked
                            || current.latestCompanionZoneId === activeZone.id
                          }
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
                disabled={filteredCandidateEntries.length === 0}
                onClick={() => selectItems(
                  filteredCandidateEntries.map((entry) => entry.bankItemId),
                )}
                type="button"
              >
                Selecionar candidatas
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

        <div className={`thematic-desk-grid${openingVisible ? " opening-visible" : ""}`}>
          <section className="thematic-panel thematic-workspace" aria-label="Workspace editorial físico">
            {renderZoneRail()}
            <div className="thematic-workspace-stack" data-opening-only={openingOnly} data-composition-mode={compositionMode} aria-label="Composição editorial" role="region" tabIndex={0}>
              {openingVisible ? renderOpeningWorkspace() : null}
              {renderActiveWorkspace()}
            </div>
          </section>
          {renderCandidates()}
        </div>
        {desk.inactiveHistoricalCount > 0 ? <p className="thematic-message">Estado histórico inativo: {desk.inactiveHistoricalCount}</p> : null}
        <Diagnostics diagnostics={desk.diagnostics} />
      </div>

      <footer className="thematic-pending" aria-live="polite">
        <div className="thematic-pending-copy"><strong>{pendingCount} {pendingCount === 1 ? "alteração pendente" : "alterações pendentes"}</strong>{applyState === "refreshing" ? <span>A atualizar a Mesa…</span> : null}</div>
        <button className="thematic-button" disabled={mutationBlocked || physicalDesk.history.length === 0} onClick={undo} type="button">Desfazer última</button>
        <button className="thematic-button" disabled={mutationBlocked || !pending} onClick={resetLocal} type="button">Limpar alterações</button>
        <button className="thematic-button dark" disabled={!pending || mutationBlocked} onClick={applyChanges} type="button">{applyState === "saving" ? "A aplicar…" : applyState === "refreshing" ? "A atualizar…" : "Aplicar alterações"}</button>
      </footer>
    </main>
  );
}
