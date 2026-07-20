"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from "react";

import {
  isTeamBatchCreationApiErrorResponse,
  isTeamBatchCreationApiSuccessResponse,
  type TeamBatchCreationApiSuccessResponse
} from "@/lib/team-batch-creation-api";
import {
  parseTeamBatchCreationRequest,
  parseTeamBatchCreationText,
  TEAM_BATCH_CREATION_HEADER,
  TEAM_BATCH_CREATION_MAX_ROWS,
  TEAM_BATCH_CREATION_MAX_TEXT_BYTES,
  TeamBatchCreationPolicyError,
  type TeamBatchCreationInputRow,
  type TeamBatchCreationParseResult,
  type TeamBatchCreationStatus,
  type TeamBatchCreationSuggestions
} from "@/lib/team-batch-creation-policy";
import styles from "./team-batch-creation.module.css";

type CountryOption = {
  id: string;
  name: string;
  flagEmoji: string | null;
};

type TeamBatchCreationProps = {
  apiAvailable: boolean;
  countries: CountryOption[];
  initialError: string | null;
};

type EditableField = Exclude<keyof TeamBatchCreationInputRow, "lineNumber" | "aliases">;

const STATUS_LABELS: Record<TeamBatchCreationStatus, string> = {
  create: "Criar",
  existing: "Já existe",
  complete_existing: "Completar existente",
  probable: "Provável",
  ambiguous: "Ambíguo",
  conflict: "Conflito",
  invalid: "Inválido"
};

function errorMessage(error: unknown) {
  if (error instanceof TeamBatchCreationPolicyError) return error.message;
  return "Não foi possível validar o lote.";
}

function stableSnapshot(countryId: string, rows: readonly TeamBatchCreationInputRow[]) {
  return JSON.stringify({ countryId, rows });
}

function displayNullable(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function inputValue(value: string | null) {
  return value ?? "";
}

export default function TeamBatchCreation({
  apiAvailable,
  countries,
  initialError
}: TeamBatchCreationProps) {
  const [countryId, setCountryId] = useState("");
  const [rawText, setRawText] = useState("");
  const [localResult, setLocalResult] = useState<TeamBatchCreationParseResult | null>(null);
  const [rows, setRows] = useState<TeamBatchCreationInputRow[]>([]);
  const [suggestions, setSuggestions] = useState<Record<number, TeamBatchCreationSuggestions>>({});
  const [confirmedSuggestedSlugs, setConfirmedSuggestedSlugs] = useState<Set<number>>(new Set());
  const [serverPreview, setServerPreview] = useState<TeamBatchCreationApiSuccessResponse | null>(null);
  const [serverSnapshot, setServerSnapshot] = useState<string | null>(null);
  const [confirmedCompleteLines, setConfirmedCompleteLines] = useState<Set<number>>(new Set());
  const [appliedResult, setAppliedResult] = useState<TeamBatchCreationApiSuccessResponse | null>(null);
  const [message, setMessage] = useState<string | null>(initialError);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const issueFocusRef = useRef<HTMLDivElement>(null);

  const suggestedSlugLines = useMemo(
    () =>
      rows
        .filter((row) => suggestions[row.lineNumber]?.slug.suggested)
        .map((row) => row.lineNumber),
    [rows, suggestions]
  );
  const unconfirmedSuggestedSlugLines = suggestedSlugLines.filter(
    (lineNumber) => !confirmedSuggestedSlugs.has(lineNumber)
  );
  const currentSnapshot = stableSnapshot(countryId, rows);
  const previewChanged = serverSnapshot !== null && serverSnapshot !== currentSnapshot;
  const completeLines = serverPreview?.rows
    .filter((row) => row.result_status === "complete_existing")
    .map((row) => row.line_number) ?? [];
  const allCompleteLinesConfirmed = completeLines.every((lineNumber) =>
    confirmedCompleteLines.has(lineNumber)
  );
  const unresolvedBlockingCount = serverPreview
    ? serverPreview.summary.probableCount +
      serverPreview.summary.ambiguousCount +
      serverPreview.summary.conflictCount +
      serverPreview.summary.invalidCount
    : 0;
  const canRequestServerPreview =
    apiAvailable &&
    Boolean(countryId) &&
    Boolean(localResult?.summary.canSubmit) &&
    rows.length > 0 &&
    unconfirmedSuggestedSlugLines.length === 0 &&
    busy === null;
  const canApply =
    serverPreview !== null &&
    serverPreview.operation === "preview" &&
    serverPreview.fingerprint.length > 0 &&
    !previewChanged &&
    unresolvedBlockingCount === 0 &&
    allCompleteLinesConfirmed &&
    busy === null;

  function invalidateServerPreview() {
    setServerPreview(null);
    setServerSnapshot(null);
    setConfirmedCompleteLines(new Set());
    setAppliedResult(null);
  }

  function handleCountryChange(event: ChangeEvent<HTMLSelectElement>) {
    setCountryId(event.target.value);
    invalidateServerPreview();
    setMessage(null);
  }

  function previewLocally() {
    const parsed = parseTeamBatchCreationText(rawText);
    const nextSuggestions: Record<number, TeamBatchCreationSuggestions> = {};
    for (const line of parsed.lines) {
      if (line.ok) nextSuggestions[line.lineNumber] = line.suggestions;
    }
    setLocalResult(parsed);
    setRows(parsed.rows);
    setSuggestions(nextSuggestions);
    setConfirmedSuggestedSlugs(new Set());
    invalidateServerPreview();
    setMessage(
      parsed.summary.canSubmit
        ? "Pré-visualização local concluída. Reveja os dados e confirme as sugestões."
        : "Existem erros bloqueantes no texto. Corrija-os antes de continuar."
    );
    if (!parsed.summary.canSubmit) {
      window.requestAnimationFrame(() => issueFocusRef.current?.focus());
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setRawText(await file.text());
      setLocalResult(null);
      setRows([]);
      setSuggestions({});
      setConfirmedSuggestedSlugs(new Set());
      invalidateServerPreview();
      setMessage(`Ficheiro carregado: ${file.name}. Faça a pré-visualização local.`);
    } catch {
      setMessage("Não foi possível ler o ficheiro selecionado.");
    }
  }

  function changeField(lineNumber: number, field: EditableField, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.lineNumber === lineNumber
          ? {
              ...row,
              [field]: ["publicName", "code", "logoUrl", "primaryColor"].includes(field)
                ? value || null
                : value
            }
          : row
      )
    );
    if (field === "slug") {
      setConfirmedSuggestedSlugs((current) => new Set(current).add(lineNumber));
    }
    invalidateServerPreview();
    setMessage("O lote foi alterado. Volte a pré-visualizar na base de dados.");
  }

  function changeAliases(lineNumber: number, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.lineNumber === lineNumber
          ? {
              ...row,
              aliases: value
                .split("|")
                .map((alias) => alias.trim())
                .filter(Boolean)
            }
          : row
      )
    );
    invalidateServerPreview();
    setMessage("O lote foi alterado. Volte a pré-visualizar na base de dados.");
  }

  function confirmSuggestedSlug(lineNumber: number) {
    setConfirmedSuggestedSlugs((current) => new Set(current).add(lineNumber));
    setMessage("Slug sugerido confirmado explicitamente.");
  }

  function usePublicNameSuggestion(lineNumber: number) {
    const value = suggestions[lineNumber]?.publicName.value;
    if (!value) return;
    changeField(lineNumber, "publicName", value);
    setMessage("Sugestão de nome público aplicada para revisão.");
  }

  function usePublicNameAsAlias(lineNumber: number) {
    const value = suggestions[lineNumber]?.publicNameAsAlias;
    if (!value) return;
    setRows((current) =>
      current.map((row) =>
        row.lineNumber === lineNumber && !row.aliases.includes(value)
          ? { ...row, aliases: [...row.aliases, value] }
          : row
      )
    );
    invalidateServerPreview();
    setMessage("Sugestão adicionada aos aliases para revisão.");
  }

  async function postRequest(body: unknown) {
    const response = await fetch("/api/admin/teams/batch", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.redirected || response.url.includes("/admin/login")) {
      window.location.assign(response.url);
      return null;
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    if (response.ok && isTeamBatchCreationApiSuccessResponse(payload)) return payload;
    if (isTeamBatchCreationApiErrorResponse(payload)) {
      if (
        payload.code === "team-batch-creation-preview-stale" ||
        payload.code === "team-batch-creation-batch-blocked"
      ) {
        invalidateServerPreview();
      }
      throw new Error(payload.message);
    }
    throw new Error("A API devolveu uma resposta inesperada.");
  }

  async function previewOnServer() {
    setMessage(null);
    let request;
    try {
      request = parseTeamBatchCreationRequest({ action: "preview", countryId, rows });
    } catch (error) {
      setMessage(errorMessage(error));
      window.requestAnimationFrame(() => issueFocusRef.current?.focus());
      return;
    }

    setBusy("preview");
    try {
      const result = await postRequest(request);
      if (!result) return;
      setServerPreview(result);
      setServerSnapshot(stableSnapshot(request.countryId, request.rows));
      setConfirmedCompleteLines(new Set());
      setAppliedResult(null);
      setMessage("Pré-visualização da base de dados concluída.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na pré-visualização.");
      window.requestAnimationFrame(() => issueFocusRef.current?.focus());
    } finally {
      setBusy(null);
    }
  }

  function toggleCompleteLine(lineNumber: number) {
    setConfirmedCompleteLines((current) => {
      const next = new Set(current);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  async function applyBatch() {
    if (!serverPreview || !canApply) return;
    setBusy("apply");
    setMessage(null);
    try {
      const request = parseTeamBatchCreationRequest({
        action: "apply",
        countryId,
        rows,
        previewFingerprint: serverPreview.fingerprint,
        confirmedCompleteExistingLines: completeLines.filter((lineNumber) =>
          confirmedCompleteLines.has(lineNumber)
        )
      });
      const result = await postRequest(request);
      if (!result) return;
      setAppliedResult(result);
      setServerPreview(result);
      setMessage("Lote aplicado integralmente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao aplicar o lote.");
      window.requestAnimationFrame(() => issueFocusRef.current?.focus());
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p>Jornada.pt · Gestão de clubes</p>
          <h1>CRIAR CLUBES EM LOTE</h1>
          <span>
            Cria clubes canónicos na base global. A associação a competições e épocas continua na
            preparação de participantes.
          </span>
        </div>
        <nav aria-label="Navegação de clubes" className={styles.heroActions}>
          <a href="/admin/clubes">Voltar aos clubes</a>
          <a href="/admin/clubes/aliases">Gerir aliases</a>
        </nav>
      </header>

      <div
        aria-live="polite"
        className={message ? styles.message : styles.srOnly}
        ref={issueFocusRef}
        tabIndex={message ? -1 : undefined}
      >
        {message}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <p>Passo 1</p>
            <h2>Origem do lote</h2>
          </div>
          <span>{rawText ? new TextEncoder().encode(rawText).byteLength : 0} / {TEAM_BATCH_CREATION_MAX_TEXT_BYTES} bytes</span>
        </div>
        <div className={styles.countryField}>
          <label htmlFor="team-batch-country">País do lote</label>
          <select
            disabled={!apiAvailable || busy !== null}
            id="team-batch-country"
            onChange={handleCountryChange}
            required
            value={countryId}
          >
            <option value="">Selecionar país</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.flagEmoji ? `${country.flagEmoji} ` : ""}{country.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formatBox}>
          <strong>Formato</strong>
          <code>{TEAM_BATCH_CREATION_HEADER}</code>
          <span>Separe vários aliases com <b>|</b>. O cabeçalho é opcional.</span>
        </div>
        <label className={styles.textLabel} htmlFor="team-batch-text">Lista de clubes</label>
        <textarea
          className={styles.textarea}
          disabled={busy !== null}
          id="team-batch-text"
          onChange={(event) => {
            setRawText(event.target.value);
            setLocalResult(null);
            setRows([]);
            setSuggestions({});
            setConfirmedSuggestedSlugs(new Set());
            invalidateServerPreview();
          }}
          placeholder={`${TEAM_BATCH_CREATION_HEADER}\nClube Exemplo;Exemplo;CEX;CODE;clube-exemplo;Exemplo FC|C. Exemplo;https://example.invalid/logo.svg;#123ABC`}
          rows={10}
          spellCheck={false}
          value={rawText}
        />
        <div className={styles.toolbar}>
          <label className={styles.fileButton}>
            Carregar .txt/.csv
            <input
              accept=".txt,.csv,text/plain,text/csv"
              disabled={busy !== null}
              onChange={handleFile}
              type="file"
            />
          </label>
          <button
            className={styles.primaryButton}
            disabled={!rawText.trim() || busy !== null}
            onClick={previewLocally}
            type="button"
          >
            PRÉ-VISUALIZAR LOCALMENTE
          </button>
        </div>
      </section>

      {localResult ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p>Passo 2</p>
              <h2>Validação e revisão local</h2>
            </div>
            <span>Máximo {TEAM_BATCH_CREATION_MAX_ROWS} clubes</span>
          </div>
          <div className={styles.metrics}>
            <div><strong>{localResult.summary.validRows}</strong><span>Válidas</span></div>
            <div><strong>{localResult.summary.invalidRows}</strong><span>Inválidas</span></div>
            <div><strong>{localResult.summary.warningCount}</strong><span>Avisos</span></div>
            <div><strong>{localResult.summary.byteLength}</strong><span>Bytes</span></div>
            <div><strong>{localResult.summary.headerPresent ? "Sim" : "Não"}</strong><span>Cabeçalho</span></div>
          </div>

          {localResult.issues.length > 0 ? (
            <div className={styles.issues}>
              <h3>Ocorrências</h3>
              <ul>
                {localResult.issues.map((issue, index) => (
                  <li className={issue.severity === "error" ? styles.errorIssue : styles.warningIssue} key={`${issue.lineNumber}-${issue.code}-${index}`}>
                    {issue.lineNumber > 0 ? `Linha ${issue.lineNumber}: ` : ""}{issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.editTable}>
                <caption>Linhas normalizadas e editáveis antes do preview servidor</caption>
                <thead>
                  <tr>
                    <th>Linha</th><th>Nome canónico</th><th>Nome público</th><th>Sigla</th><th>Código</th><th>Slug</th><th>Aliases</th><th>Emblema URL</th><th>Cor</th><th>Sugestões</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const lineSuggestions = suggestions[row.lineNumber];
                    const slugNeedsConfirmation = Boolean(lineSuggestions?.slug.suggested) && !confirmedSuggestedSlugs.has(row.lineNumber);
                    return (
                      <tr key={row.lineNumber}>
                        <td>{row.lineNumber}</td>
                        <td><input aria-label={`Nome canónico da linha ${row.lineNumber}`} onChange={(event) => changeField(row.lineNumber, "canonicalName", event.target.value)} value={row.canonicalName} /></td>
                        <td><input aria-label={`Nome público da linha ${row.lineNumber}`} onChange={(event) => changeField(row.lineNumber, "publicName", event.target.value)} value={inputValue(row.publicName)} /></td>
                        <td><input aria-label={`Sigla da linha ${row.lineNumber}`} maxLength={6} onChange={(event) => changeField(row.lineNumber, "shortName", event.target.value)} value={row.shortName} /></td>
                        <td><input aria-label={`Código da linha ${row.lineNumber}`} onChange={(event) => changeField(row.lineNumber, "code", event.target.value)} value={inputValue(row.code)} /></td>
                        <td>
                          <input aria-label={`Slug da linha ${row.lineNumber}`} onChange={(event) => changeField(row.lineNumber, "slug", event.target.value)} value={row.slug} />
                          {slugNeedsConfirmation ? <button className={styles.inlineButton} onClick={() => confirmSuggestedSlug(row.lineNumber)} type="button">Confirmar slug sugerido</button> : null}
                        </td>
                        <td><textarea aria-label={`Aliases da linha ${row.lineNumber}`} onChange={(event) => changeAliases(row.lineNumber, event.target.value)} rows={3} value={row.aliases.join("|")} /></td>
                        <td><input aria-label={`Emblema da linha ${row.lineNumber}`} onChange={(event) => changeField(row.lineNumber, "logoUrl", event.target.value)} value={inputValue(row.logoUrl)} /></td>
                        <td><input aria-label={`Cor da linha ${row.lineNumber}`} onChange={(event) => changeField(row.lineNumber, "primaryColor", event.target.value)} value={inputValue(row.primaryColor)} /></td>
                        <td className={styles.suggestionCell}>
                          {lineSuggestions?.publicName.value ? (
                            <>
                              <span>{lineSuggestions.publicName.value}</span>
                              <small>{lineSuggestions.publicName.confidence} · {lineSuggestions.publicName.reason}</small>
                              {row.publicName !== lineSuggestions.publicName.value ? <button className={styles.inlineButton} onClick={() => usePublicNameSuggestion(row.lineNumber)} type="button">Usar como nome público</button> : null}
                              {lineSuggestions.publicNameAsAlias && !row.aliases.includes(lineSuggestions.publicNameAsAlias) ? <button className={styles.inlineButton} onClick={() => usePublicNameAsAlias(row.lineNumber)} type="button">Adicionar como alias</button> : null}
                            </>
                          ) : <span>Sem sugestão</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {unconfirmedSuggestedSlugLines.length > 0 ? (
            <p className={styles.blockingNote}>Confirme os slugs sugeridos nas linhas {unconfirmedSuggestedSlugLines.join(", ")}.</p>
          ) : null}
          <div className={styles.toolbar}>
            <button
              className={styles.primaryButton}
              disabled={!canRequestServerPreview}
              onClick={previewOnServer}
              type="button"
            >
              {busy === "preview" ? "A PRÉ-VISUALIZAR…" : "PRÉ-VISUALIZAR NA BASE DE DADOS"}
            </button>
          </div>
        </section>
      ) : null}

      {serverPreview ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><p>Passo 3</p><h2>Preview transacional</h2></div>
            <code>{serverPreview.fingerprint}</code>
          </div>
          {previewChanged ? <p className={styles.blockingNote}>O país ou o lote mudou. Este preview deixou de ser válido.</p> : null}
          <div className={styles.metrics}>
            <div><strong>{serverPreview.summary.totalCount}</strong><span>Total</span></div>
            <div><strong>{serverPreview.summary.createCount}</strong><span>Criar</span></div>
            <div><strong>{serverPreview.summary.existingCount}</strong><span>Já existem</span></div>
            <div><strong>{serverPreview.summary.completeExistingCount}</strong><span>Completar</span></div>
            <div><strong>{serverPreview.summary.probableCount}</strong><span>Prováveis</span></div>
            <div><strong>{serverPreview.summary.ambiguousCount}</strong><span>Ambíguos</span></div>
            <div><strong>{serverPreview.summary.conflictCount}</strong><span>Conflitos</span></div>
            <div><strong>{serverPreview.summary.invalidCount}</strong><span>Inválidos</span></div>
            <div><strong>{serverPreview.summary.blockingCount}</strong><span>Bloqueantes</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.resultTable}>
              <caption>Resultado por linha devolvido pela base de dados</caption>
              <thead><tr><th>Linha</th><th>Estado</th><th>Ação</th><th>Identidade proposta</th><th>Clube resolvido</th><th>Aliases</th><th>Motivo</th><th>Conflitos</th><th>Confirmação</th></tr></thead>
              <tbody>
                {serverPreview.rows.map((row) => (
                  <tr key={row.line_number}>
                    <td>{row.line_number}</td>
                    <td><span className={`${styles.status} ${styles[`status_${row.result_status}`]}`}>{STATUS_LABELS[row.result_status]}</span></td>
                    <td>{row.proposed_action}</td>
                    <td>
                      <strong>{displayNullable(row.proposed_identity.canonical_name)}</strong>
                      <small>{displayNullable(row.proposed_identity.public_name)} · {displayNullable(row.proposed_identity.short_name)} · {displayNullable(row.proposed_identity.code)}</small>
                      <small>{displayNullable(row.proposed_identity.slug)}</small>
                      <small>{displayNullable(row.proposed_identity.logo_url)} · {displayNullable(row.proposed_identity.primary_color)}</small>
                    </td>
                    <td>
                      {row.existing_identity ? <><strong>{row.existing_identity.canonical_name}</strong><small>ID {row.existing_identity.team_id}</small><small>{displayNullable(row.existing_identity.country_id)} · {row.existing_identity.slug}</small></> : "—"}
                    </td>
                    <td>{row.normalized_aliases.length ? row.normalized_aliases.join(" · ") : "—"}</td>
                    <td><strong>{row.reason_code}</strong><small>{row.reason_message}</small></td>
                    <td>{row.conflicts.length ? row.conflicts.map((conflict) => typeof conflict === "string" ? conflict : JSON.stringify(conflict)).join(" · ") : "—"}</td>
                    <td>
                      {row.result_status === "complete_existing" ? (
                        <label className={styles.confirmLabel}>
                          <input checked={confirmedCompleteLines.has(row.line_number)} onChange={() => toggleCompleteLine(row.line_number)} type="checkbox" />
                          Confirmo completar este clube legacy
                        </label>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.applyBox}>
            <h3>Resumo da aplicação</h3>
            <p>
              Serão criados <strong>{serverPreview.summary.createCount}</strong> clubes, completados <strong>{serverPreview.summary.completeExistingCount}</strong> clubes legacy e mantidos sem alteração <strong>{serverPreview.summary.existingCount}</strong> clubes existentes.
            </p>
            {unresolvedBlockingCount > 0 ? <p className={styles.blockingNote}>Existem {unresolvedBlockingCount} linhas com revisão ou conflito bloqueante.</p> : null}
            {!allCompleteLinesConfirmed ? <p className={styles.blockingNote}>Confirme individualmente todos os clubes a completar.</p> : null}
            <button className={styles.dangerButton} disabled={!canApply} onClick={applyBatch} type="button">
              {busy === "apply" ? "A CRIAR…" : "CRIAR CLUBES VALIDADOS"}
            </button>
          </div>
        </section>
      ) : null}

      {appliedResult ? (
        <section aria-live="polite" className={`${styles.panel} ${styles.successPanel}`}>
          <div className={styles.panelHeading}><div><p>Concluído</p><h2>Lote aplicado integralmente</h2></div></div>
          <div className={styles.metrics}>
            <div><strong>{appliedResult.summary.createdCount}</strong><span>Clubes criados</span></div>
            <div><strong>{appliedResult.summary.completedExistingCount}</strong><span>Clubes completados</span></div>
            <div><strong>{appliedResult.summary.existingResultCount}</strong><span>Já existentes</span></div>
            <div><strong>{appliedResult.summary.aliasesCreatedCount}</strong><span>Aliases criados</span></div>
            <div><strong>{appliedResult.summary.aliasesUnchangedCount}</strong><span>Aliases mantidos</span></div>
            <div><strong>{appliedResult.summary.publicNamesChangedCount}</strong><span>Nomes públicos alterados</span></div>
          </div>
          <ul className={styles.finalIds}>
            {appliedResult.rows.map((row) => <li key={row.line_number}>Linha {row.line_number}: <code>{row.final_team_id}</code></li>)}
          </ul>
          <a className={styles.returnLink} href="/admin/gestor">Preparar participantes da época</a>
        </section>
      ) : null}
    </main>
  );
}
