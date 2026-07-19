"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isTeamAliasBatchErrorResponse,
  isTeamAliasBatchSuccessResponse,
  TEAM_ALIAS_BATCH_MAX_BODY_BYTES,
  TEAM_ALIAS_BATCH_MAX_ROWS,
  type TeamAliasBatchAction,
  type TeamAliasBatchErrorResponse,
  type TeamAliasBatchInputRow,
  type TeamAliasBatchResultRow,
  type TeamAliasBatchSuccessResponse
} from "@/lib/team-alias-batch-policy";
import styles from "./team-aliases.module.css";

export type TeamAliasBatchImportProps = {
  countryId: string;
  countryName: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onApplied: () => Promise<void>;
};

type PreparedBatch = {
  rows: TeamAliasBatchInputRow[];
  usefulLineCount: number;
  structuralErrors: string[];
};

type PreviewSnapshot = {
  countryId: string;
  rawText: string;
};

const INVALID_ROW_MESSAGES: Record<string, string> = {
  invalid_row_not_object: "A linha não tem uma estrutura válida.",
  invalid_row_fields: "A linha contém campos inválidos.",
  invalid_line_number: "O número da linha é inválido.",
  duplicate_line_number: "O número da linha está repetido.",
  canonical_club_required: "O clube canónico é obrigatório.",
  canonical_club_normalized_empty: "O clube canónico não contém uma identidade utilizável.",
  alias_required: "O alias é obrigatório.",
  alias_too_long: "O alias excede 160 caracteres.",
  normalized_alias_empty: "O alias não contém uma identidade utilizável."
};

class BatchRequestError extends Error {
  readonly code: string;
  readonly preview?: TeamAliasBatchSuccessResponse;

  constructor(code: string, message: string, preview?: TeamAliasBatchSuccessResponse) {
    super(message);
    this.name = "BatchRequestError";
    this.code = code;
    this.preview = preview;
  }
}

function prepareBatch(rawText: string): PreparedBatch {
  const rows: TeamAliasBatchInputRow[] = [];
  const structuralErrors: string[] = [];
  let usefulLineCount = 0;

  rawText.split("\n").forEach((rawLine, index) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const containsTab = line.includes("\t");
    if (!containsTab && line.trim().length === 0) {
      return;
    }

    usefulLineCount += 1;
    const columns = line.split("\t");
    if (columns.length !== 2) {
      structuralErrors.push(
        `Linha ${index + 1}: use exatamente duas colunas separadas por um único TAB.`
      );
      return;
    }

    rows.push({
      lineNumber: index + 1,
      canonicalClub: columns[0],
      alias: columns[1]
    });
  });

  return { rows, usefulLineCount, structuralErrors };
}

function requestBodyBytes(
  action: TeamAliasBatchAction,
  countryId: string,
  rows: TeamAliasBatchInputRow[]
) {
  return new TextEncoder().encode(JSON.stringify({ action, countryId, rows })).byteLength;
}

function isLoginRedirect(response: Response) {
  if (!response.redirected) {
    return false;
  }

  try {
    return new URL(response.url).pathname.startsWith("/admin/login");
  } catch {
    return false;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 401 || response.status === 403 || isLoginRedirect(response)) {
    throw new BatchRequestError(
      "authentication-required",
      "A sessão administrativa terminou. Inicia sessão novamente para continuar."
    );
  }

  try {
    return await response.json();
  } catch {
    throw new BatchRequestError(
      "invalid-api-response",
      "A resposta do servidor não pôde ser validada."
    );
  }
}

async function postBatch(
  action: TeamAliasBatchAction,
  countryId: string,
  rows: TeamAliasBatchInputRow[]
) {
  const response = await fetch("/api/admin/team-aliases/batch", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, countryId, rows })
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    if (isTeamAliasBatchErrorResponse(payload)) {
      throw new BatchRequestError(payload.code, payload.message, payload.preview);
    }

    throw new BatchRequestError(
      `http-${response.status}`,
      "Não foi possível processar o lote de aliases."
    );
  }

  if (!isTeamAliasBatchSuccessResponse(payload) || payload.operation !== action) {
    throw new BatchRequestError(
      "invalid-api-response",
      "A resposta do servidor não pôde ser validada."
    );
  }

  return payload;
}

function requestErrorMessage(error: unknown) {
  if (error instanceof BatchRequestError) {
    return error.message;
  }

  return "Não foi possível comunicar com o servidor. Tenta novamente.";
}

function resultLabel(row: TeamAliasBatchResultRow) {
  if (row.resultStatus === "create" && row.changed && row.resultCode === "created") {
    return "Criada";
  }

  if (row.resultStatus === "create" && !row.changed && row.resultCode === "create_ready") {
    return "Pronta a criar";
  }

  switch (row.resultStatus) {
    case "existing_active_same_team":
      return "Já ativa no mesmo clube — sem alteração";
    case "existing_inactive_same_team":
      return "Alias inativo — requer reativação manual";
    case "unknown_club":
      return "Clube não encontrado";
    case "ambiguous_club":
      return "Clube ambíguo";
    case "duplicate_alias_in_batch":
      return "Alias duplicado no lote";
    case "alias_conflict_other_team":
      return "Alias associado a outro clube";
    case "canonical_identity_conflict_other_team":
      return "Coincide com a identidade de outro clube";
    case "redundant_same_team_identity":
      return "Já corresponde à identidade do próprio clube";
    case "invalid_row":
      return "Linha inválida";
    default:
      return "Resultado não reconhecido";
  }
}

function invalidRowDescription(row: TeamAliasBatchResultRow) {
  if (row.resultStatus !== "invalid_row") {
    return null;
  }

  return INVALID_ROW_MESSAGES[row.resultCode] ?? `Código técnico: ${row.resultCode}`;
}

function resultClassName(row: TeamAliasBatchResultRow) {
  if (row.blocking) {
    return styles.batchResultBlocking;
  }

  if (row.changed) {
    return styles.batchResultCreated;
  }

  if (row.resultStatus === "existing_active_same_team") {
    return styles.batchResultExisting;
  }

  return styles.batchResultReady;
}

export default function TeamAliasBatchImport({
  countryId,
  countryName,
  disabled,
  onBusyChange,
  onApplied
}: TeamAliasBatchImportProps) {
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<TeamAliasBatchSuccessResponse | null>(null);
  const [appliedResult, setAppliedResult] = useState<TeamAliasBatchSuccessResponse | null>(null);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [loadingAction, setLoadingAction] = useState<TeamAliasBatchAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestLocked = useRef(false);

  const prepared = useMemo(() => prepareBatch(rawText), [rawText]);
  const bodyBytes = useMemo(
    () => requestBodyBytes("preview", countryId, prepared.rows),
    [countryId, prepared.rows]
  );
  const tooManyRows = prepared.usefulLineCount > TEAM_ALIAS_BATCH_MAX_ROWS;
  const bodyTooLarge = bodyBytes > TEAM_ALIAS_BATCH_MAX_BODY_BYTES;
  const currentResult = appliedResult ?? preview;
  const readyCount = currentResult
    ? currentResult.rows.filter(
        (row) => row.resultStatus === "create" && !row.changed && row.resultCode === "create_ready"
      ).length
    : 0;
  const snapshotIsCurrent = Boolean(
    snapshot && snapshot.countryId === countryId && snapshot.rawText === rawText
  );
  const hasBlockingRows = Boolean(preview?.rows.some((row) => row.blocking));
  const canPreview =
    Boolean(countryId) &&
    prepared.usefulLineCount > 0 &&
    prepared.structuralErrors.length === 0 &&
    !tooManyRows &&
    !bodyTooLarge &&
    !disabled &&
    loadingAction === null;
  const canApply = Boolean(
    preview &&
      !appliedResult &&
      preview.summary.canApply &&
      preview.summary.blockingCount === 0 &&
      !hasBlockingRows &&
      preview.summary.createCount > 0 &&
      !preview.summary.noop &&
      snapshotIsCurrent &&
      !disabled &&
      loadingAction === null
  );

  useEffect(() => {
    setPreview(null);
    setAppliedResult(null);
    setSnapshot(null);
    setError(null);
    setNotice(null);
  }, [countryId]);

  function changeRawText(nextRawText: string) {
    setRawText(nextRawText);
    setPreview(null);
    setAppliedResult(null);
    setSnapshot(null);
    setError(null);
    setNotice(null);
  }

  async function runOperation(action: TeamAliasBatchAction) {
    if (requestLocked.current) {
      return null;
    }

    requestLocked.current = true;
    setLoadingAction(action);
    setError(null);
    setNotice(null);
    onBusyChange(true);

    try {
      return await postBatch(action, countryId, prepared.rows);
    } finally {
      requestLocked.current = false;
      setLoadingAction(null);
      onBusyChange(false);
    }
  }

  async function requestPreview() {
    if (!canPreview) {
      return;
    }

    try {
      const result = await runOperation("preview");
      if (!result) {
        return;
      }

      setPreview(result);
      setAppliedResult(null);
      setSnapshot({ countryId, rawText });
      setNotice(
        result.summary.blockingCount > 0 || result.rows.some((row) => row.blocking)
          ? "Preview concluído com bloqueios. Corrige o lote e pré-visualiza novamente."
          : result.summary.noop
            ? "Preview concluído. Todos os aliases já estão ativos no clube correto."
            : "Preview concluído. Nenhum dado foi gravado."
      );
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    }
  }

  async function applyBatch() {
    if (!canApply || !preview) {
      return;
    }

    const confirmed = window.confirm(
      `Aplicar o lote de aliases em ${countryName || "país selecionado"}?\n\n` +
        `${preview.summary.createCount} aliases serão criados.\n` +
        `${preview.summary.existingActiveCount} já estão ativos e não serão alterados.`
    );
    if (!confirmed) {
      return;
    }

    try {
      const result = await runOperation("apply");
      if (!result) {
        return;
      }

      setAppliedResult(result);
      setNotice(
        `${result.summary.createdCount} aliases criados. A listagem atual foi recarregada.`
      );
      await onApplied();
    } catch (requestError) {
      if (requestError instanceof BatchRequestError && requestError.preview) {
        setPreview(requestError.preview);
        setAppliedResult(null);
        setSnapshot({ countryId, rawText });
        setError(requestError.message);
        return;
      }

      setError(requestErrorMessage(requestError));
    }
  }

  return (
    <section
      className={styles.panel}
      id="importar-aliases"
      aria-labelledby="batch-import-title"
      aria-busy={loadingAction !== null}
    >
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Importação em lote</p>
          <h2 id="batch-import-title">Importar aliases</h2>
        </div>
        <span>O preview é obrigatório e não grava dados.</span>
      </header>

      <div className={styles.batchBody}>
        <div className={styles.batchHelp} id="batch-import-help">
          <p>
            Seleciona primeiro o país. Cola duas colunas: clube canónico na primeira e alias na segunda,
            separadas por <strong>TAB</strong>. Máximo de {TEAM_ALIAS_BATCH_MAX_ROWS} linhas.
          </p>
          <code className={styles.batchExample}>
            {"Sporting Clube de Portugal\tSp. Portugal\nSport Lisboa e Benfica\tBenfica Lisboa"}
          </code>
          <p>
            País atual: <strong>{countryName || "nenhum país selecionado"}</strong>.
          </p>
        </div>

        <label className={styles.batchField} htmlFor="team-alias-batch-input">
          <span>Clube canónico e alias, separados por TAB</span>
          <textarea
            aria-describedby="batch-import-help batch-import-counter"
            disabled={disabled || loadingAction !== null}
            id="team-alias-batch-input"
            onChange={(event) => changeRawText(event.target.value)}
            rows={10}
            spellCheck={false}
            value={rawText}
          />
        </label>

        <div className={styles.batchCounter} id="batch-import-counter">
          <span>
            {prepared.usefulLineCount} de {TEAM_ALIAS_BATCH_MAX_ROWS} linhas úteis
          </span>
          <span>
            {bodyBytes} de {TEAM_ALIAS_BATCH_MAX_BODY_BYTES} bytes no pedido
          </span>
        </div>

        {prepared.structuralErrors.length > 0 ? (
          <div className={`${styles.inlineMessage} ${styles.error}`} role="alert">
            <strong>Corrige a estrutura antes do preview.</strong>
            <ul className={styles.batchErrorList}>
              {prepared.structuralErrors.map((structuralError) => (
                <li key={structuralError}>{structuralError}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {tooManyRows ? (
          <div className={`${styles.inlineMessage} ${styles.error}`} role="alert">
            O lote excede o máximo de {TEAM_ALIAS_BATCH_MAX_ROWS} linhas úteis.
          </div>
        ) : null}
        {bodyTooLarge ? (
          <div className={`${styles.inlineMessage} ${styles.error}`} role="alert">
            O pedido excede o limite de {TEAM_ALIAS_BATCH_MAX_BODY_BYTES} bytes.
          </div>
        ) : null}

        <div className={styles.batchActions}>
          <button
            className={styles.secondaryButton}
            disabled={!canPreview}
            onClick={() => void requestPreview()}
            type="button"
          >
            {loadingAction === "preview" ? "A pré-visualizar…" : "Pré-visualizar"}
          </button>
          <button
            className={styles.primaryButton}
            disabled={!canApply}
            onClick={() => void applyBatch()}
            type="button"
          >
            {loadingAction === "apply" ? "A aplicar…" : "Aplicar lote"}
          </button>
        </div>

        <div className={styles.batchMessages} aria-live="polite">
          {error ? <div className={`${styles.inlineMessage} ${styles.error}`} role="alert">{error}</div> : null}
          {notice ? <div className={`${styles.inlineMessage} ${styles.success}`} role="status">{notice}</div> : null}
        </div>
      </div>

      {currentResult ? (
        <div className={styles.batchResults}>
          <div className={styles.batchSummary} aria-label="Resumo do lote">
            <span><strong>{readyCount}</strong> prontas a criar</span>
            <span><strong>{currentResult.summary.existingActiveCount}</strong> já ativas</span>
            <span><strong>{currentResult.summary.blockingCount}</strong> bloqueantes</span>
            <span><strong>{currentResult.summary.createdCount}</strong> criadas</span>
          </div>

          <div className={styles.tableScroll}>
            <table className={`${styles.table} ${styles.batchTable}`}>
              <caption className={styles.visuallyHidden}>Resultado linha a linha da importação de aliases</caption>
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Clube canónico</th>
                  <th scope="col">Alias</th>
                  <th scope="col">Clube resolvido</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {currentResult.rows.map((row, index) => {
                  const detail = invalidRowDescription(row);
                  return (
                    <tr className={row.blocking ? styles.batchBlockingRow : undefined} key={`${row.lineNumber ?? "invalid"}-${index}`}>
                      <td>{row.lineNumber ?? "—"}</td>
                      <td>{row.canonicalClubInput || "—"}</td>
                      <td className={styles.aliasCell}>{row.aliasInput || "—"}</td>
                      <td>{row.resolvedTeamName || "—"}</td>
                      <td>
                        <span className={`${styles.batchResultBadge} ${resultClassName(row)}`}>
                          {resultLabel(row)}
                        </span>
                        {detail ? <small className={styles.batchResultDetail}>{detail}</small> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
