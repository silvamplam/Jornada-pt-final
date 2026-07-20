"use client";

import { useRef, useState } from "react";
import {
  buildTeamSafeDeletionApplyRequest,
  canApplyTeamSafeDeletion,
  isTeamSafeDeletionApiError,
  isTeamSafeDeletionApiSuccess,
  type TeamSafeDeletionRpcResult,
} from "@/lib/team-safe-deletion-policy";
import styles from "./team-safe-deletion.module.css";

type TeamSafeDeletionProps = {
  teamId: string;
  teamName: string;
  disabled: boolean;
  onDeleted: (teamId: string, teamName: string) => void;
};

type RequestState = "preview" | "apply" | null;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function TeamSafeDeletion({
  teamId,
  teamName,
  disabled,
  onDeleted,
}: TeamSafeDeletionProps) {
  const [open, setOpen] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>(null);
  const [preview, setPreview] = useState<TeamSafeDeletionRpcResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lockRef = useRef(false);

  const endpoint = `/api/admin/teams/${encodeURIComponent(teamId)}/safe-deletion`;

  async function sendRequest(body: unknown): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.redirected && new URL(response.url).pathname === "/admin/login") {
      window.location.assign(response.url);
      return null;
    }

    const payload = await readJson(response);
    if (!response.ok) {
      if (isTeamSafeDeletionApiError(payload)) {
        if (payload.requiresNewPreview) {
          setPreview(null);
          setConfirmation("");
        }
        throw new Error(payload.message);
      }
      throw new Error("Não foi possível concluir a operação de remoção segura.");
    }
    return payload;
  }

  async function requestPreview() {
    if (lockRef.current) return;
    lockRef.current = true;
    setRequestState("preview");
    setPreview(null);
    setConfirmation("");
    setError(null);
    try {
      const payload = await sendRequest({ operation: "preview" });
      if (!isTeamSafeDeletionApiSuccess(payload) || payload.operation !== "preview") {
        throw new Error("O servidor devolveu uma análise de dependências inválida.");
      }
      setPreview(payload.result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível analisar as dependências do clube.",
      );
    } finally {
      setRequestState(null);
      lockRef.current = false;
    }
  }

  async function openDialog() {
    setOpen(true);
    await requestPreview();
  }

  async function applyDeletion() {
    if (!preview || !canApplyTeamSafeDeletion(preview, confirmation) || lockRef.current) return;
    lockRef.current = true;
    setRequestState("apply");
    setError(null);
    try {
      const payload = await sendRequest(buildTeamSafeDeletionApplyRequest(preview));
      if (
        !isTeamSafeDeletionApiSuccess(payload) ||
        payload.operation !== "apply" ||
        !payload.result.applied
      ) {
        throw new Error("O servidor não confirmou a remoção integral do clube.");
      }
      setOpen(false);
      setPreview(null);
      setConfirmation("");
      onDeleted(teamId, payload.result.name);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível remover o clube.",
      );
    } finally {
      setRequestState(null);
      lockRef.current = false;
    }
  }

  function closeDialog() {
    if (requestState) return;
    setOpen(false);
    setPreview(null);
    setConfirmation("");
    setError(null);
  }

  const busy = requestState !== null;
  const blockingDependencies =
    preview?.dependencies.filter((dependency) => dependency.blocking && dependency.count > 0) ?? [];
  const aliases = preview ? [...preview.active_aliases, ...preview.inactive_aliases] : [];

  return (
    <div className={styles.root}>
      <button disabled={disabled || busy} onClick={openDialog} type="button">
        Remover clube
      </button>

      {open ? (
        <div aria-labelledby={`safe-deletion-title-${teamId}`} aria-modal="true" className={styles.backdrop} role="dialog">
          <section className={styles.dialog}>
            <header className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Remoção segura</p>
                <h3 id={`safe-deletion-title-${teamId}`}>{teamName}</h3>
              </div>
              <button aria-label="Fechar" disabled={busy} onClick={closeDialog} type="button">
                Fechar
              </button>
            </header>

            <div aria-live="polite" className={styles.content}>
              {requestState === "preview" ? <p>A analisar dependências do clube…</p> : null}
              {error ? <p className={styles.error}>{error}</p> : null}

              {!preview && requestState !== "preview" ? (
                <button disabled={busy} onClick={requestPreview} type="button">
                  Atualizar análise
                </button>
              ) : null}

              {preview?.status === "removable" ? (
                <div className={styles.notice}>
                  <strong>O clube pode ser removido.</strong>
                  <p>Não existem dependências bloqueadoras. O histórico de auditoria será preservado.</p>
                </div>
              ) : null}

              {preview?.status === "removable_with_aliases" ? (
                <div className={styles.notice}>
                  <strong>O clube e os aliases associados podem ser removidos.</strong>
                  <p>
                    Serão eliminados {preview.alias_count} aliases. As auditorias de aliases e nomes
                    públicos permanecem preservadas.
                  </p>
                  {aliases.length > 0 ? (
                    <ul className={styles.aliasList}>
                      {aliases.map((alias) => (
                        <li key={alias.id}>
                          {alias.alias} — {alias.status === "active" ? "ativo" : "inativo"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {preview?.status === "blocked" ? (
                <div className={styles.blocked}>
                  <strong>O clube não pode ser removido porque possui dependências.</strong>
                  <ul className={styles.dependencyList}>
                    {blockingDependencies.map((dependency) => (
                      <li key={dependency.key}>
                        <span>{dependency.reason}</span>
                        <strong>{dependency.count}</strong>
                        <small>
                          {dependency.table}.{dependency.column}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview && preview.status !== "blocked" && preview.proposed_action !== "none" ? (
                <div className={styles.confirmation}>
                  <p>
                    Esta operação é irreversível. Escreva <strong>{preview.name}</strong> para confirmar
                    a eliminação {preview.alias_count > 0 ? "do clube e dos aliases" : "do clube"}.
                  </p>
                  <label htmlFor={`safe-deletion-confirmation-${teamId}`}>Nome canónico do clube</label>
                  <input
                    autoComplete="off"
                    disabled={busy}
                    id={`safe-deletion-confirmation-${teamId}`}
                    onChange={(event) => setConfirmation(event.target.value)}
                    value={confirmation}
                  />
                  <button
                    className={styles.dangerButton}
                    disabled={busy || !canApplyTeamSafeDeletion(preview, confirmation)}
                    onClick={applyDeletion}
                    type="button"
                  >
                    {requestState === "apply"
                      ? "A remover…"
                      : preview.proposed_action === "delete_team_and_aliases"
                        ? "REMOVER CLUBE E ALIASES"
                        : "REMOVER CLUBE"}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
