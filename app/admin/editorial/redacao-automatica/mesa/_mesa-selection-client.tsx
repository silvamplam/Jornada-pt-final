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
import type { ArticleClassificationKey } from "@/lib/editorial-classifications";
import type { OperationalDeskSourceLifecycle } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

import {
  EMPTY_MESA_PREPARATION_BUFFER,
  MESA_MAX_NEWSROOM_SOURCES,
  MESA_PREPARATION_STORAGE_KEY,
  changeMesaPreparationTitle,
  clearMesaPreparationBuffer,
  mesaMaterialIsSelected,
  mesaPreparationPayload,
  readMesaPreparationBuffer,
  removeMesaMaterial,
  selectMesaMaterial,
  observeMesaMaterial,
  changeMesaPreparationTheme,
  mesaPreparationStorageKey,
  writeMesaPreparationBuffer,
  selectMesaDossierMaterial, removeMesaDossierMaterial,
  type MesaDossierSelection,
  type MesaMaterialSelection,
  type MesaPreparationBuffer,
} from "./_mesa-selection-state";
import type { MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { suggestedThemeClassification } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { MesaSourceChanges } from "./_mesa-source-changes";
import styles from "./mesa.module.css";

const PREPARE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/preparar";
const DISCARD_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/source";
const CLASSIFICATION_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/classification";

type PrepareResponse = Readonly<{
  ok?: boolean;
  code?: string;
  message?: string;
  workspaceUrl?: string;
}>;

type DismissedSource = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string | null;
  lifecycle: OperationalDeskSourceLifecycle;
  classificationKey: ArticleClassificationKey | null;
}>;

type MesaSelectionContextValue = Readonly<{
  buffer: MesaPreparationBuffer;
  loaded: boolean;
  fixtureMode: boolean;
  dismissed: readonly DismissedSource[];
  discardErrors: Readonly<Record<string, string>>;
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
  remove: (newsroomArticleId: string) => void;
  changeTitle: (title: string) => void;
  clear: () => void;
  discard: (source: DismissedSource) => Promise<void>;
}>;

const MesaSelectionContext = createContext<MesaSelectionContextValue | null>(null);

function createPreparationKey(): string {
  return window.crypto.randomUUID();
}

function useMesaSelection(): MesaSelectionContextValue {
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
}: Readonly<{
  children: ReactNode;
  fixtureMode?: boolean;
  initialSelection?: readonly MesaMaterialSelection[];
  themes?: readonly MesaThemeCard[];
  themeContext?: Readonly<{ id: string; title: string }> | null;
  serverSourceIds?: readonly string[] | null;
}>) {
  const storageKey = mesaPreparationStorageKey(themeContext?.id);
  const [buffer, setBuffer] = useState<MesaPreparationBuffer>(
    fixtureMode && initialSelection.length > 0
      ? {
          version: 2,
          preparationKey: FIXTURE_PREPARATION_KEY,
          title: "Seleção visual da Mesa",
          sources: initialSelection,
        }
      : EMPTY_MESA_PREPARATION_BUFFER,
  );
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState<readonly DismissedSource[]>([]);
  const [discardErrors, setDiscardErrors] = useState<Readonly<Record<string, string>>>({});

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
    dismissed,
    discardErrors,
    themes,
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
    remove(newsroomArticleId) {
      persist((current) => removeMesaMaterial(
        current,
        newsroomArticleId,
        createPreparationKey,
      ));
    },
    changeTitle(title) {
      persist((current) => changeMesaPreparationTitle(current, title, createPreparationKey));
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
  const { dismissed, serverSourceIds } = useMesaSelection();
  const removed = dismissed.filter((source) => (
    (serverSourceIds === null || serverSourceIds.includes(source.newsroomArticleId))
    &&
    (lifecycle === undefined || source.lifecycle === lifecycle)
    && (classificationKey === undefined
      || (classificationKey === "unclassified"
        ? source.classificationKey === null
        : source.classificationKey === classificationKey))
  )).length;
  return <span className={styles.liveCount}>{Math.max(0, initial - removed)}</span>;
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
  const { dismissed, discardErrors, discard } = useMesaSelection();
  if (allowDiscard && dismissed.some((item) => item.newsroomArticleId === source.newsroomArticleId
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
          onClick={() => void discard(source)}
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
  const { buffer, loaded, select, observe, remove } = useMesaSelection();
  const selected = material ? mesaMaterialIsSelected(buffer, material) : false;
  const selectedSource = material
    ? buffer.sources.find(
        (selection) => selection.newsroomArticleId === material.newsroomArticleId,
      ) ?? null
    : null;
  const frozenOnAnotherSnapshot = Boolean(
    selectedSource
    && material
    && selectedSource.newsroomSnapshotId
    && material.newsroomSnapshotId
    && selectedSource.newsroomSnapshotId !== material.newsroomSnapshotId,
  );
  const sourceLimitReached = Boolean(
    material
    && !selected
    && buffer.sources.length >= MESA_MAX_NEWSROOM_SOURCES,
  );

  useEffect(() => {
    if (material && selectedSource) observe(material);
  }, [material, observe, selectedSource]);

  if (!material) {
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
          if (selected) remove(material.newsroomArticleId);
          else select(material);
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
  const { buffer, select } = useMesaSelection();
  const saved = buffer.sources.find((source) => source.newsroomArticleId === material.newsroomArticleId);
  if (!saved || saved.newsroomSnapshotId === material.newsroomSnapshotId || !material.newsroomSnapshotId) return null;
  return <div className={styles.versionNotice}>
    {saved.newsroomSnapshotId ? <MesaSourceChanges sourceId={material.newsroomArticleId}
      beforeId={saved.newsroomSnapshotId} afterId={material.newsroomSnapshotId} title={material.title} />
      : <span>Já existe conteúdo para esta fonte.</span>}
    <button type="button" onClick={() => select(material)}>Usar versão recente na seleção</button>
  </div>;
}

const classificationOptions = [
  ["benfica", "Benfica"],
  ["sporting", "Sporting"],
  ["fc_porto", "FC Porto"],
  ["other_liga_clubs", "Outros 1.ª Liga"],
  ["outside_liga_other", "Fora da 1.ª Liga / Outros"],
] as const;

export function MesaClassificationEditor({
  newsroomArticleId,
  currentClassificationKey,
  fixtureMode = false,
}: Readonly<{
  newsroomArticleId: string;
  currentClassificationKey: ArticleClassificationKey | null;
  fixtureMode?: boolean;
}>) {
  const router = useRouter();
  const [classificationKey, setClassificationKey] = useState(
    currentClassificationKey ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!classificationKey) return;
    setSaving(true);
    setMessage("");
    if (fixtureMode) {
      setMessage("Classificação simulada localmente.");
      setSaving(false);
      return;
    }
    try {
      const response = await fetch(CLASSIFICATION_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsroomArticleId, classificationKey }),
      });
      const result = await response.json().catch(() => null) as PrepareResponse | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Não foi possível guardar a classificação.");
      }
      setMessage("Classificação manual guardada.");
      router.refresh();
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
        <option value="" disabled>Classificar…</option>
        {classificationOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={saving || !classificationKey || classificationKey === currentClassificationKey}
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

export function MesaSelectionTray() {
  const {
    buffer,
    loaded,
    fixtureMode,
    remove,
    removeDossier,
    changeTitle,
    clear,
    discard,
    themes,
    moveToTheme,
    storageKey,
    themeContext,
    discardErrors,
  } = useMesaSelection();
  const router = useRouter();
  const [organizing, setOrganizing] = useState(false);
  const [targetTheme, setTargetTheme] = useState(buffer.themeId ?? themeContext?.id ?? "");
  const [themeClassification, setThemeClassification] = useState("");
  const organizationRequest = useRef({ fingerprint: "", id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const payload = mesaPreparationPayload(buffer);
  const publicadas = buffer.sources.filter((source) => source.lifecycle === "published");
  const dossiers = buffer.dossiers ?? [];
  const total = buffer.sources.length + dossiers.length;
  const distinctSources = new Set([...buffer.sources.map((row) => row.newsroomArticleId),
    ...dossiers.flatMap((row) => row.sources.map((ref) => ref.newsroomArticleId))]).size;
  const unclassifiedCount = buffer.sources.filter(
    (source) => source.classificationKey === null,
  ).length;
  const missingSnapshotCount = buffer.sources.filter(
    (source) => source.newsroomSnapshotId === null,
  ).length;
  const selectionBlocked = unclassifiedCount > 0 || missingSnapshotCount > 0 || !payload;

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
          : unclassifiedCount > 0
            ? "Resolve as fontes POR CLASSIFICAR antes de preparar a producao."
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
        body: JSON.stringify({ ...payload, mesaVersion: 2, materials: payload.materials ?? [] }),
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

  async function organize() {
    if (fixtureMode) { setMessage("Fixture visual: ação de Tema não enviada."); return; }
    const classification = themeClassification || suggestedThemeClassification([...buffer.sources, ...dossiers]) || "";
    const command = { action: "organize_sources", themeId: targetTheme || null, title: buffer.title,
      classificationKey: classification, sourceIds: buffer.sources.map((source) => source.newsroomArticleId),
      materials: dossiers.map(({ key, versionId, sources }) => ({ key, versionId, sources })) };
    if (!targetTheme && (!buffer.title.trim() || !classification)) {
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
      const result = await response.json();
      if (!response.ok || !result.ok || !result.themeId) throw new Error(result.message ?? "Organização não guardada.");
      const title = themes.find((theme) => theme.id === result.themeId)?.title ?? buffer.title;
      moveToTheme(result.themeId, title, command.sourceIds);
      setOrganizing(false); setMessage("Material guardado no Tema.");
      router.push(`/admin/editorial/redacao-automatica/mesa/temas/${result.themeId}`);
      router.refresh();
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

  if (!loaded || total === 0) return null;

  return (
    <section className={styles.selectionTray} aria-labelledby="mesa-selection-title">
      <div className={styles.selectionSummary}>
        <div>
          <h2 id="mesa-selection-title">
            {total} selecionadas
          </h2>
          <p>{distinctSources} fontes distintas · {dossiers.length} Dossiês inteiros · {publicadas.length} fontes publicadas avulsas</p>
        </div>
        <button type="button" onClick={clear} disabled={submitting}>
          Limpar
        </button>
      </div>

      <details className={styles.selectionDetails}>
        <summary>Ver seleção</summary>
        <ul>
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
        </ul>
      </details>

      <div className={styles.selectionActions}>
        <label>
          <span>Título de trabalho</span>
          <input
            value={buffer.title}
            onChange={(event) => changeTitle(event.currentTarget.value)}
            maxLength={180}
            placeholder="Ex.: Preparação editorial da tarde"
            disabled={!loaded || submitting}
          />
        </label>
        <button type="button" className={styles.selectionActionLink} disabled={submitting}
          onClick={() => { setTargetTheme(buffer.themeId ?? themeContext?.id ?? ""); setOrganizing((open) => !open); }}>
          ORGANIZAR EM TEMA
        </button>
        <button
          type="button"
          className={styles.discardSelectionButton}
          onClick={() => void discardSelection()}
          disabled={submitting || missingSnapshotCount > 0 || dossiers.length > 0}
          title={missingSnapshotCount > 0 ? "Existem fontes sem snapshot elegível" : undefined}
        >
          DESCARTAR
        </button>
        <button
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
        </button>
      </div>

      {organizing ? <section className={styles.themeChooser} aria-label="Organizar seleção">
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
      {selectionBlocked ? (
        <p className={styles.classificationBlock} role="alert">
          {unclassifiedCount > 0
            ? `${unclassifiedCount} sem classificar. `
            : ""}
          {missingSnapshotCount > 0
            ? `${missingSnapshotCount} sem snapshot elegivel. `
            : ""}
          {distinctSources > MESA_MAX_NEWSROOM_SOURCES ? `O motor aceita até ${MESA_MAX_NEWSROOM_SOURCES} fontes por produção. ` : ""}
          {!buffer.title.trim() ? "Indica um título de trabalho. " : ""}
          {buffer.title.trim() && dossiers.length > 0 && !payload && distinctSources <= MESA_MAX_NEWSROOM_SOURCES && !unclassifiedCount && !missingSnapshotCount
            ? "Conflito de versões: há snapshots diferentes da mesma fonte. " : ""}
          A seleção permanece; organizar em Tema não divide nem altera os Dossiês.
        </p>
      ) : null}

      {message ? <p className={styles.selectionMessage} role="status">{message}</p> : null}
    </section>
  );
}
