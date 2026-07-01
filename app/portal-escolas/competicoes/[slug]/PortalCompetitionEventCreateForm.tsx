"use client";

type PortalCompetitionEventParticipantOption = {
  participantId: string;
  name: string;
  typeLabel: string;
  groupLabel: string | null;
  seedOrderLabel: string;
};

type PortalCompetitionEventCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  portalCompetitionId: string;
  portalStageId: string;
  competitionSlug: string;
  competitionName: string;
  stageName: string;
  participantOptions: PortalCompetitionEventParticipantOption[];
};

export function PortalCompetitionEventCreateForm({
  action,
  portalCompetitionId,
  portalStageId,
  competitionSlug,
  competitionName,
  stageName,
  participantOptions
}: PortalCompetitionEventCreateFormProps) {
  return (
    <form action={action} className="portal-competition-format-create-form">
      <input type="hidden" name="portal_competition_id" value={portalCompetitionId} />
      <input type="hidden" name="portal_stage_id" value={portalStageId} />
      <input type="hidden" name="competition_slug" value={competitionSlug} />

      <div className="portal-competition-format-create-state" aria-label="Estado do evento após criação">
        <span className="portal-competition-detail-tag">Estado inicial: rascunho</span>
        <span className="portal-competition-detail-tag">Publicação: gatekeeper</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-competition">Competição</label>
        <input id="portal-competition-event-competition" value={competitionName} readOnly />
        <span>O evento ficará associado à competição atual.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-stage">Estrutura competitiva</label>
        <input id="portal-competition-event-stage" value={stageName} readOnly />
        <span>O evento ficará ligado à estrutura já criada para esta competição.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-name">Nome do evento/jornada</label>
        <input
          id="portal-competition-event-name"
          name="event_name"
          type="text"
          required
          maxLength={140}
          placeholder="Ex.: Jornada 1"
        />
        <span>Usa um nome simples para a escola reconhecer a jornada, jogo, prova ou ronda.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-type">Tipo de evento</label>
        <select id="portal-competition-event-type" name="event_type" defaultValue="match">
          <option value="match">Jogo/partida</option>
          <option value="event">Evento/prova</option>
        </select>
        <span>O Portal guarda o tipo compatível com o formato competitivo definido.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-order">Ordem/jornada, se aplicável</label>
        <input
          id="portal-competition-event-order"
          name="event_order"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="Ex.: 1"
        />
        <span>Opcional. Se ficares sem preencher, o Portal atribui a próxima ordem disponível.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-scheduled-at">Data/hora, se aplicável</label>
        <input id="portal-competition-event-scheduled-at" name="scheduled_at" type="datetime-local" />
        <span>Opcional. Pode ser preenchido mais tarde antes da validação/publicação.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-venue">Local, se aplicável</label>
        <input
          id="portal-competition-event-venue"
          name="venue"
          type="text"
          maxLength={140}
          placeholder="Ex.: Campo da escola"
        />
        <span>Opcional. Mantém uma descrição simples e reconhecível.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label>Participantes neste evento</label>
        {participantOptions.length > 0 ? (
          <div className="portal-competition-event-create-options">
            {participantOptions.map((participant) => (
              <label className="portal-competition-event-create-option" key={participant.participantId}>
                <input name="participant_ids" type="checkbox" value={participant.participantId} />
                <span>
                  <strong>{participant.name}</strong>
                  <small>
                    {participant.typeLabel} · {participant.groupLabel ?? "Sem grupo/série"} · Ordem {participant.seedOrderLabel}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="portal-competition-detail-empty">Adiciona primeiro participantes à competição para os associar a eventos.</p>
        )}
        <span>Seleciona apenas participantes já inscritos nesta competição.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-event-notes">Notas opcionais</label>
        <textarea
          id="portal-competition-event-notes"
          name="notes"
          maxLength={300}
          placeholder="Ex.: observações internas sobre a jornada, prova ou jogo"
        />
        <span>As notas não publicam nada e servem apenas para preparar a validação futura.</span>
      </div>

      <button type="submit">Criar evento em rascunho</button>
    </form>
  );
}
