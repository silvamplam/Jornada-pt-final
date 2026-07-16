import {
  listRegisteredSources,
  type SourceOperationalStatus,
  type SourceRegistryEntry,
} from "@/lib/redacao-automatica/source-registry";

import styles from "./redacao-automatica.module.css";

const editorialSummary = [
  "Novos temas",
  "Atualizações relevantes",
  "Aguardam validação",
  "Notícias geradas",
] as const;

const topicFields = [
  "Tema",
  "Destaque",
  "Fontes",
  "Última atualização",
  "Estado",
  "Ação",
] as const;

const editorialFlow = [
  "Tema detetado",
  "Informação reunida",
  "Notícia gerada",
  "Validação editorial",
  "Rascunho criado",
  "Revisão e publicação",
] as const;

const operationalStatusLabels: Record<SourceOperationalStatus, string> = {
  active: "Operacional",
  paused: "Em preparação",
  legal_hold: "Validação jurídica pendente",
  degraded: "Funcionamento condicionado",
  disabled: "Desativada",
};

const inactiveMonitoringStatusLabels: Record<SourceOperationalStatus, string> = {
  active: "Monitorização inativa",
  paused: "Monitorização ainda não ativa",
  legal_hold: "Monitorização inativa — validação jurídica necessária",
  degraded: "Monitorização inativa — funcionamento condicionado",
  disabled: "Monitorização desativada",
};

const operationalStatusClasses: Record<SourceOperationalStatus, string> = {
  active: styles.statusActive,
  paused: styles.statusPaused,
  legal_hold: styles.statusLegalHold,
  degraded: styles.statusDegraded,
  disabled: styles.statusDisabled,
};

function getMonitoringStatus(source: SourceRegistryEntry) {
  const canMonitor = source.operationalStatus === "active" || source.operationalStatus === "degraded";

  if (!source.monitoringEnabled || !canMonitor) {
    return inactiveMonitoringStatusLabels[source.operationalStatus];
  }

  return source.operationalStatus === "degraded"
    ? "Monitorização ativa com funcionamento condicionado"
    : "Monitorização ativa";
}

export default function AutomaticNewsroomPage() {
  const sources = listRegisteredSources();

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Área editorial</p>
            <h1>Redação automática</h1>
            <p className={styles.description}>
              Área destinada à deteção de temas, acompanhamento de dossiês e preparação automática de notícias
              para validação editorial.
            </p>
          </div>
          <nav className={styles.heroActions} aria-label="Navegação da Redação automática">
            <a href="/admin">Voltar ao backoffice</a>
            <a className={styles.primaryAction} href="/admin/editorial/artigos">
              Ver artigos editoriais
            </a>
          </nav>
        </header>

        <section className={styles.summarySection} aria-labelledby="editorial-summary-title">
          <h2 className={styles.visuallyHidden} id="editorial-summary-title">
            Resumo editorial
          </h2>
          <div className={styles.summaryGrid}>
            {editorialSummary.map((label) => (
              <article className={styles.summaryCard} key={label}>
                <strong>0</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
          <p className={styles.emptyDataNote}>
            Estado inicial da área. A monitorização das fontes ainda não está ativa.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="tracked-topics-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Acompanhamento editorial</p>
              <h2 id="tracked-topics-title">Temas acompanhados</h2>
            </div>
            <p>
              A ação de gerar notícia ficará disponível quando a recolha e a geração estiverem ligadas.
            </p>
          </div>

          <table className={styles.topicsTable}>
            <thead>
              <tr>
                {topicFields.map((field) => (
                  <th scope="col" key={field}>
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.emptyRow}>
                <td colSpan={topicFields.length}>
                  <strong>Ainda não existem temas recolhidos.</strong>
                  <span>
                    A monitorização das fontes e a criação automática dos dossiês serão ativadas numa fase
                    posterior.
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className={styles.section} aria-labelledby="planned-sources-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Configuração inicial</p>
              <h2 id="planned-sources-title">Fontes previstas</h2>
            </div>
            <p>A ativação de cada fonte dependerá da respetiva validação técnica e jurídica.</p>
          </div>

          <div className={styles.sourceGrid}>
            {sources.map((source) => (
              <article className={styles.sourceCard} key={source.code}>
                <div className={styles.sourceCardHeader}>
                  <div>
                    <span>Fonte prevista</span>
                    <h3>{source.name}</h3>
                  </div>
                  <span
                    className={`${styles.statusBadge} ${operationalStatusClasses[source.operationalStatus]}`}
                  >
                    {operationalStatusLabels[source.operationalStatus]}
                  </span>
                </div>
                <p className={styles.monitoringStatus}>{getMonitoringStatus(source)}</p>
                <p>{source.editorialNote}</p>
                {source.legalNote ? <p className={styles.legalNote}>{source.legalNote}</p> : null}
              </article>
            ))}
          </div>

          <aside className={styles.extensibilityNote} aria-label="Evolução das fontes">
            <strong>Evolução progressiva</strong>
            <p>
              A área será preparada para receber novas fontes de forma progressiva, sem alterar o funcionamento
              dos temas, dossiês e artigos.
            </p>
          </aside>
        </section>

        <section className={styles.section} aria-labelledby="editorial-flow-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Processo futuro</p>
              <h2 id="editorial-flow-title">Fluxo editorial</h2>
            </div>
            <p>A validação editorial mantém-se antes da criação do rascunho e da revisão final.</p>
          </div>

          <ol className={styles.flowGrid}>
            {editorialFlow.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.integrationSection}`} aria-labelledby="integration-title">
          <div>
            <p className={styles.sectionEyebrow}>Continuidade do processo</p>
            <h2 id="integration-title">Integração editorial</h2>
            <p>
              A notícia validada será futuramente guardada como rascunho no sistema editorial existente e aberta
              no editor normal de artigos.
            </p>
            <p className={styles.futureActionNote}>
              A validação e a criação do rascunho serão disponibilizadas numa fase posterior.
            </p>
          </div>
          <a className={styles.integrationLink} href="/admin/editorial/artigos">
            Abrir artigos editoriais
          </a>
        </section>
      </div>
    </main>
  );
}
