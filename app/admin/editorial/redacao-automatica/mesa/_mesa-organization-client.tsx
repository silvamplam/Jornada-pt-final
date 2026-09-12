"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MesaOrganization, MesaDossierCard, MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { MesaDossierSelectionToggle } from "./_mesa-selection-client";
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
  const router = useRouter();
  const [themeId, setThemeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Associação não guardada."); }
    finally { setBusy(false); }
  }
  return <article className={styles.organizationCard}>
    {card.material ? <MesaDossierSelectionToggle material={{ ...card.material, title: card.title,
      classificationKey: card.classificationKeys?.length === 1 && !card.hasUnclassified ? card.classificationKeys[0] : null }} /> : null}
    <Link href={href} prefetch={false}>{card.title}</Link>
    <p>{card.sourceCount} fontes · {card.articleCount} artigos publicados</p>
    {card.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{card.updatedSourceCount} fontes mais recentes que a produção</strong> : null}
    {card.themeIds && card.themeIds.length > 1 ? <p>Associado a {card.themeIds.length} Temas independentes</p> : null}
    {card.material && themes.some((theme) => theme.status === "open" && !card.themeIds?.includes(theme.id)) ? <details>
      <summary>Associar a um Tema</summary>
      <select aria-label={`Tema para ${card.title}`} value={themeId} onChange={(event) => setThemeId(event.target.value)} disabled={busy}>
        <option value="">Escolher Tema</option>
        {themes.filter((theme) => theme.status === "open" && !card.themeIds?.includes(theme.id)).map((theme) => <option key={theme.id} value={theme.id}>{theme.title}</option>)}
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
  const [tab, setTab] = useState("themes");
  const themes = organization.themes.filter((theme) => status === "all" || theme.status === status);
  return <section id="mesa-organizacao" className={styles.sourcePanel} data-organization="true">
    <header className={styles.panelHeader}>
      <nav aria-label="Organização editorial">
        <button type="button" aria-pressed={tab === "themes"} onClick={() => setTab("themes")}>TEMAS</button>
        <button type="button" aria-pressed={tab === "dossiers"} onClick={() => setTab("dossiers")}>DOSSIÊS</button>
      </nav>
      <select aria-label="Temas visíveis" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="open">Abertos</option><option value="archived">Arquivados</option><option value="all">Todos</option>
      </select>
    </header>
    <MesaSourceWindow storageKey={`jornada.mesa.organizacao.${tab}.${status}`} empty="Organiza uma seleção num Tema. Os Dossiês existentes continuam acessíveis aqui."
      items={[
        ...(tab === "themes" ? themes : []).map((theme) => <li key={`theme:${theme.id}`} className={styles.organizationItem}>
          <article className={styles.organizationCard}>
            <Link href={`/admin/editorial/redacao-automatica/mesa/temas/${theme.id}`} prefetch={false}>{theme.title}</Link>
            <p>{theme.sourceCount} fontes · {theme.dossiers.length} dossiês · {theme.articleCount} artigos publicados</p>
            {theme.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{theme.updatedSourceCount} fontes atualizadas</strong> : null}
            {theme.dossiers.length > 0 ? <details><summary>Ver Dossiês</summary>
              {theme.dossiers.map((card) => <MesaDossierCardView key={card.id} card={card} fixtureMode={fixtureMode} />)}
            </details> : null}
          </article>
        </li>),
        ...(tab === "dossiers" ? (organization.availableDossiers ?? organization.unlinkedDossiers).map((card) => <li key={`${card.kind}:${card.id}`} className={styles.organizationItem}>
          <span className={styles.unlinkedLabel}>{card.themeIds?.length ? `${card.themeIds.length} Temas · associação não exclusiva` : "Dossiê sem Tema"}</span>
          <MesaDossierCardView card={card} themes={organization.themes} fixtureMode={fixtureMode} />
        </li>) : []),
      ]} />
  </section>;
}

export function MesaLooseSourcesPanel({ newItems, publishedItems, storageKey, initialTab, newHref, publishedHref }: Readonly<{
  newItems: readonly ReactNode[];
  publishedItems: readonly ReactNode[];
  storageKey: string;
  initialTab: "new" | "published";
  newHref: string;
  publishedHref: string;
}>) {
  const tab = initialTab;
  return <section className={styles.sourcePanel} data-lifecycle={tab}>
    <header className={styles.panelHeader}><nav aria-label="Fontes avulsas">
      <Link href={newHref} aria-current={tab === "new" ? "page" : undefined}>NOVAS ({newItems.length})</Link>
      <Link href={publishedHref} aria-current={tab === "published" ? "page" : undefined}>PUBLICADAS ({publishedItems.length})</Link>
    </nav></header>
    <MesaSourceWindow key={tab} storageKey={`${storageKey}.${tab}`}
      empty={tab === "new" ? "Sem fontes por encaminhar neste filtro." : "Sem fontes publicadas avulsas neste filtro."}
      items={tab === "new" ? newItems : publishedItems} />
  </section>;
}
