"use client";

type PortalCompetitionFormatCatalogOption = {
  id: string;
  name: string;
};

type PortalCompetitionFormatCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  portalCompetitionId: string;
  competitionSlug: string;
  competitionName: string;
  formatOptions: PortalCompetitionFormatCatalogOption[];
};

export function PortalCompetitionFormatCreateForm({
  action,
  portalCompetitionId,
  competitionSlug,
  competitionName,
  formatOptions
}: PortalCompetitionFormatCreateFormProps) {
  const firstOption = formatOptions[0] ?? null;

  return (
    <form action={action} className="portal-competition-format-create-form">
      <input type="hidden" name="portal_competition_id" value={portalCompetitionId} />
      <input type="hidden" name="competition_slug" value={competitionSlug} />

      <div className="portal-competition-format-create-state" aria-label="Estado do formato após criação">
        <span className="portal-competition-detail-tag">Rascunho</span>
        <span className="portal-competition-detail-tag">Pendente de validação</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-format-competition">Competição</label>
        <input id="portal-competition-format-competition" value={competitionName} readOnly />
        <span>O formato ficará associado à competição atual.</span>
      </div>

      <div className="portal-competition-format-create-field">
        <label htmlFor="portal-competition-format-catalog">Tipo de competição</label>
        <select
          id="portal-competition-format-catalog"
          name="catalog_format_id"
          defaultValue={firstOption?.id ?? ""}
          required
        >
          {formatOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <span>
          Escolhe apenas a mecânica competitiva. Os campos técnicos são preenchidos automaticamente pelo Portal.
        </span>
      </div>

      {formatOptions.length === 0 ? (
        <p className="portal-competition-detail-empty">
          Não há tipos de competição disponíveis para escolher neste momento.
        </p>
      ) : null}

      <button type="submit" disabled={formatOptions.length === 0}>
        Definir formato em rascunho
      </button>
    </form>
  );
}
