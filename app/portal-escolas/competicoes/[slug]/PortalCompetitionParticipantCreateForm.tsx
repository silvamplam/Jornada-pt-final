"use client";

type PortalCompetitionParticipantCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  portalCompetitionId: string;
  competitionSlug: string;
  competitionName: string;
};

export function PortalCompetitionParticipantCreateForm({
  action,
  portalCompetitionId,
  competitionSlug,
  competitionName
}: PortalCompetitionParticipantCreateFormProps) {
  return (
    <form action={action} className="portal-competition-format-create-form">
      <input type="hidden" name="portal_competition_id" value={portalCompetitionId} />
      <input type="hidden" name="competition_slug" value={competitionSlug} />

      <div className="portal-competition-format-create-state" aria-label="Estado do participante após criação">
        <span className="portal-competition-detail-tag">Estado inicial: rascunho</span>
        <span className="portal-competition-detail-tag">Publicação: gatekeeper</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-participant-competition">Competição</label>
        <input id="portal-competition-participant-competition" value={competitionName} readOnly />
        <span>O participante ficará associado à competição atual.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-participant-name">Nome da turma/equipa/grupo</label>
        <input
          id="portal-competition-participant-name"
          name="participant_name"
          type="text"
          required
          maxLength={120}
          placeholder="Ex.: Turma 7.º A"
        />
        <span>Usa um nome claro para a escola ou entidade reconhecer o participante.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-participant-type">Tipo de participante</label>
        <select id="portal-competition-participant-type" name="participant_type" defaultValue="team">
          <option value="team">Turma/equipa</option>
          <option value="group">Grupo</option>
          <option value="individual">Aluno/participante individual</option>
          <option value="participant">Participante genérico</option>
        </select>
        <span>Este campo é guardado de forma simples para apoiar eventos e resultados futuros.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-participant-group">Grupo/série, se aplicável</label>
        <input
          id="portal-competition-participant-group"
          name="group_label"
          type="text"
          maxLength={80}
          placeholder="Ex.: Grupo A"
        />
        <span>Opcional. Útil para competições com grupos, séries ou escalões.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-participant-seed">Ordem, se aplicável</label>
        <input
          id="portal-competition-participant-seed"
          name="seed_order"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="Ex.: 1"
        />
        <span>Opcional. Pode ser usada mais tarde para ordenação ou sorteio.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-participant-notes">Notas opcionais</label>
        <textarea
          id="portal-competition-participant-notes"
          name="notes"
          maxLength={300}
          placeholder="Ex.: equipa mista, observações internas ou contexto escolar"
        />
        <span>As notas ajudam a preparar eventos futuros, mas não publicam nada.</span>
      </div>

      <button type="submit">Adicionar participante em rascunho</button>
    </form>
  );
}
