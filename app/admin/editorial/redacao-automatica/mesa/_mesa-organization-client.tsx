"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { MesaOrganization, MesaDossierCard, MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { MesaLiveCount, MesaThemeSelectionToggle, useMesaSelection } from "./_mesa-selection-client";
import { MESA_MAX_NEWSROOM_SOURCES, type MesaMaterialSelection } from "./_mesa-selection-state";
import { MESA_THEME_UPDATED_EVENT, mesaThemeFromEvent, publishMesaThemeUpdate } from "./_mesa-client-events";
import styles from "./mesa.module.css";

const ORGANIZATION_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/organizacao";

/** Each panel owns its window/scroll. Loading more never navigates the other panel. */
export function MesaSourceWindow({ items, storageKey, empty = "Sem entradas.", showAll = false }: Readonly<{
  items: readonly ReactNode[]; storageKey: string; empty?: string; showAll?: boolean;
}>) {
  const root = useRef<HTMLOListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(24);
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    if (showAll) {
      setVisible(items.length);
      setLoadedKey(storageKey);
      return;
    }
    let saved = { visible: 24, scroll: 0 };
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");
      if (Number.isSafeInteger(parsed?.visible) && parsed.visible >= 24 && Number.isFinite(parsed?.scroll)) saved = parsed;
    } catch { /* Storage is an enhancement, never a prerequisite for reading. */ }
    setVisible(saved.visible);
    setLoadedKey(storageKey);
    const frame = requestAnimationFrame(() => { if (root.current) root.current.scrollTop = saved.scroll; });
    return () => cancelAnimationFrame(frame);
  }, [storageKey, showAll, items.length]);
  useEffect(() => {
    const list = root.current;
    if (!list || loadedKey !== storageKey) return;
    const save = () => {
      try { window.sessionStorage.setItem(storageKey, JSON.stringify({ visible, scroll: list.scrollTop })); } catch { /* non-fatal */ }
    };
    list.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => { save(); list.removeEventListener("scroll", save); window.removeEventListener("pagehide", save); };
  }, [storageKey, loadedKey, visible]);
  useEffect(() => {
    if (showAll || !sentinel.current || !root.current || visible >= items.length || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible((count) => Math.min(items.length, count + 24));
    }, { root: root.current, rootMargin: "80px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [items.length, visible, showAll]);
  if (!items.length) return <p className={styles.emptyPanel}>{empty}</p>;
  return <ol className={styles.sourceGrid} ref={root}>
    {items.slice(0, visible)}
    {visible < items.length ? <li ref={sentinel} className={styles.windowMore}>
      <button type="button" onClick={() => setVisible((count) => count + 24)}>Mostrar mais ({items.length - visible})</button>
    </li> : null}
  </ol>;
}

export function MesaDossierCardView({ card, themes = [], fixtureMode = false }: Readonly<{
  card: MesaDossierCard; themes?: readonly MesaThemeCard[]; fixtureMode?: boolean;
}>) {
  const [themeId, setThemeId] = useState("");
  const [attachedThemeIds, setAttachedThemeIds] = useState<readonly string[]>(card.themeIds ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setAttachedThemeIds(card.themeIds ?? []), [card.themeIds]);
  const href = card.material
    ? `/admin/editorial/redacao-automatica/mesa/dossies?material=${encodeURIComponent(card.material.key)}${card.material.versionId ? `&version=${card.material.versionId}` : ""}`
    : card.href ?? (card.kind === "dossier"
    ? `/admin/editorial/redacao-automatica/mesa/producao/${card.id}`
    : "/admin/editorial/redacao-automatica?view=used");
  async function attach() {
    if (!themeId || fixtureMode || !card.material) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(ORGANIZATION_ROUTE, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "organize_sources", requestId: window.crypto.randomUUID(),
          sourceIds: [], materials: [card.material], themeId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Não foi possível associar o Dossiê.");
      if (!result.theme) throw new Error("theme-summary-missing");
      setAttachedThemeIds((current) => current.includes(themeId) ? current : [...current, themeId]);
      publishMesaThemeUpdate(result.theme as MesaThemeCard);
      setMessage("Dossiê associado ao Tema.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Associação não guardada."); }
    finally { setBusy(false); }
  }
  return <article className={styles.organizationCard}>
    <Link href={href} prefetch={false}>{card.title}</Link>
    <p>{card.sourceCount} fontes · {card.articleCount} artigos publicados</p>
    {card.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{card.updatedSourceCount} fontes mais recentes que a produção</strong> : null}
    {attachedThemeIds.length > 1 ? <p>Associado a {attachedThemeIds.length} Temas independentes</p> : null}
    {card.material && themes.some((theme) => theme.status === "open" && !attachedThemeIds.includes(theme.id)) ? <details>
      <summary>Associar a um Tema</summary>
      <select aria-label={`Tema para ${card.title}`} value={themeId} onChange={(event) => setThemeId(event.target.value)} disabled={busy}>
        <option value="">Escolher Tema</option>
        {themes.filter((theme) => theme.status === "open" && !attachedThemeIds.includes(theme.id)).map((theme) => <option key={theme.id} value={theme.id}>{theme.title}</option>)}
      </select>
      <button type="button" onClick={() => void attach()} disabled={busy || !themeId || fixtureMode}>Associar</button>
      {message ? <p role="alert">{message}</p> : null}
    </details> : null}
  </article>;
}

export function MesaOrganizationPanel({ organization, fixtureMode = false }: Readonly<{
  organization: MesaOrganization; fixtureMode?: boolean;
}>) {
  const { removeTheme } = useMesaSelection();
  const [status, setStatus] = useState("open");
  const [themeCards, setThemeCards] = useState(organization.themes);
  const [archivingThemeIds, setArchivingThemeIds] = useState<readonly string[]>([]);
  const [archiveErrors, setArchiveErrors] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => setThemeCards(organization.themes), [organization.themes]);
  useEffect(() => {
    const update = (event: Event) => {
      const theme = mesaThemeFromEvent(event);
      if (!theme) return;
      setThemeCards((current) => {
        if (!current.some((item) => item.id === theme.id)) return [theme, ...current];
        return current.map((item) => item.id === theme.id ? theme : item);
      });
    };
    window.addEventListener(MESA_THEME_UPDATED_EVENT, update);
    return () => window.removeEventListener(MESA_THEME_UPDATED_EVENT, update);
  }, []);
  async function archiveTheme(theme: MesaThemeCard) {
    if (theme.status !== "open" || archivingThemeIds.includes(theme.id)) return;
    setArchiveErrors((current) => {
      const next = { ...current };
      delete next[theme.id];
      return next;
    });
    setArchivingThemeIds((current) => [...current, theme.id]);
    setThemeCards((current) => current.map((item) => (
      item.id === theme.id ? { ...item, status: "archived" } : item
    )));
    if (fixtureMode) {
      removeTheme(theme.id);
      setArchivingThemeIds((current) => current.filter((id) => id !== theme.id));
      return;
    }
    try {
      const response = await fetch(ORGANIZATION_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive_theme", themeId: theme.id }),
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean; message?: string; theme?: MesaThemeCard;
      } | null;
      if (!response.ok || !result?.ok || !result.theme) {
        throw new Error(result?.message || "Não foi possível apagar o Tema da Mesa.");
      }
      setThemeCards((current) => current.map((item) => (
        item.id === theme.id ? result.theme! : item
      )));
      removeTheme(theme.id);
      publishMesaThemeUpdate(result.theme);
    } catch (error) {
      setThemeCards((current) => current.map((item) => (item.id === theme.id ? theme : item)));
      setArchiveErrors((current) => ({
        ...current,
        [theme.id]: error instanceof Error ? error.message : "Não foi possível apagar o Tema da Mesa.",
      }));
    } finally {
      setArchivingThemeIds((current) => current.filter((id) => id !== theme.id));
    }
  }

  const themes = themeCards.filter((theme) => status === "all" || theme.status === status);
  return <section id="mesa-organizacao" className={styles.sourcePanel} data-organization="true">
    <header className={styles.panelHeader}>
      <nav aria-label="Organização editorial">
        <button type="button" aria-pressed={true}>TEMAS</button>
      </nav>
      <select aria-label="Temas visíveis" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="open">Abertos</option><option value="archived">Arquivados</option><option value="all">Todos</option>
      </select>
    </header>
    <MesaSourceWindow storageKey={`jornada.mesa.organizacao.themes.${status}`} empty="Organiza uma seleção num Tema."
      items={[
        ...themes.map((theme) => <li key={`theme:${theme.id}`} className={styles.organizationThemeItem}>
          <article className={styles.organizationCard} data-theme-publication={theme.articleCount > 0 ? "published" : "empty"}>
            <MesaThemeSelectionToggle theme={theme} />
            {theme.status === "open" ? (
              <button
                type="button"
                className={styles.themeDiscardButton}
                disabled={archivingThemeIds.includes(theme.id)}
                aria-label="Apagar Tema da Mesa"
                title="Apagar Tema da Mesa"
                onClick={() => void archiveTheme(theme)}
              >Apagar Tema</button>
            ) : null}
            <Link href={`/admin/editorial/redacao-automatica/mesa/temas/${theme.id}`} prefetch={false}>{theme.title}</Link>
            <p>
              {theme.sourceCount} fontes · {" "}
              <span className={styles.themePublicationState} data-tone={theme.articleCount > 0 ? "published" : "empty"}>
                {theme.articleCount} artigos publicados
              </span>
            </p>
            {theme.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{theme.updatedSourceCount} fontes atualizadas</strong> : null}
            {archiveErrors[theme.id] ? <span className={styles.themeDiscardError} role="alert">{archiveErrors[theme.id]}</span> : null}
          </article>
        </li>)
      ]} />
  </section>;
}

export function MesaLooseSourcesPanel({
  newItems,
  publishedItems,
  archiveItems,
  storageKey,
  initialTab,
  newHref,
  publishedHref,
  archiveHref,
  newCount,
  publishedCount,
  archiveCount,
  newSelectionItems,
  publishedSelectionItems,
}: Readonly<{
  newItems: readonly ReactNode[];
  publishedItems: readonly ReactNode[];
  archiveItems: readonly ReactNode[];
  newSelectionItems: readonly MesaMaterialSelection[];
  publishedSelectionItems: readonly MesaMaterialSelection[];
  storageKey: string;
  initialTab: "new" | "published" | "archive";
  newHref: string;
  publishedHref: string;
  archiveHref: string;
  newCount: number;
  publishedCount: number;
  archiveCount: number | null;
}>) {
  const {
    buffer,
    classificationChanges,
    classificationFilter,
    dismissed,
    hiddenSourceIds,
    loaded,
    select,
  } = useMesaSelection();
  const tab = initialTab;
  const items = tab === "new"
    ? newItems
    : tab === "published"
      ? publishedItems
      : archiveItems;
  const empty = tab === "new"
    ? "Sem fontes por encaminhar neste filtro."
    : tab === "published"
      ? "Sem fontes publicadas avulsas neste filtro."
      : "Sem fontes arquivadas neste filtro.";
  const selectableItems = tab === "new"
    ? newSelectionItems
    : tab === "published"
      ? publishedSelectionItems
      : [];
  const visibleSelectableItems = selectableItems.filter((material) => {
    if (!material.newsroomSnapshotId || hiddenSourceIds.includes(material.newsroomArticleId)) return false;
    const classificationChange = classificationChanges[material.newsroomArticleId];
    const currentClassification = classificationChange
      ? classificationChange.current
      : material.classificationKey;
    const outsideFilter = classificationFilter !== "all" && (
      classificationFilter === "unclassified"
        ? currentClassification !== null
        : currentClassification !== classificationFilter
    );
    return !outsideFilter && !dismissed.some((source) => (
      source.newsroomArticleId === material.newsroomArticleId
      && source.newsroomSnapshotId === material.newsroomSnapshotId
    ));
  });
  const selectedSourceIds = new Set(buffer.sources.map((source) => source.newsroomArticleId));
  const unselectedItems = visibleSelectableItems.filter(
    (material) => !selectedSourceIds.has(material.newsroomArticleId),
  );
  const remainingSelectionSlots = Math.max(
    0,
    MESA_MAX_NEWSROOM_SOURCES - buffer.sources.length,
  );
  const bulkSelection = unselectedItems.slice(0, remainingSelectionSlots);
  const selectionLimitHit = unselectedItems.length > remainingSelectionSlots;
  const hasSelection = buffer.sources.length + (buffer.themes?.length ?? 0) + (buffer.dossiers?.length ?? 0) > 0;

  return <section className={styles.sourcePanel} data-lifecycle={tab}>
    <header className={styles.panelHeader}><nav aria-label="Fontes">
      <Link href={newHref} aria-current={tab === "new" ? "page" : undefined}>
        NOVAS (<MesaLiveCount
          initial={newCount}
          lifecycle="new"
          classificationKey={classificationFilter === "all" ? undefined : classificationFilter}
        />)
      </Link>
      <Link href={publishedHref} aria-current={tab === "published" ? "page" : undefined}>PUBLICADAS ({publishedCount})</Link>
      <Link href={archiveHref} aria-current={tab === "archive" ? "page" : undefined}>
        {archiveCount === null ? "ARQUIVO" : `ARQUIVO (${archiveCount})`}
      </Link>
    </nav>
    <span id="mesa-selection-control" className={styles.sourceSelectionControl}>
      {!hasSelection && tab !== "archive" ? <button
        type="button"
        className={styles.sourceSelectionButton}
        disabled={!loaded || bulkSelection.length === 0}
        title={selectionLimitHit
          ? `Seleciona até ao limite atual de ${MESA_MAX_NEWSROOM_SOURCES} fontes.`
          : "Selecionar as fontes elegíveis deste separador"}
        onClick={() => bulkSelection.forEach((material) => select(material))}
      >Selecionar</button> : null}
    </span></header>
    <MesaSourceWindow
      key={tab}
      storageKey={`${storageKey}.${tab}`}
      empty={empty}
      items={items}
      showAll
    />
  </section>;
}
