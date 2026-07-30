import {
  EDITORIAL_PROFILE_CHANGE_SUMMARY_MAX_LENGTH,
  EDITORIAL_PROFILE_DOCUMENT_MAX_LENGTH,
  type EditorialProfileActorType,
} from "@/lib/redacao-automatica/editorial-profile-internal";
import { getEditorialProfileOverview } from "@/lib/redacao-automatica/editorial-profile-repository";

import styles from "../redacao-automatica.module.css";

export const dynamic = "force-dynamic";

type EditorialProfilePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const actorLabels: Record<EditorialProfileActorType, string> = {
  system_migration: "Migração do sistema",
  admin_session: "Sessão administrativa",
};

const feedbackMessages: Record<string, string> = {
  version_created: "A nova versão foi guardada. A versão ativa não foi alterada.",
  version_activated: "A versão editorial foi ativada.",
  version_rolled_back: "O rollback editorial foi concluído.",
  invalid_request: "O pedido não é válido. Reveja os campos e tente novamente.",
  editorial_profile_version_conflict:
    "O histórico mudou entretanto. Recarregue a página antes de criar outra versão.",
  editorial_profile_active_conflict:
    "A versão ativa mudou entretanto. Recarregue a página antes de continuar.",
  editorial_profile_version_already_active:
    "A versão indicada já se encontra ativa.",
  editorial_profile_not_found: "O perfil editorial não foi encontrado.",
  editorial_profile_version_not_found: "A versão editorial não foi encontrada.",
  persistence_failed: "Não foi possível guardar a alteração editorial.",
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-PT", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Lisbon",
      }).format(date);
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function normalizeEditorialProfileDocumentForHtml(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export default async function EditorialProfilePage({
  searchParams,
}: EditorialProfilePageProps) {
  const [profileResult, resolvedSearchParams] = await Promise.all([
    getEditorialProfileOverview(),
    searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      ),
  ]);
  const state = firstValue(resolvedSearchParams.state);
  const error = firstValue(resolvedSearchParams.error);

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Redação Automática</p>
            <h1>Linha editorial</h1>
            <p className={styles.description}>
              Documento canónico, versões imutáveis e ativação explícita da
              orientação editorial usada nas gerações.
            </p>
          </div>
          <nav className={styles.heroActions} aria-label="Navegação editorial">
            <a href="/admin/editorial/redacao-automatica">
              Voltar à Redação Automática
            </a>
            <a className={styles.primaryAction} href="/admin/editorial/artigos">
              Artigos em revisão
            </a>
          </nav>
        </header>

        {state && feedbackMessages[state] ? (
          <p className={styles.editorialProfileSuccess} role="status">
            {feedbackMessages[state]}
          </p>
        ) : null}
        {error && feedbackMessages[error] ? (
          <p className={styles.editorialProfileError} role="alert">
            {feedbackMessages[error]}
          </p>
        ) : null}

        {!profileResult.ok ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Configuração necessária</p>
                <h2>Perfil editorial indisponível</h2>
              </div>
              <p>
                Aplique e valide primeiro os steps SQL desta fase. Esta página
                não cria estruturas nem escolhe uma versão por omissão.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className={styles.section} aria-labelledby="active-profile-title">
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Versão ativa</p>
                  <h2 id="active-profile-title">{profileResult.profile.name}</h2>
                </div>
                <p>
                  Versão {profileResult.profile.activeVersion.versionNumber} ·{" "}
                  {shortHash(profileResult.profile.activeVersion.contentHash)}
                </p>
              </div>
              <div className={styles.editorialProfileDocument}>
                <dl className={styles.editorialProfileFacts}>
                  <div>
                    <dt>Código</dt>
                    <dd>{profileResult.profile.code}</dd>
                  </div>
                  <div>
                    <dt>Criada em</dt>
                    <dd>{formatDate(profileResult.profile.activeVersion.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Autoria</dt>
                    <dd>
                      {actorLabels[profileResult.profile.activeVersion.createdByActorType]}
                    </dd>
                  </div>
                  <div>
                    <dt>Hash SHA-256</dt>
                    <dd className={styles.editorialProfileHash}>
                      {profileResult.profile.activeVersion.contentHash}
                    </dd>
                  </div>
                </dl>
                <pre><span>{normalizeEditorialProfileDocumentForHtml(profileResult.profile.activeVersion.documentText)}</span></pre>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="new-profile-version-title">
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Nova versão</p>
                  <h2 id="new-profile-version-title">
                    Criar a partir da versão ativa
                  </h2>
                </div>
                <p>
                  Guardar cria uma versão imutável. A ativação é sempre uma ação
                  posterior e separada.
                </p>
              </div>
              <form
                className={styles.editorialProfileForm}
                action="/api/admin/editorial/redacao-automatica/linha-editorial"
                method="post"
              >
                <input type="hidden" name="action" value="create_version" />
                <input type="hidden" name="profile_id" value={profileResult.profile.id} />
                <input
                  type="hidden"
                  name="based_on_version_id"
                  value={profileResult.profile.activeVersion.id}
                />
                <input
                  type="hidden"
                  name="expected_latest_version_number"
                  value={profileResult.profile.versions[0]?.versionNumber ?? 1}
                />
                <label>
                  Documento editorial
                  <textarea
                    name="document_text"
                    required
                    maxLength={EDITORIAL_PROFILE_DOCUMENT_MAX_LENGTH}
                    defaultValue={normalizeEditorialProfileDocumentForHtml(
                      profileResult.profile.activeVersion.documentText,
                    )}
                    rows={22}
                  />
                </label>
                <label>
                  Resumo da alteração
                  <input
                    type="text"
                    name="change_summary"
                    required
                    maxLength={EDITORIAL_PROFILE_CHANGE_SUMMARY_MAX_LENGTH}
                  />
                </label>
                <button type="submit">Guardar nova versão</button>
              </form>
            </section>

            <section className={styles.section} aria-labelledby="profile-history-title">
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Histórico imutável</p>
                  <h2 id="profile-history-title">Versões editoriais</h2>
                </div>
                <p>
                  Uma versão anterior pode voltar a ser ativa por rollback,
                  sem alterar o seu conteúdo nem apagar o histórico.
                </p>
              </div>
              <ol className={styles.editorialProfileHistory}>
                {profileResult.profile.versions.map((version) => {
                  const isActive = version.id === profileResult.profile.activeVersionId;
                  const isRollback =
                    version.versionNumber <
                    profileResult.profile.activeVersion.versionNumber;

                  return (
                    <li key={version.id}>
                      <div className={styles.editorialProfileVersionHeader}>
                        <div>
                          <strong>Versão {version.versionNumber}</strong>
                          {isActive ? <span>Ativa</span> : null}
                        </div>
                        <time dateTime={version.createdAt}>
                          {formatDate(version.createdAt)}
                        </time>
                      </div>
                      <p>{version.changeSummary}</p>
                      <dl className={styles.editorialProfileFacts}>
                        <div>
                          <dt>Hash</dt>
                          <dd className={styles.editorialProfileHash}>
                            {version.contentHash}
                          </dd>
                        </div>
                        <div>
                          <dt>Autoria</dt>
                          <dd>{actorLabels[version.createdByActorType]}</dd>
                        </div>
                      </dl>
                      <details>
                        <summary>Consultar documento desta versão</summary>
                        <pre><span>{normalizeEditorialProfileDocumentForHtml(version.documentText)}</span></pre>
                      </details>
                      {!isActive ? (
                        <form
                          className={styles.editorialProfileActivationForm}
                          action="/api/admin/editorial/redacao-automatica/linha-editorial"
                          method="post"
                        >
                          <input
                            type="hidden"
                            name="action"
                            value={isRollback ? "rollback" : "activate"}
                          />
                          <input
                            type="hidden"
                            name="profile_id"
                            value={profileResult.profile.id}
                          />
                          <input type="hidden" name="version_id" value={version.id} />
                          <input
                            type="hidden"
                            name="expected_active_version_id"
                            value={profileResult.profile.activeVersionId}
                          />
                          <label>
                            Motivo {isRollback ? "do rollback" : "da ativação"} (opcional)
                            <input
                              type="text"
                              name="reason"
                              maxLength={1_000}
                            />
                          </label>
                          <button type="submit">
                            {isRollback
                              ? `Fazer rollback para a versão ${version.versionNumber}`
                              : `Ativar versão ${version.versionNumber}`}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
