"use client";

type PortalCompetitionContentEventOption = {
  key: string;
  name: string;
  stageLabel: string;
  statusLabel: string;
};

type PortalCompetitionContentParticipantOption = {
  participantId: string;
  name: string;
  typeLabel: string;
  groupLabel: string | null;
  seedOrderLabel: string;
};

type PortalCompetitionContentCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  portalCompetitionId: string;
  competitionSlug: string;
  competitionName: string;
  events: PortalCompetitionContentEventOption[];
  participants: PortalCompetitionContentParticipantOption[];
  canCreateContent: boolean;
};

export function PortalCompetitionContentCreateForm({
  action,
  portalCompetitionId,
  competitionSlug,
  competitionName,
  events,
  participants,
  canCreateContent
}: PortalCompetitionContentCreateFormProps) {
  const fieldIdPrefix = `portal-content-create-${portalCompetitionId}`;

  return (
    <form action={action} className="portal-competition-format-create-form">
      <input type="hidden" name="portal_competition_id" value={portalCompetitionId} />
      <input type="hidden" name="competition_slug" value={competitionSlug} />

      <div className="portal-competition-format-create-state" aria-label="Estado do conteúdo após criação">
        <span className="portal-competition-detail-tag">Estado inicial: draft</span>
        <span className="portal-competition-detail-tag">Publicação: não publicada</span>
        <span className="portal-competition-detail-tag">Camada: Portal das Escolas</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-competition`}>Competição</label>
        <input id={`${fieldIdPrefix}-competition`} value={competitionName} readOnly />
        <span>O conteúdo fica associado à competição atual e não entra no editorial antigo.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-type`}>Tipo de conteúdo</label>
        <select id={`${fieldIdPrefix}-type`} name="type" defaultValue="news" required>
          <option value="news">Notícia</option>
          <option value="note">Nota</option>
          <option value="photo">Fotografia</option>
          <option value="video">Vídeo</option>
        </select>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-title`}>Título</label>
        <input
          id={`${fieldIdPrefix}-title`}
          name="title"
          type="text"
          required
          maxLength={160}
          placeholder="Ex.: Turma 7A vence a primeira jornada"
        />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-summary`}>Resumo opcional</label>
        <textarea
          id={`${fieldIdPrefix}-summary`}
          name="summary"
          maxLength={300}
          placeholder="Resumo curto para contextualizar o conteúdo"
        />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-body`}>Corpo do conteúdo</label>
        <textarea
          id={`${fieldIdPrefix}-body`}
          name="body"
          required
          maxLength={4000}
          placeholder="Escreve o conteúdo em rascunho para revisão futura no Portal das Escolas"
        />
        <span>Obrigatório nesta UI mínima para evitar submissões vazias.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-media-url`}>URL de media opcional</label>
        <input
          id={`${fieldIdPrefix}-media-url`}
          name="media_url"
          type="url"
          maxLength={500}
          placeholder="https://..."
        />
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-event`}>Evento associado</label>
        <select id={`${fieldIdPrefix}-event`} name="portal_event_id" defaultValue="">
          <option value="">Sem evento associado</option>
          {events.map((event) => (
            <option value={event.key} key={event.key}>
              {event.name} · {event.stageLabel} · {event.statusLabel}
            </option>
          ))}
        </select>
        <span>Opcional. Usa apenas eventos já existentes nesta competição.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor={`${fieldIdPrefix}-participant`}>Participante associado</label>
        <select id={`${fieldIdPrefix}-participant`} name="portal_participant_id" defaultValue="">
          <option value="">Sem participante associado</option>
          {participants.map((participant) => (
            <option value={participant.participantId} key={participant.participantId}>
              {participant.name} · {participant.typeLabel} · {participant.groupLabel ?? "Sem grupo/série"} · {participant.seedOrderLabel}
            </option>
          ))}
        </select>
        <span>Opcional. Usa apenas participantes já inscritos nesta competição.</span>
      </div>

      <button type="submit" disabled={!canCreateContent}>
        Criar conteúdo em draft
      </button>
    </form>
  );
}
