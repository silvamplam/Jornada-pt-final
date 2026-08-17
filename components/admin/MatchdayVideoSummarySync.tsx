"use client";

import { useCallback, useEffect, useState } from "react";

import type { MatchVideoSummaryState } from "@/lib/match-video-summary-types";

type ApiResponse = {
  ok?: boolean;
  state?: MatchVideoSummaryState;
  code?: string;
  message?: string;
};

type Action = "sync" | "confirm" | "reject";

const styles = `
  .video-summary-sync {
    display: grid;
    gap: 9px;
    margin: 14px 0 12px;
    padding: 10px;
    border: 1px solid #d8e0e9;
    border-radius: 7px;
    background: #f8fafc;
  }
  .video-summary-sync-head {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .video-summary-sync-title {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .video-summary-sync-title strong { font-size: 13px; }
  .video-summary-sync-title span { color: #607086; font-size: 11px; font-weight: 700; }
  .video-summary-sync-button {
    min-height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
    background: #e5252a;
    color: #fff;
    font: inherit;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
    text-transform: uppercase;
  }
  .video-summary-sync-button.secondary {
    border: 1px solid #cbd5df;
    background: #fff;
    color: #10151b;
    text-transform: none;
  }
  .video-summary-sync-button:disabled { opacity: .55; cursor: default; }
  .video-summary-sync-message {
    margin: 0;
    padding: 6px 8px;
    border-radius: 5px;
    background: #eef6ff;
    color: #1e3a8a;
    font-size: 11px;
    font-weight: 700;
  }
  .video-summary-sync-message.error { background: #fff1f2; color: #9f1239; }
  .video-summary-sync-rows { display: grid; gap: 4px; }
  .video-summary-sync-row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(110px, auto) auto;
    gap: 8px;
    align-items: center;
    min-height: 34px;
    padding: 5px 7px;
    border: 1px solid #e3e8ee;
    border-radius: 5px;
    background: #fff;
  }
  .video-summary-sync-row > strong { min-width: 0; font-size: 11px; overflow-wrap: anywhere; }
  .video-summary-sync-state { color: #526174; font-size: 10px; font-weight: 900; text-transform: uppercase; }
  .video-summary-sync-actions { display: flex; gap: 5px; justify-content: flex-end; flex-wrap: wrap; }
  .video-summary-sync-actions a {
    display: inline-flex;
    min-height: 26px;
    align-items: center;
    padding: 0 7px;
    border: 1px solid #cbd5df;
    border-radius: 4px;
    color: #10151b;
    font-size: 10px;
    font-weight: 800;
    text-decoration: none;
  }
  .video-summary-sync-candidates {
    grid-column: 1 / -1;
    display: grid;
    gap: 4px;
    padding-top: 4px;
    border-top: 1px solid #eef2f6;
  }
  .video-summary-sync-candidate {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }
  .video-summary-sync-candidate-copy { display: grid; gap: 2px; min-width: 0; }
  .video-summary-sync-candidate-copy strong { font-size: 10px; overflow-wrap: anywhere; }
  .video-summary-sync-candidate-copy span { color: #64748b; font-size: 9px; }
  @media (max-width: 800px) {
    .video-summary-sync-row { grid-template-columns: 1fr; }
    .video-summary-sync-actions { justify-content: flex-start; }
    .video-summary-sync-candidate { grid-template-columns: 1fr; }
  }
`;

function statusLabel(status: MatchVideoSummaryState["rows"][number]["status"]) {
  if (status === "associated") return "Resumo associado";
  if (status === "candidate") return "Candidato encontrado";
  if (status === "waiting") return "Jogo por terminar";
  return "Por encontrar";
}

export default function MatchdayVideoSummarySync({ matchdayId }: { matchdayId: string }) {
  const [state, setState] = useState<MatchVideoSummaryState | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const endpoint = `/api/admin/editorial/jornada/${encodeURIComponent(matchdayId)}/video-summaries`;

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.ok || !result.state) {
        setError(result.message ?? "Não foi possível ler o estado dos resumos.");
        return;
      }
      setState(result.state);
      setError("");
    } catch {
      setError("Não foi possível contactar a sincronização dos resumos.");
    }
  }, [endpoint]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function runAction(action: Action, candidateId?: string) {
    const key = candidateId ? `${action}:${candidateId}` : action;
    if (busyKey) return;
    setBusyKey(key);
    setMessage(action === "sync" ? "A procurar os resumos nas fontes autorizadas…" : "A atualizar o candidato…");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, candidateId }),
      });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.ok || !result.state) {
        setError(result.message ?? "Não foi possível concluir a operação.");
        setMessage("");
        return;
      }
      setState(result.state);
      setMessage(result.state.message ?? (action === "sync" ? "Sincronização concluída." : "Estado atualizado."));
      if (action === "confirm") window.location.reload();
      if (action === "sync" && result.state.associatedCount > (state?.associatedCount ?? 0)) window.location.reload();
    } catch {
      setError("Não foi possível contactar a sincronização dos resumos.");
      setMessage("");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="video-summary-sync" aria-label="Recolha automática dos resumos dos jogos">
      <style>{styles}</style>
      <div className="video-summary-sync-head">
        <div className="video-summary-sync-title">
          <strong>Resumos dos jogos</strong>
          {state ? (
            <span>
              {state.totalGames} jogos · {state.associatedCount} associados · {state.candidateCount} por confirmar · {state.missingCount} por encontrar
              {state.waitingCount > 0 ? ` · ${state.waitingCount} por terminar` : ""}
            </span>
          ) : <span>A carregar estado…</span>}
        </div>
        <button
          className="video-summary-sync-button"
          disabled={busyKey !== null}
          onClick={() => runAction("sync")}
          type="button"
        >
          {busyKey === "sync" ? "A procurar…" : "Procurar resumos da jornada"}
        </button>
      </div>

      {message ? <p className="video-summary-sync-message">{message}</p> : null}
      {error ? <p className="video-summary-sync-message error">{error}</p> : null}

      {state ? (
        <div className="video-summary-sync-rows">
          {state.rows.map((row) => (
            <article className="video-summary-sync-row" key={row.matchId}>
              <strong>{row.label}</strong>
              <span className="video-summary-sync-state">{statusLabel(row.status)}</span>
              <div className="video-summary-sync-actions">
                {row.videoUrl ? (
                  <a href={row.videoUrl} rel="noopener noreferrer" target="_blank">Ver</a>
                ) : null}
                {row.status === "missing" ? (
                  <button
                    className="video-summary-sync-button secondary"
                    disabled={busyKey !== null}
                    onClick={() => runAction("sync")}
                    type="button"
                  >
                    Procurar novamente
                  </button>
                ) : null}
              </div>

              {row.candidates.length > 0 ? (
                <div className="video-summary-sync-candidates">
                  {row.candidates.map((candidate) => (
                    <div className="video-summary-sync-candidate" key={candidate.id}>
                      <div className="video-summary-sync-candidate-copy">
                        <strong>{candidate.title}</strong>
                        <span>
                          {[candidate.channelTitle, candidate.duration, candidate.confidence ? `${candidate.confidence}%` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <div className="video-summary-sync-actions">
                        <a href={candidate.videoUrl} rel="noopener noreferrer" target="_blank">Ver</a>
                        <button
                          className="video-summary-sync-button secondary"
                          disabled={busyKey !== null}
                          onClick={() => runAction("confirm", candidate.id)}
                          type="button"
                        >
                          Confirmar
                        </button>
                        <button
                          className="video-summary-sync-button secondary"
                          disabled={busyKey !== null}
                          onClick={() => runAction("reject", candidate.id)}
                          type="button"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
