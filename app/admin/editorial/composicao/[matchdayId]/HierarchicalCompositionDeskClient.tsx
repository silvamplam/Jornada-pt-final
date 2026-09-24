"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS,
  HIERARCHICAL_COMPOSITION_DESK_SECTIONS,
} from "@/lib/editorial-hierarchical-composition";
import {
  articleClassificationLabel,
  isArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY,
  HISTORICAL_DYNAMIC_ZONE_LAYOUTS,
  filterHistoricalCompositionReservoir,
  historicalCompositionClassificationCounts,
  historicalCompositionDecisionCounts,
  historicalDynamicZonePositions,
  moveHistoricalCompositionPiece,
  type HistoricalCompositionBlockKey,
  type HistoricalCompositionPlacementLocation,
  type HistoricalCompositionDecision,
  type HistoricalCompositionDecisionFilter,
  type HistoricalDynamicZoneVisualFamily,
} from "@/lib/editorial-historical-composition-workspace";

export type HierarchicalCompositionDeskArticle = {
  bankItemId: string;
  articleId: string;
  label: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  naturalGroupKey: string | null;
  historicalEligible: boolean;
  historicalDecision: HistoricalCompositionDecision;
  inheritedFromMatchdayNumber: number | null;
};

export type HierarchicalCompositionDeskSlot = {
  id: string;
  slotKey: string;
  bankItemId: string | null;
  title: string;
};

export type HierarchicalCompositionDeskAuxiliary = {
  id: string;
  target: string;
  bankItemId: string | null;
  title: string;
};

type TargetCard = {
  persistedId: string | null;
  bankItemId: string | null;
  title: string;
};

type DynamicZonePlan = {
  clientId: string;
  persistedId: string | null;
  publicTitle: string;
  visualFamily: HistoricalDynamicZoneVisualFamily;
  items: Record<number, TargetCard | null>;
};

type PlanState = {
  slots: Record<string, TargetCard | null>;
  auxiliary: Record<string, TargetCard | null>;
  dynamicZones: DynamicZonePlan[];
  settings: CompositionSettings;
};

type CompositionSettings = {
  headlineTitleColor: string;
  zone1Title: string;
  zone2Title: string;
  faixaTitle: string;
  blockOrder: HistoricalCompositionBlockKey[];
  videoPosition: number;
};

type PlanOperation =
  | { kind: "unassign_slot"; slotId: string }
  | { kind: "remove_auxiliary"; itemId: string }
  | { kind: "assign_slot"; slotKey: string; bankItemId: string }
  | { kind: "assign_auxiliary"; target: string; bankItemId: string }
  | { kind: "remove_editorial" }
  | { kind: "assign_editorial"; bankItemId: string };

type DynamicDragLocation = Readonly<{
  kind: "dynamic";
  zoneKey: string;
  targetKey: string;
}>;

type DragLocation = HistoricalCompositionPlacementLocation | DynamicDragLocation;

type DragState =
  | { kind: "reservoir"; bankItemId: string }
  | DragLocation;

export type HierarchicalCompositionDeskGroup = {
  key: string;
  label: string;
};

export type HierarchicalCompositionDeskEditorial = {
  bankItemId: string | null;
  title: string | null;
};

export type HierarchicalCompositionDeskDynamicZone = {
  id: string;
  sortOrder: number;
  publicTitle: string;
  visualFamily: "six_news" | "five_news_balanced" | "five_news_secondary";
  items: Array<{
    id: string;
    position: number;
    bankItemId: string | null;
    label: string | null;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
  }>;
};

type Props = {
  articles: HierarchicalCompositionDeskArticle[];
  auxiliaryItems: HierarchicalCompositionDeskAuxiliary[];
  children?: ReactNode;
  compositionId: string;
  editorial: HierarchicalCompositionDeskEditorial;
  groups: HierarchicalCompositionDeskGroup[];
  initialDynamicZones: HierarchicalCompositionDeskDynamicZone[];
  initialBlockOrder: HistoricalCompositionBlockKey[];
  initialFaixaTitle: string;
  initialHeadlineTitleColor: string;
  initialVideoPosition: number;
  initialZone1Title: string;
  initialZone2Title: string;
  matchdayId: string;
  matchdayNumber: number;
  returnTo: string;
  slots: HierarchicalCompositionDeskSlot[];
};

const styles = `
  .composition-admin-shell-desk {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 100dvh;
    padding: 5px 10px 54px;
    overflow: visible;
  }

  .composition-admin-shell-desk > .composition-admin-preview-section {
    display: none;
  }

  .composition-admin-shell-desk .composition-admin-hero {
    flex: 0 0 auto;
    min-height: 38px;
    padding: 4px 7px;
    align-items: center;
  }

  .composition-admin-shell-desk .composition-admin-hero h1 {
    margin: 0;
    font-size: 14px;
    white-space: nowrap;
  }

  .composition-admin-shell-desk .composition-admin-hero p {
    display: none;
  }

  .composition-admin-shell-desk .composition-admin-hero span {
    display: none;
  }

  .composition-admin-shell-desk .composition-admin-actions {
    flex-wrap: nowrap;
    gap: 5px;
    overflow-x: auto;
  }

  .composition-admin-shell-desk .composition-admin-button {
    min-height: 26px;
    padding: 0 8px;
    font-size: 9px;
    white-space: nowrap;
  }

  .composition-admin-shell-desk .composition-context-selector {
    display: block;
    flex: 0 0 auto;
    margin-top: 0;
    padding: 3px 5px;
    overflow-x: auto;
  }

  .composition-admin-shell-desk .composition-context-selector > div:first-child {
    display: none;
  }

  .composition-admin-shell-desk .composition-context-selector strong {
    margin-top: 1px;
    font-size: 10px;
  }

  .composition-admin-shell-desk .composition-context-selector p,
  .composition-admin-shell-desk .composition-context-selector-field label {
    font-size: 8px;
  }

  .composition-admin-shell-desk .composition-context-selector-form {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    align-items: end;
    min-width: max-content;
  }

  .composition-admin-shell-desk .composition-context-selector-field select {
    min-height: 25px;
    font-size: 10px;
  }

  .composition-admin-shell-desk .composition-admin-mode-selector {
    margin-top: 7px;
  }

  .hc-desk-workspace {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: calc(100vw - 24px);
    max-width: 1920px;
    margin: 0 calc(50% - 50vw + 12px);
    overflow: visible;
  }

  .hc-desk-library {
    width: 100%;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 7px 18px rgba(12,22,34,.05);
  }

  .hc-desk-operational-sticky {
    position: sticky;
    top: 0;
    z-index: 30;
    display: grid;
    gap: 3px;
    padding: 3px 0;
    background: rgba(245,247,250,.98);
    backdrop-filter: blur(9px);
    order: 1;
  }

  .hc-desk-library {
    margin-top: 4px;
    order: 2;
  }

  .hc-zone-tabs {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    padding: 3px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #f7f9fb;
  }

  .hc-zone-tabs button {
    flex: 0 0 auto;
    min-height: 27px;
    padding: 3px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 10px;
    font-weight: 850;
    cursor: pointer;
  }

  .hc-zone-tabs button.active {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }


  .hc-dynamic-zone-editor {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(210px, .55fr);
    gap: 5px;
    align-items: end;
    padding: 4px 5px;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #fbfcfd;
  }

  .hc-dynamic-zone-editor label {
    display: grid;
    gap: 3px;
    color: #526173;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .hc-dynamic-zone-editor input,
  .hc-dynamic-zone-editor select {
    min-height: 31px;
    padding: 0 8px;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 11px;
  }

  .hc-dynamic-zone-editor.has-selection {
    grid-template-columns: minmax(220px, 1fr) minmax(180px, .45fr) auto;
  }

  .hc-dynamic-zone-place {
    min-height: 31px;
    padding: 3px 8px;
    border: 1px solid #2563eb;
    border-radius: 6px;
    background: #2563eb;
    color: #ffffff;
    font: inherit;
    font-size: 10px;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
  }

  .hc-page-structure {
    display: grid;
    gap: 5px;
    margin-top: 8px;
  }

  .hc-page-structure-head {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-start;
  }

  .hc-page-structure-head strong {
    color: #10151b;
    font-size: 11px;
  }

  .hc-page-structure-head button,
  .hc-page-structure-actions button {
    min-height: 28px;
    padding: 3px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 10px;
    font-weight: 850;
    cursor: pointer;
  }

  .hc-page-structure-head button {
    border-style: dashed;
  }

  .hc-page-structure-row {
    display: grid;
    grid-template-columns: minmax(0, 620px) auto;
    justify-content: start;
    gap: 10px;
    align-items: center;
    min-height: 34px;
    padding: 4px 6px;
    border: 1px solid #e0e6ed;
    border-radius: 6px;
    background: #ffffff;
  }

  .hc-page-structure-row.fixed {
    background: #f8fafc;
  }

  .hc-page-structure-main {
    display: grid;
    grid-template-columns: 310px 290px;
    gap: 10px;
    align-items: center;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .hc-page-structure-main b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #10151b;
    font-size: 10px;
  }

  .hc-page-structure-main span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #64748b;
    font-size: 9px;
  }

  .hc-page-structure-actions {
    display: flex;
    gap: 4px;
  }

  .hc-page-structure-actions button:disabled {
    opacity: .4;
    cursor: default;
  }

  .hc-page-structure-actions button.remove {
    margin-left: 4px;
  }

  .hc-color-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hc-color-control input[type="color"] {
    width: 46px;
    min-height: 34px;
    padding: 2px;
    cursor: pointer;
  }

  .hc-desk-toolbar {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: rgba(255,255,255,.98);
    backdrop-filter: blur(8px);
  }

  .hc-desk-search {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto;
    gap: 7px;
    align-items: center;
  }

  .hc-desk-search input,
  .hc-desk-bulk select {
    min-height: 34px;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
  }

  .hc-desk-search input {
    padding: 0 10px;
  }

  .hc-desk-search strong {
    color: #64748b;
    font-size: 11px;
  }

  .hc-desk-scope {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .hc-desk-scope button {
    min-height: 28px;
    padding: 3px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #ffffff;
    color: #334155;
    font: inherit;
    font-size: 10px;
    font-weight: 900;
    white-space: nowrap;
    cursor: pointer;
  }

  .hc-desk-scope button.active {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }

  .hc-desk-filters,
  .hc-desk-groups,
  .hc-desk-bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
  }

  .hc-desk-groups label {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    min-height: 27px;
    padding: 3px 7px;
    border: 1px solid #d7dee7;
    border-radius: 999px;
    color: #334155;
    font-size: 10px;
    font-weight: 800;
  }

  .hc-desk-filters button,
  .hc-desk-bulk button,
  .hc-desk-pending button,
  .hc-desk-card button {
    min-height: 28px;
    padding: 4px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .hc-desk-filters button.active,
  .hc-desk-bulk button.primary,
  .hc-desk-pending button.apply {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }

  .hc-desk-bulk {
    padding-top: 6px;
    border-top: 1px solid #edf1f5;
  }

  .hc-desk-bulk strong {
    margin-right: 2px;
    font-size: 11px;
  }

  .hc-desk-bulk select {
    min-width: 230px;
    padding: 0 7px;
  }

  .hc-desk-message {
    margin: 0;
    padding: 5px 8px;
    border-radius: 5px;
    background: #eff6ff;
    color: #1e3a8a;
    font-size: 11px;
    font-weight: 700;
  }

  .hc-desk-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 6px;
    padding: 7px;
  }

  .hc-desk-scroll {
    overflow: visible;
  }

  .hc-desk-inherited {
    margin: 12px;
    border: 1px solid #dccda9;
    border-radius: 8px;
    background: #fffdf7;
  }

  .hc-desk-inherited > summary {
    cursor: pointer;
    padding: 11px 12px;
    color: #5f4a1f;
    font-size: 12px;
    font-weight: 900;
  }

  .hc-desk-inherited > p {
    margin: 0;
    padding: 0 12px 10px;
    color: #746849;
    font-size: 11px;
    line-height: 1.4;
  }

  .hc-desk-inherited-list {
    display: grid;
    border-top: 1px solid #eadfc4;
  }

  .hc-desk-inherited-row {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid #efe7d4;
  }

  .hc-desk-inherited-row:last-child {
    border-bottom: 0;
  }

  .hc-desk-inherited-row img,
  .hc-desk-inherited-row > .hc-desk-image {
    width: 56px;
    height: 42px;
    object-fit: cover;
    border-radius: 4px;
    background: #ece8dd;
  }

  .hc-desk-inherited-row form button {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid #a58c53;
    border-radius: 4px;
    background: #ffffff;
    color: #5f4a1f;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .hc-desk-inherited-row form button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .hc-desk-continuity {
    border-radius: 999px;
    padding: 3px 6px;
    background: #f4efe4;
    color: #775b22 !important;
    font-style: normal;
    font-weight: 900;
  }

  .hc-desk-continuity.revalidated {
    background: #e8f1ec;
    color: #1f6d43 !important;
  }

  .hc-desk-live-bank {
    border-radius: 999px;
    padding: 3px 6px;
    background: #eef2ff;
    color: #4338ca !important;
    font-style: normal;
    font-weight: 900;
  }

  .hc-desk-historical-mark {
    border-radius: 999px;
    padding: 3px 6px;
    background: #ecfdf5;
    color: #047857 !important;
    font-style: normal;
    font-weight: 900;
  }

  .hc-desk-row {
    display: grid;
    grid-template-columns: 18px 22px 56px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    min-height: 64px;
    padding: 6px;
    border: 1px solid #e0e6ed;
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
  }

  .hc-desk-row[draggable="true"] {
    cursor: grab;
  }

  .hc-desk-row.selected {
    border-color: #2563eb;
    box-shadow: inset 3px 0 0 #2563eb;
  }

  .hc-desk-row input {
    width: 15px;
    height: 15px;
  }

  .hc-desk-rank {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #eef2f6;
    color: #94a3b8;
    font-size: 10px;
  }

  .hc-desk-row.selected .hc-desk-rank {
    background: #1d4ed8;
    color: #ffffff;
  }

  .hc-desk-row img,
  .hc-desk-image {
    display: block;
    width: 56px;
    height: 42px;
    border-radius: 4px;
    background: #e9eef4;
    object-fit: cover;
  }

  .hc-desk-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .hc-desk-copy strong {
    overflow: hidden;
    font-size: 13px;
    line-height: 1.14;
    text-overflow: ellipsis;
  }

  .hc-desk-copy small {
    color: #526174;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .02em;
  }

  .hc-desk-meta {
    display: flex;
    gap: 7px;
    align-items: center;
    color: #64748b;
    font-size: 9px;
  }

  .hc-desk-meta em {
    color: #c40012;
    font-style: normal;
    font-weight: 900;
    text-transform: uppercase;
  }

  .hc-desk-map {
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 4px;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 7px 18px rgba(12,22,34,.05);
  }

  .hc-desk-summary {
    position: sticky;
    top: -8px;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: center;
    min-height: 30px;
    padding: 5px 7px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: rgba(255,255,255,.98);
    backdrop-filter: blur(8px);
  }

  .hc-desk-summary div {
    display: flex;
    gap: 4px;
    align-items: baseline;
  }

  .hc-desk-summary span {
    color: #64748b;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .hc-desk-summary strong {
    font-size: 13px;
  }

  .hc-desk-zone {
    display: grid;
    gap: 2px;
    padding: 3px;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #f8fafc;
  }

  .hc-desk-zone > header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }

  .hc-desk-zone h3,
  .hc-desk-zone p {
    margin: 0;
  }

  .hc-desk-zone h3 {
    font-size: 14px;
  }

  .hc-desk-zone p {
    margin-top: 1px;
    color: #64748b;
    font-size: 10px;
  }

  .hc-desk-zone > header > span {
    color: #64748b;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .hc-desk-slots {
    display: grid;
    grid-template-columns: minmax(240px, 1fr);
    gap: 3px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }

  .hc-desk-slots-4 {
    grid-template-columns: repeat(4, minmax(210px, 1fr));
  }

  .hc-desk-slots-5,
  .hc-desk-slots-6 {
    grid-template-columns: repeat(3, minmax(240px, 1fr));
  }

  .hc-desk-slots-faixa {
    grid-auto-flow: column;
    grid-auto-columns: minmax(220px, 1fr);
    grid-template-columns: none;
  }

  .hc-desk-slot {
    min-width: 0;
    min-height: 65px;
    padding: 3px;
    border: 1px dashed #b8c4d2;
    border-radius: 5px;
    background: #ffffff;
  }

  .hc-desk-slot > small {
    display: block;
    margin-bottom: 2px;
    color: #64748b;
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .hc-desk-empty {
    display: grid;
    place-items: center;
    min-height: 48px;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
  }

  .hc-desk-card {
    display: flex;
    gap: 4px;
    align-items: center;
    min-height: 48px;
    padding: 3px;
    border-radius: 5px;
    background: #ffffff;
    box-shadow: 0 2px 7px rgba(15,23,42,.07);
  }

  .hc-desk-card strong {
    display: -webkit-box;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.14;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .hc-desk-card-body {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 4px;
    align-items: center;
    min-width: 0;
  }

  .hc-desk-card-body img,
  .hc-desk-card-image {
    width: 56px;
    height: 42px;
    border-radius: 4px;
    background: #e9eef4;
    object-fit: cover;
  }

  .hc-desk-card-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .hc-desk-card-copy small {
    overflow: hidden;
    color: #64748b;
    font-size: 8px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-desk-card button {
    flex: 0 0 auto;
    min-height: 22px;
    padding: 2px 5px;
    font-size: 9px;
  }

  .hc-desk-card[draggable="true"] {
    position: relative;
    padding-left: 24px;
    cursor: grab;
    user-select: none;
  }

  .hc-desk-card[draggable="true"]:active {
    cursor: grabbing;
  }

  .hc-desk-card[draggable="true"]::before {
    content: "⋮⋮";
    position: absolute;
    top: 7px;
    left: 6px;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -3px;
  }

  .hc-desk-slot[data-drop-active="true"] {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: inset 0 0 0 1px #2563eb;
  }

  .hc-desk-tools {
    display: grid;
    gap: 7px;
  }

  .hc-desk-top-tools {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: 4px;
    width: calc(100vw - 24px);
    max-width: 1920px;
    min-height: 34px;
    margin: 0 calc(50% - 50vw + 12px);
    overflow: visible;
  }

  .hc-desk-top-tools > .hc-desk-tool {
    position: static;
    flex: 1 1 0;
    min-width: 0;
  }

  .hc-desk-top-tools > .hc-desk-tool[open] > .hc-desk-tool-body {
    position: absolute;
    z-index: 40;
    top: calc(100% + 3px);
    right: 0;
    left: 0;
    max-height: min(54dvh, 560px);
    overflow: auto;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    box-shadow: 0 14px 34px rgba(15,23,42,.18);
  }

  .hc-desk-settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .hc-desk-settings label {
    display: grid;
    gap: 3px;
    color: #475569;
    font-size: 10px;
    font-weight: 800;
  }

  .hc-desk-settings input {
    min-width: 0;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    font: inherit;
  }

  .hc-desk-block-order {
    display: grid;
    gap: 4px;
    margin-top: 8px;
  }

  .hc-desk-block-order-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto auto;
    gap: 5px;
    align-items: center;
    padding: 4px 6px;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
  }

  .hc-desk-zone-action {
    display: inline-flex;
    gap: 5px;
    align-items: center;
  }

  .hc-desk-tool {
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #ffffff;
  }

  .hc-desk-tool > summary {
    cursor: pointer;
    min-height: 32px;
    padding: 7px 9px;
    overflow: hidden;
    font-size: 10px;
    font-weight: 900;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .hc-desk-tool-body {
    padding: 8px;
  }

  .hc-desk-pending {
    position: fixed;
    z-index: 50;
    right: 12px;
    bottom: 8px;
    left: 12px;
    display: flex;
    gap: 6px;
    align-items: center;
    max-width: 1920px;
    margin: 0 auto;
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: rgba(255,255,255,.97);
    box-shadow: 0 10px 26px rgba(15,23,42,.16);
    backdrop-filter: blur(10px);
  }

  .hc-desk-pending div {
    display: grid;
    gap: 1px;
    margin-right: auto;
  }

  .hc-desk-pending strong {
    font-size: 12px;
  }

  .hc-desk-pending span {
    color: #64748b;
    font-size: 9px;
  }

  .hc-desk-pending button:disabled,
  .hc-desk-bulk button:disabled,
  .hc-desk-selection-actions button:disabled {
    opacity: .45;
    cursor: default;
  }

  .hc-desk-toolbar {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: 5px;
    align-items: center;
    min-height: 42px;
    padding: 4px 6px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }

  .hc-desk-toolbar.selection-mode {
    min-height: 38px;
    overflow-x: visible;
    overscroll-behavior-inline: auto;
  }

  .hc-desk-selection-actions {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    gap: 5px;
    align-items: center;
    min-width: 0;
  }

  .hc-desk-selection-actions strong {
    margin-right: 2px;
    font-size: 11px;
    white-space: nowrap;
  }

  .hc-desk-selection-actions button {
    min-height: 28px;
    padding: 3px 7px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }

  .hc-desk-scope {
    order: 0;
    flex: 0 0 auto;
  }

  .hc-desk-classification,
  .hc-desk-order {
    order: 1;
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    align-items: center;
    min-width: 0;
    color: #475569;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .hc-desk-classification select,
  .hc-desk-order select {
    min-height: 28px;
    max-width: 190px;
    padding: 0 24px 0 7px;
    border: 1px solid #d8e0e9;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 10px;
    text-transform: none;
    white-space: nowrap;
  }

  .hc-desk-bulk {
    order: 6;
    display: flex;
    flex: 0 0 auto;
    gap: 5px;
    align-items: center;
    min-width: max-content;
    padding-top: 0;
    border-top: 0;
  }

  .hc-desk-bulk strong {
    margin-right: 0;
    white-space: nowrap;
  }

  .hc-desk-search {
    order: 3;
    display: block;
    flex: 1 1 240px;
    align-items: center;
    min-width: 150px;
  }

  .hc-desk-search input {
    width: 100%;
    min-height: 28px;
  }

  .hc-desk-message {
    order: 7;
    flex: 0 0 auto;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-desk-order {
    order: 4;
  }

  .hc-desk-result-count {
    order: 5;
    flex: 0 0 auto;
    color: #334155;
    font-size: 10px;
    white-space: nowrap;
  }

  /*
   * A barra superior já identifica a área ativa.
   * Na área de trabalho, o cabeçalho da zona só reaparece
   * quando contém uma ação operacional de colocação em lote.
   */
  .hc-desk-zone > header:not(:has(button)) {
    display: none;
  }

  .hc-desk-zone > header:has(button) {
    display: flex;
    justify-content: flex-end;
    min-height: 0;
    margin: 0 0 4px;
    padding: 0;
    border: 0;
  }

  .hc-desk-zone > header:has(button) > div {
    display: none;
  }

  .hc-desk-zone > header:has(button) > span {
    display: flex;
    gap: 4px;
    align-items: center;
    margin: 0;
    font-size: 0;
  }

  .hc-desk-zone > header:has(button) > span > button {
    min-height: 26px;
    padding: 3px 7px;
    font-size: 10px;
  }
  .hc-dynamic-zone-editor {
    align-items: center;
    padding: 2px 4px;
  }

  .hc-dynamic-zone-editor label {
    gap: 0;
  }
  @media (max-width: 1180px) {
    .hc-page-structure-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .hc-page-structure-main {
      grid-template-columns: minmax(180px, .8fr) minmax(0, 1fr);
    }

    .hc-desk-toolbar {
      flex-wrap: nowrap;
    }

    .hc-desk-search {
      flex: 1 1 200px;
      min-width: 150px;
    }
    .hc-desk-top-tools {
      width: 100%;
      margin: 0;
    }

    .hc-desk-workspace {
      width: 100%;
      margin: 0;
    }

    .hc-desk-list {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    }

  }

  @media (max-width: 720px) {
    .hc-desk-top-tools,
    .hc-desk-settings,
    .hc-dynamic-zone-editor:not(.has-selection) {
      grid-template-columns: 1fr;
    }

    .hc-dynamic-zone-editor.has-selection {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .hc-dynamic-zone-editor.has-selection label:first-child {
      grid-column: 1 / -1;
    }

    .hc-desk-selection-actions {
      flex-wrap: wrap;
    }

    .hc-desk-row {
      grid-template-columns: 18px 22px minmax(0,1fr);
    }

    .hc-desk-row img,
    .hc-desk-image {
      display: none;
    }

    .hc-desk-pending {
      flex-wrap: wrap;
    }

    .hc-desk-pending div {
      flex: 1 1 100%;
    }
  }

  /* Mesa histórica modernizada: rail, zona ativa e candidatos independentes. */
  .hc-desk-shell {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    gap: 4px;
  }

  .hc-focus-bar {
    display: flex;
    min-width: 0;
    min-height: 34px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 8px;
    border-radius: 7px;
    background: #101820;
    color: #ffffff;
  }

  .hc-focus-bar[hidden] {
    display: none;
  }

  .hc-focus-bar h1 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-focus-toggle {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 4px 9px;
    border: 1px solid #657588;
    border-radius: 5px;
    background: #253241;
    color: #ffffff;
    font: inherit;
    font-size: 10px;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
  }

  .hc-focus-toggle:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }

  .hc-desk-top-tools > .hc-focus-entry {
    justify-self: end;
    margin-left: 12px;
  }

  .hc-desk-top-tools {
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(4, max-content) minmax(0, 1fr);
    align-items: center;
    gap: 0;
    min-height: 38px;
    padding: 3px;
    overflow: visible;
    border: 1px solid #d7e0e9;
    border-radius: 7px;
    background: #ffffff;
  }

  .hc-desk-top-tools > .hc-desk-tool {
    position: relative;
    min-width: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .hc-desk-top-tools > .hc-desk-tool[open] {
    z-index: 2;
  }

  .hc-desk-top-tools > .hc-desk-tool > summary {
    display: flex;
    min-height: 30px;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border-radius: 4px;
    color: #334155;
    cursor: pointer;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .055em;
    list-style: none;
    text-transform: uppercase;
    user-select: none;
    white-space: nowrap;
  }

  .hc-desk-top-tools > .hc-desk-tool > summary::-webkit-details-marker {
    display: none;
  }

  .hc-desk-top-tools > .hc-desk-tool > summary::after {
    width: 5px;
    height: 5px;
    border-right: 1px solid currentColor;
    border-bottom: 1px solid currentColor;
    content: "";
    opacity: .6;
    transform: rotate(45deg) translateY(-1px);
    transition: transform .14s ease;
  }

  .hc-desk-top-tools > .hc-desk-tool[open] > summary {
    background: #edf2f6;
    color: #172331;
    box-shadow: inset 0 -2px 0 #526173;
  }

  .hc-desk-top-tools > .hc-desk-tool[open] > summary::after {
    transform: rotate(225deg) translate(-1px, -1px);
  }

  .hc-desk-top-tools > .hc-desk-tool + .hc-desk-tool > summary {
    border-left: 1px solid #e1e7ed;
  }

  .hc-desk-top-tools > .hc-desk-tool[open] > .hc-desk-tool-body {
    position: absolute;
    z-index: 40;
    top: calc(100% + 5px);
    right: auto;
    left: 0;
    width: clamp(660px, 50vw, 760px);
    max-width: calc(100vw - 24px);
    max-height: min(72vh, 720px);
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid #ccd6e0;
    border-radius: 7px;
    background: #ffffff;
    box-shadow: 0 9px 24px rgba(15, 23, 42, .11);
  }

  .hc-desk-video-tool[open] > .hc-desk-tool-body {
    width: clamp(420px, 50vw, 720px);
  }

  .hc-desk-publish-tool[open] > .hc-desk-tool-body {
    width: clamp(360px, 38vw, 540px);
  }

  .hc-desk-preview-tool[open] > .hc-desk-tool-body {
    right: 0;
    left: auto;
    width: min(1200px, calc(100vw - 24px));
  }

  .hc-desk-shell[data-focus-mode="true"] .hc-desk-top-tools {
    display: grid;
  }

  .hc-desk-shell[data-focus-mode="true"] .hc-focus-entry {
    display: none;
  }

  .composition-admin-shell-desk:has(> .hc-desk-shell[data-focus-mode="true"]) > :is(
    .composition-admin-hero,
    .composition-context-selector
  ) {
    display: none;
  }

  .hc-desk-workspace {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(145px, 170px) minmax(0, 1.08fr) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0 6px;
    min-height: 0;
    width: calc(100vw - 24px);
    max-width: 1920px;
    margin: 0 calc(50% - 50vw + 12px);
    overflow: hidden;
  }

  .hc-zone-rail {
    display: grid;
    grid-column: 1;
    grid-row: 1 / 3;
    min-width: 0;
    min-height: 0;
    align-content: start;
    gap: 7px;
    padding: 7px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    border: 1px solid #273444;
    border-radius: 8px;
    background: #101820;
    color: #ffffff;
  }

  .hc-zone-rail-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    color: #aebdcb;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .09em;
    text-transform: uppercase;
  }

  .hc-zone-tabs {
    display: grid;
    gap: 4px;
    padding: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .hc-zone-tabs button {
    display: grid;
    min-width: 0;
    min-height: 43px;
    align-content: center;
    gap: 2px;
    padding: 6px 8px;
    overflow: hidden;
    border: 1px solid #3a4858;
    border-radius: 6px;
    background: #18232f;
    color: #ffffff;
    text-align: left;
  }

  .hc-zone-tabs button strong,
  .hc-zone-tabs button small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-zone-tabs button strong {
    font-size: 11px;
  }

  .hc-zone-tabs button small {
    color: #9fb0c0;
    font-size: 8px;
    font-weight: 850;
  }

  .hc-zone-tabs button.active {
    border-color: #ff5c65;
    background: #8f1f29;
    color: #ffffff;
    box-shadow: inset 3px 0 #ff5c65;
  }

  .hc-zone-tabs button.active small {
    color: #ffe4e6;
  }

  .hc-zone-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
    border: 1px solid #3a4858;
    border-radius: 6px;
    background: #18232f;
  }

  .hc-zone-row.active {
    border-color: #ff5c65;
    box-shadow: inset 3px 0 #ff5c65;
  }

  .hc-zone-row.reorder-selected {
    outline: 2px solid #93c5fd;
    outline-offset: -2px;
  }

  .hc-zone-select {
    display: grid;
    place-items: center;
    border-right: 1px solid #3a4858;
    cursor: pointer;
  }

  .hc-zone-select input {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: #ff5c65;
  }

  .hc-zone-row.reorder-selected .hc-zone-select {
    background: #455970;
  }

  .hc-zone-tabs .hc-zone-focus {
    display: grid;
    min-width: 0;
    min-height: 41px;
    align-content: center;
    gap: 2px;
    padding: 6px 7px;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #ffffff;
    text-align: left;
    cursor: pointer;
  }

  .hc-zone-tabs .hc-zone-focus strong,
  .hc-zone-tabs .hc-zone-focus small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-zone-tabs .hc-zone-focus small {
    color: #9fb0c0;
  }

  .hc-zone-move-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    padding-top: 3px;
    border-top: 1px solid #344252;
  }

  .hc-zone-move-controls button {
    display: grid;
    min-height: 44px;
    place-items: center;
    gap: 1px;
    border: 1px solid #657588;
    border-radius: 7px;
    background: #253241;
    color: #ffffff;
    font: inherit;
    font-size: 9px;
    font-weight: 900;
    cursor: pointer;
  }

  .hc-zone-move-controls button span {
    font-size: 17px;
    line-height: 1;
  }

  .hc-zone-move-controls button:disabled {
    cursor: default;
    opacity: .32;
  }

  .hc-desk-operational-sticky {
    display: contents;
  }

  .hc-desk-map {
    grid-column: 2;
    grid-row: 1 / 3;
    min-width: 0;
    min-height: 0;
    align-content: start;
    gap: 5px;
    padding: 5px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
  }

  .hc-desk-map:focus-visible,
  .hc-desk-scroll:focus-visible {
    outline: 2px solid #526174;
    outline-offset: -2px;
  }

  .hc-desk-map-heading {
    position: sticky;
    top: -5px;
    z-index: 8;
    display: flex;
    min-width: 0;
    min-height: 38px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 7px;
    border-radius: 6px;
    background: #101820;
    color: #ffffff;
  }

  .hc-desk-map-heading div {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .hc-desk-map-heading span,
  .hc-desk-map-heading small {
    color: #bac8d5;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .hc-desk-map-heading strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-desk-library {
    display: flex;
    grid-column: 3;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    margin-top: 0;
    overflow: hidden;
    border-top: 0;
    border-radius: 0 0 8px 8px;
  }

  .hc-desk-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .hc-desk-toolbar {
    display: grid;
    grid-column: 3;
    grid-row: 1;
    min-width: 0;
    min-height: 0;
    align-items: stretch;
    gap: 5px;
    padding: 7px;
    overflow: visible;
    border: 1px solid #263342;
    border-radius: 8px 8px 0 0;
    background: #101820;
    color: #ffffff;
  }

  .hc-desk-toolbar.selection-mode {
    min-height: 0;
    overflow: visible;
  }

  .hc-desk-scope {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    order: initial;
  }

  .hc-desk-scope button {
    min-width: 0;
    min-height: 31px;
    padding: 4px 5px;
    overflow: hidden;
    border: 1px solid #526174;
    border-radius: 5px;
    background: #1b2734;
    color: #dce5ed;
    font-size: 9px;
    text-overflow: ellipsis;
  }

  .hc-desk-scope button.active {
    border-color: #ff5c65;
    background: #a52530;
    color: #ffffff;
  }

  .hc-desk-filter-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;
    min-width: 0;
    align-items: center;
  }

  .hc-desk-groups {
    display: flex;
    min-width: 0;
    flex-wrap: nowrap;
    gap: 3px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .hc-desk-groups button {
    flex: 0 0 auto;
    min-height: 25px;
    padding: 3px 6px;
    border: 1px solid #465669;
    border-radius: 999px;
    background: transparent;
    color: #cbd5e1;
    font: inherit;
    font-size: 8px;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
  }

  .hc-desk-groups button.active {
    border-color: #ffffff;
    background: #ffffff;
    color: #101820;
  }

  .hc-desk-candidate-actions {
    display: flex;
    gap: 4px;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
  }

  .hc-desk-search {
    display: block;
    min-width: 0;
    order: initial;
  }

  .hc-desk-search input {
    width: 100%;
    min-width: 0;
    min-height: 28px;
    padding: 0 7px;
    border: 1px solid #4b5b6e;
    border-radius: 5px;
    background: #ffffff;
    color: #101820;
  }

  .hc-desk-search-toggle {
    display: grid;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    place-items: center;
    padding: 0;
    border: 1px solid #bac7d4;
    border-radius: 5px;
    background: #ffffff;
    color: #243244;
    cursor: pointer;
  }

  .hc-desk-search-toggle[data-query-active="true"] {
    border-color: #ff5c65;
    background: #a52530;
    color: #ffffff;
  }

  .hc-desk-visible-selection {
    min-height: 28px;
    padding: 4px 6px;
    border: 1px solid #bac7d4;
    border-radius: 5px;
    background: #ffffff;
    color: #243244;
    font: inherit;
    font-size: 9px;
    font-weight: 900;
    white-space: nowrap;
    cursor: pointer;
  }

  .hc-desk-visible-selection:disabled {
    cursor: default;
    opacity: .45;
  }

  .hc-desk-bulk-context {
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    width: calc(100vw - 24px);
    max-width: 1920px;
    margin: 0 calc(50% - 50vw + 12px);
    padding: 7px 9px;
    border: 1px solid #9fb2c5;
    border-radius: 7px;
    background: #ffffff;
    box-shadow: 0 5px 16px rgba(15, 23, 42, .09);
  }

  .hc-desk-bulk-context > strong {
    font-size: 10px;
  }

  .hc-desk-selection-actions {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .hc-desk-selection-actions strong {
    color: #334155;
    font-size: 9px;
  }

  .hc-desk-selection-actions button {
    min-height: 25px;
    padding: 3px 6px;
    border: 1px solid #bac7d4;
    border-radius: 5px;
    background: #ffffff;
    color: #243244;
    font: inherit;
    font-size: 9px;
    font-weight: 850;
    cursor: pointer;
  }

  .hc-desk-feedback {
    flex: 0 0 auto;
    width: calc(100vw - 24px);
    max-width: none;
    margin: 0 calc(50% - 50vw + 12px);
    overflow: visible;
    white-space: normal;
    order: initial;
  }

  .hc-desk-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-content: start;
    gap: 5px;
    padding: 6px;
  }

  .hc-desk-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    min-width: 0;
    min-height: 0;
    align-content: start;
    padding: 6px;
    overflow: hidden;
    border-radius: 7px;
    cursor: grab;
  }

  .hc-desk-row:active {
    cursor: grabbing;
  }

  .hc-desk-row-image {
    position: relative;
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 5px;
    background: #dce4ed;
  }

  .hc-desk-row-image > img,
  .hc-desk-row-image > .hc-desk-image {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 0;
    object-fit: cover;
  }

  .hc-desk-row-image > input {
    position: absolute;
    z-index: 2;
    top: 9px;
    left: 9px;
    width: 17px;
    height: 17px;
    margin: 0;
    accent-color: #e43e48;
    outline: 2px solid #ffffff;
    outline-offset: 1px;
    box-shadow: 0 0 0 4px rgba(15, 23, 42, .45);
  }

  .hc-desk-rank {
    position: absolute;
    z-index: 2;
    top: 7px;
    right: 7px;
    width: 22px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, .8);
    background: rgba(16, 24, 32, .82);
    color: #ffffff;
  }

  .hc-desk-row.selected .hc-desk-rank {
    background: #a52530;
  }

  .hc-desk-copy {
    gap: 4px;
  }

  .hc-desk-copy strong {
    display: -webkit-box;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.28;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .hc-desk-meta {
    flex-wrap: wrap;
    gap: 3px;
    font-size: 8px;
  }

  .hc-desk-meta em {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thematic-classification-badge {
    display: inline-flex;
    flex: 0 0 auto;
    height: 13px;
    align-items: center;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: #e2e8f0;
    color: #000;
    font-size: 9px;
    font-style: normal;
    font-weight: 800;
    line-height: 11px;
    white-space: nowrap;
  }

  .thematic-classification-badge[data-classification="unclassified"] {
    background: #fde047;
  }

  .thematic-classification-badge[data-classification="benfica"] {
    background: #ef4444;
  }

  .thematic-classification-badge[data-classification="sporting"] {
    background: #15803d;
    color: #fff;
  }

  .thematic-classification-badge[data-classification="fc_porto"] {
    background: #1d4ed8;
    color: #fff;
  }

  .thematic-classification-badge[data-classification="other_liga_clubs"] {
    border-color: #000;
    background: #fff;
  }

  .hc-desk-zone {
    min-width: 0;
    gap: 5px;
    padding: 5px;
  }

  .hc-desk-slots,
  .hc-desk-slots-4,
  .hc-desk-slots-5,
  .hc-desk-slots-6,
  .hc-desk-slots-faixa {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-flow: row;
    grid-auto-columns: auto;
    gap: 5px;
    overflow: visible;
  }

  .hc-desk-slot {
    display: flex;
    min-width: 0;
    min-height: 162px;
    flex-direction: column;
    padding: 4px;
  }

  .hc-desk-slot > .hc-desk-card,
  .hc-desk-slot > .hc-desk-empty {
    flex: 1 1 auto;
  }

  .hc-desk-card,
  .hc-desk-card[draggable="true"] {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 0;
    align-content: start;
    gap: 5px;
    padding: 5px;
  }

  .hc-desk-card-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 5px;
    align-items: start;
  }

  .hc-desk-card-media {
    display: block;
    width: 100%;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 5px;
    background: #dce4ed;
  }

  .hc-desk-card-media > img,
  .hc-desk-card-media > .hc-desk-card-image {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 0;
    object-fit: cover;
  }

  .hc-desk-card button {
    position: absolute;
    z-index: 3;
    top: 9px;
    right: 9px;
    min-height: 24px;
    border-color: #d7e0e9;
    background: rgba(255, 255, 255, .96);
    box-shadow: 0 2px 8px rgba(15, 23, 42, .18);
  }

  .hc-desk-card[draggable="true"]::before {
    z-index: 3;
    top: 11px;
    left: 10px;
    padding: 3px 5px;
    border-radius: 4px;
    background: rgba(16, 24, 32, .82);
    color: #ffffff;
  }

  .hc-desk-card-copy strong {
    font-size: 12px;
  }

  .hc-desk-card-top {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
  }

  .hc-faixa-title-editor {
    display: grid;
    width: min(420px, 100%);
    gap: 3px;
    padding: 4px;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    background: #fbfcfd;
    color: #5f6e80;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .hc-faixa-title-editor span {
    letter-spacing: .04em;
  }

  .hc-faixa-title-editor input {
    width: 100%;
    min-width: 0;
    min-height: 30px;
    padding: 0 7px;
    border: 1px solid #cbd5df;
    border-radius: 5px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
    text-transform: none;
  }

  @media (min-width: 1181px) {
    .composition-admin-shell-desk {
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
    }

    .composition-admin-shell-desk > .hc-desk-shell {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  @media (max-width: 1180px) {
    .hc-desk-shell {
      overflow: visible;
    }

    .hc-desk-workspace {
      grid-template-columns: minmax(140px, 170px) minmax(0, 1fr);
      grid-template-rows: auto auto minmax(360px, 70dvh);
      width: 100%;
      margin: 0;
      overflow: visible;
    }

    .hc-desk-bulk-context,
    .hc-desk-feedback {
      width: 100%;
      margin: 0;
    }

    .hc-zone-rail {
      grid-column: 1;
      grid-row: 1;
      max-height: 70dvh;
    }

    .hc-desk-map {
      grid-column: 2;
      grid-row: 1;
      max-height: none;
      overflow: visible;
    }

    .hc-desk-toolbar {
      grid-column: 1 / 3;
      grid-row: 2;
      margin-top: 6px;
    }

    .hc-desk-library {
      grid-column: 1 / 3;
      grid-row: 3;
    }
  }

  @media (max-width: 760px) {
    .hc-desk-top-tools,
    .hc-desk-shell[data-focus-mode="true"] .hc-desk-top-tools {
      display: flex;
      flex-wrap: wrap;
    }

    .hc-desk-top-tools > .hc-desk-tool {
      position: static;
      flex: 0 0 auto;
    }

    .hc-desk-top-tools > .hc-focus-entry {
      margin-left: auto;
    }

    .hc-desk-top-tools > .hc-desk-tool[open] > .hc-desk-tool-body {
      top: calc(100% + 5px);
      right: 3px;
      left: 3px;
      width: auto;
      max-width: none;
      max-height: calc(100vh - 80px);
    }

    .hc-desk-workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto auto minmax(360px, 70dvh);
    }

    .hc-zone-rail,
    .hc-desk-map,
    .hc-desk-toolbar,
    .hc-desk-library {
      grid-column: 1;
    }

    .hc-zone-rail {
      grid-row: 1;
      max-height: none;
      overflow: visible;
    }

    .hc-zone-tabs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hc-desk-map {
      grid-row: 2;
    }

    .hc-desk-toolbar {
      grid-row: 3;
    }

    .hc-desk-library {
      grid-row: 4;
    }

    .hc-desk-filter-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .hc-desk-list,
    .hc-desk-slots,
    .hc-desk-slots-4,
    .hc-desk-slots-5,
    .hc-desk-slots-6,
    .hc-desk-slots-faixa {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .hc-zone-tabs,
    .hc-desk-list,
    .hc-desk-slots,
    .hc-desk-slots-4,
    .hc-desk-slots-5,
    .hc-desk-slots-6,
    .hc-desk-slots-faixa {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

function ClassificationBadge({
  classificationKey,
}: Readonly<{
  classificationKey: string | null;
}>) {
  const key = isArticleClassificationKey(classificationKey)
    ? classificationKey
    : null;
  const label = key
    ? articleClassificationLabel(key)
    : "Sem classificação";

  return (
    <span
      className="thematic-classification-badge"
      data-classification={key ?? "unclassified"}
      title={`Classificação editorial: ${label}`}
    >
      {label}
    </span>
  );
}

function identity(card: TargetCard | null) {
  if (!card) return "";
  if (card.bankItemId) return `bank:${card.bankItemId}`;
  return card.persistedId ? `persisted:${card.persistedId}` : "";
}

function initialDynamicZonePlan(
  zones: HierarchicalCompositionDeskDynamicZone[],
): DynamicZonePlan[] {
  return zones
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((zone, index) => {
      const items: Record<number, TargetCard | null> = {};
      const capacity = HISTORICAL_DYNAMIC_ZONE_LAYOUTS[zone.visualFamily].capacity;
      for (let position = 1; position <= capacity; position += 1) items[position] = null;
      zone.items.forEach((item) => {
        if (item.position < 1 || item.position > capacity) return;
        items[item.position] = { persistedId: item.id, bankItemId: item.bankItemId, title: item.title };
      });
      const publicTitle = /^Zona editorial \d+$/i.test(zone.publicTitle.trim())
        ? `Zona editorial ${index + 1}`
        : zone.publicTitle;
      return { clientId: zone.id, persistedId: zone.id, publicTitle, visualFamily: zone.visualFamily, items };
    });
}

function dynamicZonesFingerprint(zones: DynamicZonePlan[]) {
  return JSON.stringify(zones.map((zone) => ({
    publicTitle: zone.publicTitle.trim(),
    visualFamily: zone.visualFamily,
    items: historicalDynamicZonePositions(zone.visualFamily).map((position) => zone.items[position.position]?.bankItemId ?? null),
  })));
}

function initialPlan(
  slots: HierarchicalCompositionDeskSlot[],
  auxiliaryItems: HierarchicalCompositionDeskAuxiliary[],
  editorial: HierarchicalCompositionDeskEditorial,
  settings: CompositionSettings,
  dynamicZones: HierarchicalCompositionDeskDynamicZone[],
): PlanState {
  const slotState: Record<string, TargetCard | null> = {};

  HIERARCHICAL_COMPOSITION_DESK_SECTIONS.forEach((section) => {
    section.slots.forEach((slot) => {
      slotState[slot.key] = null;
    });
  });

  slots.forEach((slot) => {
    slotState[slot.slotKey] = {
      persistedId: slot.id,
      bankItemId: slot.bankItemId,
      title: slot.title,
    };
  });

  const auxiliary: Record<string, TargetCard | null> = {
    editorial: editorial.title
      ? {
          persistedId: editorial.bankItemId ? null : "legacy-editorial",
          bankItemId: editorial.bankItemId,
          title: editorial.title,
        }
      : null,
    video_highlight: null,
  };

  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.forEach((position) => {
    auxiliary[`beyond_matchday_${position.sortOrder}`] = null;
  });

  for (let position = 1; position <= 10; position += 1) {
    auxiliary[`faixa_${position}`] = null;
  }

  auxiliaryItems.forEach((item) => {
    auxiliary[item.target] = {
      persistedId: item.id,
      bankItemId: item.bankItemId,
      title: item.title,
    };
  });

  return {
    slots: slotState,
    auxiliary,
    dynamicZones: initialDynamicZonePlan(dynamicZones),
    settings,
  };
}

function samePlan(left: PlanState, right: PlanState) {
  return Object.keys(left.slots).every(
    (key) =>
      identity(left.slots[key] ?? null) ===
      identity(right.slots[key] ?? null),
  ) && Object.keys(left.auxiliary).every(
    (key) =>
      identity(left.auxiliary[key] ?? null) ===
      identity(right.auxiliary[key] ?? null),
  )
    && left.settings.headlineTitleColor === right.settings.headlineTitleColor
    && left.settings.zone1Title === right.settings.zone1Title
    && left.settings.zone2Title === right.settings.zone2Title
    && left.settings.faixaTitle === right.settings.faixaTitle
    && left.settings.blockOrder.join("|") === right.settings.blockOrder.join("|")
    && left.settings.videoPosition === right.settings.videoPosition
    && dynamicZonesFingerprint(left.dynamicZones) === dynamicZonesFingerprint(right.dynamicZones);
}

function DynamicZoneTitleInput({
  clientId,
  value,
  onCommit,
}: {
  clientId: string;
  value: string;
  onCommit: (clientId: string, publicTitle: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      aria-label="Título público da zona editorial"
      maxLength={120}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(clientId, draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export default function HierarchicalCompositionDeskClient({
  articles,
  auxiliaryItems,
  children,
  compositionId,
  editorial,
  groups,
  initialDynamicZones,
  initialBlockOrder,
  initialFaixaTitle,
  initialHeadlineTitleColor,
  initialVideoPosition,
  initialZone1Title,
  initialZone2Title,
  matchdayId,
  matchdayNumber,
  returnTo,
  slots,
}: Props) {
  const router = useRouter();
  const initialSettings = {
    headlineTitleColor: initialHeadlineTitleColor,
    zone1Title: initialZone1Title,
    zone2Title: initialZone2Title,
    faixaTitle: initialFaixaTitle,
    blockOrder: initialBlockOrder,
    videoPosition: initialVideoPosition,
  } satisfies CompositionSettings;
  const [basePlan] = useState(() =>
    initialPlan(slots, auxiliaryItems, editorial, initialSettings, initialDynamicZones),
  );
  const [plan, setPlan] = useState(() =>
    initialPlan(slots, auxiliaryItems, editorial, initialSettings, initialDynamicZones),
  );
  const [history, setHistory] = useState<PlanState[]>([]);
  const [selectedBankItemIds, setSelectedBankItemIds] =
    useState<string[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [search, setSearch] = useState("");
  const [candidateSearchOpen, setCandidateSearchOpen] = useState(false);
  const candidateSearchToggleRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [isBatchMutating, setIsBatchMutating] = useState(false);
  const [dragged, setDragged] = useState<DragState | null>(null);
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<string>(
    () => initialDynamicZones[0] ? `dynamic:${initialDynamicZones[0].id}` : "opening",
  );
  const [selectedReorderBlockKey, setSelectedReorderBlockKey] =
    useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const enterFocusButtonRef = useRef<HTMLButtonElement>(null);
  const exitFocusButtonRef = useRef<HTMLButtonElement>(null);

  const articleByBankId = useMemo(
    () =>
      new Map(
        articles.map(
          (article) =>
            [article.bankItemId, article] as const,
        ),
      ),
    [articles],
  );

  const selectionRank = useMemo(
    () =>
      new Map(
        selectedBankItemIds.map(
          (bankItemId, index) =>
            [bankItemId, index + 1] as const,
        ),
      ),
    [selectedBankItemIds],
  );

  function toggleSelection(
    bankItemId: string,
    checked: boolean,
  ) {
    setSelectedBankItemIds((current) => {
      if (checked) {
        return current.includes(bankItemId)
          ? current
          : [...current, bankItemId];
      }

      return current.filter(
        (id) => id !== bankItemId,
      );
    });
  }

  const placementByBankItem = useMemo(() => {
    const result = new Map<string, string>();

    const editorialCard = plan.auxiliary.editorial;
    if (editorialCard?.bankItemId) {
      result.set(editorialCard.bankItemId, "Editorial da Jornada");
    }

    HIERARCHICAL_COMPOSITION_DESK_SECTIONS.forEach(
      (section) => {
        section.slots.forEach((slot) => {
          const card = plan.slots[slot.key];

          if (card?.bankItemId) {
            result.set(
              card.bankItemId,
              `${section.title} · ${slot.label}`,
            );
          }
        });
      },
    );

    const highlight = plan.auxiliary.video_highlight;

    if (highlight?.bankItemId) {
      result.set(
        highlight.bankItemId,
        "Destaque da Jornada",
      );
    }

    HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.forEach(
      (position) => {
        const card =
          plan.auxiliary[
            `beyond_matchday_${position.sortOrder}`
          ];

        if (card?.bankItemId) {
          result.set(
            card.bankItemId,
            `Para Lá · ${position.label}`,
          );
        }
      },
    );

    plan.dynamicZones.forEach((zone) => {
      historicalDynamicZonePositions(zone.visualFamily).forEach((position) => {
        const card = zone.items[position.position];
        if (card?.bankItemId) result.set(card.bankItemId, `${zone.publicTitle} · ${position.label}`);
      });
    });

    for (let position = 1; position <= 10; position += 1) {
      const card =
        plan.auxiliary[`faixa_${position}`];

      if (card?.bankItemId) {
        result.set(
          card.bankItemId,
          `Faixa de notícias · posição ${position}`,
        );
      }
    }


    return result;
  }, [plan]);

  const placedBankItemIds = useMemo(
    () => new Set(placementByBankItem.keys()),
    [placementByBankItem],
  );

  const [historicalDecisionFilter, setHistoricalDecisionFilter] =
    useState<HistoricalCompositionDecisionFilter>("all");

  const selectedGroupKeys = useMemo(
    () => selectedGroupKey
      ? new Set([selectedGroupKey])
      : new Set<string>(),
    [selectedGroupKey],
  );

  const historicalDecisionCounts = useMemo(
    () => historicalCompositionDecisionCounts(
      articles,
      placedBankItemIds,
      selectedGroupKeys,
      search,
    ),
    [articles, placedBankItemIds, search, selectedGroupKeys],
  );

  const classificationCounts = useMemo(
    () => historicalCompositionClassificationCounts(
      articles,
      placedBankItemIds,
      search,
      historicalDecisionFilter,
    ),
    [articles, historicalDecisionFilter, placedBankItemIds, search],
  );

  const filteredArticles = useMemo(
    () => filterHistoricalCompositionReservoir(
      articles,
      placedBankItemIds,
      selectedGroupKeys,
      search,
      historicalDecisionFilter,
    ),
    [articles, historicalDecisionFilter, placedBankItemIds, search, selectedGroupKeys],
  );

  const visibleArticles = useMemo(
    () => [...filteredArticles].sort((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : null;
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : null;

      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return rightTime - leftTime;
    }),
    [filteredArticles],
  );

  const selectedArticles = useMemo(
    () => selectedBankItemIds
      .map((bankItemId) => articleByBankId.get(bankItemId))
      .filter((article): article is HierarchicalCompositionDeskArticle => Boolean(article)),
    [articleByBankId, selectedBankItemIds],
  );
  const selectedHistoricalDecision = selectedArticles.length > 0
    && selectedArticles.length === selectedBankItemIds.length
    && selectedArticles.every(
      (article) => article.historicalDecision === selectedArticles[0]?.historicalDecision,
    )
    ? selectedArticles[0].historicalDecision
    : null;

  const inheritedAvailableArticles = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

    return articles.filter((article) => {
      if (article.historicalEligible || placedBankItemIds.has(article.bankItemId)) return false;
      if (
        selectedGroupKey
        && (article.naturalGroupKey ?? HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY) !== selectedGroupKey
      ) {
        return false;
      }
      return !normalizedSearch
        || article.title.toLocaleLowerCase("pt-PT").includes(normalizedSearch)
        || (article.label ?? "").toLocaleLowerCase("pt-PT").includes(normalizedSearch);
    });
  }, [articles, placedBankItemIds, search, selectedGroupKey]);

  const pendingCount = useMemo(() => {
    let count = 0;

    Object.keys(basePlan.slots).forEach((key) => {
      if (
        identity(basePlan.slots[key] ?? null) !==
        identity(plan.slots[key] ?? null)
      ) {
        count += 1;
      }
    });

    Object.keys(basePlan.auxiliary).forEach((key) => {
      if (
        identity(basePlan.auxiliary[key] ?? null) !==
        identity(plan.auxiliary[key] ?? null)
      ) {
        count += 1;
      }
    });

    if (basePlan.settings.headlineTitleColor !== plan.settings.headlineTitleColor) count += 1;
    if (basePlan.settings.zone1Title !== plan.settings.zone1Title) count += 1;
    if (basePlan.settings.zone2Title !== plan.settings.zone2Title) count += 1;
    if (basePlan.settings.faixaTitle !== plan.settings.faixaTitle) count += 1;
    if (basePlan.settings.blockOrder.join("|") !== plan.settings.blockOrder.join("|")) count += 1;
    if (basePlan.settings.videoPosition !== plan.settings.videoPosition) count += 1;
    if (dynamicZonesFingerprint(basePlan.dynamicZones) !== dynamicZonesFingerprint(plan.dynamicZones)) count += 1;

    return count;
  }, [basePlan, plan]);

  useEffect(() => {
    if (pendingCount === 0) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);

    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [pendingCount]);

  function commit(next: PlanState, nextMessage: string) {
    if (samePlan(next, plan)) {
      setMessage(nextMessage);
      return;
    }

    setHistory((items) => [...items, plan]);
    setPlan(next);
    setMessage(nextMessage);
  }

  function commitDynamicZones(dynamicZones: DynamicZonePlan[], nextMessage: string) {
    commit({ ...plan, dynamicZones }, nextMessage);
  }

  function renumberAutomaticDynamicZoneTitles(dynamicZones: DynamicZonePlan[]) {
    return dynamicZones.map((zone, index) => ({
      ...zone,
      publicTitle: /^Zona editorial \d+$/i.test(zone.publicTitle.trim())
        ? `Zona editorial ${index + 1}`
        : zone.publicTitle,
    }));
  }

  function bodyBlockKeys(
    dynamicZones: DynamicZonePlan[],
    videoPosition: number,
  ) {
    const keys = dynamicZones.map((zone) => `dynamic:${zone.clientId}`);
    const safeVideoPosition = Math.min(
      Math.max(videoPosition, 0),
      dynamicZones.length,
    );
    keys.splice(safeVideoPosition, 0, "video");
    return keys;
  }

  function moveBodyBlock(
    blockKey: string,
    direction: "up" | "down",
  ) {
    const keys = bodyBlockKeys(
      plan.dynamicZones,
      plan.settings.videoPosition,
    );
    const index = keys.indexOf(blockKey);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (
      index < 0
      || targetIndex < 0
      || targetIndex >= keys.length
    ) {
      return;
    }

    [keys[index], keys[targetIndex]] = [
      keys[targetIndex],
      keys[index],
    ];

    const dynamicZones = renumberAutomaticDynamicZoneTitles(
      keys
        .filter((key) => key.startsWith("dynamic:"))
        .map((key) => {
          const clientId = key.slice("dynamic:".length);
          const zone = plan.dynamicZones.find(
            (candidate) => candidate.clientId === clientId,
          );

          if (!zone) {
            throw new Error("Zona editorial não encontrada.");
          }

          return zone;
        }),
    );

    const videoPosition = keys.indexOf("video");

    commit(
      {
        ...plan,
        dynamicZones,
        settings: {
          ...plan.settings,
          videoPosition,
        },
      },
      "Ordem do corpo editorial planeada.",
    );
  }

  function addDynamicZone() {
    const clientId = crypto.randomUUID();
    const visualFamily: HistoricalDynamicZoneVisualFamily = "five_news_balanced";
    const items: Record<number, TargetCard | null> = {};
    historicalDynamicZonePositions(visualFamily).forEach((position) => { items[position.position] = null; });
    commitDynamicZones(
      renumberAutomaticDynamicZoneTitles([
        ...plan.dynamicZones,
        {
          clientId,
          persistedId: null,
          publicTitle: `Zona editorial ${plan.dynamicZones.length + 1}`,
          visualFamily,
          items,
        },
      ]),
      "Nova zona editorial planeada.",
    );
    setActiveWorkspaceKey(`dynamic:${clientId}`);
  }

  function commitDynamicZonePublicTitle(
    clientId: string,
    publicTitle: string,
  ) {
    const dynamicZones = plan.dynamicZones.map(
      (zone) =>
        zone.clientId === clientId
          ? { ...zone, publicTitle }
          : zone,
    );

    commitDynamicZones(
      dynamicZones,
      "Título público da zona alterado.",
    );
  }

  function updateDynamicZone(clientId: string, patch: Partial<Pick<DynamicZonePlan, "publicTitle" | "visualFamily">>) {
    const dynamicZones = plan.dynamicZones.map((zone) => {
      if (zone.clientId !== clientId) return zone;
      if (patch.visualFamily && patch.visualFamily !== zone.visualFamily) {
        const nextItems: Record<number, TargetCard | null> = {};
        const retainedCards = historicalDynamicZonePositions(zone.visualFamily).map((position) => zone.items[position.position] ?? null).filter((card): card is TargetCard => Boolean(card));
        historicalDynamicZonePositions(patch.visualFamily).forEach((position, index) => { nextItems[position.position] = retainedCards[index] ?? null; });
        return { ...zone, ...patch, items: nextItems };
      }
      return { ...zone, ...patch };
    });
    commitDynamicZones(dynamicZones, "Definição da zona editorial planeada.");
  }

  function removeDynamicZone(clientId: string) {
    const index = plan.dynamicZones.findIndex((zone) => zone.clientId === clientId);
    if (index < 0) return;
    const dynamicZones = renumberAutomaticDynamicZoneTitles(
      plan.dynamicZones.filter((zone) => zone.clientId !== clientId),
    );
    const videoPosition = Math.min(
      plan.settings.videoPosition
        - (index < plan.settings.videoPosition ? 1 : 0),
      dynamicZones.length,
    );
    commit(
      {
        ...plan,
        dynamicZones,
        settings: {
          ...plan.settings,
          videoPosition: Math.max(videoPosition, 0),
        },
      },
      "Zona editorial retirada. As notícias regressaram ao reservatório.",
    );
    const fallback = dynamicZones[Math.min(index, Math.max(0, dynamicZones.length - 1))];
    setActiveWorkspaceKey(fallback ? `dynamic:${fallback.clientId}` : "opening");
    setSelectedReorderBlockKey((current) =>
      current === `dynamic:${clientId}` ? null : current,
    );
    setSelectedBankItemIds([]);
  }

  function placeSelectedInDynamicZone(clientId: string) {
    if (selectedBankItemIds.length === 0) { setMessage("Seleciona primeiro uma ou mais notícias."); return; }
    const zone = plan.dynamicZones.find((candidate) => candidate.clientId === clientId);
    if (!zone) { setMessage("Zona editorial inválida."); return; }
    const positions = historicalDynamicZonePositions(zone.visualFamily);
    const freePositions = positions.filter((position) => !zone.items[position.position]);
    if (freePositions.length < selectedBankItemIds.length) {
      setMessage(`A zona só tem ${freePositions.length} lugares livres para ${selectedBankItemIds.length} notícias selecionadas.`);
      return;
    }
    const nextItems = { ...zone.items };
    selectedBankItemIds.forEach((bankItemId, index) => {
      const article = articleByBankId.get(bankItemId);
      if (article) nextItems[freePositions[index].position] = { persistedId: null, bankItemId, title: article.title };
    });
    commitDynamicZones(plan.dynamicZones.map((candidate) => candidate.clientId === clientId ? { ...candidate, items: nextItems } : candidate), "Colocação planeada. A ordem de seleção definiu a ordem inicial da zona.");
    setSelectedBankItemIds([]);
  }

  function removeDynamicItem(clientId: string, position: number) {
    commitDynamicZones(plan.dynamicZones.map((zone) => zone.clientId === clientId ? { ...zone, items: { ...zone.items, [position]: null } } : zone), "Retirada planeada. A notícia regressou ao reservatório.");
    setSelectedBankItemIds([]);
  }

  function dynamicCardAt(state: PlanState, location: DynamicDragLocation) {
    const zone = state.dynamicZones.find((candidate) => candidate.clientId === location.zoneKey);
    return zone?.items[Number(location.targetKey)] ?? null;
  }

  function setDynamicCard(state: PlanState, location: DynamicDragLocation, card: TargetCard | null) {
    return { ...state, dynamicZones: state.dynamicZones.map((zone) => zone.clientId === location.zoneKey ? { ...zone, items: { ...zone.items, [Number(location.targetKey)]: card } } : zone) };
  }

  function placeSelectedInZone(zoneKey: string) {
    if (selectedBankItemIds.length === 0) {
      setMessage(
        "Seleciona primeiro uma ou mais notícias.",
      );
      return;
    }

    const selectedArticles =
      selectedBankItemIds
        .map((bankItemId) =>
          articleByBankId.get(bankItemId),
        )
        .filter(
          (
            article,
          ): article is HierarchicalCompositionDeskArticle =>
            Boolean(article),
        );

    if (
      selectedArticles.length !==
      selectedBankItemIds.length
    ) {
      setMessage(
        "Uma das notícias selecionadas já não está disponível.",
      );
      return;
    }

    let targetKeys: string[] = [];
    if (zoneKey.startsWith("core:")) {
      const sectionKey = zoneKey.slice("core:".length);
      const section = HIERARCHICAL_COMPOSITION_DESK_SECTIONS.find(
        (candidate) => candidate.key === sectionKey,
      );
      if (!section) {
        setMessage("Zona de destino inválida.");
        return;
      }
      targetKeys = section.slots.map((slot) => slot.key);
    }
    else if (zoneKey === "beyond") {
      targetKeys = HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map(
        (position) => `beyond_matchday_${position.sortOrder}`,
      );
    }
    else if (zoneKey === "faixa") {
      targetKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
        (position) => `faixa_${position}`,
      );
    }
    else {
      setMessage("Zona de destino inválida.");
      return;
    }

    const auxiliaryZone = zoneKey === "beyond" || zoneKey === "faixa";
    const freeKeys = targetKeys.filter((targetKey) => (
      auxiliaryZone ? !plan.auxiliary[targetKey] : !plan.slots[targetKey]
    ));
    if (freeKeys.length < selectedArticles.length) {
      setMessage(
        `A zona só tem ${freeKeys.length} lugares livres para ${selectedArticles.length} notícias selecionadas.`,
      );
      return;
    }

    let next = plan;
    selectedArticles.forEach((article, index) => {
      const card: TargetCard = {
        persistedId: null,
        bankItemId: article.bankItemId,
        title: article.title,
      };
      next = auxiliaryZone
        ? { ...next, auxiliary: { ...next.auxiliary, [freeKeys[index]]: card } }
        : { ...next, slots: { ...next.slots, [freeKeys[index]]: card } };
    });

    commit(next, "Colocação planeada. A ordem de seleção definiu a ordem inicial da zona.");
    setSelectedBankItemIds([]);
  }

  function dropOnLocation(target: DragLocation) {
    if (!dragged) return;

    if (dragged.kind === "reservoir") {
      const article = articleByBankId.get(dragged.bankItemId);
      const targetCard = target.kind === "dynamic" ? dynamicCardAt(plan, target) : target.kind === "slot" ? plan.slots[target.targetKey] : plan.auxiliary[target.targetKey];
      if (!article) setMessage("A notícia arrastada já não está disponível.");
      else if (targetCard) setMessage("Esse lugar está ocupado. Retira primeiro o conteúdo atual.");
      else {
        const card: TargetCard = { persistedId: null, bankItemId: article.bankItemId, title: article.title };
        const next = target.kind === "dynamic" ? setDynamicCard(plan, target, card) : target.kind === "slot" ? { ...plan, slots: { ...plan.slots, [target.targetKey]: card } } : { ...plan, auxiliary: { ...plan.auxiliary, [target.targetKey]: card } };
        commit(next, "Colocação planeada. A notícia saiu do reservatório.");
      }
    }
    else if (dragged.kind === "dynamic" || target.kind === "dynamic") {
      const sourceCard = dragged.kind === "dynamic" ? dynamicCardAt(plan, dragged) : dragged.kind === "slot" ? plan.slots[dragged.targetKey] : plan.auxiliary[dragged.targetKey];
      const targetCard = target.kind === "dynamic" ? dynamicCardAt(plan, target) : target.kind === "slot" ? plan.slots[target.targetKey] : plan.auxiliary[target.targetKey];
      if (!sourceCard) setMessage("A notícia de origem já não está colocada.");
      else {
        const sameZone = dragged.kind === target.kind && dragged.zoneKey === target.zoneKey;
        if (targetCard && !sameZone) setMessage("O destino está ocupado. A notícia atual não foi substituída.");
        else {
          let next = plan;
          if (dragged.kind === "dynamic") next = setDynamicCard(next, dragged, sameZone ? targetCard ?? null : null);
          else if (dragged.kind === "slot") next = { ...next, slots: { ...next.slots, [dragged.targetKey]: sameZone ? targetCard ?? null : null } };
          else next = { ...next, auxiliary: { ...next.auxiliary, [dragged.targetKey]: sameZone ? targetCard ?? null : null } };
          if (target.kind === "dynamic") next = setDynamicCard(next, target, sourceCard);
          else if (target.kind === "slot") next = { ...next, slots: { ...next.slots, [target.targetKey]: sourceCard } };
          else next = { ...next, auxiliary: { ...next.auxiliary, [target.targetKey]: sourceCard } };
          commit(next, targetCard && sameZone ? "Troca de posição planeada." : "Mudança direta entre zonas planeada.");
        }
      }
    }
    else {
      const result = moveHistoricalCompositionPiece(plan, dragged, target);
      if (result.occupied) setMessage("O destino está ocupado. A notícia atual não foi substituída.");
      else if (result.changed) commit(result.plan as PlanState, result.swapped ? "Troca de posição planeada." : "Mudança direta entre zonas planeada.");
    }

    setDragged(null);
    setSelectedBankItemIds([]);
  }

  function removeSlot(key: string) {
    commit(
      {
        ...plan,
        slots: {
          ...plan.slots,
          [key]: null,
        },
      },
      "Retirada planeada.",
    );

    setSelectedBankItemIds([]);
  }

  function removeAuxiliary(key: string) {
    commit(
      {
        ...plan,
        auxiliary: {
          ...plan.auxiliary,
          [key]: null,
        },
      },
      "Retirada planeada.",
    );

    setSelectedBankItemIds([]);
  }

  function undo() {
    const previous = history.at(-1);

    if (!previous) return;

    setPlan(previous);
    setHistory((items) => items.slice(0, -1));
    setSelectedBankItemIds([]);
    setMessage("Última alteração desfeita.");
  }

  function reset() {
    if (samePlan(plan, basePlan)) return;

    setHistory((items) => [...items, plan]);
    setPlan(basePlan);
    setSelectedBankItemIds([]);
    setMessage("Alterações planeadas eliminadas.");
  }

  function operations(): PlanOperation[] {
    const result: PlanOperation[] = [];

    Object.keys(basePlan.slots).forEach((slotKey) => {
      const before =
        basePlan.slots[slotKey] ?? null;
      const after =
        plan.slots[slotKey] ?? null;

      if (identity(before) === identity(after)) {
        return;
      }

      if (before?.persistedId) {
        result.push({
          kind: "unassign_slot",
          slotId: before.persistedId,
        });
      }

      if (after?.bankItemId) {
        result.push({
          kind: "assign_slot",
          slotKey,
          bankItemId: after.bankItemId,
        });
      }
    });

    Object.keys(basePlan.auxiliary).forEach((target) => {
      const before =
        basePlan.auxiliary[target] ?? null;
      const after =
        plan.auxiliary[target] ?? null;

      if (identity(before) === identity(after)) {
        return;
      }

      if (target === "editorial") {
        if (before) {
          result.push({ kind: "remove_editorial" });
        }
        if (after?.bankItemId) {
          result.push({
            kind: "assign_editorial",
            bankItemId: after.bankItemId,
          });
        }
        return;
      }

      if (before?.persistedId) {
        result.push({
          kind: "remove_auxiliary",
          itemId: before.persistedId,
        });
      }

      if (after?.bankItemId) {
        result.push({
          kind: "assign_auxiliary",
          target,
          bankItemId: after.bankItemId,
        });
      }
    });

    return result;
  }

  async function applyBatchEditorialDecision(
    decision: HistoricalCompositionDecision,
  ) {
    if (selectedArticles.length === 0 || selectedArticles.length !== selectedBankItemIds.length) {
      setMessage("Uma das notícias selecionadas já não está disponível.");
      return;
    }

    setIsBatchMutating(true);
    setMessage("A guardar a decisão editorial…");
    try {
      const body = new FormData();
      body.set("matchday_id", matchdayId);
      body.set("action_type", "set_historical_article_decision");
      body.set(
        "article_ids_json",
        JSON.stringify(Array.from(new Set(selectedArticles.map((article) => article.articleId)))),
      );
      body.set("decision", decision);

      const response = await fetch("/api/admin/editorial/composicao", {
        method: "POST",
        body,
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || result.ok !== true) {
        setMessage(result.message ?? "Não foi possível aplicar a operação editorial.");
        return;
      }

      setSelectedBankItemIds([]);
      setMessage(decision === "bank"
        ? "Seleção enviada para Bank."
        : decision === "selected"
          ? "Seleção marcada para a Histórica."
          : "Seleção reposta como sem decisão.");
      router.refresh();
    } catch {
      setMessage("Não foi possível contactar a gravação editorial.");
    } finally {
      setIsBatchMutating(false);
    }
  }

  async function applyChanges() {
    const planned = operations();
    const settingsChanged =
      basePlan.settings.headlineTitleColor !== plan.settings.headlineTitleColor
      || basePlan.settings.zone1Title !== plan.settings.zone1Title
      || basePlan.settings.zone2Title !== plan.settings.zone2Title
      || basePlan.settings.faixaTitle !== plan.settings.faixaTitle
      || basePlan.settings.blockOrder.join("|") !== plan.settings.blockOrder.join("|")
      || basePlan.settings.videoPosition !== plan.settings.videoPosition;
    const dynamicZonesChanged = dynamicZonesFingerprint(basePlan.dynamicZones) !== dynamicZonesFingerprint(plan.dynamicZones);

    if (planned.length === 0 && !settingsChanged && !dynamicZonesChanged) return;

    setIsApplying(true);
    setMessage("A guardar a montagem da Composição…");

    try {
      const body = new FormData();

      body.set(
        "action_type",
        "apply_hierarchical_desk_plan",
      );
      body.set(
        "matchday_id",
        matchdayId,
      );
      body.set(
        "composition_id",
        compositionId,
      );
      body.set(
        "operations_json",
        JSON.stringify(planned),
      );
      if (settingsChanged || dynamicZonesChanged) {
        body.set("settings_json", JSON.stringify(plan.settings));
      }
      if (dynamicZonesChanged) {
        body.set("dynamic_zones_json", JSON.stringify(plan.dynamicZones.map((zone) => ({
          publicTitle: zone.publicTitle.trim(),
          visualFamily: zone.visualFamily,
          items: historicalDynamicZonePositions(zone.visualFamily).map((position) => {
            const card = zone.items[position.position];
            return card?.bankItemId ? { position: position.position, bankItemId: card.bankItemId } : null;
          }).filter(Boolean),
        }))));
      }

      const response =
        await fetch(
          "/api/admin/editorial/composicao",
          {
            method: "POST",
            body,
          },
        );

      const result =
        await response.json() as {
          ok?: boolean;
          message?: string;
        };

      if (
        !response.ok ||
        result.ok !== true
      ) {
        setMessage(
          result.message ??
          "Não foi possível guardar a montagem.",
        );
        return;
      }

      setSelectedBankItemIds([]);
      window.location.reload();
    }
    catch {
      setMessage(
        "Não foi possível contactar a gravação da Composição.",
      );
    }
    finally {
      setIsApplying(false);
    }
  }

  function renderCard(
    card: TargetCard | null,
    onRemove: () => void,
    location?: DragLocation,
  ) {
    if (!card) {
      return (
        <span className="hc-desk-empty">
          Livre
        </span>
      );
    }

    const article = card.bankItemId ? articleByBankId.get(card.bankItemId) : null;

    return (
      <article
        className="hc-desk-card"
        draggable={Boolean(location)}
        title={
          location
            ? "Arrastar para mover diretamente para qualquer lugar compatível"
            : undefined
        }
        onDragStart={
          location
            ? (event) => {
                setDragged(location);

                event.dataTransfer.effectAllowed =
                  "move";

                event.dataTransfer.setData(
                  "text/plain",
                  JSON.stringify(location),
                );
              }
            : undefined
        }
        onDragEnd={() => setDragged(null)}
      >
        <div className="hc-desk-card-body">
          <span className="hc-desk-card-media">
            {article?.imageUrl ? <img alt="" src={article.imageUrl} /> : <span className="hc-desk-card-image" />}
          </span>
          <span className="hc-desk-card-copy">
            <span className="hc-desk-card-top">
              <small>{article?.label ?? "COMPOSIÇÃO"}</small>
              {article ? (
                <ClassificationBadge classificationKey={article.naturalGroupKey} />
              ) : null}
            </span>
            <strong>{card.title}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onRemove}
        >
          Retirar
        </button>
      </article>
    );
  }

  function updateSettings(nextSettings: CompositionSettings, nextMessage: string) {
    commit({ ...plan, settings: nextSettings }, nextMessage);
  }

  function allowDrop(event: DragEvent, target: DragLocation) {
    if (!dragged) return;
    if (dragged.kind !== "reservoir" && dragged.targetKey === target.targetKey && dragged.kind === target.kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function changeFocusMode(nextFocusMode: boolean) {
    setFocusMode(nextFocusMode);
    requestAnimationFrame(() => {
      (nextFocusMode ? exitFocusButtonRef : enterFocusButtonRef).current?.focus();
    });
  }

  function toggleVisibleSelection() {
    if (selectedBankItemIds.length > 0) {
      setSelectedBankItemIds([]);
      return;
    }

    setSelectedBankItemIds(
      visibleArticles.map((article) => article.bankItemId),
    );
  }

  const openingSection = HIERARCHICAL_COMPOSITION_DESK_SECTIONS.find((section) => section.key === "opening");
  const occupiedOpening = openingSection?.slots.filter((slot) => Boolean(plan.slots[slot.key])).length ?? 0;
  const occupiedFaixa = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((position) => Boolean(plan.auxiliary[`faixa_${position}`])).length;
  const activeDynamicZone = activeWorkspaceKey.startsWith("dynamic:")
    ? plan.dynamicZones.find((zone) => zone.clientId === activeWorkspaceKey.slice("dynamic:".length)) ?? null
    : null;
  const activeWorkspaceLabel = activeWorkspaceKey === "opening"
    ? "Abertura"
    : activeWorkspaceKey === "editorial"
      ? "Editorial da Jornada"
      : activeWorkspaceKey === "highlight"
        ? "Vídeo + Destaque"
        : activeWorkspaceKey === "faixa"
          ? "Faixa de notícias"
          : activeDynamicZone?.publicTitle || "Zona editorial";
  const orderedBodyBlockKeys = bodyBlockKeys(
    plan.dynamicZones,
    plan.settings.videoPosition,
  );
  const selectedReorderBlockIndex = selectedReorderBlockKey === null
    ? -1
    : orderedBodyBlockKeys.indexOf(selectedReorderBlockKey);

  const articleToolbar = (
    <div className={selectedBankItemIds.length > 0 ? "hc-desk-toolbar selection-mode" : "hc-desk-toolbar normal-mode"}>
      <nav className="hc-desk-scope" aria-label="Decisão histórica">
        <button type="button" className={historicalDecisionFilter === "all" ? "active" : undefined} aria-pressed={historicalDecisionFilter === "all"} onClick={() => setHistoricalDecisionFilter("all")}>
          Todos ({historicalDecisionCounts.all})
        </button>
        <button type="button" className={historicalDecisionFilter === "undecided" ? "active" : undefined} aria-pressed={historicalDecisionFilter === "undecided"} onClick={() => setHistoricalDecisionFilter("undecided")}>
          Sem decisão ({historicalDecisionCounts.undecided})
        </button>
        <button type="button" className={historicalDecisionFilter === "bank" ? "active" : undefined} aria-pressed={historicalDecisionFilter === "bank"} onClick={() => setHistoricalDecisionFilter("bank")}>
          Bank ({historicalDecisionCounts.bank})
        </button>
        <button type="button" className={historicalDecisionFilter === "selected" ? "active" : undefined} aria-pressed={historicalDecisionFilter === "selected"} onClick={() => setHistoricalDecisionFilter("selected")}>
          Histórica ({historicalDecisionCounts.selected})
        </button>
      </nav>

      <div className="hc-desk-filter-row">
        {candidateSearchOpen ? (
          <label className="hc-desk-search">
            <input
              aria-label="Pesquisar artigos"
              autoFocus
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCandidateSearchOpen(false);
                  candidateSearchToggleRef.current?.focus();
                }
              }}
              placeholder="Título ou antetítulo"
              type="search"
              value={search}
            />
          </label>
        ) : (
          <nav className="hc-desk-groups" aria-label="Classificação">
            <button type="button" className={selectedGroupKey === "" ? "active" : undefined} aria-pressed={selectedGroupKey === ""} onClick={() => setSelectedGroupKey("")}>
              Todas ({Array.from(classificationCounts.values()).reduce((sum, count) => sum + count, 0)})
            </button>
            {groups.map((group) => (
              <button type="button" className={selectedGroupKey === group.key ? "active" : undefined} aria-pressed={selectedGroupKey === group.key} key={group.key} onClick={() => setSelectedGroupKey(group.key)}>
                {group.label} ({classificationCounts.get(group.key) ?? 0})
              </button>
            ))}
            {(classificationCounts.get(HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY) ?? 0) > 0
              || selectedGroupKey === HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY ? (
                <button type="button" className={selectedGroupKey === HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY ? "active" : undefined} aria-pressed={selectedGroupKey === HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY} onClick={() => setSelectedGroupKey(HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY)}>
                  Sem classificação ({classificationCounts.get(HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY) ?? 0})
                </button>
              ) : null}
          </nav>
        )}

        <div className="hc-desk-candidate-actions">
          <button
            aria-label={candidateSearchOpen ? "Fechar pesquisa" : "Pesquisar artigos"}
            aria-expanded={candidateSearchOpen}
            className="hc-desk-search-toggle"
            data-query-active={search.trim().length > 0}
            onClick={() => setCandidateSearchOpen((open) => !open)}
            ref={candidateSearchToggleRef}
            title={candidateSearchOpen ? "Fechar pesquisa" : search ? `Pesquisa ativa: ${search}` : "Pesquisar artigos"}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
              {candidateSearchOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
            </svg>
          </button>

          <button
            className="hc-desk-visible-selection"
            disabled={isBatchMutating || (selectedBankItemIds.length === 0 && visibleArticles.length === 0)}
            onClick={toggleVisibleSelection}
            type="button"
          >
            {selectedBankItemIds.length > 0 ? "Limpar" : "Selecionar visíveis"}
          </button>
        </div>
      </div>
    </div>
  );

  const selectionContext = selectedBankItemIds.length > 0 ? (
    <section className="hc-desk-bulk-context" aria-label="Ações para artigos selecionados">
      <strong>{selectedBankItemIds.length === 1 ? "1 artigo selecionado" : `${selectedBankItemIds.length} artigos selecionados`}</strong>
      <div className="hc-desk-selection-actions">
        {selectedHistoricalDecision === "undecided" ? <button type="button" disabled={isBatchMutating} onClick={() => applyBatchEditorialDecision("bank")}>Enviar p/ Bank</button> : null}
        {selectedHistoricalDecision === "bank" ? <button type="button" disabled={isBatchMutating} onClick={() => applyBatchEditorialDecision("undecided")}>Retirar do Bank</button> : null}
        {selectedHistoricalDecision !== null && selectedHistoricalDecision !== "selected" ? <button type="button" disabled={isBatchMutating} onClick={() => applyBatchEditorialDecision("selected")}>Selecionar p/ Histórica</button> : null}
        {selectedHistoricalDecision === "selected" ? <button type="button" disabled={isBatchMutating} onClick={() => applyBatchEditorialDecision("undecided")}>Retirar da Histórica</button> : null}
        {selectedHistoricalDecision === "selected" ? <button type="button" disabled={isBatchMutating} onClick={() => applyBatchEditorialDecision("bank")}>Enviar p/ Bank</button> : null}
      </div>
    </section>
  ) : null;


  return (
    <section className="hc-desk-shell" data-focus-mode={focusMode}>
      <style
        dangerouslySetInnerHTML={{
          __html: styles,
        }}
      />

      <header className="hc-focus-bar" hidden={!focusMode}>
        <h1 title={`Jornada ${String(matchdayNumber).padStart(2, "0")} · ${activeWorkspaceLabel}`}>
          Jornada {String(matchdayNumber).padStart(2, "0")} · {activeWorkspaceLabel}
        </h1>
        <button className="hc-focus-toggle" onClick={() => changeFocusMode(false)} ref={exitFocusButtonRef} title="Sair do modo foco" type="button">
          Mostrar controlos
        </button>
      </header>

      <div className="hc-desk-tools hc-desk-top-tools" aria-label="Controlos da Composição">
        <details className="hc-desk-tool" name="composition-tools">
          <summary>Página e blocos</summary>
          <div className="hc-desk-tool-body">
            <div className="hc-desk-settings">
              <label>
                Cor do título da Manchete
                <span className="hc-color-control">
                  <input type="color" aria-label="Cor do título da Manchete" value={plan.settings.headlineTitleColor} onChange={(event) => updateSettings({ ...plan.settings, headlineTitleColor: event.target.value.toUpperCase() }, "Cor da Manchete planeada.")} />
                  <strong>Escolher cor</strong>
                </span>
              </label>
            </div>
            <div className="hc-page-structure" aria-label="Estrutura global da página">
              <div className="hc-page-structure-head">
                <strong>Estrutura da página</strong>
                <button type="button" onClick={addDynamicZone}>+ Adicionar zona</button>
              </div>

              <div className="hc-page-structure-row fixed">
                <button className="hc-page-structure-main" type="button" onClick={() => setActiveWorkspaceKey("opening")}>
                  <b>01 · Abertura</b>
                  <span>{occupiedOpening}/4 · fixa no topo</span>
                </button>
                <span />
              </div>

              <div className="hc-page-structure-row fixed">
                <button className="hc-page-structure-main" type="button" onClick={() => setActiveWorkspaceKey("editorial")}>
                  <b>02 · Editorial da Jornada</b>
                  <span>{plan.auxiliary.editorial ? "1/1" : "0/1"} · fixo abaixo da Abertura</span>
                </button>
                <span />
              </div>

              {orderedBodyBlockKeys.map((blockKey, bodyIndex) => {
                if (blockKey === "video") {
                  return (
                    <div className="hc-page-structure-row" key="video">
                      <button
                        className="hc-page-structure-main"
                        type="button"
                        onClick={() => setActiveWorkspaceKey("highlight")}
                      >
                        <b>{String(bodyIndex + 3).padStart(2, "0")} · Vídeo + Destaque</b>
                        <span>{plan.auxiliary.video_highlight ? "1/1" : "0/1"} · móvel no corpo editorial</span>
                      </button>
                      <span />
                    </div>
                  );
                }

                const clientId = blockKey.slice("dynamic:".length);
                const zone = plan.dynamicZones.find(
                  (candidate) => candidate.clientId === clientId,
                );

                if (!zone) return null;

                const zoneIndex = plan.dynamicZones.findIndex(
                  (candidate) => candidate.clientId === clientId,
                );
                const occupied = historicalDynamicZonePositions(zone.visualFamily)
                  .filter((position) => Boolean(zone.items[position.position]))
                  .length;
                const capacity = HISTORICAL_DYNAMIC_ZONE_LAYOUTS[zone.visualFamily].capacity;

                return (
                  <div className="hc-page-structure-row" key={zone.clientId}>
                    <button
                      className="hc-page-structure-main"
                      type="button"
                      onClick={() => setActiveWorkspaceKey(`dynamic:${zone.clientId}`)}
                    >
                      <b>{String(bodyIndex + 3).padStart(2, "0")} · {zone.publicTitle || `Zona editorial ${zoneIndex + 1}`}</b>
                      <span>{HISTORICAL_DYNAMIC_ZONE_LAYOUTS[zone.visualFamily].label} · {occupied}/{capacity}</span>
                    </button>

                    <div className="hc-page-structure-actions">
                      <button
                        className="remove"
                        type="button"
                        onClick={() => removeDynamicZone(zone.clientId)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="hc-page-structure-row fixed">
                <button className="hc-page-structure-main" type="button" onClick={() => setActiveWorkspaceKey("faixa")}>
                  <b>Faixa de notícias</b>
                  <span>{occupiedFaixa}/10 · fixa no fecho</span>
                </button>
                <span />
              </div>
            </div>
          </div>
        </details>

        {children}

        <button className="hc-focus-toggle hc-focus-entry" onClick={() => changeFocusMode(true)} ref={enterFocusButtonRef} type="button">
          Modo foco
        </button>
      </div>

      {selectionContext}
      {message ? <p className="hc-desk-message hc-desk-feedback" aria-live="polite">{message}</p> : null}

      <div className="hc-desk-workspace">
        <aside className="hc-zone-rail" aria-label="Zonas da Composição">
          <div className="hc-zone-rail-heading">
            <span>Zonas</span>
            <span>{plan.dynamicZones.length + 4}</span>
          </div>
          <nav className="hc-zone-tabs" aria-label="Lista vertical de zonas">
            <button type="button" className={activeWorkspaceKey === "opening" ? "active" : undefined} aria-pressed={activeWorkspaceKey === "opening"} onClick={() => setActiveWorkspaceKey("opening")}>
              <strong>Abertura</strong>
              <small>{occupiedOpening}/4</small>
            </button>
            <button type="button" className={activeWorkspaceKey === "editorial" ? "active" : undefined} aria-pressed={activeWorkspaceKey === "editorial"} onClick={() => setActiveWorkspaceKey("editorial")}>
              <strong>Editorial</strong>
              <small>{plan.auxiliary.editorial ? "1/1" : "0/1"}</small>
            </button>
            {orderedBodyBlockKeys.map((blockKey) => {
              if (blockKey === "video") {
                return (
                  <div className={`hc-zone-row${activeWorkspaceKey === "highlight" ? " active" : ""}${selectedReorderBlockKey === blockKey ? " reorder-selected" : ""}`} key="video">
                    <label className="hc-zone-select">
                      <input
                        aria-label="Selecionar Vídeo + Destaque para mover"
                        checked={selectedReorderBlockKey === blockKey}
                        onChange={(event) => setSelectedReorderBlockKey(event.target.checked ? blockKey : null)}
                        type="checkbox"
                      />
                    </label>
                    <button className="hc-zone-focus" type="button" aria-pressed={activeWorkspaceKey === "highlight"} onClick={() => setActiveWorkspaceKey("highlight")}>
                      <strong>Vídeo + Destaque</strong>
                      <small>{plan.auxiliary.video_highlight ? "1/1" : "0/1"}</small>
                    </button>
                  </div>
                );
              }

              const clientId = blockKey.slice("dynamic:".length);
              const zone = plan.dynamicZones.find((candidate) => candidate.clientId === clientId);
              if (!zone) return null;
              const occupied = historicalDynamicZonePositions(zone.visualFamily).filter((position) => Boolean(zone.items[position.position])).length;
              const capacity = HISTORICAL_DYNAMIC_ZONE_LAYOUTS[zone.visualFamily].capacity;
              const workspaceKey = `dynamic:${zone.clientId}`;
              return (
                <div className={`hc-zone-row${activeWorkspaceKey === workspaceKey ? " active" : ""}${selectedReorderBlockKey === blockKey ? " reorder-selected" : ""}`} key={zone.clientId}>
                  <label className="hc-zone-select">
                    <input
                      aria-label={`Selecionar ${zone.publicTitle || "Zona editorial"} para mover`}
                      checked={selectedReorderBlockKey === blockKey}
                      onChange={(event) => setSelectedReorderBlockKey(event.target.checked ? blockKey : null)}
                      type="checkbox"
                    />
                  </label>
                  <button className="hc-zone-focus" type="button" aria-pressed={activeWorkspaceKey === workspaceKey} onClick={() => setActiveWorkspaceKey(workspaceKey)}>
                    <strong>{zone.publicTitle || "Zona editorial"}</strong>
                    <small>{occupied}/{capacity}</small>
                  </button>
                </div>
              );
            })}
            <button type="button" className={activeWorkspaceKey === "faixa" ? "active" : undefined} aria-pressed={activeWorkspaceKey === "faixa"} onClick={() => setActiveWorkspaceKey("faixa")}>
              <strong>Faixa</strong>
              <small>{occupiedFaixa}/10</small>
            </button>
          </nav>
          <div className="hc-zone-move-controls" aria-label="Mover zona selecionada">
            <button
              aria-label="Subir zona selecionada"
              disabled={selectedReorderBlockIndex <= 0}
              onClick={() => {
                if (selectedReorderBlockKey) moveBodyBlock(selectedReorderBlockKey, "up");
              }}
              type="button"
            >
              <span aria-hidden="true">↑</span>
              Subir
            </button>
            <button
              aria-label="Descer zona selecionada"
              disabled={selectedReorderBlockIndex < 0 || selectedReorderBlockIndex >= orderedBodyBlockKeys.length - 1}
              onClick={() => {
                if (selectedReorderBlockKey) moveBodyBlock(selectedReorderBlockKey, "down");
              }}
              type="button"
            >
              <span aria-hidden="true">↓</span>
              Descer
            </button>
          </div>
        </aside>

        <section
          className="hc-desk-library"
          aria-label="Artigos e candidatos"
        >
          <div className="hc-desk-scroll">
            <div className="hc-desk-list">
              {
                visibleArticles
                  .map((article) => {
                  const rank =
                    selectionRank.get(
                      article.bankItemId,
                    ) ?? null;

                  const selected =
                    rank !== null;

                  return (
                    <label
                      className={
                        `hc-desk-row${
                          selected
                            ? " selected"
                            : ""
                        }`
                      }
                      draggable
                      key={article.bankItemId}
                      onDragStart={(event) => {
                        const source: DragState = {
                          kind: "reservoir",
                          bankItemId: article.bankItemId,
                        };
                        setDragged(source);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", JSON.stringify(source));
                      }}
                      onDragEnd={() => setDragged(null)}
                    >
                      <span className="hc-desk-row-image">
                        <input
                          aria-label={`Selecionar ${article.title}`}
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            toggleSelection(
                              article.bankItemId,
                              event.target.checked,
                            )
                          }
                        />

                        <b className="hc-desk-rank">
                          {rank ?? "·"}
                        </b>

                        {
                          article.imageUrl
                            ? (
                              <img
                                alt=""
                                src={article.imageUrl}
                              />
                            )
                            : (
                              <span className="hc-desk-image" />
                            )
                        }
                      </span>

                      <span className="hc-desk-copy">
                        <span className="hc-desk-meta">
                          <ClassificationBadge classificationKey={article.naturalGroupKey} />

                          {
                            article.historicalDecision === "bank"
                              ? (
                                <em className="hc-desk-live-bank">
                                  BANK
                                </em>
                              )
                              : null
                          }

                          {
                            article.historicalDecision === "selected"
                              ? <em className="hc-desk-historical-mark">HISTÓRICA</em>
                              : null
                          }

                          {
                            article.inheritedFromMatchdayNumber !== null
                              ? (
                                <em className="hc-desk-continuity revalidated">
                                  REVALIDADA · J{String(article.inheritedFromMatchdayNumber).padStart(2, "0")} → J{String(matchdayNumber).padStart(2, "0")}
                                </em>
                              )
                              : null
                          }

                          {
                            article.publishedAt
                              ? (
                                <time>
                                  {
                                    new Date(
                                      article.publishedAt,
                                    )
                                      .toLocaleString(
                                        "pt-PT",
                                        {
                                          day: "2-digit",
                                          month: "2-digit",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        },
                                      )
                                  }
                                </time>
                              )
                              : null
                          }
                        </span>

                        <strong>
                          {article.title}
                        </strong>

                      </span>
                    </label>
                  );
                  })
              }
            </div>

            {inheritedAvailableArticles.length > 0 ? (
              <details className="hc-desk-inherited">
                <summary>
                  Herdadas de jornadas anteriores ({inheritedAvailableArticles.length})
                </summary>
                <div className="hc-desk-inherited-list">
                  {inheritedAvailableArticles.map((article) => (
                    <article className="hc-desk-inherited-row" key={article.bankItemId}>
                      {article.imageUrl ? <img alt="" src={article.imageUrl} /> : <span className="hc-desk-image" />}
                      <span className="hc-desk-copy">
                        <span className="hc-desk-meta">
                          <em className="hc-desk-continuity">
                            HERDADA{article.inheritedFromMatchdayNumber === null
                              ? ""
                              : ` · J${String(article.inheritedFromMatchdayNumber).padStart(2, "0")}`}
                          </em>
                          <ClassificationBadge classificationKey={article.naturalGroupKey} />
                          {article.label ? <em>{article.label}</em> : null}
                        </span>
                        <strong>{article.title}</strong>
                        <small>FORA DA SELEÇÃO HISTÓRICA</small>
                      </span>
                      <form action="/api/admin/editorial/composicao" method="post">
                        <input type="hidden" name="action_type" value="revalidate_inherited_bank_item" />
                        <input type="hidden" name="matchday_id" value={matchdayId} />
                        <input type="hidden" name="bank_item_id" value={article.bankItemId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <button
                          type="submit"
                          disabled={pendingCount > 0}
                          title={pendingCount > 0 ? "Aplica primeiro as alterações pendentes da composição." : undefined}
                        >
                          Revalidar para J{String(matchdayNumber).padStart(2, "0")}
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </section>

        <div className="hc-desk-operational-sticky">
          <section className="hc-desk-map" aria-label="Zona ativa da Composição" role="region" tabIndex={0}>
          <header className="hc-desk-map-heading">
            <div>
              <span>Zona histórica ativa</span>
              <strong>{activeWorkspaceLabel}</strong>
            </div>
            <small>Apenas esta zona está aberta</small>
          </header>

          {activeWorkspaceKey === "opening" && openingSection ? (
            <section className="hc-desk-zone">
              <header><div><h3>Abertura</h3><p>Manchete e as três crónicas imediatamente abaixo.</p></div><span className="hc-desk-zone-action"><span>{occupiedOpening}/4</span>{selectedBankItemIds.length > 0 ? <button type="button" onClick={() => placeSelectedInZone("core:opening")}>Colocar {selectedBankItemIds.length} aqui</button> : null}</span></header>
              <div className="hc-desk-slots hc-desk-slots-4">
                {openingSection.slots.map((definition) => {
                  const location: HistoricalCompositionPlacementLocation = { kind: "slot", zoneKey: "core:opening", targetKey: definition.key };
                  return <div className="hc-desk-slot" data-drop-active={dragged ? "true" : undefined} key={definition.key} onDragOver={(event) => allowDrop(event, location)} onDrop={(event) => { event.preventDefault(); dropOnLocation(location); }}><small>{definition.label}</small>{renderCard(plan.slots[definition.key] ?? null, () => removeSlot(definition.key), location)}</div>;
                })}
              </div>
            </section>
          ) : null}

          {activeDynamicZone ? (
            <>
              <div className={selectedBankItemIds.length > 0 ? "hc-dynamic-zone-editor has-selection" : "hc-dynamic-zone-editor"}>
                <label>
                  <DynamicZoneTitleInput
                    key={activeDynamicZone.clientId}
                    clientId={activeDynamicZone.clientId}
                    value={activeDynamicZone.publicTitle}
                    onCommit={commitDynamicZonePublicTitle}
                  />
                </label>
                <label><select aria-label="Layout da zona editorial" value={activeDynamicZone.visualFamily} onChange={(event) => updateDynamicZone(activeDynamicZone.clientId, { visualFamily: event.target.value as HistoricalDynamicZoneVisualFamily })}><option value="six_news">6 notícias</option><option value="five_news_balanced">5 notícias equilibradas</option><option value="five_news_secondary">5 notícias secundárias</option></select></label>
                {selectedBankItemIds.length > 0 ? <button className="hc-dynamic-zone-place" type="button" onClick={() => placeSelectedInDynamicZone(activeDynamicZone.clientId)}>Colocar {selectedBankItemIds.length} aqui</button> : null}
              </div>
              <section className="hc-desk-zone">
                <div className={`hc-desk-slots hc-desk-slots-${HISTORICAL_DYNAMIC_ZONE_LAYOUTS[activeDynamicZone.visualFamily].capacity}`}>
                  {historicalDynamicZonePositions(activeDynamicZone.visualFamily).map((position) => {
                    const location: DynamicDragLocation = { kind: "dynamic", zoneKey: activeDynamicZone.clientId, targetKey: String(position.position) };
                    return <div className="hc-desk-slot" data-drop-active={dragged ? "true" : undefined} key={position.position} onDragOver={(event) => allowDrop(event, location)} onDrop={(event) => { event.preventDefault(); dropOnLocation(location); }}><small>{position.label}</small>{renderCard(activeDynamicZone.items[position.position] ?? null, () => removeDynamicItem(activeDynamicZone.clientId, position.position), location)}</div>;
                  })}
                </div>
              </section>
            </>
          ) : null}

          {activeWorkspaceKey === "editorial" ? (
            <section className="hc-desk-zone" data-historical-editorial-slot="canonical-article"><header><div><h3>Editorial da Jornada</h3><p>Um artigo canónico; o texto continua a ser editado no editor normal de Artigos.</p></div><span>{plan.auxiliary.editorial ? "1/1" : "0/1"}</span></header><div className="hc-desk-slots"><div className="hc-desk-slot" data-drop-active={dragged ? "true" : undefined} onDragOver={(event) => allowDrop(event, { kind: "auxiliary", zoneKey: "editorial", targetKey: "editorial" })} onDrop={(event) => { event.preventDefault(); dropOnLocation({ kind: "auxiliary", zoneKey: "editorial", targetKey: "editorial" }); }}><small>Editorial</small>{renderCard(plan.auxiliary.editorial ?? null, () => removeAuxiliary("editorial"), { kind: "auxiliary", zoneKey: "editorial", targetKey: "editorial" })}</div></div></section>
          ) : null}

          {activeWorkspaceKey === "highlight" ? (
            <section className="hc-desk-zone"><header><div><h3>Vídeo + Destaque</h3><p>O vídeo é gerido no menu superior; aqui escolhes o Destaque opcional.</p></div><span>{plan.auxiliary.video_highlight ? "1/1" : "0/1"}</span></header><div className="hc-desk-slots"><div className="hc-desk-slot" data-drop-active={dragged ? "true" : undefined} onDragOver={(event) => allowDrop(event, { kind: "auxiliary", zoneKey: "highlight", targetKey: "video_highlight" })} onDrop={(event) => { event.preventDefault(); dropOnLocation({ kind: "auxiliary", zoneKey: "highlight", targetKey: "video_highlight" }); }}><small>Destaque da Jornada</small>{renderCard(plan.auxiliary.video_highlight ?? null, () => removeAuxiliary("video_highlight"), { kind: "auxiliary", zoneKey: "highlight", targetKey: "video_highlight" })}</div></div></section>
          ) : null}

          {activeWorkspaceKey === "faixa" ? (
            <section className="hc-desk-zone">
              <header><div><h3>Faixa de notícias</h3><p>Até dez notícias. Todos os lugares são opcionais.</p></div><span className="hc-desk-zone-action"><span>{occupiedFaixa}/10</span>{selectedBankItemIds.length > 0 ? <button type="button" onClick={() => placeSelectedInZone("faixa")}>Colocar {selectedBankItemIds.length} aqui</button> : null}</span></header>
              <label className="hc-faixa-title-editor">
                <span>Título público</span>
                <input
                  aria-label="Título público da Faixa histórica"
                  defaultValue={plan.settings.faixaTitle}
                  key={`faixa:${plan.settings.faixaTitle}`}
                  maxLength={120}
                  onBlur={(event) => {
                    const faixaTitle = event.currentTarget.value.trim();
                    if (faixaTitle === plan.settings.faixaTitle) return;
                    updateSettings(
                      { ...plan.settings, faixaTitle },
                      "Título público da Faixa planeado.",
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <div className="hc-desk-slots hc-desk-slots-faixa">{[1,2,3,4,5,6,7,8,9,10].map((position) => { const target = `faixa_${position}`; const location: HistoricalCompositionPlacementLocation = { kind: "auxiliary", zoneKey: "faixa", targetKey: target }; return <div className="hc-desk-slot" data-drop-active={dragged ? "true" : undefined} key={target} onDragOver={(event) => allowDrop(event, location)} onDrop={(event) => { event.preventDefault(); dropOnLocation(location); }}><small>Faixa {position}</small>{renderCard(plan.auxiliary[target] ?? null, () => removeAuxiliary(target), location)}</div>; })}</div>
            </section>
          ) : null}
          </section>
          {articleToolbar}
        </div>
      </div>

      <footer className="hc-desk-pending">
        <div>
          <strong>
            {pendingCount} alterações pendentes
          </strong>
        </div>

        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
        >
          Desfazer última
        </button>

        <button
          type="button"
          onClick={reset}
          disabled={pendingCount === 0}
        >
          Limpar alterações
        </button>

        <button
          className="apply"
          type="button"
          onClick={applyChanges}
          disabled={
            isApplying ||
            isBatchMutating ||
            pendingCount === 0
          }
        >
          {
                isApplying
                  ? "A guardar…"
                  : "GUARDAR MONTAGEM"
          }
        </button>
      </footer>
    </section>
  );
}
