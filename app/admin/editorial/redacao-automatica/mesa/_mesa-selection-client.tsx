"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ARTICLE_CLASSIFICATIONS,
  articleClassificationBadgeColors,
  articleClassificationLabel,
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import type { OperationalDeskSourceLifecycle } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

import {
  EMPTY_MESA_PREPARATION_BUFFER,
  MESA_MAX_NEWSROOM_SOURCES,
  changeMesaPreparationTitle,
  clearMesaPreparationBuffer,
  mesaMaterialIsSelected,
  mesaContextPreparationPayload,
  mesaPreparationPayload,
  mesaThemeIsSelected,
  readMesaPreparationBuffer,
  removeMesaMaterial,
  removeMesaMaterials,
  selectMesaMaterial,
  selectMesaTheme,
  removeMesaTheme,
  observeMesaMaterial,
  changeMesaPreparationTheme,
  mesaPreparationStorageKey,
  writeMesaPreparationBuffer,
  selectMesaDossierMaterial, removeMesaDossierMaterial,
  type MesaDossierSelection,
  type MesaMaterialSelection,
  type MesaPreparationBuffer,
  type MesaThemeSelection,
} from "./_mesa-selection-state";
import type { MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { suggestedThemeClassification } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import type { MesaClassificationValue } from "./_mesa-query";
import { MESA_SOURCE_HIDDEN_EVENT, MESA_THEME_UPDATED_EVENT, mesaThemeFromEvent, publishMesaThemeUpdate } from "./_mesa-client-events";
import { MesaSourceChanges } from "./_mesa-source-changes";
import styles from "./mesa.module.css";
import { MesaIntentPreparationClient } from "./_mesa-intent-preparation-client";
import { retainMesaDeferredSelection } from "./_mesa-selection-state";
import type { MesaProductionIntent } from "@/lib/redacao-automatica/newsroom-mesa-production-intents";

const PREPARE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/preparar";
const DISCARD_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/source";
const CLASSIFICATION_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/classification";
const ORGANIZATION_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/organizacao";

type PrepareResponse = Readonly<{
  ok?: boolean;
  code?: string;
  message?: string;
  workspaceUrl?: string;
  themeId?: string;
  addedCount?: number;
  theme?: MesaThemeCard;
  classificationKey?: ArticleClassificationKey;
  requestedCount?: number;
  changedCount?: number;
}>;

type DismissedSource = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string | null;
  lifecycle: OperationalDeskSourceLifecycle;
  classificationKey: ArticleClassificationKey | null;
}>;

type ClassificationChange = Readonly<{
  lifecycle: OperationalDeskSourceLifecycle;
  previous: ArticleClassificationKey | null;
  current: ArticleClassificationKey | null;
}>;

function effectiveClassificationKey(
  changes: Readonly<Record<string, ClassificationChange>>,
  newsroomArticleId: string,
  fallback: ArticleClassificationKey | null,
) {
  return changes[newsroomArticleId]?.current ?? (
    Object.prototype.hasOwnProperty.call(changes, newsroomArticleId)
      ? null
      : fallback
  );
}

type MesaSelectionContextValue = Readonly<{
  buffer: MesaPreparationBuffer;
  loaded: boolean;
  fixtureMode: boolean;
  dismissed: readonly DismissedSource[];
  discardErrors: Readonly<Record<string, string>>;
  classificationChanges: Readonly<Record<string, ClassificationChange>>;
  classificationFilter: MesaClassificationValue;
  hiddenSourceIds: readonly string[];
  themes: readonly MesaThemeCard[];
  themeContext: Readonly<{ id: string; title: string }> | null;
  serverSourceIds: readonly string[] | null;
  observe: (material: MesaMaterialSelection) => void;
  setTheme: (id: string, title: string) => void;
  storageKey: string;
  moveToTheme: (id: string, title: string, sourceIds: readonly string[]) => void;
  selectDossier: (material: MesaDossierSelection) => void;
  removeDossier: (key: string) => void;
  select: (material: MesaMaterialSelection) => void;
  selectTheme: (theme: MesaThemeSelection) => void;
  removeTheme: (themeId: string) => void;
  remove: (newsroomArticleId: string) => void;
  removeSources: (newsroomArticleIds: readonly string[]) => void;
  hideSources: (sources: readonly DismissedSource[]) => void;
  updateClassification: (
    newsroomArticleId: string,
    lifecycle: OperationalDeskSourceLifecycle,
    previous: ArticleClassificationKey | null,
    current: ArticleClassificationKey | null,
  ) => void;
  upsertTheme: (theme: MesaThemeCard) => void;
  changeTitle: (title: string) => void;
  clear: () => void;
  consumePrepared: (request: MesaProductionIntent) => void;
  discard: (source: DismissedSource) => Promise<void>;
}>;

const MesaSelectionContext = createContext<MesaSelectionContextValue | null>(null);

function createPreparationKey(): string {
  return window.crypto.randomUUID();
}

export function useMesaSelection(): MesaSelectionContextValue {
  const value = useContext(MesaSelectionContext);
  if (!value) throw new Error("mesa_selection_provider_missing");
  return value;
}

const FIXTURE_PREPARATION_KEY = "f0000000-0000-4000-8000-000000000001";

export function MesaSelectionProvider({
  children,
  fixtureMode = false,
  initialSelection = [],
  themes = [],
  themeContext = null,
  serverSourceIds = null,
  serverClassifications = null,
  serverSnapshots = null,
  classificationFilter = "all",
}: Readonly<{
  children: ReactNode;
  fixtureMode?: boolean;
  initialSelection?: readonly MesaMaterialSelection[];
  themes?: readonly MesaThemeCard[];
  themeContext?: Readonly<{ id: string; title: string }> | null;
  serverSourceIds?: readonly string[] | null;
  serverClassifications?: Readonly<Record<string, ArticleClassificationKey | null>> | null;
  serverSnapshots?: Readonly<Record<string, string | null>> | null;
  classificationFilter?: MesaClassificationValue;
}>) {
  const storageKey = mesaPreparationStorageKey(themeContext?.id);
  const [buffer, setBuffer] = useState<MesaPreparationBuffer>(
    fixtureMode && initialSelection.length > 0
      ? {
          version: 3,
          preparationKey: FIXTURE_PREPARATION_KEY,
          title: "Seleção visual da Mesa",
          sources: initialSelection,
        }
      : EMPTY_MESA_PREPARATION_BUFFER,
  );
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState<readonly DismissedSource[]>([]);
  const [discardErrors, setDiscardErrors] = useState<Readonly<Record<string, string>>>({});
  const [classificationChanges, setClassificationChanges] = useState<Readonly<Record<string, ClassificationChange>>>({});
  const [hiddenSourceIds, setHiddenSourceIds] = useState<readonly string[]>([]);
  const [themeCards, setThemeCards] = useState(themes);
  const effectiveClassificationChanges = Object.fromEntries(
    Object.entries(classificationChanges).filter(([newsroomArticleId, change]) => (
      serverClassifications?.[newsroomArticleId] !== change.current
    )),
  );
  const effectiveDismissed = dismissed.filter((source) => (
    source.newsroomSnapshotId === null
    || !serverSnapshots
    || !Object.prototype.hasOwnProperty.call(serverSnapshots, source.newsroomArticleId)
    || serverSnapshots[source.newsroomArticleId] === source.newsroomSnapshotId
  ));

  useEffect(() => setThemeCards(themes), [themes]);
  useEffect(() => {
    const update = (event: Event) => {
      const theme = mesaThemeFromEvent(event);
      if (!theme) return;
      setThemeCards((current) => current.some((item) => item.id === theme.id)
        ? current.map((item) => item.id === theme.id ? theme : item)
        : [theme, ...current]);
    };
    window.addEventListener(MESA_THEME_UPDATED_EVENT, update);
    return () => window.removeEventListener(MESA_THEME_UPDATED_EVENT, update);
  }, []);
  useEffect(() => {
    const hide = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") return;
      setHiddenSourceIds((current) => current.includes(event.detail)
        ? current
        : [...current, event.detail]);
    };
    window.addEventListener(MESA_SOURCE_HIDDEN_EVENT, hide);
    return () => window.removeEventListener(MESA_SOURCE_HIDDEN_EVENT, hide);
  }, []);

  useEffect(() => {
    if (fixtureMode) {
      setLoaded(true);
      return;
    }
    try {
      setBuffer(readMesaPreparationBuffer(window.sessionStorage.getItem(storageKey)));
    } catch {
      setDiscardErrors({ storage: "O armazenamento da seleção está indisponível nesta janela." });
    }
    setLoaded(true);
  }, [fixtureMode, storageKey]);

  function persist(
    update: (current: MesaPreparationBuffer) => MesaPreparationBuffer,
  ) {
    setBuffer((current) => {
      const next = update(current);
      if (next === current) return current;
      if (!fixtureMode) {
        try {
          window.sessionStorage.setItem(storageKey, writeMesaPreparationBuffer(next));
        } catch {
          setDiscardErrors((currentErrors) => ({ ...currentErrors,
            storage: "A seleção está apenas nesta janela: o armazenamento local está indisponível." }));
        }
      }
      return next;
    });
  }

  const value: MesaSelectionContextValue = {
    buffer,
    loaded,
    fixtureMode,
    dismissed: effectiveDismissed,
    discardErrors,
    classificationChanges: effectiveClassificationChanges,
    classificationFilter,
    hiddenSourceIds,
    themes: themeCards,
    themeContext,
    serverSourceIds,
    storageKey,
    moveToTheme(id, title, sourceIds) {
      const requested = new Set(sourceIds);
      persist((current) => {
        if (mesaPreparationStorageKey(id) === storageKey) {
          return changeMesaPreparationTheme(current, id, title, createPreparationKey);
        }
        const transferred = current.sources.filter((source) => requested.has(source.newsroomArticleId));
        const remaining = current.sources.filter((source) => !requested.has(source.newsroomArticleId));
        if (!fixtureMode) {
          try {
            const destination = readMesaPreparationBuffer(window.sessionStorage.getItem(mesaPreparationStorageKey(id)));
            // Never overwrite another selection already being worked on in that Theme.
            if (destination.sources.length + (destination.dossiers?.length ?? 0) === 0) {
              window.sessionStorage.setItem(mesaPreparationStorageKey(id), writeMesaPreparationBuffer({
                ...current, themeId: id, themeTitle: title, sources: transferred,
                preparationKey: transferred.length + (current.dossiers?.length ?? 0) ? createPreparationKey() : null,
              }));
            }
          } catch { /* The persisted Theme remains available even if browser storage fails. */ }
        }
        return remaining.length ? { ...current, dossiers: [], sources: remaining, preparationKey: createPreparationKey() }
          : clearMesaPreparationBuffer();
      });
    },
    selectDossier(material) {
      persist((current) => {
        const next = selectMesaDossierMaterial(current, material, createPreparationKey);
        return themeContext ? changeMesaPreparationTheme(next, themeContext.id, themeContext.title, createPreparationKey) : next;
      });
    },
    removeDossier(key) { persist((current) => removeMesaDossierMaterial(current, key, createPreparationKey)); },
    observe(material) { persist((current) => observeMesaMaterial(current, material)); },
    setTheme(id, title) { persist((current) => changeMesaPreparationTheme(current, id, title, createPreparationKey)); },
    select(material) {
      persist((current) => {
        const next = selectMesaMaterial(current, material, createPreparationKey);
        return themeContext ? changeMesaPreparationTheme(next, themeContext.id, themeContext.title, createPreparationKey) : next;
      });
    },
    selectTheme(theme) {
      persist((current) => selectMesaTheme(current, theme, createPreparationKey));
    },
    removeTheme(themeId) {
      persist((current) => removeMesaTheme(current, themeId, createPreparationKey));
    },
    remove(newsroomArticleId) {
      persist((current) => removeMesaMaterial(
        current,
        newsroomArticleId,
        createPreparationKey,
      ));
    },
    removeSources(newsroomArticleIds) {
      persist((current) => removeMesaMaterials(
        current,
        newsroomArticleIds,
        createPreparationKey,
      ));
    },
    hideSources(sources) {
      setHiddenSourceIds((current) => [...new Set([
        ...current,
        ...sources.map((source) => source.newsroomArticleId),
      ])]);
      setDismissed((current) => {
        const hidden = new Set(current.map((item) => item.newsroomArticleId));
        return [...current, ...sources.filter((source) => !hidden.has(source.newsroomArticleId))];
      });
    },
    updateClassification(newsroomArticleId, lifecycle, previous, current) {
      setClassificationChanges((changes) => ({
        ...changes,
        [newsroomArticleId]: {
          lifecycle,
          previous: serverClassifications
            && Object.prototype.hasOwnProperty.call(serverClassifications, newsroomArticleId)
            ? serverClassifications[newsroomArticleId] ?? null
            : changes[newsroomArticleId]?.previous ?? previous,
          current,
        },
      }));
      persist((currentBuffer) => {
        const selectedSource = currentBuffer.sources.find(
          (source) => source.newsroomArticleId === newsroomArticleId,
        );
        return selectedSource
          ? observeMesaMaterial(currentBuffer, {
              ...selectedSource,
              lifecycle,
              classificationKey: current,
            })
          : currentBuffer;
      });
    },
    upsertTheme(theme) {
      setThemeCards((current) => current.some((item) => item.id === theme.id)
        ? current.map((item) => item.id === theme.id ? theme : item)
        : [theme, ...current]);
      publishMesaThemeUpdate(theme);
    },
    changeTitle(title) {
      persist((current) => changeMesaPreparationTitle(current, title, createPreparationKey));
    },
    consumePrepared(request) {
      persist((current) => retainMesaDeferredSelection(current, request, createPreparationKey));
    },
    clear() {
      if (!fixtureMode) {
        try { window.sessionStorage.removeItem(storageKey); } catch { /* memory remains usable */ }
      }
      setBuffer(clearMesaPreparationBuffer());
    },
    async discard(source) {
      if (!source.newsroomSnapshotId) return;
      setDiscardErrors((current) => {
        const next = { ...current };
        delete next[source.newsroomArticleId];
        return next;
      });
      setDismissed((current) => current.some(
        (item) => item.newsroomArticleId === source.newsroomArticleId,
      ) ? current : [...current, source]);

      if (fixtureMode) {
        persist((current) => removeMesaMaterial(
          current,
          source.newsroomArticleId,
          createPreparationKey,
        ));
        return;
      }

      try {
        const response = await fetch(DISCARD_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newsroomArticleId: source.newsroomArticleId,
            newsroomSnapshotId: source.newsroomSnapshotId,
          }),
        });
        const result = await response.json().catch(() => null) as PrepareResponse | null;
        if (!response.ok || !result?.ok) {
          throw new Error(result?.message || "Não foi possível descartar esta fonte.");
        }
        persist((current) => removeMesaMaterial(
          current,
          source.newsroomArticleId,
          createPreparationKey,
        ));
      } catch (error) {
        setDismissed((current) => current.filter(
          (item) => item.newsroomArticleId !== source.newsroomArticleId,
        ));
        setDiscardErrors((current) => ({
          ...current,
          [source.newsroomArticleId]: error instanceof Error
            ? error.message
            : "Não foi possível descartar esta fonte. A entrada foi reposta.",
        }));
      }
    },
  };

  return (
    <MesaSelectionContext.Provider value={value}>
      {children}
    </MesaSelectionContext.Provider>
  );
}

export function MesaLiveCount({
  initial,
  lifecycle,
  classificationKey,
}: Readonly<{
  initial: number;
  lifecycle?: OperationalDeskSourceLifecycle;
  classificationKey?: ArticleClassificationKey | "unclassified";
}>) {
  const { classificationChanges, dismissed, serverSourceIds } = useMesaSelection();
  const inServerWindow = (newsroomArticleId: string) => (
    serverSourceIds === null || serverSourceIds.includes(newsroomArticleId)
  );
  const removed = dismissed.filter((source) => (
    inServerWindow(source.newsroomArticleId)
    &&
    (lifecycle === undefined || source.lifecycle === lifecycle)
    && (classificationKey === undefined
      || (classificationKey === "unclassified"
        ? effectiveClassificationKey(classificationChanges, source.newsroomArticleId, source.classificationKey) === null
        : effectiveClassificationKey(classificationChanges, source.newsroomArticleId, source.classificationKey) === classificationKey))
  )).length;
  const classificationAdjustment = classificationKey === undefined ? 0 : Object.entries(classificationChanges)
    .filter(([newsroomArticleId, change]) => inServerWindow(newsroomArticleId)
      && (lifecycle === undefined || change.lifecycle === lifecycle)
      && !dismissed.some((source) => source.newsroomArticleId === newsroomArticleId))
    .reduce((total, [, change]) => {
      const previousMatches = classificationKey === "unclassified"
        ? change.previous === null
        : change.previous === classificationKey;
      const currentMatches = classificationKey === "unclassified"
        ? change.current === null
        : change.current === classificationKey;
      return total + Number(currentMatches) - Number(previousMatches);
    }, 0);
  return <span className={styles.liveCount}>{Math.max(0, initial - removed + classificationAdjustment)}</span>;
}

export function MesaThemeCount() {
  const { themes } = useMesaSelection();
  return <>{themes.length}</>;
}

export function MesaOperationalSourceRow({
  source,
  children,
  allowDiscard = true,
}: Readonly<{
  source: DismissedSource;
  children: ReactNode;
  allowDiscard?: boolean;
}>) {
  const { classificationChanges, classificationFilter, hiddenSourceIds, dismissed, discardErrors, discard } = useMesaSelection();
  const currentClassification = effectiveClassificationKey(
    classificationChanges,
    source.newsroomArticleId,
    source.classificationKey,
  );
  const outsideFilter = classificationFilter !== "all" && (
    classificationFilter === "unclassified"
      ? currentClassification !== null
      : currentClassification !== classificationFilter
  );
  if (outsideFilter || hiddenSourceIds.includes(source.newsroomArticleId)
    || dismissed.some((item) => item.newsroomArticleId === source.newsroomArticleId
      && item.newsroomSnapshotId === source.newsroomSnapshotId)) {
    return null;
  }
  return (
    <li className={styles.sourceRow} data-lifecycle={source.lifecycle}>
      {children}
      {allowDiscard ? <div className={styles.discardArea}>
        <button
          type="button"
          disabled={!source.newsroomSnapshotId}
          aria-label="Descartar fonte da Mesa"
          title={source.newsroomSnapshotId
            ? "Descartar fonte da Mesa"
            : "Sem snapshot para registar a decisão"}
          onClick={() => void discard({ ...source, classificationKey: currentClassification })}
        >Descartar</button>
        {discardErrors[source.newsroomArticleId] ? (
          <span role="alert">{discardErrors[source.newsroomArticleId]}</span>
        ) : null}
      </div> : null}
    </li>
  );
}

export function MesaSelectionToggle({
  material,
  unavailableReason,
}: Readonly<{
  material: MesaMaterialSelection | null;
  unavailableReason?: string;
}>) {
  const { buffer, classificationChanges, loaded, select, observe, remove } = useMesaSelection();
  const classificationChange = material
    ? classificationChanges[material.newsroomArticleId]
    : undefined;
  const effectiveMaterial = material && classificationChange
    ? { ...material, classificationKey: classificationChange.current }
    : material;
  const selected = effectiveMaterial ? mesaMaterialIsSelected(buffer, effectiveMaterial) : false;
  const selectedSource = effectiveMaterial
    ? buffer.sources.find(
        (selection) => selection.newsroomArticleId === effectiveMaterial.newsroomArticleId,
      ) ?? null
    : null;
  const frozenOnAnotherSnapshot = Boolean(
    selectedSource
    && effectiveMaterial
    && selectedSource.newsroomSnapshotId
    && effectiveMaterial.newsroomSnapshotId
    && selectedSource.newsroomSnapshotId !== effectiveMaterial.newsroomSnapshotId,
  );
  const sourceLimitReached = Boolean(
    effectiveMaterial
    && !selected
    && buffer.sources.length >= MESA_MAX_NEWSROOM_SOURCES,
  );

  useEffect(() => {
    if (effectiveMaterial && selectedSource) observe(effectiveMaterial);
  }, [effectiveMaterial, observe, selectedSource]);

  if (!effectiveMaterial) {
    return (
      <span className={styles.selectionUnavailable}>
        {unavailableReason ?? "Sem snapshot elegível para preparar"}
      </span>
    );
  }

  return (
    <label className={styles.selectionToggle}>
      <input
        type="checkbox"
        checked={selected}
        disabled={!loaded || sourceLimitReached}
        title={frozenOnAnotherSnapshot
          ? "Fonte atualizada: a seleção mantém a versão anterior até escolheres a nova."
          : undefined}
        onChange={() => {
          if (selected) remove(effectiveMaterial.newsroomArticleId);
          else select(effectiveMaterial);
        }}
      />
      <span>
        {sourceLimitReached ? "Limite atual: 20 fontes" : "Selecionar"}
        {frozenOnAnotherSnapshot ? " · snapshot guardado" : ""}
      </span>
    </label>
  );
}

export function MesaSelectedVersionNotice({ material }: Readonly<{ material: MesaMaterialSelection }>) {
  const { buffer, classificationChanges, select } = useMesaSelection();
  const effectiveMaterial = {
    ...material,
    classificationKey: effectiveClassificationKey(
      classificationChanges,
      material.newsroomArticleId,
      material.classificationKey,
    ),
  };
  const saved = buffer.sources.find((source) => source.newsroomArticleId === effectiveMaterial.newsroomArticleId);
  if (!saved || saved.newsroomSnapshotId === effectiveMaterial.newsroomSnapshotId || !effectiveMaterial.newsroomSnapshotId) return null;
  return <div className={styles.versionNotice}>
    {saved.newsroomSnapshotId ? <MesaSourceChanges sourceId={effectiveMaterial.newsroomArticleId}
      beforeId={saved.newsroomSnapshotId} afterId={effectiveMaterial.newsroomSnapshotId} title={effectiveMaterial.title} />
      : <span>Já existe conteúdo para esta fonte.</span>}
    <button type="button" onClick={() => select(effectiveMaterial)}>Usar versão recente na seleção</button>
  </div>;
}

const classificationOptions = ARTICLE_CLASSIFICATIONS.map(
  ({ key, label }) => [key, label] as const,
);

export function MesaClassificationBadge({
  newsroomArticleId,
  currentClassificationKey,
  classificationSource,
}: Readonly<{
  newsroomArticleId: string;
  currentClassificationKey: ArticleClassificationKey | null;
  classificationSource: "automatic" | "manual" | null;
}>) {
  const { classificationChanges } = useMesaSelection();
  const changed = classificationChanges[newsroomArticleId];
  const classificationKey = effectiveClassificationKey(
    classificationChanges,
    newsroomArticleId,
    currentClassificationKey,
  );
  if (!classificationKey) {
    return <span
      className={styles.classificationBadge}
      data-tone="unclassified"
      style={articleClassificationBadgeColors("unclassified")}
    >Por classificar</span>;
  }
  const label = articleClassificationLabel(classificationKey);
  return <span
    className={styles.classificationBadge}
    data-tone={classificationKey}
    style={articleClassificationBadgeColors(classificationKey)}
  >
    {label}
    <small>{changed || classificationSource === "manual" ? "Manual" : "Automática"}</small>
  </span>;
}

export function MesaClassificationEditor({
  newsroomArticleId,
  lifecycle,
  currentClassificationKey,
  fixtureMode = false,
}: Readonly<{
  newsroomArticleId: string;
  lifecycle: OperationalDeskSourceLifecycle;
  currentClassificationKey: ArticleClassificationKey | null;
  fixtureMode?: boolean;
}>) {
  const { updateClassification } = useMesaSelection();
  const [classificationKey, setClassificationKey] = useState(
    currentClassificationKey ?? "",
  );
  const [savedClassificationKey, setSavedClassificationKey] = useState(currentClassificationKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setClassificationKey(currentClassificationKey ?? "");
    setSavedClassificationKey(currentClassificationKey);
  }, [currentClassificationKey, newsroomArticleId]);

  async function save() {
    const nextClassificationKey = classificationKey === ""
      ? null
      : isArticleClassificationKey(classificationKey)
        ? classificationKey
        : undefined;
    if (nextClassificationKey === undefined) return;
    const previous = savedClassificationKey;
    setSaving(true);
    setMessage("");
    if (fixtureMode) {
      updateClassification(newsroomArticleId, lifecycle, previous, nextClassificationKey);
      setSavedClassificationKey(nextClassificationKey);
      setMessage("Classificação simulada localmente.");
      setSaving(false);
      return;
    }
    try {
      const response = await fetch(CLASSIFICATION_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsroomArticleId, classificationKey: nextClassificationKey }),
      });
      const result = await response.json().catch(() => null) as PrepareResponse | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Não foi possível guardar a classificação.");
      }
      updateClassification(newsroomArticleId, lifecycle, previous, nextClassificationKey);
      setSavedClassificationKey(nextClassificationKey);
      setMessage("Classificação manual guardada.");
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : "Não foi possível guardar a classificação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.classificationEditor}>
      <select
        aria-label="Classificação manual"
        value={classificationKey}
        disabled={saving}
        onChange={(event) => setClassificationKey(event.currentTarget.value)}
      >
        <option value="">Sem classificação</option>
        {classificationOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={saving || (classificationKey || null) === savedClassificationKey}
        onClick={() => void save()}
      >{saving ? "A guardar…" : "Guardar"}</button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}

export function MesaDossierSelectionToggle({ material }: Readonly<{ material: MesaDossierSelection }>) {
  const { buffer, loaded, selectDossier, removeDossier } = useMesaSelection();
  const saved = (buffer.dossiers ?? []).find((row) => row.key === material.key);
  const selected = Boolean(saved);
  const differentVersion = saved && (saved.versionId !== material.versionId || JSON.stringify(saved.sources) !== JSON.stringify(material.sources));
  return <button type="button" className={styles.selectionActionLink} aria-pressed={selected} disabled={!loaded}
    title={differentVersion ? "A seleção conserva outra versão. Retira o Dossiê da seleção e seleciona-o novamente para a substituir." : undefined}
    onClick={() => selected ? removeDossier(material.key) : selectDossier(material)}>
    {selected ? `Dossiê selecionado${differentVersion ? " · versão conservada" : ""}` : "Selecionar Dossiê inteiro"}
  </button>;
}

export function MesaThemeSelectionToggle({ theme }: Readonly<{ theme: MesaThemeCard }>) {
  const { buffer, fixtureMode, loaded, selectTheme, removeTheme, upsertTheme } = useMesaSelection();
  const selected = mesaThemeIsSelected(buffer, theme.id);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const available = theme.status === "open" && theme.productionReady !== false && theme.sourceCount > 0;

  async function addTheme() {
    if (!available || loading) return;
    setMessage("");
    if (theme.sourceRefs.length > 0 || fixtureMode) {
      selectTheme({ kind: "theme", themeId: theme.id, title: theme.title,
        classificationKey: theme.classificationKey, sources: theme.sourceRefs });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${ORGANIZATION_ROUTE}?theme=${encodeURIComponent(theme.id)}`, {
        cache: "no-store",
      });
      const result = await response.json().catch(() => null) as PrepareResponse | null;
      if (!response.ok || !result?.ok || !result.theme || result.theme.sourceRefs.length === 0) {
        throw new Error(result?.message || "O Tema não tem fontes atuais elegíveis para Produção.");
      }
      upsertTheme(result.theme);
      selectTheme({ kind: "theme", themeId: result.theme.id, title: result.theme.title,
        classificationKey: result.theme.classificationKey, sources: result.theme.sourceRefs });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ler o Tema.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <label className={styles.themeSelectionToggle} title={available
      ? `Usar ${theme.title} como contexto de produção`
      : "Este Tema não tem fontes atuais elegíveis para Produção"}>
      <input
        type="checkbox"
        checked={selected}
        disabled={!loaded || !available || loading}
        onChange={() => selected ? removeTheme(theme.id) : void addTheme()}
      />
      <span>{loading ? "A ler Tema…" : selected ? "Tema selecionado" : "Selecionar Tema"}</span>
      {message ? <small role="alert">{message}</small> : null}
    </label>
  );
}

export function MesaSourceThemeMenu({
  newsroomArticleId,
  lifecycle,
  classificationKey,
  themeIds,
}: Readonly<{
  newsroomArticleId: string;
  lifecycle: OperationalDeskSourceLifecycle;
  classificationKey: ArticleClassificationKey | null;
  themeIds: readonly string[];
}>) {
  const { fixtureMode, hideSources, removeSources, themes, upsertTheme } = useMesaSelection();
  const [targetThemeId, setTargetThemeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const availableThemes = themes.filter((theme) => (
    theme.status === "open" && !themeIds.includes(theme.id)
  ));
  if (availableThemes.length === 0) return null;

  async function attach() {
    if (!targetThemeId || busy) return;
    if (fixtureMode) {
      setMessage("Fixture visual: associação não enviada.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/editorial/redacao-automatica/mesa/organizacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "organize_sources",
          requestId: window.crypto.randomUUID(),
          themeId: targetThemeId,
          sourceIds: [newsroomArticleId],
        }),
      });
      const result = await response.json().catch(() => null) as PrepareResponse | null;
      if (!response.ok || !result?.ok || !result.theme) {
        throw new Error(result?.message || "Não foi possível adicionar a fonte ao Tema.");
      }
      removeSources([newsroomArticleId]);
      hideSources([{ newsroomArticleId, newsroomSnapshotId: null, lifecycle, classificationKey }]);
      upsertTheme(result.theme);
      setMessage("Fonte adicionada ao Tema.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Associação não guardada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={styles.sourceThemeMenu}>
      <summary>Tema</summary>
      <div>
        <select aria-label="Tema de destino" value={targetThemeId} disabled={busy}
          onChange={(event) => setTargetThemeId(event.currentTarget.value)}>
          <option value="">Escolher Tema</option>
          {availableThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.title}</option>)}
        </select>
        <button type="button" disabled={busy || !targetThemeId} onClick={() => void attach()}>
          {busy ? "A adicionar…" : "Adicionar"}
        </button>
      </div>
      {message ? <small role="status">{message}</small> : null}
    </details>
  );
}

type MesaThemeAction = "create" | "add";

export function MesaSelectionTray({
  sourceThemeActions = false,
}: Readonly<{
  sourceThemeActions?: boolean;
}> = {}) {
  const {
    buffer,
    loaded,
    fixtureMode,
    hideSources,
    remove,
    removeSources,
    removeTheme,
    removeDossier,
    changeTitle,
    clear,
    consumePrepared,
    discard,
    themes,
    upsertTheme,
    moveToTheme,
    storageKey,
    themeContext,
    discardErrors,
    classificationChanges,
    updateClassification,
  } = useMesaSelection();
  const router = useRouter();
  const [organizing, setOrganizing] = useState(false);
  const [themeAction, setThemeAction] = useState<MesaThemeAction | null>(null);
  const [targetTheme, setTargetTheme] = useState(buffer.themeId ?? themeContext?.id ?? "");
  const [themeTitle, setThemeTitle] = useState(buffer.title);
  const [themeClassification, setThemeClassification] = useState("");
  const organizationRequest = useRef({ fingerprint: "", id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [incorporateSources, setIncorporateSources] = useState(false);
  const [selectionPanelOpen, setSelectionPanelOpen] = useState(false);
  const [batchClassificationKey, setBatchClassificationKey] = useState<
    ArticleClassificationKey | "unclassified" | ""
  >("");
  const selectedThemes = buffer.themes ?? [];
  const incorporationAvailable = sourceThemeActions
    && selectedThemes.length === 1
    && buffer.sources.length > 0;
  useEffect(() => {
    if (!incorporationAvailable) setIncorporateSources(false);
  }, [incorporationAvailable]);
  useEffect(() => {
    if (!selectionPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setSelectionPanelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectionPanelOpen, submitting]);
  const payload = sourceThemeActions
    ? mesaContextPreparationPayload(buffer, incorporationAvailable && incorporateSources)
    : mesaPreparationPayload(buffer);
  const dossiers = buffer.dossiers ?? [];
  const total = buffer.sources.length + selectedThemes.length + dossiers.length;
  const classificationBatchAvailable = buffer.sources.length > 0
    && selectedThemes.length === 0
    && dossiers.length === 0;
  const distinctSources = new Set([...buffer.sources.map((row) => row.newsroomArticleId),
    ...selectedThemes.flatMap((theme) => theme.sources.map((ref) => ref.newsroomArticleId)),
    ...dossiers.flatMap((row) => row.sources.map((ref) => ref.newsroomArticleId))]).size;
  const missingSnapshotCount = buffer.sources.filter(
    (source) => source.newsroomSnapshotId === null,
  ).length;
  const selectionBlocked = missingSnapshotCount > 0 || !payload;

  async function classifySelection() {
    if (!classificationBatchAvailable || !batchClassificationKey) return;
    const classificationKey = batchClassificationKey === "unclassified"
      ? null
      : batchClassificationKey;
    const selectedSources = buffer.sources.map((source) => ({
      ...source,
      previousClassificationKey: effectiveClassificationKey(
        classificationChanges,
        source.newsroomArticleId,
        source.classificationKey,
      ),
    }));

    setSubmitting(true);
    setMessage("");
    try {
      if (!fixtureMode) {
        const response = await fetch(CLASSIFICATION_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newsroomArticleIds: selectedSources.map(
              (source) => source.newsroomArticleId,
            ),
            classificationKey,
          }),
        });
        const result = await response.json().catch(() => null) as PrepareResponse | null;
        if (
          !response.ok
          || !result?.ok
          || result.requestedCount !== selectedSources.length
        ) {
          throw new Error(
            result?.message || "Não foi possível classificar a seleção.",
          );
        }
      }

      for (const source of selectedSources) {
        updateClassification(
          source.newsroomArticleId,
          source.lifecycle,
          source.previousClassificationKey,
          classificationKey,
        );
      }
      removeSources(selectedSources.map((source) => source.newsroomArticleId));
      setBatchClassificationKey("");
      setMessage(
        classificationKey === null
          ? `${selectedSources.length} fontes ficaram sem classificação.`
          : `${selectedSources.length} fontes classificadas.`,
      );
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : "Não foi possível classificar a seleção.");
    } finally {
      setSubmitting(false);
    }
  }

  async function prepare() {
    if (!payload) {
      setMessage(
        total === 0
          ? "Seleciona pelo menos uma fonte NOVA ou PUBLICADA."
          : dossiers.length > 0 && distinctSources > MESA_MAX_NEWSROOM_SOURCES
            ? `O motor existente aceita até ${MESA_MAX_NEWSROOM_SOURCES} fontes por produção. O Tema pode guardar toda a seleção.`
          : !buffer.title.trim()
            ? "Indica um título de trabalho para a produção."
          : dossiers.length > 0 && !payload
            ? "Há versões diferentes da mesma fonte na seleção. A preparação foi bloqueada; nenhum Dossiê foi dividido ou alterado."
          : missingSnapshotCount > 0
              ? "Aguarda um snapshot elegivel para todas as fontes selecionadas."
            : "Indica um titulo de trabalho para a producao.",
      );
      return;
    }

    if (fixtureMode) {
      setMessage("Fixture visual: nenhuma produção foi enviada.");
      return;
    }

    setSubmitting(true);
    setMessage("A preparar a producao...");

    try {
      const response = await fetch(PREPARE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceThemeActions
          ? { ...payload, mesaVersion: 3 }
          : { ...payload, mesaVersion: 2, materials: "materials" in payload ? payload.materials ?? [] : [] }),
      });
      const result = await response.json().catch(() => null) as PrepareResponse | null;

      if (!response.ok || !result?.ok || !result.workspaceUrl) {
        throw new Error(
          result?.message
          || (result?.code === "preparation_conflict"
            ? "A chave desta preparacao pertence a um pedido diferente. A selecao foi preservada."
            : "Nao foi possivel preparar a producao. A selecao foi preservada para tentar novamente."),
        );
      }

      try { window.sessionStorage.removeItem(storageKey); } catch { /* preparation already persisted */ }
      setMessage("Producao preparada. A abrir o workspace...");
      window.location.assign(result.workspaceUrl);
    } catch (error) {
      setSubmitting(false);
      setMessage(error instanceof Error
        ? error.message
        : "Nao foi possivel preparar a producao. A selecao foi preservada.");
    }
  }

  async function organize(action?: MesaThemeAction) {
    if (fixtureMode) { setMessage("Fixture visual: ação de Tema não enviada."); return; }
    const sourceOnly = sourceThemeActions;
    const selectedTheme = sourceOnly && action === "create" ? "" : targetTheme;
    const title = sourceOnly ? themeTitle : buffer.title;
    const classificationCandidates = sourceOnly ? buffer.sources : [...buffer.sources, ...dossiers];
    const classification = themeClassification || suggestedThemeClassification(classificationCandidates) || "";
    const command = { action: "organize_sources", themeId: selectedTheme || null, title,
      classificationKey: classification, sourceIds: buffer.sources.map((source) => source.newsroomArticleId),
      ...(!sourceOnly ? { materials: dossiers.map(({ key, versionId, sources }) => ({ key, versionId, sources })) } : {}) };
    if (sourceOnly && command.sourceIds.length === 0) {
      setMessage("Seleciona pelo menos uma fonte para organizar num Tema."); return;
    }
    if (sourceOnly && action === "create" && command.sourceIds.length < 2) {
      setMessage("Seleciona pelo menos duas fontes para criar um Tema."); return;
    }
    if (!selectedTheme && (!title.trim() || !classification)) {
      setMessage("Indica o título e a classificação do Tema. Não é necessário classificar cada fonte para a organizar."); return;
    }
    const fingerprint = JSON.stringify(command);
    if (organizationRequest.current.fingerprint !== fingerprint) organizationRequest.current = { fingerprint, id: createPreparationKey() };
    setSubmitting(true); setMessage("A guardar o Tema e a seleção…");
    try {
      const response = await fetch("/api/admin/editorial/redacao-automatica/mesa/organizacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, requestId: organizationRequest.current.id }),
      });
      const result = await response.json() as PrepareResponse;
      if (!response.ok || !result.ok || !result.themeId || !result.theme) throw new Error(result.message ?? "Organização não guardada.");
      upsertTheme(result.theme);
      for (const source of buffer.sources) {
        updateClassification(
          source.newsroomArticleId,
          source.lifecycle,
          effectiveClassificationKey(
            classificationChanges,
            source.newsroomArticleId,
            source.classificationKey,
          ),
          result.theme.classificationKey,
        );
      }
      if (sourceOnly) {
        hideSources(buffer.sources.map((source) => ({
          newsroomArticleId: source.newsroomArticleId,
          newsroomSnapshotId: source.newsroomSnapshotId,
          lifecycle: source.lifecycle,
          classificationKey: source.classificationKey,
        })));
        removeSources(command.sourceIds);
        setThemeAction(null); setTargetTheme(""); setThemeClassification(""); setSelectionPanelOpen(false);
        const addedCount = result.addedCount ?? 0;
        setMessage(addedCount > 0
          ? `${addedCount} ${addedCount === 1 ? "fonte adicionada" : "fontes adicionadas"} ao Tema.`
          : "As fontes selecionadas já pertenciam a este Tema; nenhuma associação foi duplicada.");
      } else {
        const destinationTitle = result.theme.title;
        moveToTheme(result.themeId, destinationTitle, command.sourceIds);
        setOrganizing(false); setMessage("Material guardado no Tema.");
        router.push(`/admin/editorial/redacao-automatica/mesa/temas/${result.themeId}`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Organização não guardada. A seleção foi preservada."); }
    finally { setSubmitting(false); }
  }

  async function discardSelection() {
    if (missingSnapshotCount > 0) {
      setMessage("Há fontes sem snapshot elegível; descarta-as individualmente quando estiverem completas.");
      return;
    }
    setSubmitting(true);
    setMessage(fixtureMode ? "A remover da fixture local…" : "A descartar seleção…");
    await Promise.all(buffer.sources.map((source) => discard({
      newsroomArticleId: source.newsroomArticleId,
      newsroomSnapshotId: source.newsroomSnapshotId,
      lifecycle: source.lifecycle,
      classificationKey: source.classificationKey,
    })));
    setSubmitting(false);
    setMessage(fixtureMode ? "Seleção removida apenas da fixture local." : "Descarte concluído.");
  }

  const selectionItems = <>
    {selectedThemes.map((selection) => <li key={`theme:${selection.themeId}`}><span>
      <strong>{selection.title}</strong>
      <small>Tema · {selection.sources.length} fontes</small>
    </span><button type="button" onClick={() => removeTheme(selection.themeId)} disabled={submitting}>Remover Tema</button></li>)}
    {dossiers.map((selection) => <li key={selection.key}><span><strong>{selection.title}</strong>
      <small>Dossiê inteiro · {selection.sources.length} fontes</small></span>
      <button type="button" onClick={() => removeDossier(selection.key)} disabled={submitting}>Remover Dossiê</button></li>)}
    {buffer.sources.map((selection) => (
      <li key={selection.newsroomArticleId}>
        <span>
          <strong>{selection.title}</strong>
          <small>
            {selection.sourceLabel} · {selection.lifecycle === "new" ? "NOVA" : "PUBLICADA"}
          </small>
        </span>
        <button type="button" onClick={() => remove(selection.newsroomArticleId)} disabled={submitting}>
          Remover
        </button>
      </li>
    ))}
  </>;

  if (!loaded || total === 0) return null;

  const clearSelectionButton = (
    <button type="button" className={sourceThemeActions ? styles.sourceSelectionButton : undefined} onClick={() => {
      setThemeAction(null); setOrganizing(false); setTargetTheme(""); setMessage(""); setSelectionPanelOpen(false); clear();
    }} disabled={submitting}>
      Limpar
    </button>
  );
  const selectionControlTarget = sourceThemeActions && typeof document !== "undefined"
    ? document.getElementById("mesa-selection-control")
    : null;

  return (
    <section className={styles.selectionTray}
      aria-label={sourceThemeActions ? "Ações da seleção" : undefined}
      aria-labelledby={sourceThemeActions ? undefined : "mesa-selection-title"}
      data-source-theme-actions={sourceThemeActions ? "true" : undefined}>
      {loaded && total > 0 && selectionControlTarget
        ? createPortal(clearSelectionButton, selectionControlTarget)
        : null}
      <div className={styles.selectionTrayHeader}>
        {!sourceThemeActions ? <div className={styles.selectionSummary}>
          <div className={styles.selectionSummaryHeader}>
            <h2 id="mesa-selection-title">
              {total} selecionadas
            </h2>
            {clearSelectionButton}

            {!sourceThemeActions ? (
              <details className={styles.selectionDetails}>
                <summary>Ver seleção</summary>
                <ul>{selectionItems}</ul>
              </details>
            ) : null}
          </div>
          <p>{buffer.sources.length} fontes soltas · {selectedThemes.length} Temas · {distinctSources} fontes congeláveis</p>
        </div> : null}

      <div className={styles.selectionActions}>
        {sourceThemeActions && loaded && total > 0 && !selectionControlTarget
          ? clearSelectionButton
          : null}
        {sourceThemeActions ? (
          <button
            type="button"
            className={styles.selectionPanelToggle}
            aria-expanded={selectionPanelOpen}
            aria-controls="mesa-selection-panel"
            onClick={() => setSelectionPanelOpen((open) => !open)}
            disabled={submitting}
          >
            {selectionPanelOpen ? "Fechar seleção" : "Ver seleção"}
          </button>
        ) : null}
        <label>
          <input
            aria-label="Título de trabalho"
            value={buffer.title}
            onChange={(event) => changeTitle(event.currentTarget.value)}
            maxLength={180}
            placeholder="Ex.: Preparação editorial da tarde"
            disabled={!loaded || submitting}
          />
        </label>
        {classificationBatchAvailable ? (
          <div className={styles.batchClassification}>
            <select
              aria-label="Classificação em lote"
              value={batchClassificationKey}
              disabled={submitting}
              onChange={(event) => setBatchClassificationKey(
                event.currentTarget.value as
                  | ArticleClassificationKey
                  | "unclassified"
                  | "",
              )}
            >
              <option value="">Classificar como…</option>
              {classificationOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
              <option value="unclassified">Sem classificação</option>
            </select>
            <button
              type="button"
              disabled={submitting || !batchClassificationKey}
              onClick={() => void classifySelection()}
            >Aplicar</button>
          </div>
        ) : null}
        {sourceThemeActions ? <div className={styles.themeActionButtons}>
          <button type="button" className={styles.selectionActionLink} disabled={submitting || buffer.sources.length < 2}
            onClick={() => { setThemeTitle(buffer.title); setThemeClassification(""); setTargetTheme(""); setThemeAction("create"); setSelectionPanelOpen(true); setMessage(""); }}>
            Criar tema
          </button>
          <button type="button" className={styles.selectionActionLink}
            disabled={submitting || buffer.sources.length === 0 || !themes.some((theme) => theme.status === "open")}
            onClick={() => { setTargetTheme(""); setThemeAction("add"); setSelectionPanelOpen(true); setMessage(""); }}>
            Adicionar a tema
          </button>
        </div> : <button type="button" className={styles.selectionActionLink} disabled={submitting}
          onClick={() => { setTargetTheme(buffer.themeId ?? themeContext?.id ?? ""); setOrganizing((open) => !open); }}>
          ORGANIZAR EM TEMA
        </button>}
        {!sourceThemeActions && incorporationAvailable ? <label className={styles.incorporateSelection}>
          <input type="checkbox" checked={incorporateSources} disabled={submitting}
            onChange={(event) => setIncorporateSources(event.currentTarget.checked)} />
          <span>Incorporar fontes selecionadas no Tema antes de produzir</span>
        </label> : null}
        <button
          type="button"
          className={styles.discardSelectionButton}
          onClick={() => void discardSelection()}
          disabled={submitting || missingSnapshotCount > 0 || dossiers.length > 0 || selectedThemes.length > 0}
          title={missingSnapshotCount > 0 ? "Existem fontes sem snapshot elegível" : undefined}
        >
          DESCARTAR
        </button>
        {!sourceThemeActions ? <button
          type="button"
          className={styles.prepareButton}
          onClick={prepare}
          disabled={
            !loaded
            || submitting
            || !buffer.title.trim()
            || selectionBlocked
          }
        >
          {submitting ? "A preparar…" : "PREPARAR PRODUÇÃO"}
        </button> : null}
      </div>

      </div>
      {sourceThemeActions && selectionPanelOpen && typeof document !== "undefined" ? createPortal(
        <aside
          id="mesa-selection-panel"
          className={styles.selectionPanel}
          aria-label="Seleção e trabalho de Produção"
        >
          <header className={styles.selectionPanelHeader}>
            <div>
              <strong>{total} {total === 1 ? "selecionada" : "selecionadas"}</strong>
              <span>{buffer.sources.length} fontes soltas · {selectedThemes.length} Temas</span>
            </div>
            <button type="button" onClick={() => setSelectionPanelOpen(false)} disabled={submitting}>
              Fechar
            </button>
          </header>
          <ul className={styles.selectionPanelList}>{selectionItems}</ul>
          {dossiers.length > 0 ? <p role="alert" className={styles.selectionMessage}>
            A seleção inclui Dossiês de produções anteriores. Retira-os desta seleção antes de preparar Fontes e Temas;
            as produções guardadas não serão apagadas nem alteradas.
          </p> : null}
          <MesaIntentPreparationClient
            selection={{ themes: selectedThemes, sources: buffer.sources }}
            title={buffer.title}
            storageKey={storageKey}
            fixtureMode={fixtureMode}
            combineSelectedMaterial
            disabled={submitting || dossiers.length > 0}
            onBusyChange={setSubmitting}
            onPrepared={(request, url) => {
              consumePrepared(request);
              router.push(url);
            }}
          />
          {themeAction === "create" ? <section className={styles.themeChooser} aria-label="Criar tema">
            <label>Nome do Tema
              <input value={themeTitle} maxLength={180} autoFocus disabled={submitting}
                onChange={(event) => setThemeTitle(event.currentTarget.value)} />
            </label>
            <label>Classificação do Tema
              <select value={themeClassification || suggestedThemeClassification(buffer.sources) || ""}
                onChange={(event) => setThemeClassification(event.target.value)} disabled={submitting}>
                <option value="">Escolher classificação do conjunto</option>
                {classificationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className={styles.themeChooserActions}>
              <button type="button" onClick={() => void organize("create")}
                disabled={submitting || buffer.sources.length < 2 || !themeTitle.trim()
                  || !(themeClassification || suggestedThemeClassification(buffer.sources))}>
                {submitting ? "A guardar…" : "Confirmar"}
              </button>
              <button type="button" onClick={() => { setThemeAction(null); setMessage(""); }} disabled={submitting}>Cancelar</button>
            </div>
          </section> : null}
          {themeAction === "add" ? <section className={styles.themeChooser} aria-label="Adicionar a tema">
            <label>Tema existente
              <select value={targetTheme} onChange={(event) => setTargetTheme(event.target.value)} disabled={submitting} autoFocus>
                <option value="">Escolher Tema</option>
                {themes.filter((theme) => theme.status === "open").map((theme) => <option key={theme.id} value={theme.id}>{theme.title}</option>)}
              </select>
            </label>
            <div className={styles.themeChooserActions}>
              <button type="button" onClick={() => void organize("add")}
                disabled={submitting || buffer.sources.length === 0 || !targetTheme}>
                {submitting ? "A guardar…" : "Confirmar"}
              </button>
              <button type="button" onClick={() => { setThemeAction(null); setTargetTheme(""); setMessage(""); }} disabled={submitting}>Cancelar</button>
            </div>
          </section> : null}
        </aside>,
        document.body,
      ) : null}
      {!sourceThemeActions && organizing ? <section className={styles.themeChooser} aria-label="Organizar seleção">
        <label>Destino
          <select value={targetTheme} onChange={(event) => setTargetTheme(event.target.value)} disabled={submitting}>
            <option value="">Criar Tema com o título de trabalho</option>
            {themes.filter((theme) => theme.status === "open").map((theme) => <option key={theme.id} value={theme.id}>{theme.title}</option>)}
          </select>
        </label>
        {!targetTheme ? <label>Classificação do Tema
          <select value={themeClassification || suggestedThemeClassification([...buffer.sources, ...dossiers]) || ""}
            onChange={(event) => setThemeClassification(event.target.value)} disabled={submitting}>
            <option value="">Escolher classificação do conjunto</option>
            {classificationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label> : null}
        <button type="button" onClick={() => void organize()} disabled={submitting}>Guardar organização</button>
      </section> : null}
      {buffer.themeId ? <p className={styles.selectionMessage}>Produção no Tema: {buffer.themeTitle ?? "Tema selecionado"}</p> : null}
      {discardErrors.storage ? <p className={styles.selectionMessage} role="alert">{discardErrors.storage}</p> : null}
      {!sourceThemeActions && selectionBlocked ? (
        <p className={styles.classificationBlock} role="alert">
          {missingSnapshotCount > 0
            ? `${missingSnapshotCount} sem snapshot elegivel. `
            : ""}
          {distinctSources > MESA_MAX_NEWSROOM_SOURCES ? `O motor aceita até ${MESA_MAX_NEWSROOM_SOURCES} fontes por produção. ` : ""}
          {!buffer.title.trim() ? "Indica um título de trabalho. " : ""}
          {buffer.title.trim() && dossiers.length > 0 && !payload && distinctSources <= MESA_MAX_NEWSROOM_SOURCES && !missingSnapshotCount
            ? "Conflito de versões: há snapshots diferentes da mesma fonte. " : ""}
          A seleção permanece; organizar em Tema não divide nem altera os Dossiês.
        </p>
      ) : null}

      {message ? <p className={styles.selectionMessage} role="status">{message}</p> : null}
    </section>
  );
}
