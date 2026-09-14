"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { ThemeContinuityReadModel } from "@/lib/redacao-automatica/newsroom-theme-continuity-contract";
import styles from "../../mesa.module.css";

type LoadResponse =
  | Readonly<{ ok: true; continuity: ThemeContinuityReadModel }>
  | Readonly<{ ok: false; message?: string }>;

type PrepareResponse =
  | Readonly<{ ok: true; workspaceUrl: string }>
  | Readonly<{ ok: false; message?: string }>;

export function ThemeContinuityClient({
  themeId,
  disabled,
}: Readonly<{ themeId: string; disabled: boolean }>) {
  const router = useRouter();
  const preparationKey = useRef<string | null>(null);
  const [continuity, setContinuity] = useState<ThemeContinuityReadModel | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function openContinuity() {
    if (continuity) {
      setExpanded((current) => !current);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/editorial/redacao-automatica/mesa/tema-continuity?themeId=${encodeURIComponent(themeId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as LoadResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.ok ? "" : payload.message);
      setContinuity(payload.continuity);
      setNewArticleCount(Math.min(1, Math.max(0, 30 - payload.continuity.publishedArticleCount)));
      preparationKey.current = window.crypto.randomUUID();
      setExpanded(true);
    } catch (error) {
      setMessage(error instanceof Error && error.message
        ? error.message
        : "Não foi possível ler a continuidade deste Tema.");
    } finally {
      setLoading(false);
    }
  }

  async function prepare() {
    if (!continuity || preparing) return;
    const key = preparationKey.current ?? window.crypto.randomUUID();
    preparationKey.current = key;
    setPreparing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/editorial/redacao-automatica/mesa/tema-continuity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preparationKey: key,
          themeId,
          newArticleCount,
          authorityFingerprint: continuity.authorityFingerprint,
        }),
      });
      const payload = await response.json() as PrepareResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.ok ? "" : payload.message);
      router.push(payload.workspaceUrl);
    } catch (error) {
      setMessage(error instanceof Error && error.message
        ? error.message
        : "Não foi possível preparar esta Produção.");
    } finally {
      setPreparing(false);
    }
  }

  const maxNew = continuity ? Math.max(0, 30 - continuity.publishedArticleCount) : 0;
  const blocked = Boolean(continuity && (
    continuity.sourceCount < 1
    || continuity.sourceCount > 20
    || continuity.publishedArticleCount > 30
    || continuity.publishedArticleCount + newArticleCount < 1
  ));

  return <section className={styles.continuityPanel} aria-labelledby="theme-continuity-title">
    <div className={styles.continuityLead}>
      <div>
        <p className={styles.eyebrow}>Tema vivo</p>
        <h2 id="theme-continuity-title">Continuidade editorial</h2>
        <p>Congela a captura atual, revê todos os artigos publicados e acrescenta apenas os novos que escolheres.</p>
      </div>
      <button type="button" onClick={openContinuity} disabled={disabled || loading || preparing}>
        {loading ? "A ler Tema…" : expanded ? "Fechar preparação" : "Voltar a levar à Produção"}
      </button>
    </div>

    {message ? <p className={styles.continuityError} role="alert">{message}</p> : null}
    {expanded && continuity ? <div className={styles.continuityBody}>
      <div className={styles.continuityMetrics}>
        <span><strong>{continuity.sources.filter((source) => source.change === "NEW_SOURCE").length}</strong> novas</span>
        <span><strong>{continuity.sources.filter((source) => source.change === "UPDATED_SOURCE").length}</strong> atualizadas</span>
        <span><strong>{continuity.sources.filter((source) => source.change === "UNCHANGED_SOURCE").length}</strong> inalteradas</span>
        <span><strong>{continuity.publishedArticleCount}</strong> artigos a rever</span>
      </div>

      <div className={styles.continuityColumns}>
        <section>
          <h3>Sources desta captura</h3>
          <ol>{continuity.sources.map((source) => <li key={source.newsroomArticleId}>
            <span>{source.title}</span>
            <small>{source.change === "NEW_SOURCE" ? "Nova" : source.change === "UPDATED_SOURCE" ? "Atualizada" : "Inalterada"}</small>
          </li>)}</ol>
        </section>
        <section>
          <h3>Artigos publicados a rever</h3>
          {continuity.publishedArticles.length
            ? <ol>{continuity.publishedArticles.map((article, index) => <li key={article.editorialArticleId}>
                <span>EXISTING_{String(index + 1).padStart(2, "0")} · {article.title}</span>
                <small>UPDATE ou SEM_ALTERAÇÃO</small>
              </li>)}</ol>
            : <p>Ainda não há artigos publicados deste Tema.</p>}
        </section>
      </div>

      <div className={styles.continuityPrepare}>
        <label>Novos artigos
          <select
            value={newArticleCount}
            onChange={(event) => setNewArticleCount(Number(event.target.value))}
            disabled={preparing || maxNew === 0}
          >
            {Array.from({ length: maxNew + 1 }, (_, value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <p>{continuity.publishedArticleCount} revisões + {newArticleCount} NEW = {continuity.publishedArticleCount + newArticleCount} outputs</p>
        {continuity.sourceCount > 20
          ? <p className={styles.continuityError}>O Tema tem {continuity.sourceCount} Sources; o limite é 20. Nada será truncado.</p>
          : null}
        <button type="button" onClick={prepare} disabled={blocked || preparing}>
          {preparing ? "A preparar…" : "Criar nova Produção"}
        </button>
      </div>
    </div> : null}
  </section>;
}
