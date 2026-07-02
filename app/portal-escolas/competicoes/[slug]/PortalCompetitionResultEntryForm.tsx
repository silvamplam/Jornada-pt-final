"use client";

type PortalCompetitionResultEntryFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  competitionSlug: string;
  eventId: string;
  participantId: string;
  participantName: string;
  initialScoreText: string | null;
  initialScoreNumeric: number | string | null;
  initialPoints: number | string | null;
  initialOutcome: string | null;
  initialResultStatus: string | null;
};

function formatInitialValue(value: number | string | null) {
  if (value === null || value === "") {
    return "";
  }

  return String(value);
}

function cleanOutcomeValue(value: string | null) {
  return value === "win" || value === "draw" || value === "loss" ? value : "";
}

export function PortalCompetitionResultEntryForm({
  action,
  competitionSlug,
  eventId,
  participantId,
  participantName,
  initialScoreText,
  initialScoreNumeric,
  initialPoints,
  initialOutcome
}: PortalCompetitionResultEntryFormProps) {
  const fieldIdPrefix = `portal-result-entry-${eventId}-${participantId}`;

  return (
    <form action={action} className="portal-competition-format-create-form">
      <input type="hidden" name="competition_slug" value={competitionSlug} />
      <input type="hidden" name="portal_event_id" value={eventId} />
      <input type="hidden" name="portal_participant_id" value={participantId} />
      <input type="hidden" name="result_status" value="submitted" />

      <div className="portal-competition-format-create-state" aria-label="Estado do resultado após gravação">
        <span className="portal-competition-detail-tag">Estado: submetido</span>
        <span className="portal-competition-detail-tag">Validação futura</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-participant`}>Participante</label>
        <input id={`${fieldIdPrefix}-participant`} value={participantName} readOnly />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-score-text`}>Resultado / observação</label>
        <input
          id={`${fieldIdPrefix}-score-text`}
          name="score_text"
          type="text"
          maxLength={120}
          defaultValue={initialScoreText ?? ""}
          placeholder="Ex.: Resultado UI: 2 pontos"
        />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-score-numeric`}>Valor</label>
        <input
          id={`${fieldIdPrefix}-score-numeric`}
          name="score_numeric"
          type="number"
          step="any"
          inputMode="decimal"
          defaultValue={formatInitialValue(initialScoreNumeric)}
          placeholder="Ex.: 2"
        />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-points`}>Pontos</label>
        <input
          id={`${fieldIdPrefix}-points`}
          name="points"
          type="number"
          step="any"
          inputMode="decimal"
          defaultValue={formatInitialValue(initialPoints)}
          placeholder="Ex.: 3"
        />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-outcome`}>Desfecho</label>
        <select id={`${fieldIdPrefix}-outcome`} name="outcome" defaultValue={cleanOutcomeValue(initialOutcome)}>
          <option value="">Sem desfecho</option>
          <option value="win">Vitória</option>
          <option value="draw">Empate</option>
          <option value="loss">Derrota</option>
        </select>
      </div>

      <button type="submit">Guardar resultado</button>
    </form>
  );
}
