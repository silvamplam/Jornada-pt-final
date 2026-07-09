export type PortalCompetitionGuidedPathStepStatus = "Concluído" | "Atual" | "Por fazer" | "Futuro";

export type PortalCompetitionGuidedPathStep = {
  title: string;
  description: string;
  status: PortalCompetitionGuidedPathStepStatus;
  href: string;
};

export type PortalCompetitionGuidedPathAction = {
  label: string;
  href: string;
};

type PortalCompetitionGuidedPathProps = {
  steps: PortalCompetitionGuidedPathStep[];
  nextAction: PortalCompetitionGuidedPathAction;
};

function getStepStatusClassName(status: PortalCompetitionGuidedPathStepStatus) {
  if (status === "Concluído") {
    return "portal-competition-guided-path-step-complete";
  }

  if (status === "Atual") {
    return "portal-competition-guided-path-step-current";
  }

  if (status === "Futuro") {
    return "portal-competition-guided-path-step-future";
  }

  return "portal-competition-guided-path-step-pending";
}

export function PortalCompetitionGuidedPath({ steps, nextAction }: PortalCompetitionGuidedPathProps) {
  return (
    <section className="portal-competition-detail-section portal-competition-guided-path" aria-labelledby="portal-competition-guided-path-title">
      <div className="portal-competition-detail-section-header">
        <div>
          <p className="portal-competition-detail-eyebrow">Percurso</p>
          <h2 id="portal-competition-guided-path-title">Percurso da competição</h2>
          <p className="portal-competition-detail-text">Segue os passos principais para configurar, disputar e documentar esta competição.</p>
        </div>
        <div className="portal-competition-guided-path-next">
          <span>Próxima ação recomendada</span>
          <a href={nextAction.href}>{nextAction.label}</a>
        </div>
      </div>

      <ol className="portal-competition-guided-path-list">
        {steps.map((step, index) => (
          <li className={`portal-competition-guided-path-step ${getStepStatusClassName(step.status)}`} key={step.title}>
            <a href={step.href}>
              <span className="portal-competition-guided-path-number">{index + 1}</span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
              <em>{step.status}</em>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
