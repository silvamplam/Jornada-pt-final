"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CALENDAR_IMPORT_HEADER,
  CALENDAR_IMPORT_MAX_BYTES,
  CALENDAR_IMPORT_MAX_LINES,
  applyCalendarCheckpointTransition,
  calendarImportByteLength,
  getNextCalendarMatchday,
  prepareCalendarCheckpointsForResume,
  type CalendarApplyResponse,
  type CalendarErrorResponse,
  type CalendarMatchdayCheckpoint,
  type CalendarPreviewResponse
} from "@/lib/calendar-import";

type CalendarImportToolProps = {
  countryId: string;
  competitionId: string;
  seasonId: string;
  writeConfigured: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCalendarError(value: unknown): value is CalendarErrorResponse {
  return isObject(value) && value.ok === false && typeof value.error === "string" && typeof value.message === "string";
}

function isCalendarPreview(value: unknown): value is CalendarPreviewResponse {
  return isObject(value) && value.ok === true && Array.isArray(value.rows) && Array.isArray(value.matchdays);
}

function isCalendarApply(value: unknown): value is CalendarApplyResponse {
  return isObject(value) && value.ok === true && isObject(value.checkpoint);
}

function usefulLineCount(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] === CALENDAR_IMPORT_HEADER ? Math.max(0, lines.length - 1) : lines.length;
}

function checkpointRecord(checkpoints: CalendarMatchdayCheckpoint[]) {
  return Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint.matchdayNumber, checkpoint]));
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function CalendarImportTool({ countryId, competitionId, seasonId, writeConfigured }: CalendarImportToolProps) {
  const [rawList, setRawList] = useState("");
  const [preview, setPreview] = useState<CalendarPreviewResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Record<number, CalendarMatchdayCheckpoint>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const byteLength = useMemo(() => calendarImportByteLength(rawList), [rawList]);
  const lineCount = useMemo(() => usefulLineCount(rawList), [rawList]);
  const localLimitError =
    byteLength > CALENDAR_IMPORT_MAX_BYTES
      ? `A lista excede ${CALENDAR_IMPORT_MAX_BYTES} bytes.`
      : lineCount > CALENDAR_IMPORT_MAX_LINES
        ? `A lista excede ${CALENDAR_IMPORT_MAX_LINES} linhas úteis.`
        : "";
  const blocked = Boolean(
    preview && (preview.summary.rejectedRows > 0 || preview.summary.duplicateRows > 0 || preview.matchdays.length === 0)
  );
  const completedCount = Object.values(checkpoints).filter((checkpoint) => checkpoint.status === "completed").length;
  const hasFailedCheckpoint = Object.values(checkpoints).some((checkpoint) => checkpoint.status === "failed");

  function resetPlan(nextRawList: string) {
    setRawList(nextRawList);
    setPreview(null);
    setCheckpoints({});
    setMessage("");
    setError("");
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt") && !file.name.toLowerCase().endsWith(".csv")) {
      setError("Seleciona um ficheiro .txt ou .csv.");
      event.target.value = "";
      return;
    }
    if (file.size > CALENDAR_IMPORT_MAX_BYTES) {
      setError(`O ficheiro excede ${CALENDAR_IMPORT_MAX_BYTES} bytes.`);
      event.target.value = "";
      return;
    }

    try {
      resetPlan(await file.text());
    } catch {
      setError("Não foi possível ler o ficheiro selecionado.");
    } finally {
      event.target.value = "";
    }
  }

  function requestForm(actionType: "preview_calendar_list" | "apply_calendar_matchday") {
    const formData = new FormData();
    formData.set("action_type", actionType);
    formData.set("country_id", countryId);
    formData.set("competition_id", competitionId);
    formData.set("season_id", seasonId);
    formData.set("calendar_list", rawList);
    return formData;
  }

  async function requestPreview(preserveCompleted = false) {
    setError("");
    setMessage("");
    if (!countryId || !competitionId || !seasonId) {
      setError("Seleciona país, competição e época antes do preview.");
      return null;
    }
    if (!writeConfigured) {
      setError("A escrita administrativa não está configurada.");
      return null;
    }
    if (!rawList.trim() || localLimitError) {
      setError(localLimitError || "Introduz pelo menos uma linha de calendário.");
      return null;
    }

    setPreviewing(true);
    try {
      const response = await fetch("/api/admin/gestor", { method: "POST", body: requestForm("preview_calendar_list") });
      const payload = await readJsonResponse(response);
      if (!response.ok || !isCalendarPreview(payload)) {
        const calendarError = isCalendarError(payload) ? payload.message : "O preview não devolveu uma resposta válida.";
        setError(calendarError);
        return null;
      }

      setPreview(payload);
      if (!preserveCompleted) setCheckpoints({});
      else {
        setCheckpoints((current) =>
          checkpointRecord(prepareCalendarCheckpointsForResume(Object.values(current)))
        );
      }
      setMessage(
        payload.summary.rejectedRows || payload.summary.duplicateRows
          ? "Preview concluído com bloqueios. Corrige todas as linhas antes de aplicar."
          : "Preview validado. Nenhum dado foi escrito."
      );
      return payload;
    } catch {
      setError("Não foi possível obter o preview. Nenhum dado foi escrito.");
      return null;
    } finally {
      setPreviewing(false);
    }
  }

  async function applyMatchdays() {
    if (!preview || blocked || applying) return;
    setApplying(true);
    setError("");
    setMessage("Aplicação iniciada por jornada.");

    try {
      let workingCheckpoints = Object.values(checkpoints).sort(
        (left, right) => left.matchdayNumber - right.matchdayNumber
      );
      while (true) {
        const matchday = getNextCalendarMatchday(preview.matchdays, workingCheckpoints);
        if (!matchday) {
          if (workingCheckpoints.some((checkpoint) => checkpoint.status === "failed")) {
            setError("A aplicação está parada no primeiro checkpoint falhado. Atualiza o preview para retomar.");
          } else {
            setMessage("Todas as jornadas do plano foram aplicadas e confirmadas por checkpoint.");
          }
          return;
        }
        const formData = requestForm("apply_calendar_matchday");
        formData.set("matchday_number", String(matchday.number));
        formData.set("matchday_fingerprint", matchday.fingerprint);
        formData.set("calendar_checkpoints", JSON.stringify(workingCheckpoints));

        let response: Response;
        let payload: unknown;
        try {
          response = await fetch("/api/admin/gestor", { method: "POST", body: formData });
          payload = await readJsonResponse(response);
        } catch {
          const failedTransition = applyCalendarCheckpointTransition(preview.matchdays, workingCheckpoints, {
            matchdayNumber: matchday.number,
            matchdayLabel: matchday.label,
            createdMatchday: false,
            createdMatches: 0,
            updatedMatches: 0,
            keptMatches: 0,
            status: "failed",
            message: "Falha de comunicação. Atualiza o preview antes de retomar."
          });
          if (failedTransition.ok) {
            workingCheckpoints = failedTransition.progress.checkpoints;
            setCheckpoints(checkpointRecord(workingCheckpoints));
          }
          setError(`A aplicação parou na Jornada ${matchday.number}. Atualiza o preview para retomar.`);
          return;
        }

        if (!response.ok || !isCalendarApply(payload)) {
          const calendarError = isCalendarError(payload) ? payload : null;
          if (calendarError?.progress) {
            workingCheckpoints = calendarError.progress.checkpoints;
            setCheckpoints(checkpointRecord(workingCheckpoints));
          }
          setError(`A aplicação parou na Jornada ${matchday.number}: ${calendarError?.message ?? "erro não detalhado"}`);
          return;
        }

        workingCheckpoints = payload.progress.checkpoints;
        setCheckpoints(checkpointRecord(workingCheckpoints));
      }
    } finally {
      setApplying(false);
    }
  }

  return (
    <article className="manager-create-card manager-wide-card manager-calendar-future">
      <header>
        <h3>Importar dados do calendário</h3>
        <p>
          Formato: <code>{CALENDAR_IMPORT_HEADER}</code>. DataHora aceita data e hora, apenas data ou campo vazio. Os campos não
          podem conter ponto e vírgula.
        </p>
      </header>

      <div className="manager-create-form">
        <div className="manager-field">
          <label htmlFor="calendar-import-list">Lista de jogos por jornada</label>
          <textarea
            id="calendar-import-list"
            value={rawList}
            onChange={(event) => resetPlan(event.target.value)}
            placeholder={
              "3;Jornada 03;Benfica;Casa Pia;2026-08-23T20:30;Estádio da Luz\n" +
              "3;Jornada 03;Sporting;Arouca;2026-08-23;Estádio José Alvalade\n" +
              "3;Jornada 03;Famalicão;Braga;;Estádio Municipal de Famalicão"
            }
          />
          <small>
            {lineCount} linhas úteis · {byteLength} de {CALENDAR_IMPORT_MAX_BYTES} bytes · máximo {CALENDAR_IMPORT_MAX_LINES} linhas
          </small>
        </div>
        <input ref={fileInputRef} type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleFile} hidden />
        <div className="manager-matchday-actions">
          <button className="manager-subtle-button" type="button" onClick={() => fileInputRef.current?.click()}>
            Carregar .txt/.csv
          </button>
          <button
            className="manager-button"
            type="button"
            onClick={() => requestPreview(false)}
            disabled={previewing || applying || Boolean(localLimitError) || !rawList.trim() || !seasonId}
          >
            {previewing ? "A validar…" : "Pré-visualizar calendário"}
          </button>
        </div>
      </div>

      {localLimitError ? <div className="manager-message manager-message-error">{localLimitError}</div> : null}
      <div aria-live="polite">
        {error ? <div className="manager-message manager-message-error">{error}</div> : null}
        {message ? <div className="manager-message">{message}</div> : null}
      </div>

      {preview ? (
        <>
          <div className="manager-stat-row">
            <article className="manager-stat"><strong>{preview.summary.totalRows}</strong><small>Linhas</small></article>
            <article className="manager-stat"><strong>{preview.summary.activeParticipants}</strong><small>Participantes ativos</small></article>
            <article className="manager-stat"><strong>{preview.summary.distinctMatchdays}</strong><small>Jornadas</small></article>
            <article className="manager-stat"><strong>{preview.summary.matchesToCreate}</strong><small>Criar</small></article>
            <article className="manager-stat"><strong>{preview.summary.matchesToUpdate}</strong><small>Atualizar</small></article>
            <article className="manager-stat"><strong>{preview.summary.matchesToKeep}</strong><small>Manter</small></article>
            <article className="manager-stat"><strong>{preview.summary.rejectedRows}</strong><small>Rejeitar</small></article>
            <article className="manager-stat"><strong>{preview.summary.duplicateRows}</strong><small>Duplicados</small></article>
          </div>

          <p>
            Jogos por jornada: {preview.summary.gamesByMatchday.map((item) => `J${item.number}: ${item.games}`).join(" · ") || "—"}.
            {preview.summary.missingMatchdayNumbers.length
              ? ` Jornadas em falta na sequência observada: ${preview.summary.missingMatchdayNumbers.join(", ")}.`
              : " Sem falhas na sequência observada."}
          </p>
          <p>
            Emparelhamentos repetidos: {preview.summary.repeatedPairings}. Equipas repetidas numa jornada: {preview.summary.repeatedTeamsInMatchday}.
          </p>

          <div className="manager-table-wrap">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Estado</th><th>Jornada</th><th>Casa</th><th>Fora</th><th>Data/hora</th><th>Estádio</th><th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={`${row.lineNumber}-${row.homeName}-${row.awayName}`}>
                    <td>{row.statusLabel}</td>
                    <td>{row.matchdayNumber ? `J${row.matchdayNumber}` : "—"}{row.matchdayWillBeCreated ? " · a criar" : ""}</td>
                    <td>{row.homeName || "—"}</td>
                    <td>{row.awayName || "—"}</td>
                    <td>{row.scheduleLabel}</td>
                    <td>{row.venue ?? "—"}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(checkpoints).length > 0 ? (
            <ul className="manager-list">
              {Object.values(checkpoints)
                .sort((left, right) => left.matchdayNumber - right.matchdayNumber)
                .map((checkpoint) => (
                  <li key={checkpoint.matchdayNumber}>
                    <div>
                      <b>J{checkpoint.matchdayNumber} · {checkpoint.status === "completed" ? "concluída" : "falhou"}</b>
                      <small>
                        {checkpoint.createdMatches} criados, {checkpoint.updatedMatches} atualizados, {checkpoint.keptMatches} mantidos
                        {checkpoint.message ? ` · ${checkpoint.message}` : ""}
                      </small>
                    </div>
                  </li>
                ))}
            </ul>
          ) : null}

          <div className="manager-matchday-actions">
            <button
              className="manager-button"
              type="button"
              onClick={applyMatchdays}
              disabled={blocked || applying || previewing || hasFailedCheckpoint}
            >
              {applying ? "A aplicar por jornada…" : completedCount ? "Retomar jornadas pendentes" : "Aplicar calendário validado"}
            </button>
            {hasFailedCheckpoint ? (
              <button className="manager-subtle-button" type="button" onClick={() => requestPreview(true)} disabled={applying || previewing}>
                Atualizar preview para retomar
              </button>
            ) : null}
          </div>
          {blocked ? <div className="manager-empty">A aplicação está bloqueada até todas as linhas serem válidas e inequívocas.</div> : null}
        </>
      ) : null}
    </article>
  );
}
