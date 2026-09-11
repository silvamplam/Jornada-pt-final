"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compareSourceParagraphs } from "@/lib/redacao-automatica/newsroom-source-comparison";
import styles from "./mesa.module.css";

const route = "/api/admin/editorial/redacao-automatica/mesa/organizacao";
type Comparison = { before: { id: string; body: unknown; extracted_at: string }; after: { id: string; body: unknown; extracted_at: string } };
const date = (value: string) => Number.isNaN(Date.parse(value)) ? value
  : new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));

export function MesaSourceChanges({ sourceId, beforeId, afterId, title, themeId, detectedAt }: Readonly<{
  sourceId: string; beforeId: string; afterId: string; title: string; themeId?: string; detectedAt?: string | null;
}>) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    dialog.current?.showModal(); setBusy(true); setMessage(""); setComparison(null);
    try {
      const params = new URLSearchParams({ source: sourceId, before: beforeId, after: afterId });
      const response = await fetch(`${route}?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Comparação indisponível.");
      setComparison(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Comparação indisponível."); }
    finally { setBusy(false); }
  }
  async function acknowledge() {
    if (!themeId || !comparison) return;
    setBusy(true);
    try {
      const response = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge_source", themeId, sourceId, snapshotId: comparison.after.id }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Não foi possível guardar a leitura.");
      dialog.current?.close(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Leitura não guardada."); }
    finally { setBusy(false); }
  }
  const diff = comparison ? compareSourceParagraphs(comparison.before.body, comparison.after.body) : null;
  return <>
    <button type="button" className={styles.sourceUpdateAction} onClick={() => void open()}
      title={detectedAt ? `Alteração detetada: ${date(detectedAt)}` : "Comparar com a versão guardada"}>Fonte atualizada · Ver alterações</button>
    <dialog ref={dialog} className={styles.comparisonDialog} aria-label={`Alterações da fonte: ${title}`}>
      <header><h2>{title}</h2><button type="button" onClick={() => dialog.current?.close()}>Fechar</button></header>
      <p>Comparação das cópias recolhidas. Isto não altera uma produção nem publica artigos.</p>
      {busy ? <p role="status">A carregar…</p> : null}
      {message ? <p role="alert">{message}</p> : null}
      {comparison && diff ? <>
        {!diff.exactAlignment ? <p>Texto extenso: os destaques comparam presença de parágrafos, não a sua ordem.</p> : null}
        <div className={styles.comparisonColumns}>
          <section><h3>Versão de referência · {date(comparison.before.extracted_at)}</h3>
            {diff.before.map((paragraph, index) => <p key={index} data-change={paragraph.changed ? "removed" : undefined}>{paragraph.text}</p>)}
          </section>
          <section><h3>Versão recolhida · {date(comparison.after.extracted_at)}</h3>
            {diff.after.map((paragraph, index) => <p key={index} data-change={paragraph.changed ? "added" : undefined}>{paragraph.text}</p>)}
          </section>
        </div>
        {themeId ? <button type="button" disabled={busy} onClick={() => void acknowledge()}>Marcar esta alteração como vista no Tema</button> : null}
      </> : null}
    </dialog>
  </>;
}

export function MesaRemoveThemeSource({ themeId, sourceId }: Readonly<{ themeId: string; sourceId: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_source", themeId, sourceId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Não foi possível retirar a fonte.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível retirar a fonte."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" disabled={busy} onClick={() => void remove()}>Retirar deste Tema</button>
    {message ? <span role="alert">{message}</span> : null}</span>;
}
