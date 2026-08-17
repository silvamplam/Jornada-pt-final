"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS,
  HIERARCHICAL_COMPOSITION_DESK_SECTIONS,
} from "@/lib/editorial-hierarchical-composition";
import {
  placementGroupForKey,
  placementLabelForKey,
} from "@/lib/editorial-matchday-desk-model";

export type HierarchicalCompositionDeskArticle = {
  bankItemId: string;
  articleId: string;
  label: string | null;
  title: string;
  imageUrl: string | null;
  publishedAt: string | null;
  inLatest: boolean;
  placementKey: string | null;
};

export type HierarchicalCompositionDeskVideo = {
  id: string;
  label: string | null;
  title: string;
  imageUrl: string | null;
  duration: string | null;
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

type DeskFilter =
  | "all"
  | "latest"
  | "latest_without_zone"
  | "four_news"
  | "six_news"
  | "five_news_balanced"
  | "five_news_secondary"
  | "faixa"
  | "videos"
  | "highlight"
  | "unplaced";

type TargetCard = {
  persistedId: string | null;
  bankItemId: string | null;
  title: string;
};

type PlanState = {
  slots: Record<string, TargetCard | null>;
  auxiliary: Record<string, TargetCard | null>;
};

type PlanOperation =
  | { kind: "unassign_slot"; slotId: string }
  | { kind: "remove_auxiliary"; itemId: string }
  | { kind: "assign_slot"; slotKey: string; bankItemId: string }
  | { kind: "assign_auxiliary"; target: string; bankItemId: string };

type Props = {
  articles: HierarchicalCompositionDeskArticle[];
  auxiliaryItems: HierarchicalCompositionDeskAuxiliary[];
  children?: ReactNode;
  compositionId: string;
  matchdayId: string;
  slots: HierarchicalCompositionDeskSlot[];
  videos: HierarchicalCompositionDeskVideo[];
};

const styles = `
  .composition-admin-shell-desk {
    padding: 10px 12px 72px;
  }

  .composition-admin-shell-desk > .composition-admin-preview-section {
    display: none;
  }

  .composition-admin-shell-desk .composition-admin-hero {
    min-height: 52px;
    padding: 8px 12px;
    align-items: center;
  }

  .composition-admin-shell-desk .composition-admin-hero h1 {
    margin-top: 3px;
    font-size: 22px;
  }

  .composition-admin-shell-desk .composition-admin-hero p {
    font-size: 10px;
  }

  .composition-admin-shell-desk .composition-admin-hero span {
    margin-top: 4px;
    font-size: 11px;
  }

  .composition-admin-shell-desk .composition-admin-actions {
    gap: 5px;
  }

  .composition-admin-shell-desk .composition-admin-button {
    min-height: 29px;
    padding: 0 8px;
    font-size: 9px;
  }

  .composition-admin-shell-desk .composition-context-selector {
    grid-template-columns: minmax(170px, .55fr) minmax(0, 2.45fr);
    gap: 8px;
    margin-top: 7px;
    padding: 7px 9px;
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
    gap: 6px;
  }

  .composition-admin-shell-desk .composition-context-selector-field select {
    min-height: 30px;
    font-size: 10px;
  }

  .composition-admin-shell-desk .composition-admin-mode-selector {
    margin-top: 7px;
  }

  .hc-desk-workspace {
    display: grid;
    grid-template-columns: minmax(420px, .9fr) minmax(620px, 1.1fr);
    gap: 10px;
    width: calc(100vw - 24px);
    max-width: 1920px;
    margin: 8px calc(50% - 50vw + 12px) 68px;
  }

  .hc-desk-library,
  .hc-desk-map {
    height: calc(100vh - 205px);
    min-height: 540px;
    overflow: auto;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 7px 18px rgba(12,22,34,.05);
  }

  .hc-desk-toolbar {
    position: sticky;
    top: 0;
    z-index: 6;
    display: grid;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #dce3eb;
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

  .hc-desk-filters,
  .hc-desk-bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
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
    gap: 5px;
    padding: 7px;
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
    gap: 7px;
    align-content: start;
    padding: 8px;
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
    gap: 6px;
    padding: 8px;
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
    gap: 6px;
  }

  .hc-desk-slots-4 {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .hc-desk-slots-5 {
    grid-template-columns: repeat(5, minmax(0,1fr));
  }

  .hc-desk-slots-6 {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }

  .hc-desk-slot {
    min-width: 0;
    min-height: 68px;
    padding: 6px;
    border: 1px dashed #b8c4d2;
    border-radius: 5px;
    background: #ffffff;
  }

  .hc-desk-slot > small {
    display: block;
    margin-bottom: 4px;
    color: #64748b;
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .hc-desk-empty {
    display: grid;
    place-items: center;
    min-height: 43px;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
  }

  .hc-desk-card {
    display: grid;
    gap: 4px;
    min-height: 44px;
    padding: 6px;
    border-radius: 5px;
    background: #ffffff;
    box-shadow: 0 2px 7px rgba(15,23,42,.07);
  }

  .hc-desk-card strong {
    font-size: 11px;
    line-height: 1.12;
  }

  .hc-desk-card button {
    justify-self: end;
    min-height: 22px;
    padding: 2px 5px;
    font-size: 9px;
  }

  .hc-desk-tools {
    display: grid;
    gap: 7px;
  }

  .hc-desk-tool {
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #ffffff;
  }

  .hc-desk-tool > summary {
    cursor: pointer;
    padding: 9px 10px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .hc-desk-tool-body {
    padding: 0 8px 8px;
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
  .hc-desk-bulk button:disabled {
    opacity: .45;
    cursor: default;
  }

  @media (max-width: 1180px) {
    .hc-desk-workspace {
      grid-template-columns: 1fr;
      width: 100%;
      margin: 8px 0 68px;
    }

    .hc-desk-library,
    .hc-desk-map {
      height: auto;
      min-height: 0;
      max-height: none;
    }

    .hc-desk-slots-5,
    .hc-desk-slots-6 {
      grid-template-columns: repeat(2, minmax(0,1fr));
    }
  }

  @media (max-width: 720px) {
    .hc-desk-row {
      grid-template-columns: 18px 22px minmax(0,1fr);
    }

    .hc-desk-row img,
    .hc-desk-image {
      display: none;
    }

    .hc-desk-slots-4,
    .hc-desk-slots-5,
    .hc-desk-slots-6 {
      grid-template-columns: 1fr;
    }

    .hc-desk-pending {
      flex-wrap: wrap;
    }

    .hc-desk-pending div {
      flex: 1 1 100%;
    }
  }
`;

function identity(card: TargetCard | null) {
  if (!card) return "";
  if (card.bankItemId) return `bank:${card.bankItemId}`;
  return card.persistedId ? `persisted:${card.persistedId}` : "";
}

function initialPlan(
  slots: HierarchicalCompositionDeskSlot[],
  auxiliaryItems: HierarchicalCompositionDeskAuxiliary[],
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
    video_highlight: null,
  };

  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.forEach((position) => {
    auxiliary[`beyond_matchday_${position.sortOrder}`] = null;
  });

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
  );
}

function liveStatus(article: HierarchicalCompositionDeskArticle) {
  if (!article.inLatest && !article.placementKey) {
    return "SEM COLOCAÇÃO";
  }

  const latest = article.inLatest ? "ÚLTIMAS" : "FORA DE ÚLTIMAS";

  return `${latest} + ${placementLabelForKey(
    article.placementKey,
  ).toUpperCase()}`;
}

export default function HierarchicalCompositionDeskClient({
  articles,
  auxiliaryItems,
  children,
  compositionId,
  matchdayId,
  slots,
  videos,
}: Props) {
  const [basePlan] = useState(() =>
    initialPlan(slots, auxiliaryItems),
  );
  const [plan, setPlan] = useState(() =>
    initialPlan(slots, auxiliaryItems),
  );
  const [history, setHistory] = useState<PlanState[]>([]);
  const [selectedBankItemId, setSelectedBankItemId] =
    useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [filter, setFilter] = useState<DeskFilter>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);

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

  const placementByBankItem = useMemo(() => {
    const result = new Map<string, string>();

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

    return result;
  }, [plan]);

  const normalizedSearch =
    search.trim().toLocaleLowerCase("pt-PT");

  const filteredArticles = useMemo(
    () =>
      articles.filter((article) => {
        const searchMatches =
          !normalizedSearch ||
          article.title
            .toLocaleLowerCase("pt-PT")
            .includes(normalizedSearch) ||
          (article.label ?? "")
            .toLocaleLowerCase("pt-PT")
            .includes(normalizedSearch);

        if (!searchMatches) return false;

        const group =
          placementGroupForKey(article.placementKey);

        if (filter === "videos") return false;
        if (filter === "latest") return article.inLatest;

        if (filter === "latest_without_zone") {
          return article.inLatest && !article.placementKey;
        }

        if (filter === "four_news") {
          return group === "four_news";
        }

        if (filter === "six_news") {
          return group === "six_news";
        }

        if (filter === "five_news_balanced") {
          return group === "five_news_balanced";
        }

        if (filter === "five_news_secondary") {
          return group === "five_news_secondary";
        }

        if (filter === "faixa") {
          return group === "faixa";
        }

        if (filter === "highlight") {
          return group === "complement";
        }

        if (filter === "unplaced") {
          return !article.inLatest && !article.placementKey;
        }

        return true;
      }),
    [articles, filter, normalizedSearch],
  );

  const filteredVideos = useMemo(
    () =>
      filter === "all" || filter === "videos"
        ? videos.filter(
            (video) =>
              !normalizedSearch ||
              video.title
                .toLocaleLowerCase("pt-PT")
                .includes(normalizedSearch) ||
              (video.label ?? "")
                .toLocaleLowerCase("pt-PT")
                .includes(normalizedSearch),
          )
        : [],
    [filter, normalizedSearch, videos],
  );

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

  function removeBankItem(
    current: PlanState,
    bankItemId: string,
  ): PlanState {
    const nextSlots = { ...current.slots };
    const nextAuxiliary = { ...current.auxiliary };

    Object.entries(nextSlots).forEach(([key, card]) => {
      if (card?.bankItemId === bankItemId) {
        nextSlots[key] = null;
      }
    });

    Object.entries(nextAuxiliary).forEach(([key, card]) => {
      if (card?.bankItemId === bankItemId) {
        nextAuxiliary[key] = null;
      }
    });

    return {
      slots: nextSlots,
      auxiliary: nextAuxiliary,
    };
  }

  function placeSelected() {
    if (!selectedBankItemId) {
      setMessage("Seleciona primeiro uma notícia.");
      return;
    }

    if (!destination) {
      setMessage("Escolhe o lugar de destino.");
      return;
    }

    const article =
      articleByBankId.get(selectedBankItemId);

    if (!article) {
      setMessage(
        "A publicação selecionada já não está disponível.",
      );
      return;
    }

    let next =
      removeBankItem(plan, selectedBankItemId);

    const card: TargetCard = {
      persistedId: null,
      bankItemId: selectedBankItemId,
      title: article.title,
    };

    if (destination.startsWith("slot::")) {
      const key =
        destination.slice("slot::".length);

      if (
        next.slots[key] &&
        next.slots[key]?.bankItemId !== selectedBankItemId
      ) {
        setMessage(
          "Esse lugar está ocupado. Retira primeiro o conteúdo atual.",
        );
        return;
      }

      next = {
        ...next,
        slots: {
          ...next.slots,
          [key]: card,
        },
      };
    }
    else if (destination.startsWith("aux::")) {
      const key =
        destination.slice("aux::".length);

      if (
        next.auxiliary[key] &&
        next.auxiliary[key]?.bankItemId !== selectedBankItemId
      ) {
        setMessage(
          "Esse lugar está ocupado. Retira primeiro o conteúdo atual.",
        );
        return;
      }

      next = {
        ...next,
        auxiliary: {
          ...next.auxiliary,
          [key]: card,
        },
      };
    }
    else {
      setMessage("Destino inválido.");
      return;
    }

    commit(
      next,
      "Colocação planeada. Usa Aplicar alterações para guardar.",
    );

    setSelectedBankItemId(null);
    setDestination("");
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

    setSelectedBankItemId(null);
    setDestination("");
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

    setSelectedBankItemId(null);
    setDestination("");
  }

  function undo() {
    const previous = history.at(-1);

    if (!previous) return;

    setPlan(previous);
    setHistory((items) => items.slice(0, -1));
    setSelectedBankItemId(null);
    setDestination("");
    setMessage("Última alteração desfeita.");
  }

  function reset() {
    if (samePlan(plan, basePlan)) return;

    setHistory((items) => [...items, plan]);
    setPlan(basePlan);
    setSelectedBankItemId(null);
    setDestination("");
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

  async function applyChanges() {
    const planned = operations();

    if (planned.length === 0) return;

    setIsApplying(true);
    setMessage("A aplicar alterações da Composição…");

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
          "Não foi possível aplicar as alterações.",
        );
        return;
      }

      setSelectedBankItemId(null);
      setDestination("");
      window.location.reload();
    }
    catch {
      setMessage(
        "Não foi possível contactar a aplicação da Composição.",
      );
    }
    finally {
      setIsApplying(false);
    }
  }

  function renderCard(
    card: TargetCard | null,
    onRemove: () => void,
  ) {
    if (!card) {
      return (
        <span className="hc-desk-empty">
          Livre
        </span>
      );
    }

    return (
      <article className="hc-desk-card">
        <strong>{card.title}</strong>

        <button
          type="button"
          onClick={onRemove}
        >
          Retirar
        </button>
      </article>
    );
  }

  const filters:
    Array<[DeskFilter, string]> = [
      ["all", "Todas"],
      ["latest", "Últimas"],
      ["latest_without_zone", "Sem zona nas Últimas"],
      ["four_news", "4 notícias"],
      ["six_news", "6 notícias"],
      ["five_news_balanced", "5 notícias principais"],
      ["five_news_secondary", "5 notícias secundárias"],
      ["faixa", "Faixa"],
      ["videos", "Vídeos"],
      ["highlight", "Destaque da Jornada"],
      ["unplaced", "Sem colocação"],
    ];

  const occupiedCore =
    Object.values(plan.slots)
      .filter(Boolean)
      .length;

  const occupiedBeyond =
    HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS
      .filter(
        (position) =>
          Boolean(
            plan.auxiliary[
              `beyond_matchday_${position.sortOrder}`
            ],
          ),
      )
      .length;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: styles,
        }}
      />

      <div className="hc-desk-workspace">
        <section
          className="hc-desk-library"
          aria-label="Banco da Mesa"
        >
          <div className="hc-desk-toolbar">
            <div className="hc-desk-search">
              <input
                type="search"
                placeholder="Pesquisar por título ou antetítulo"
                value={search}
                onChange={(
                  event:
                    ChangeEvent<HTMLInputElement>,
                ) =>
                  setSearch(
                    event.target.value,
                  )
                }
              />

              <strong>
                {
                  filteredArticles.length +
                  filteredVideos.length
                }
                /
                {
                  articles.length +
                  videos.length
                }
              </strong>
            </div>

            <div
              className="hc-desk-filters"
              aria-label="Filtros"
            >
              {filters.map(
                ([key, label]) => (
                  <button
                    className={
                      filter === key
                        ? "active"
                        : ""
                    }
                    key={key}
                    type="button"
                    onClick={() =>
                      setFilter(key)
                    }
                  >
                    {label}
                  </button>
                ),
              )}
            </div>

            <div className="hc-desk-bulk">
              <strong>
                {
                  selectedBankItemId
                    ? "1 selecionada"
                    : "0 selecionadas"
                }
              </strong>

              <select
                value={destination}
                onChange={(
                  event:
                    ChangeEvent<HTMLSelectElement>,
                ) =>
                  setDestination(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Colocar em…
                </option>

                {
                  HIERARCHICAL_COMPOSITION_DESK_SECTIONS
                    .map((section) => (
                      <optgroup
                        key={section.key}
                        label={section.title}
                      >
                        {
                          section.slots
                            .map((definition) => {
                              const card =
                                plan.slots[
                                  definition.key
                                ];

                              const disabled =
                                Boolean(card) &&
                                card?.bankItemId !==
                                  selectedBankItemId;

                              return (
                                <option
                                  disabled={disabled}
                                  key={definition.key}
                                  value={`slot::${definition.key}`}
                                >
                                  {definition.label}
                                  {disabled ? " — ocupado" : ""}
                                </option>
                              );
                            })
                        }
                      </optgroup>
                    ))
                }

                <optgroup label="Momentos posteriores">
                  <option
                    disabled={
                      Boolean(
                        plan.auxiliary.video_highlight,
                      ) &&
                      plan.auxiliary.video_highlight
                        ?.bankItemId !==
                        selectedBankItemId
                    }
                    value="aux::video_highlight"
                  >
                    Destaque da Jornada
                    {
                      plan.auxiliary.video_highlight &&
                      plan.auxiliary.video_highlight
                        .bankItemId !== selectedBankItemId
                        ? " — ocupado"
                        : ""
                    }
                  </option>

                  {
                    HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS
                      .map((position) => {
                        const target =
                          `beyond_matchday_${position.sortOrder}`;

                        const card =
                          plan.auxiliary[target];

                        const disabled =
                          Boolean(card) &&
                          card?.bankItemId !==
                            selectedBankItemId;

                        return (
                          <option
                            disabled={disabled}
                            key={position.key}
                            value={`aux::${target}`}
                          >
                            Para Lá · {position.label}
                            {disabled ? " — ocupado" : ""}
                          </option>
                        );
                      })
                  }
                </optgroup>
              </select>

              <button
                className="primary"
                type="button"
                disabled={
                  !selectedBankItemId ||
                  !destination
                }
                onClick={placeSelected}
              >
                Colocar
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedBankItemId(null);
                  setDestination("");
                }}
              >
                Limpar seleção
              </button>
            </div>

            {
              message
                ? (
                  <p className="hc-desk-message">
                    {message}
                  </p>
                )
                : null
            }
          </div>

          <div className="hc-desk-list">
            {
              filteredArticles
                .map((article) => {
                  const selected =
                    selectedBankItemId ===
                    article.bankItemId;

                  const compositionPlacement =
                    placementByBankItem.get(
                      article.bankItemId,
                    );

                  return (
                    <label
                      className={
                        `hc-desk-row${
                          selected
                            ? " selected"
                            : ""
                        }`
                      }
                      key={article.bankItemId}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          setSelectedBankItemId(
                            event.target.checked
                              ? article.bankItemId
                              : null,
                          );

                          if (!event.target.checked) {
                            setDestination("");
                          }
                        }}
                      />

                      <b className="hc-desk-rank">
                        {selected ? "1" : "·"}
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

                      <span className="hc-desk-copy">
                        <span className="hc-desk-meta">
                          {
                            article.label
                              ? (
                                <em>
                                  {article.label}
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

                        <small>
                          {
                            compositionPlacement
                              ? `COMPOSIÇÃO · ${compositionPlacement.toUpperCase()}`
                              : liveStatus(article)
                          }
                        </small>
                      </span>
                    </label>
                  );
                })
            }

            {
              filteredVideos
                .map((video) => (
                  <article
                    className="hc-desk-row"
                    key={`video:${video.id}`}
                  >
                    <span />

                    <span className="hc-desk-rank">
                      ▶
                    </span>

                    {
                      video.imageUrl
                        ? (
                          <img
                            alt=""
                            src={video.imageUrl}
                          />
                        )
                        : (
                          <span className="hc-desk-image" />
                        )
                    }

                    <span className="hc-desk-copy">
                      <span className="hc-desk-meta">
                        <em>VÍDEO</em>

                        {
                          video.duration
                            ? (
                              <span>
                                {video.duration}
                              </span>
                            )
                            : null
                        }
                      </span>

                      <strong>
                        {video.title}
                      </strong>

                      <small>
                        A JORNADA EM VÍDEO · edição na zona própria
                      </small>
                    </span>
                  </article>
                ))
            }
          </div>
        </section>

        <section
          className="hc-desk-map"
          aria-label="Mapa da Composição planeada"
        >
          <div className="hc-desk-summary">
            <div>
              <span>15 lugares</span>
              <strong>{occupiedCore}/15</strong>
            </div>

            <div>
              <span>Destaque</span>
              <strong>
                {
                  plan.auxiliary.video_highlight
                    ? 1
                    : 0
                }
                /1
              </strong>
            </div>

            <div>
              <span>Para Lá</span>
              <strong>{occupiedBeyond}/5</strong>
            </div>

            <div>
              <span>Alteradas</span>
              <strong>{pendingCount}</strong>
            </div>
          </div>

          {
            HIERARCHICAL_COMPOSITION_DESK_SECTIONS
              .map((section) => (
                <section
                  className="hc-desk-zone"
                  key={section.key}
                >
                  <header>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.summary}</p>
                    </div>

                    <span>
                      {
                        section.slots
                          .filter(
                            (definition) =>
                              Boolean(
                                plan.slots[
                                  definition.key
                                ],
                              ),
                          )
                          .length
                      }
                      /
                      {section.slots.length}
                    </span>
                  </header>

                  <div
                    className={
                      `hc-desk-slots hc-desk-slots-${section.slots.length}`
                    }
                  >
                    {
                      section.slots
                        .map((definition) => (
                          <div
                            className="hc-desk-slot"
                            key={definition.key}
                          >
                            <small>
                              {definition.label}
                            </small>

                            {
                              renderCard(
                                plan.slots[
                                  definition.key
                                ] ?? null,
                                () =>
                                  removeSlot(
                                    definition.key,
                                  ),
                              )
                            }
                          </div>
                        ))
                    }
                  </div>
                </section>
              ))
          }

          <section className="hc-desk-zone">
            <header>
              <div>
                <h3>Destaque da Jornada</h3>
                <p>Conteúdo opcional ao lado do vídeo.</p>
              </div>

              <span>
                {
                  plan.auxiliary.video_highlight
                    ? "1/1"
                    : "0/1"
                }
              </span>
            </header>

            <div className="hc-desk-slots">
              <div className="hc-desk-slot">
                <small>Destaque da Jornada</small>

                {
                  renderCard(
                    plan.auxiliary.video_highlight ?? null,
                    () =>
                      removeAuxiliary(
                        "video_highlight",
                      ),
                  )
                }
              </div>
            </div>
          </section>

          <section className="hc-desk-zone">
            <header>
              <div>
                <h3>Para Lá da Jornada</h3>
                <p>Uma dominante e quatro secundárias.</p>
              </div>

              <span>{occupiedBeyond}/5</span>
            </header>

            <div className="hc-desk-slots hc-desk-slots-5">
              {
                HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS
                  .map((position) => {
                    const target =
                      `beyond_matchday_${position.sortOrder}`;

                    return (
                      <div
                        className="hc-desk-slot"
                        key={position.key}
                      >
                        <small>{position.label}</small>

                        {
                          renderCard(
                            plan.auxiliary[target] ?? null,
                            () =>
                              removeAuxiliary(target),
                          )
                        }
                      </div>
                    );
                  })
              }
            </div>
          </section>

          {
            children
              ? (
                <div className="hc-desk-tools">
                  {children}
                </div>
              )
              : null
          }
        </section>
      </div>

      <footer className="hc-desk-pending">
        <div>
          <strong>
            {pendingCount} alterações pendentes
          </strong>

          <span>
            Colocar e Retirar apenas planeiam. A base só muda em Aplicar alterações.
          </span>
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
            pendingCount === 0
          }
        >
          {
            isApplying
              ? "A aplicar…"
              : "Aplicar alterações"
          }
        </button>
      </footer>
    </>
  );
}