"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MesaOrganization, MesaDossierCard, MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
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
  const href = card.href ?? (card.kind === "dossier"
    ? `/admin/editorial/redacao-automatica/mesa/producao/${card.id}`
    : "/admin/editorial/redacao-automatica?view=used");
  async function attach() {
    if (!themeId || fixtureMode) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(ORGANIZATION_ROUTE, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attach_dossier", dossierId: card.id, themeId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Não foi possível associar o Dossiê.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Associação não guardada."); }
    finally { setBusy(false); }
  }
  return <article className={styles.organizationCard}>
    <Link href={href} prefetch={false}>{card.title}</Link>
    <p>{card.sourceCount} fontes · {card.articleCount} artigos publicados</p>
    {card.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{card.updatedSourceCount} fontes mais recentes que a produção</strong> : null}
    {card.themeId === null && card.kind === "dossier" && themes.some((theme) => theme.status === "open") ? <details>
      <summary>Associar a um Tema</summary>
      <select aria-label={`Tema para ${card.title}`} value={themeId} onChange={(event) => setThemeId(event.target.value)} disabled={busy}>
        <option value="">Escolher Tema</option>
        {themes.filter((theme) => theme.status === "open").map((theme) => <option key={theme.id} value={theme.id}>{theme.title}</option>)}
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
  const themes = organization.themes.filter((theme) => status === "all" || theme.status === status);
  return <section id="mesa-organizacao" className={styles.sourcePanel} data-organization="true">
    <header className={styles.panelHeader}>
      <h2>TEMAS E DOSSIÊS</h2>
      <select aria-label="Temas visíveis" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="open">Abertos</option><option value="archived">Arquivados</option><option value="all">Todos</option>
      </select>
    </header>
    <MesaSourceWindow storageKey={`jornada.mesa.organizacao.${status}`} empty="Organiza uma seleção num Tema. Os Dossiês existentes continuam acessíveis aqui."
      items={[
        ...themes.map((theme) => <li key={`theme:${theme.id}`} className={styles.organizationItem}>
          <article className={styles.organizationCard}>
            <Link href={`/admin/editorial/redacao-automatica/mesa/temas/${theme.id}`} prefetch={false}>{theme.title}</Link>
            <p>{theme.sourceCount} fontes · {theme.dossiers.length} dossiês · {theme.articleCount} artigos publicados</p>
            {theme.updatedSourceCount > 0 ? <strong className={styles.updatedNotice}>{theme.updatedSourceCount} fontes atualizadas</strong> : null}
            {theme.dossiers.length > 0 ? <details><summary>Ver Dossiês</summary>
              {theme.dossiers.map((card) => <MesaDossierCardView key={card.id} card={card} fixtureMode={fixtureMode} />)}
            </details> : null}
          </article>
        </li>),
        ...(status !== "archived" ? organization.unlinkedDossiers.map((card) => <li key={`${card.kind}:${card.id}`} className={styles.organizationItem}>
          <span className={styles.unlinkedLabel}>Dossiê sem Tema · memória preservada</span>
          <MesaDossierCardView card={card} themes={organization.themes} fixtureMode={fixtureMode} />
        </li>) : []),
      ]} />
  </section>;
}
