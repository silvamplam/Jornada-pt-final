"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent } from "react";

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
  fixMatchdayEditorialItemsInZone,
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
} from "@/lib/editorial-matchday-profile-workspace";

const FAIXA_INITIAL_VISIBLE = 10;
const FAIXA_PAGE_SIZE = 10;

const styles = `
  body { margin: 0; background: #edf1f5; color: #111820; font-family: Arial, Helvetica, sans-serif; }
  * { box-sizing: border-box; }
  button, input, select { font: inherit; }
  .thematic-shell { min-height: 100vh; padding: 10px 10px 72px; }
  .thematic-content { display: grid; gap: 9px; width: min(1920px, 100%); margin: 0 auto; }
  .thematic-hero { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 62px; padding: 10px 14px; border-radius: 8px; background: #101820; color: #fff; box-shadow: 0 7px 20px rgba(12,22,34,.12); }
  .thematic-hero-main { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
  .thematic-hero h1, .thematic-hero p { margin: 0; }
  .thematic-eyebrow { color: #ff5c65; font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .thematic-hero h1 { font-size: clamp(19px,2.2vw,27px); }
  .thematic-context { color: #cbd5e1; font-size: 11px; }
  .thematic-status { display: inline-flex; align-items: center; min-height: 23px; padding: 3px 8px; border: 1px solid #4ade80; border-radius: 999px; color: #bbf7d0; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .thematic-status.pending { border-color: #fbbf24; color: #fde68a; }
  .thematic-hero nav { display: flex; flex-wrap: wrap; gap: 5px; }
  .thematic-hero a { padding: 6px 9px; border: 1px solid rgba(255,255,255,.25); border-radius: 5px; color: #fff; font-size: 10px; font-weight: 800; text-decoration: none; }
  .thematic-panel { border: 1px solid #d7e0e9; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgba(12,22,34,.035); }
  .thematic-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 9px 10px; }
  .thematic-panel-head h2, .thematic-panel-head p { margin: 0; }
  .thematic-panel-head h2 { font-size: 15px; }
  .thematic-panel-head p { margin-top: 2px; color: #657487; font-size: 10px; }
  .thematic-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .thematic-meta span { padding: 2px 5px; border-radius: 4px; background: #edf2f7; color: #5d6c7d; font-size: 8px; font-weight: 800; }
  .thematic-layout-picker { display: grid; gap: 2px; min-width: 142px; color: #657487; font-size: 8px; font-weight: 900; text-transform: uppercase; }
  .thematic-layout-picker select { min-height: 27px; padding: 3px 5px; border: 1px solid #c8d3df; border-radius: 4px; background: #fff; color: #172331; font-size: 9px; font-weight: 800; text-transform: none; }
  .thematic-public-title { display: grid; gap: 3px; margin-top: 7px; max-width: 340px; color: #657487; font-size: 8px; font-weight: 900; text-transform: uppercase; }
  .thematic-public-title input { width: 100%; min-height: 28px; padding: 4px 7px; border: 1px solid #c8d3df; border-radius: 4px; background: #fff; color: #172331; font-size: 10px; font-weight: 700; text-transform: none; }
  .thematic-latest-block { border-style: dashed; }
  .thematic-latest-body { display: grid; gap: 5px; padding: 0 10px 10px; color: #657487; font-size: 9px; line-height: 1.35; }
  .thematic-latest-body strong { color: #172331; }
  .thematic-controls summary, .thematic-bulk summary, .thematic-movements summary { padding: 9px 10px; cursor: pointer; font-size: 11px; font-weight: 900; }
  .thematic-controls-grid { display: grid; grid-template-columns: minmax(180px,.65fr) minmax(190px,.75fr) minmax(360px,1.6fr); gap: 8px; padding: 0 10px 10px; }
  .thematic-control { display: grid; align-content: start; gap: 6px; padding: 8px; border: 1px solid #e0e7ef; border-radius: 6px; background: #f8fafc; }
  .thematic-control h3 { margin: 0; font-size: 11px; }
  .thematic-field { display: grid; gap: 3px; color: #5f6e80; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .thematic-field select { min-height: 31px; padding: 5px 7px; border: 1px solid #c8d3df; border-radius: 5px; background: #fff; color: #111820; }
  .thematic-color-row { display: flex; align-items: center; gap: 6px; }
  .thematic-color-row input { width: 44px; height: 30px; padding: 2px; border: 1px solid #c8d3df; border-radius: 5px; background: #fff; }
  .thematic-order { display: grid; gap: 3px; }
  .thematic-order-row { display: grid; grid-template-columns: 22px minmax(0,1fr) auto; gap: 5px; align-items: center; min-height: 29px; padding: 3px 5px; border: 1px solid #e1e8ef; border-radius: 4px; background: #fff; font-size: 9px; }
  .thematic-order-actions { display: flex; gap: 3px; }
  .thematic-button { min-height: 28px; padding: 4px 7px; border: 1px solid #bac7d4; border-radius: 5px; background: #fff; color: #243244; font-size: 9px; font-weight: 900; cursor: pointer; }
  .thematic-button:hover:not(:disabled) { background: #edf3f8; }
  .thematic-button:disabled { cursor: default; opacity: .4; }
  .thematic-button.dark { border-color: #101820; background: #101820; color: #fff; }
  .thematic-opening-grid { display: grid; grid-template-columns: 1.35fr repeat(3,1fr) 1.1fr; gap: 6px; padding: 0 8px 8px; }
  .thematic-opening-slot, .thematic-zone-slot { min-width: 0; padding: 5px; border: 1px dashed #b9c6d4; border-radius: 6px; background: #f6f8fb; transition: border-color .15s, background .15s; }
  .thematic-opening-slot[data-drag-active="true"], .thematic-zone-slot[data-drag-active="true"], .thematic-dropbar[data-drag-active="true"] { border-color: #e43e48; background: #fff2f3; }
  .thematic-slot-label { display: block; margin-bottom: 4px; color: #5e6d7d; font-size: 8px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  .thematic-empty { display: grid; place-items: center; min-height: 55px; margin: 0; color: #8a98a8; font-size: 9px; font-weight: 700; text-align: center; }
  .thematic-zones { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; align-items: start; }
  .thematic-zone-column { display: grid; min-width: 0; gap: 8px; align-content: start; }
  .thematic-zone { min-width: 0; }
  .thematic-zone-list { display: grid; gap: 4px; padding: 0 7px 7px; }
  .thematic-zone-slot { display: grid; grid-template-columns: 20px minmax(0,1fr); gap: 4px; align-items: start; padding: 4px; }
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
  .thematic-bank-panel { min-width: 0; }
  .thematic-bank-panel .thematic-empty { min-height: 36px; }
  .thematic-faixa-tools { display: grid; grid-template-columns: minmax(180px,1fr) auto; gap: 6px; padding: 0 8px 7px; }
  .thematic-search { min-height: 31px; padding: 5px 8px; border: 1px solid #c8d3df; border-radius: 5px; }
  .thematic-faixa-grid, .thematic-bank-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; padding: 0 7px 7px; }
  .thematic-bank-list { grid-template-columns: 1fr; max-height: 520px; overflow: auto; }
  .thematic-more { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 0 8px 8px; color: #64748b; font-size: 9px; }
  .thematic-bulk-body { display: flex; flex-wrap: wrap; gap: 5px; align-items: end; padding: 0 10px 10px; }
  .thematic-bulk-body .thematic-field { min-width: 150px; }
  .thematic-message { margin: 0; padding: 7px 9px; border-radius: 5px; background: #eef5ff; color: #25456e; font-size: 10px; font-weight: 700; }
  .thematic-message.error { background: #fff0f1; color: #a61f29; }
  .thematic-message.feedback { position: sticky; z-index: 26; top: 8px; box-shadow: 0 5px 16px rgba(15,23,42,.12); }
  .thematic-zone-alert { margin: 0 7px 7px; padding: 7px 9px; border: 1px solid #f2b8bd; border-radius: 5px; background: #fff0f1; color: #a61f29; font-size: 9px; font-weight: 800; line-height: 1.35; }
  .thematic-movement-list, .thematic-diagnostics { display: grid; gap: 3px; margin: 0; padding: 0 10px 10px 26px; font-size: 9px; }
  .thematic-pending { position: fixed; z-index: 30; right: 10px; bottom: 8px; left: 10px; display: flex; align-items: center; gap: 6px; width: min(1900px,calc(100% - 20px)); min-height: 48px; margin: 0 auto; padding: 7px 9px; border: 1px solid #c5d0dc; border-radius: 8px; background: rgba(255,255,255,.97); box-shadow: 0 10px 28px rgba(15,23,42,.18); backdrop-filter: blur(10px); }
  .thematic-pending-copy { display: grid; gap: 1px; margin-right: auto; }
  .thematic-pending-copy strong { font-size: 11px; }
  .thematic-pending-copy span { color: #667588; font-size: 8px; }
  @media (max-width: 1250px) { .thematic-opening-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } .thematic-zones { grid-template-columns: repeat(2,minmax(0,1fr)); } .thematic-controls-grid { grid-template-columns: 1fr 1fr; } .thematic-control.order { grid-column: 1 / -1; } }
  @media (max-width: 820px) { .thematic-shell { padding: 7px 7px 102px; } .thematic-hero { align-items: flex-start; flex-direction: column; } .thematic-opening-grid, .thematic-zones, .thematic-controls-grid { grid-template-columns: 1fr; } .thematic-control.order { grid-column: auto; } .thematic-faixa-grid { grid-template-columns: 1fr; } .thematic-pending { flex-wrap: wrap; } .thematic-pending-copy { flex: 1 1 100%; } }
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
  selectedIdentities: readonly string[];
}>;

type WorkspaceDraft = Readonly<{
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  pageControls: MatchdayEditorialProfilePageControls;
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
      <input aria-label={`Selecionar ${item.title ?? item.sourceId}`} checked={selected} onChange={() => onToggle(itemIdentity)} onClick={(event) => event.stopPropagation()} type="checkbox" />
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

export default function MatchdayEditorialThematicDeskClient({ desk }: Readonly<{ desk: MatchdayEditorialProfileDeskSnapshot }>) {
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
    selectedIdentities: [],
  }));
  const [history, setHistory] = useState<readonly WorkspaceDraft[]>([]);
  const [draggingIdentity, setDraggingIdentity] = useState<string | null>(null);
  const [destinationZone, setDestinationZone] = useState<EditorialProfileZoneKey>(profile.zones[0].key);
  const [startPosition, setStartPosition] = useState(1);
  const [faixaPosition, setFaixaPosition] = useState(1);
  const [faixaQuery, setFaixaQuery] = useState("");
  const [faixaVisibleCount, setFaixaVisibleCount] = useState(FAIXA_INITIAL_VISIBLE);
  const [bankQuery, setBankQuery] = useState("");
  const [applyState, setApplyState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [zoneLayoutError, setZoneLayoutError] = useState<Readonly<{
    zoneKey: EditorialProfileZoneKey;
    message: string;
  }> | null>(null);

  useEffect(() => {
    setEditorState((current) => {
      const reconciledOverrides = reconcileMatchdayEditorialProfileDeskSnapshot(incomingProfile, {
        persistedOverrides: current.persistedOverrides,
        draftOverrides: current.draftOverrides,
        selectedIdentities: current.selectedIdentities,
      }, desk.manualOverrides, desk.automaticDistribution.activeItems);
      const openingDirty = !sameJson(current.persistedOpening, current.draftOpening);
      const controlsDirty = !sameJson(current.persistedPageControls, current.draftPageControls);
      const draftOpening = openingDirty ? current.draftOpening : desk.opening;
      return {
        persistedOverrides: reconciledOverrides.persistedOverrides,
        draftOverrides: withoutMatchdayEditorialProfileOpeningOverrides(incomingProfile, reconciledOverrides.draftOverrides, draftOpening),
        persistedOpening: desk.opening,
        draftOpening,
        persistedPageControls: desk.pageControls,
        draftPageControls: controlsDirty ? current.draftPageControls : desk.pageControls,
        selectedIdentities: reconciledOverrides.selectedIdentities,
      };
    });
  }, [desk, profile]);

  const activeItems = desk.automaticDistribution.activeItems;
  const activeByIdentity = useMemo(() => new Map(activeItems.map((item) => [identity(item), item] as const)), [activeItems]);
  const activeIdentities = useMemo(() => new Set(activeByIdentity.keys()), [activeByIdentity]);
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
    || !sameJson(editorState.draftPageControls, editorState.persistedPageControls);
  const zoneByKey = new Map(
    reconcile.zonesAfter.map(
      (zone) => [zone.key, zone] as const,
    ),
  );

  const blockOrderIndex = new Map(
    editorState.draftPageControls.thematicBlockOrder.map(
      (block, index) => [block, index] as const,
    ),
  );
  const selected = useMemo(() => new Set(editorState.selectedIdentities.filter((itemIdentity) => activeIdentities.has(itemIdentity))), [activeIdentities, editorState.selectedIdentities]);
  const selectedIdentities = [...selected];
  const destination = effectiveProfile.zones.find((zone) => zone.key === destinationZone) ?? effectiveProfile.zones[0];

  useEffect(() => {
    setStartPosition((current) => Math.min(current, destination.capacity));
  }, [destination.capacity]);
  const openingIdentities = new Set(matchdayEditorialProfileOpeningSourceIds(editorState.draftOpening).map((sourceId) => thematicEditorialIdentity("editorial_article", sourceId)));
  const circuitActiveItems = activeItems.filter((item) => !openingIdentities.has(identity(item)));

  const normalizedFaixaQuery = faixaQuery.trim().toLocaleLowerCase("pt-PT");
  const filteredFaixa = normalizedFaixaQuery
    ? reconcile.faixaAfter.filter((item) => [item.label, item.title, item.subtitle].some((value) => value?.toLocaleLowerCase("pt-PT").includes(normalizedFaixaQuery)))
    : reconcile.faixaAfter;
  const visibleFaixa = filteredFaixa.slice(0, faixaVisibleCount);
  const normalizedBankQuery = bankQuery.trim().toLocaleLowerCase("pt-PT");
  const visibleBank = normalizedBankQuery
    ? reconcile.bankAfter.filter((item) => [item.label, item.title, item.subtitle].some((value) => value?.toLocaleLowerCase("pt-PT").includes(normalizedBankQuery)))
    : reconcile.bankAfter;

  function currentDraft(): WorkspaceDraft {
    return { overrides: operationalOverrides, opening: editorState.draftOpening, pageControls: editorState.draftPageControls };
  }

  function commitDraft(next: WorkspaceDraft, successMessage: string) {
    setHistory((current) => [...current, currentDraft()]);
    setEditorState((current) => ({ ...current, draftOverrides: next.overrides, draftOpening: next.opening, draftPageControls: next.pageControls, selectedIdentities: [] }));
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

  function openingWithout(itemIdentity: string): MatchdayEditorialProfileOpening {
    return removeMatchdayEditorialProfileItemFromOpening(editorState.draftOpening, sourceIdForIdentity(itemIdentity));
  }

  function activeItemsOutside(opening: MatchdayEditorialProfileOpening) {
    const excluded = new Set(matchdayEditorialProfileOpeningSourceIds(opening).map((sourceId) => thematicEditorialIdentity("editorial_article", sourceId)));
    return activeItems.filter((item) => !excluded.has(identity(item)));
  }

  function placeInOpening(itemIdentity: string, slot: MatchdayEditorialProfileOpeningSlotKey) {
    localOperation(() => {
      const movement = moveMatchdayEditorialProfileItemToOpening(editorState.draftOpening, sourceIdForIdentity(itemIdentity), slot);
      const affected = [itemIdentity];
      if (movement.displacedSourceId) affected.push(thematicEditorialIdentity("editorial_article", movement.displacedSourceId));
      return { overrides: returnMatchdayEditorialItemsToAutomatic(effectiveProfile, operationalOverrides, affected), opening: movement.opening, pageControls: editorState.draftPageControls };
    }, `${MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS[slot]} atualizada em preview; a notícia desalojada regressou ao automático.`);
  }

  function placeInZone(itemIdentity: string, zoneKey: EditorialProfileZoneKey, position: number | null) {
    localOperation(() => {
      const opening = openingWithout(itemIdentity);
      const cleanOverrides = returnMatchdayEditorialItemsToAutomatic(effectiveProfile, operationalOverrides, [itemIdentity]);
      const candidates = activeItemsOutside(opening);
      return {
        overrides: position === null
          ? fixMatchdayEditorialItemsInZone(effectiveProfile, candidates, cleanOverrides, [itemIdentity], zoneKey)
          : fixMatchdayEditorialItemsAtPosition(effectiveProfile, candidates, cleanOverrides, [itemIdentity], zoneKey, position),
        opening,
        pageControls: editorState.draftPageControls,
      };
    }, position === null ? "Notícia protegida manualmente na zona, sem posição absoluta." : `Notícia fixada na posição ${position}; a zona foi recomposta sem duplicações.`);
  }

  function placeInFaixa(itemIdentity: string, position: number) {
    localOperation(() => {
      const opening = openingWithout(itemIdentity);
      const cleanOverrides = returnMatchdayEditorialItemsToAutomatic(effectiveProfile, operationalOverrides, [itemIdentity]);
      return {
        overrides: moveMatchdayEditorialItemsToFaixa(effectiveProfile, activeItemsOutside(opening), cleanOverrides, [itemIdentity], Math.max(1, position)),
        opening,
        pageControls: editorState.draftPageControls,
      };
    }, "Notícia protegida manualmente na Faixa.");
  }

  function placeInBank(itemIdentity: string) {
    localOperation(() => {
      const opening = openingWithout(itemIdentity);
      const cleanOverrides = returnMatchdayEditorialItemsToAutomatic(effectiveProfile, operationalOverrides, [itemIdentity]);
      return { overrides: moveMatchdayEditorialItemsToBank(effectiveProfile, activeItemsOutside(opening), cleanOverrides, [itemIdentity]), opening, pageControls: editorState.draftPageControls };
    }, "Notícia enviada explicitamente para o Banco.");
  }

  function returnToAutomatic(itemIdentity: string) {
    localOperation(() => ({
      overrides: returnMatchdayEditorialItemsToAutomatic(effectiveProfile, operationalOverrides, [itemIdentity]),
      opening: openingWithout(itemIdentity),
      pageControls: editorState.draftPageControls,
    }), "Decisão manual removida; classificação e atualidade voltaram a decidir.");
  }

  function releasePosition(itemIdentity: string) {
    localOperation(() => ({
      overrides: releaseMatchdayEditorialFixedPositions(effectiveProfile, operationalOverrides, [itemIdentity]),
      opening: editorState.draftOpening,
      pageControls: editorState.draftPageControls,
    }), "Posição libertada; a proteção manual da zona foi mantida.");
  }

  function dragged(event: DragEvent<HTMLElement>): string | null {
    const candidate = draggingIdentity ?? event.dataTransfer.getData("text/plain");
    return candidate && activeByIdentity.has(candidate) ? candidate : null;
  }

  function dragStart(event: DragEvent<HTMLElement>, itemIdentity: string) {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,summary,details")) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
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
    setEditorState((current) => ({ ...current, draftOverrides: previous.overrides, draftOpening: previous.opening, draftPageControls: previous.pageControls, selectedIdentities: [] }));
    setHistory((current) => current.slice(0, -1));
    setApplyState("idle");
    setMessage("Última alteração local desfeita.");
  }

  function resetLocal() {
    if (!pending) return;
    setHistory((current) => [...current, currentDraft()]);
    setEditorState((current) => ({ ...current, draftOverrides: persistedOperationalOverrides, draftOpening: current.persistedOpening, draftPageControls: current.persistedPageControls, selectedIdentities: [] }));
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
        }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || payload.ok !== true) throw new Error(payload.message ?? "O Apply temático foi recusado integralmente.");
      setEditorState((current) => ({ ...current, persistedOverrides: operationalOverrides, draftOverrides: operationalOverrides, persistedOpening: current.draftOpening, persistedPageControls: current.draftPageControls, selectedIdentities: [] }));
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
        onAutomatic={() => returnToAutomatic(itemIdentity)}
        onBank={() => placeInBank(itemIdentity)}
        onDragEnd={() => setDraggingIdentity(null)}
        onDragStart={dragStart}
        onFaixa={() => placeInFaixa(itemIdentity, reconcile.faixaAfter.length + 1)}
        onFixPosition={
          placement.kind === "zone"
          && placement.zoneKey
          && item.manualOverride !== "position"
            ? () => placeInZone(
                itemIdentity,
                placement.zoneKey!,
                item.sortOrder,
              )
            : null
        }
        onProtectZone={placement.kind === "zone" && placement.zoneKey && item.manualOverride === null ? () => placeInZone(itemIdentity, placement.zoneKey!, null) : null}
        onReleasePosition={item.manualOverride === "position" ? () => releasePosition(itemIdentity) : null}
        onToggle={toggleSelection}
        placement={placement}
        selected={selected.has(itemIdentity)}
      />
    );
  }

  function renderZonePanel(
    zoneKey: EditorialProfileZoneKey,
  ) {
    const zone = zoneByKey.get(zoneKey);

    if (!zone) {
      return null;
    }

    const publicPosition =
      (blockOrderIndex.get(zone.key) ?? 0) + 1;

    return (
      <article
        className="thematic-panel thematic-zone"
        key={zone.key}
      >
        <div className="thematic-panel-head">
          <div>
            <h2>{zone.label}</h2>
            <p>
              {zone.items.length}/{zone.capacity} · arraste para reordenar
            </p>

            <label className="thematic-public-title">
              <span>Título público</span>
              <input
                aria-label={`Título público de ${zone.label}`}
                disabled={applyState === "saving"}
                maxLength={120}
                onBlur={() =>
                  setMessage(
                    editorState.draftPageControls
                      .thematicZoneTitles[zone.key]
                      .trim()
                      ? `${zone.label}: título público alterado em preview.`
                      : `${zone.label}: sem título público; o leitor verá apenas o conteúdo.`,
                  )
                }
                onChange={(event) => {
                  const value = event.target.value;

                  setEditorState((current) => ({
                    ...current,
                    draftPageControls: {
                      ...current.draftPageControls,
                      thematicZoneTitles: {
                        ...current.draftPageControls
                          .thematicZoneTitles,
                        [zone.key]: value,
                      },
                    },
                  }));

                  setApplyState("idle");
                }}
                placeholder="Sem título público"
                type="text"
                value={
                  editorState.draftPageControls
                    .thematicZoneTitles[zone.key]
                }
              />
            </label>
          </div>

          <div className="thematic-meta">
            <label className="thematic-layout-picker">
              <span>Layout</span>

              <select
                aria-label={`Layout de ${zone.label}`}
                disabled={applyState === "saving"}
                onChange={(event) =>
                  changeZoneLayout(
                    zone.key,
                    (event.target.value as EditorialVisualFamily),
                  )
                }
                value={
                  editorState.draftPageControls
                    .thematicZoneLayouts[zone.key]
                }
              >
                {EDITORIAL_VISUAL_FAMILIES.map(
                  (family) => (
                    <option
                      key={family}
                      value={family}
                    >
                      {
                        EDITORIAL_VISUAL_FAMILY_DEFINITIONS[
                          family
                        ].label
                      }
                    </option>
                  ),
                )}
              </select>
            </label>

            <span>{zone.capacity} posições</span>
            <span>
              público · {String(publicPosition).padStart(2, "0")}
            </span>
          </div>
        </div>

        {zoneLayoutError?.zoneKey === zone.key ? (
          <p
            className="thematic-zone-alert"
            role="alert"
          >
            {zoneLayoutError.message}
          </p>
        ) : null}

        <div
          className="thematic-dropbar"
          data-drag-active={draggingIdentity !== null}
          onDragOver={allowDrop}
          onDrop={(event) => {
            event.preventDefault();

            const itemIdentity =
              dragged(event);

            if (itemIdentity) {
              placeInZone(
                itemIdentity,
                zone.key,
                null,
              );
            }

            setDraggingIdentity(null);
          }}
        >
          Largar aqui · proteger na zona sem posição fixa
        </div>

        <div className="thematic-zone-list">
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
                className="thematic-zone-slot"
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
                  {position}
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

  return (
    <main className="thematic-shell">
      <style>{styles}</style>
      <div className="thematic-content">
        <header className="thematic-hero">
          <div className="thematic-hero-main">
            <p className="thematic-eyebrow">Mesa Temática · manipulação direta</p>
            <h1>{desk.profileDisplayName}</h1>
            <span className="thematic-context">{desk.competitionName} · {desk.seasonLabel} · {desk.matchdayLabel} · revisão {desk.reconcileRevision}</span>
            <span className={`thematic-status${pending ? " pending" : ""}`}>{pending ? "Preview · alterações pendentes" : "Estado aplicado · sem pendentes"}</span>
          </div>
          <nav><a href={`/admin/editorial/jornada/${desk.matchdayId}`}>Editorial atual</a><a href="/admin">Backoffice</a></nav>
        </header>

        {message ? (
          <p
            aria-live={applyState === "error" ? "assertive" : "polite"}
            className={`thematic-message feedback${applyState === "error" ? " error" : ""}`}
          >
            {message}
          </p>
        ) : null}

        <details className="thematic-panel thematic-controls">
          <summary>Controlos da página viva · Últimas, títulos públicos, layouts, ordem dos blocos e cor da Manchete</summary>
          <div className="thematic-controls-grid">
            <section className="thematic-control">
              <h3>Posição de Últimas</h3>
              <label className="thematic-field">Apresentação pública
                <select onChange={(event) => commitDraft({ ...currentDraft(), pageControls: { ...editorState.draftPageControls, latestZonePlacement: event.target.value as MatchdayEditorialProfilePageControls["latestZonePlacement"] } }, "Posição de Últimas alterada em preview.")} value={editorState.draftPageControls.latestZonePlacement}>
                  <option value="top">Ao lado da Manchete</option><option value="four_news">Na zona de 4 notícias</option><option value="hidden">Ocultas</option>
                </select>
              </label>
            </section>
            <section className="thematic-control">
              <h3>Cor do texto da Manchete</h3>
              <div className="thematic-color-row">
                <input aria-label="Cor do texto da Manchete" onChange={(event) => commitDraft({ ...currentDraft(), pageControls: { ...editorState.draftPageControls, headlineTitleColor: event.target.value.toUpperCase() } }, "Cor da Manchete alterada em preview.")} type="color" value={editorState.draftPageControls.headlineTitleColor ?? "#FFFFFF"} />
                <code>{editorState.draftPageControls.headlineTitleColor ?? "automática"}</code>
                <button className="thematic-button" disabled={editorState.draftPageControls.headlineTitleColor === null} onClick={() => commitDraft({ ...currentDraft(), pageControls: { ...editorState.draftPageControls, headlineTitleColor: null } }, "Cor da Manchete devolvida ao valor automático.")} type="button">Automática</button>
              </div>
            </section>
            <section className="thematic-control order">
              <h3>Ordem dos blocos editoriais</h3>
              <div className="thematic-order">
                {editorState.draftPageControls.thematicBlockOrder.map((block, index) => {
                  const label = block === "latest"
                    ? editorState.draftPageControls.latestZonePlacement === "four_news"
                      ? "Últimas + 4 notícias"
                      : "Últimas"
                    : profile.zones.find((candidate) => candidate.key === block)?.label ?? block;

                  return (
                    <div className="thematic-order-row" key={block}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{label}</strong>
                      <div className="thematic-order-actions">
                        <button className="thematic-button" disabled={index === 0} onClick={() => moveContentBlock(block, "up")} type="button">↑</button>
                        <button className="thematic-button" disabled={index === editorState.draftPageControls.thematicBlockOrder.length - 1} onClick={() => moveContentBlock(block, "down")} type="button">↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </details>

        <section className="thematic-panel" aria-label="Abertura editorial manual">
          <div className="thematic-panel-head"><div><h2>Abertura</h2><p>100% manual · nenhuma vaga é preenchida ou promovida automaticamente</p></div><div className="thematic-meta"><span>colocação exclusiva</span><span>desalojado → automático</span></div></div>
          <div className="thematic-opening-grid">
            {MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.map((slot) => {
              const sourceId = editorState.draftOpening[slot];
              const item = sourceId ? activeByIdentity.get(thematicEditorialIdentity("editorial_article", sourceId)) : null;
              return (
                <div className="thematic-opening-slot" data-drag-active={draggingIdentity !== null} key={slot} onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); const itemIdentity = dragged(event); if (itemIdentity) placeInOpening(itemIdentity, slot); setDraggingIdentity(null); }}>
                  <span className="thematic-slot-label">{MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS[slot]}</span>
                  {item ? cardFor({ ...item, manualOverride: null }, { kind: "opening" }) : <p className="thematic-empty">Arraste uma notícia para esta posição</p>}
                </div>
              );
            })}
          </div>
        </section>

        <section
          className="thematic-zones"
          aria-label="Cinco zonas temáticas, Últimas e Banco explícito"
        >
          <div className="thematic-zone-column">
            {renderZonePanel("benfica")}
            {renderZonePanel("other_liga_clubs")}

            <article
              className="thematic-panel thematic-zone thematic-latest-block"
            >
              <div className="thematic-panel-head">
                <div>
                  <h2>
                    {
                      editorState.draftPageControls
                        .latestZonePlacement === "four_news"
                        ? "Últimas + 4 notícias"
                        : "Últimas"
                    }
                  </h2>

                  <p>
                    {
                      editorState.draftPageControls
                        .latestZonePlacement === "four_news"
                        ? "Bloco ordenável · quatro notícias são projetadas automaticamente a partir de Últimas"
                        : editorState.draftPageControls
                            .latestZonePlacement === "top"
                          ? "Últimas está junto da Manchete · esta ordem fica guardada para o modo de 4 notícias"
                          : "Últimas está oculta · esta ordem fica guardada para quando o bloco voltar a ser usado"
                    }
                  </p>
                </div>

                <div className="thematic-meta">
                  <span>
                    {
                      editorState.draftPageControls
                        .latestZonePlacement
                    }
                  </span>

                  <span>
                    público · {
                      String(
                        (blockOrderIndex.get("latest") ?? 0)
                          + 1,
                      ).padStart(2, "0")
                    }
                  </span>
                </div>
              </div>

              <div className="thematic-latest-body">
                <label className="thematic-public-title">
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
                    placeholder="Sem título público"
                    type="text"
                    value={
                      editorState.draftPageControls
                        .latestZoneTitle
                    }
                  />
                </label>
                <strong>Bloco automático</strong>

                <span>
                  Move-se publicamente segundo a ordem definida
                  nos controlos acima. Nesta Mesa fica aqui apenas
                  para aproveitar melhor o espaço de trabalho.
                </span>

                <span>
                  As quatro notícias não são escolhidas
                  manualmente e não criam storage paralelo.
                </span>
              </div>
            </article>
          </div>

          <div className="thematic-zone-column">
            {renderZonePanel("sporting")}
            {renderZonePanel("outside_liga_other")}
          </div>

          <div className="thematic-zone-column">
            {renderZonePanel("fc_porto")}

            <aside
              className="thematic-panel thematic-bank-panel"
              onDragOver={allowDrop}
              onDrop={(event) => {
                event.preventDefault();

                const itemIdentity =
                  dragged(event);

                if (itemIdentity) {
                  placeInBank(itemIdentity);
                }

                setDraggingIdentity(null);
              }}
            >
              <div className="thematic-panel-head">
                <div>
                  <h2>Banco explícito</h2>

                  <p>
                    {reconcile.bankAfter.length} · nunca recebe
                    overflow automático
                  </p>
                </div>
              </div>

              <div className="thematic-faixa-tools">
                <input
                  aria-label="Pesquisar no Banco"
                  className="thematic-search"
                  onChange={(event) =>
                    setBankQuery(event.target.value)
                  }
                  placeholder="Pesquisar…"
                  type="search"
                  value={bankQuery}
                />
              </div>

              <div
                className="thematic-dropbar"
                data-drag-active={
                  draggingIdentity !== null
                }
              >
                Largar aqui · retirar explicitamente
              </div>

              <div className="thematic-bank-list">
                {visibleBank.length > 0
                  ? visibleBank.map(
                      (item) =>
                        cardFor(
                          item,
                          { kind: "bank" },
                        ),
                    )
                  : (
                    <p className="thematic-empty">
                      Sem decisões explícitas de Banco.
                    </p>
                  )}
              </div>
            </aside>
          </div>
        </section>
        <article className="thematic-panel" aria-label="Faixa partilhada completa">
          <div className="thematic-panel-head"><div><h2>Faixa</h2><p>{reconcile.faixaAfter.length} notícias · primeiras 10 montadas inicialmente · fila completa preservada</p></div><div className="thematic-meta"><span>ilimitada internamente</span><span>público: primeiras 10</span></div></div>
          <div className="thematic-faixa-tools">
            <input aria-label="Pesquisar na Faixa completa" className="thematic-search" onChange={(event) => { setFaixaQuery(event.target.value); setFaixaVisibleCount(FAIXA_INITIAL_VISIBLE); }} placeholder="Pesquisar em toda a Faixa…" type="search" value={faixaQuery} />
            <span className="thematic-meta"><span>{visibleFaixa.length}/{filteredFaixa.length} montadas</span></span>
          </div>
          <div className="thematic-dropbar" data-drag-active={draggingIdentity !== null} onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); const itemIdentity = dragged(event); if (itemIdentity) placeInFaixa(itemIdentity, reconcile.faixaAfter.length + 1); setDraggingIdentity(null); }}>Largar aqui · manter manualmente na Faixa</div>
          <div className="thematic-faixa-grid">
            {visibleFaixa.length > 0 ? visibleFaixa.map((item) => (
              <div className="thematic-zone-slot" data-drag-active={draggingIdentity !== null} key={identity(item)} onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const itemIdentity = dragged(event); if (itemIdentity) placeInFaixa(itemIdentity, item.sortOrder); setDraggingIdentity(null); }}>
                <span className="thematic-position">{item.sortOrder}</span>{cardFor(item, { kind: "faixa" })}
              </div>
            )) : <p className="thematic-empty">Faixa vazia ou sem resultados.</p>}
          </div>
          {visibleFaixa.length < filteredFaixa.length ? <div className="thematic-more"><button className="thematic-button" onClick={() => setFaixaVisibleCount((count) => count + FAIXA_PAGE_SIZE)} type="button">Mostrar mais 10</button><span>{filteredFaixa.length - visibleFaixa.length} ainda não montadas</span></div> : null}
        </article>

        <details className="thematic-panel thematic-bulk">
          <summary>Seleção múltipla e fallback acessível · {selected.size} selecionada(s)</summary>
          <div className="thematic-bulk-body">
            <label className="thematic-field">Zona<select value={destinationZone} onChange={(event) => { setDestinationZone(event.target.value as EditorialProfileZoneKey); setStartPosition(1); }}>{profile.zones.map((zone) => <option key={zone.key} value={zone.key}>{zone.label}</option>)}</select></label>
            <label className="thematic-field">Posição inicial<select value={startPosition} onChange={(event) => setStartPosition(Number(event.target.value))}>{Array.from({ length: destination.capacity }, (_, index) => index + 1).map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
            <label className="thematic-field">Posição na Faixa<select value={faixaPosition} onChange={(event) => setFaixaPosition(Number(event.target.value))}>{Array.from({ length: Math.max(1, reconcile.faixaAfter.length + 1) }, (_, index) => index + 1).map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
            <button className="thematic-button" disabled={selected.size === 0} onClick={() => localOperation(() => ({ overrides: fixMatchdayEditorialItemsAtPosition(effectiveProfile, circuitActiveItems, operationalOverrides, selectedIdentities, destinationZone, startPosition), opening: editorState.draftOpening, pageControls: editorState.draftPageControls }), "Seleção colocada em posições fixas.")} type="button">Fixar posição</button>
            <button className="thematic-button" disabled={selected.size === 0} onClick={() => localOperation(() => ({ overrides: fixMatchdayEditorialItemsInZone(effectiveProfile, circuitActiveItems, operationalOverrides, selectedIdentities, destinationZone), opening: editorState.draftOpening, pageControls: editorState.draftPageControls }), "Seleção protegida na zona.")} type="button">Proteger na zona</button>
            <button className="thematic-button" disabled={selected.size === 0} onClick={() => localOperation(() => ({ overrides: moveMatchdayEditorialItemsToFaixa(effectiveProfile, circuitActiveItems, operationalOverrides, selectedIdentities, faixaPosition), opening: editorState.draftOpening, pageControls: editorState.draftPageControls }), "Seleção protegida na Faixa.")} type="button">Mover para Faixa</button>
            <button className="thematic-button" disabled={selected.size === 0} onClick={() => localOperation(() => ({ overrides: moveMatchdayEditorialItemsToBank(effectiveProfile, circuitActiveItems, operationalOverrides, selectedIdentities), opening: editorState.draftOpening, pageControls: editorState.draftPageControls }), "Seleção enviada para Banco.")} type="button">Mover para Banco</button>
            <button className="thematic-button" disabled={selected.size === 0} onClick={() => localOperation(() => ({ overrides: returnMatchdayEditorialItemsToAutomatic(effectiveProfile, operationalOverrides, selectedIdentities), opening: editorState.draftOpening, pageControls: editorState.draftPageControls }), "Seleção devolvida ao automático.")} type="button">Devolver ao automático</button>
          </div>
        </details>

        {reconcile.movements.length > 0 ? <details className="thematic-panel thematic-movements"><summary>Movimentos em preview · {reconcile.movements.length}</summary><ul className="thematic-movement-list">{reconcile.movements.map((movement) => <li key={thematicEditorialIdentity(movement.sourceType, movement.sourceId)}>{movement.title ?? movement.sourceId} · {movement.from.kind} → {movement.to.kind}</li>)}</ul></details> : null}
        {desk.inactiveHistoricalCount > 0 ? <p className="thematic-message">Estado histórico inativo: {desk.inactiveHistoricalCount}</p> : null}
        <Diagnostics diagnostics={desk.diagnostics} />

      </div>

      <footer className="thematic-pending" aria-live="polite">
        <div className="thematic-pending-copy"><strong>{pending ? "ALTERAÇÕES PENDENTES · PREVIEW NÃO PUBLICADO" : "ESTADO APLICADO · SEM ALTERAÇÕES PENDENTES"}</strong><span>{operationalOverrides.length} decisões temáticas · {matchdayEditorialProfileOpeningSourceIds(editorState.draftOpening).length}/5 posições de Abertura · GET sem writes</span></div>
        <button className="thematic-button" disabled={history.length === 0} onClick={undo} type="button">Desfazer</button>
        <button className="thematic-button" disabled={!pending} onClick={resetLocal} type="button">Reset local</button>
        <button className="thematic-button dark" disabled={!pending || applyState === "saving"} onClick={applyChanges} type="button">{applyState === "saving" ? "A aplicar…" : "Aplicar alterações"}</button>
      </footer>
    </main>
  );
}
