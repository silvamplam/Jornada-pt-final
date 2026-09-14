"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { MesaOrganization, MesaDossierCard, MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { MesaThemeSelectionToggle } from "./_mesa-selection-client";
import { MESA_THEME_UPDATED_EVENT, mesaThemeFromEvent, publishMesaThemeUpdate } from "./_mesa-client-events";
import styles from "./mesa.module.css";

const ORGANIZATION_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/organizacao";

/** Each panel owns its window/scroll. Loading more never navigates the other panel. */
export function MesaSourceWindow({ items, storageKey, empty = "Sem entradas." }: Readonly<{
  items: readonly ReactNode[]; storageKey: string; empty?: string;
}>) {
  const root = useRef<HTMLOListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(24);
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    let saved = { visible: 24, scroll: 0 };
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");
      if (Number.isSafeInteger(parsed?.visible) && parsed.visible >= 24 && Number.isFinite(parsed?.scroll)) saved = parsed;
    } catch { /* Storage is an enhancement, never a prerequisite for reading. */ }
    setVisible(saved.visible);
    setLoadedKey(storageKey);
    const frame = requestAnimationFrame(() => { if (root.current) root.current.scrollTop = saved.scroll; });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
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
    if (!sentinel.current || !root.current || visible >= items.length || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible((count) => Math.min(items.length, count + 24));
    }, { root: root.current, rootMargin: "80px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [items.length, visible]);
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
  const [status, setStatus] = useState("open");
  const [themeCards, setThemeCards] = useState(organization.themes);
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
          <article className={styles.organizationCard}>
            <MesaThemeSelectionToggle theme={theme} />
            <Link href={`/admin/editorial/redacao-automatica/mesa/temas/${theme.id}`} prefetch={false}>{theme.title}</Link>
            <p>{theme.sourceCount} fontes · {theme.articleCount} artigos publicados</p>
            {theme.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{theme.updatedSourceCount} fontes atualizadas</strong> : null}
          </article>
        </li>)
      ]} />
  </section>;
}

export function MesaLooseSourcesPanel({
  newItems,
  publishedItems,
  storageKey,
  initialTab,
  newHref,
  publishedHref,
  newCount,
  publishedCount,
  page,
  previousHref,
  nextHref,
}: Readonly<{
  newItems: readonly ReactNode[];
  publishedItems: readonly ReactNode[];
  storageKey: string;
  initialTab: "new" | "published";
  newHref: string;
  publishedHref: string;
  newCount: number;
  publishedCount: number;
  page: number;
  previousHref: string | null;
  nextHref: string | null;
}>) {
  const tab = initialTab;
  return <section className={styles.sourcePanel} data-lifecycle={tab}>
    <header className={styles.panelHeader}><nav aria-label="Fontes avulsas">
      <Link href={newHref} aria-current={tab === "new" ? "page" : undefined}>NOVAS ({newCount})</Link>
      <Link href={publishedHref} aria-current={tab === "published" ? "page" : undefined}>PUBLICADAS ({publishedCount})</Link>
    </nav></header>
    <MesaSourceWindow key={tab} storageKey={`${storageKey}.${tab}`}
      empty={tab === "new" ? "Sem fontes por encaminhar neste filtro." : "Sem fontes publicadas avulsas neste filtro."}
      items={tab === "new" ? newItems : publishedItems} />
    {previousHref || nextHref ? <nav className={styles.sourcePagination} aria-label="Paginação das fontes">
      {previousHref ? <Link href={previousHref} rel="prev">Anterior</Link> : <span aria-disabled="true">Anterior</span>}
      <span>Página {page}</span>
      {nextHref ? <Link href={nextHref} rel="next">Seguinte</Link> : <span aria-disabled="true">Seguinte</span>}
    </nav> : null}
  </section>;
}
