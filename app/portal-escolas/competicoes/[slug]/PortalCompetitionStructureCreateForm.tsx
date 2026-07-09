"use client";

type PortalCompetitionStructureCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  portalCompetitionId: string;
  competitionSlug: string;
  competitionName: string;
  formatName: string;
};

export function PortalCompetitionStructureCreateForm({
  action,
  portalCompetitionId,
  competitionSlug,
  competitionName,
  formatName
}: PortalCompetitionStructureCreateFormProps) {
  return (
    <form action={action} className="portal-competition-format-create-form">
      <input type="hidden" name="portal_competition_id" value={portalCompetitionId} />
      <input type="hidden" name="competition_slug" value={competitionSlug} />

      <div className="portal-competition-format-create-state" aria-label="Estado da estrutura após criação">
        <span className="portal-competition-detail-tag">Rascunho</span>
        <span className="portal-competition-detail-tag">Pendente de validação</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-structure-competition">Competição</label>
        <input id="portal-competition-structure-competition" value={competitionName} readOnly />
        <span>A estrutura ficará associada à competição atual.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-structure-format">Formato competitivo</label>
        <input id="portal-competition-structure-format" value={formatName} readOnly />
        <span>O Portal vai criar a primeira organização compatível com este formato.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-structure-label">Estrutura sugerida</label>
        <input id="portal-competition-structure-label" value="Fase regular · organizar por jornadas" readOnly />
        <span>Os campos técnicos são preenchidos automaticamente por baixo.</span>
      </div>

      <button type="submit">Criar estrutura em rascunho</button>
    </form>
  );
}
