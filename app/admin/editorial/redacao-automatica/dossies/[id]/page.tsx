import { notFound } from "next/navigation";

import {
  getEditorialDossierById,
  type EditorialDossierArticleKind,
  type EditorialDossierLengthMode,
  type EditorialDossierOutputMode,
  type EditorialDossierSourceRole,
  type EditorialDossierStatus,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";
import type { ArticleProcessingStatus } from "@/lib/redacao-automatica/types";

import styles from "../../redacao-automatica.module.css";

export const dynamic = "force-dynamic";

type DossierPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusLabels: Record<EditorialDossierStatus, string> = {
  draft: "Em preparação",
  ready_for_generation: "Pronto para gerar",
  completed: "Concluído",
  archived: "Arquivado",
};

const roleLabels: Record<EditorialDossierSourceRole, string> = {
  primary: "Principal",
  corroboration: "Confirmação",
  context: "Contexto",
  complementary: "Complementar",
};

const processingStatusLabels: Record<ArticleProcessingStatus, string> = {
  detected: "Detetado",
  normalized: "Normalizado",
  duplicate: "Duplicado",
  rejected: "Rejeitado",
  ready_for_review: "Por rever",
  failed: "Falhou",
};

const outputModeLabels: Record<EditorialDossierOutputMode, string> = {
  single: "Um artigo",
  multiple: "Vários artigos",
};

const lengthModeLabels: Record<EditorialDossierLengthMode, string> = {
  brief: "Breve",
  standard: "Normal",
  developed: "Desenvolvido",
};

const articleKindLabels: Record<EditorialDossierArticleKind, string> = {
  news: "Notícia",
  analysis: "Análise",
  preview: "Antevisão",
  summary: "Síntese",
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(date);
}

export default async function EditorialDossierPage({ params, searchParams }: DossierPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const result = await getEditorialDossierById(id);

  if (result.ok && !result.value) {
    notFound();
  }

  if (!result.ok) {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <header className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Redação automática</p>
              <h1>Dossiê indisponível</h1>
              <p className={styles.description}>
                Não foi possível ler este Dossiê de redação neste momento.
              </p>
            </div>
            <nav className={styles.heroActions}>
              <a href="/admin/editorial/redacao-automatica">Voltar à Redação automática</a>
            </nav>
          </header>
        </div>
      </main>
    );
  }

  const dossier = result.value!;
  const sourceNames = new Map(listRegisteredSources().map((source) => [source.code, source.name]));
  const state = firstQueryValue(query.dossier_state);
  const errorCode = firstQueryValue(query.dossier_error);
  const errorMessages: Record<string, string> = {
    input_invalid: "Revê os dados do Dossiê antes de guardar.",
    service_unavailable: "O serviço dos Dossiês não está configurado.",
    dossier_not_found: "O Dossiê já não existe.",
    dossier_update_failed: "Não foi possível guardar as alterações.",
  };
  const errorMessage = errorCode
    ? errorMessages[errorCode] ?? "Não foi possível guardar o Dossiê."
    : null;
  const successMessage = state === "created"
    ? "O Dossiê foi criado e os snapshots das fontes ficaram congelados."
    : state === "updated"
      ? "As orientações e preferências do Dossiê foram guardadas."
      : null;

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Mesa de preparação</p>
            <h1>{dossier.title}</h1>
            <p className={styles.description}>
              Organiza as fontes e as orientações humanas antes de qualquer composição automática.
            </p>
          </div>
          <nav className={styles.heroActions} aria-label="Navegação do Dossiê">
            <a href="/admin/editorial/redacao-automatica">Voltar à Redação automática</a>
            <a className={styles.primaryAction} href="/admin/editorial/artigos">
              Ver artigos editoriais
            </a>
          </nav>
        </header>

        <section className={styles.dossierDetailSummary} aria-label="Estado do Dossiê">
          <div>
            <span>Estado</span>
            <strong>{statusLabels[dossier.status]}</strong>
          </div>
          <div>
            <span>Fontes congeladas</span>
            <strong>{dossier.sources.length}</strong>
          </div>
          <div>
            <span>Resultado previsto</span>
            <strong>
              {outputModeLabels[dossier.outputMode]}
              {dossier.outputMode === "multiple" ? ` (${dossier.outputCount})` : ""}
            </strong>
          </div>
          <div>
            <span>Última alteração</span>
            <strong>{formatDate(dossier.updatedAt)}</strong>
          </div>
        </section>

        {errorMessage ? <p className={styles.dossierError} role="status">{errorMessage}</p> : null}
        {successMessage ? <p className={styles.dossierSuccess} role="status">{successMessage}</p> : null}

        <div className={styles.dossierDetailLayout}>
          <section className={styles.dossierEditorPanel} aria-labelledby="dossier-editor-title">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Orientação humana</p>
                <h2 id="dossier-editor-title">Definição editorial</h2>
              </div>
              <p>Estas instruções serão usadas futuramente pelo compositor, mas nesta fase são apenas guardadas.</p>
            </div>

            <form action="/api/admin/editorial/redacao-automatica/dossies" method="post" className={styles.dossierForm}>
              <input type="hidden" name="action" value="update" />
              <input type="hidden" name="dossier_id" value={dossier.id} />

              <label>
                <span>Título interno do Dossiê</span>
                <input name="title" defaultValue={dossier.title} maxLength={180} required />
              </label>

              <label>
                <span>Orientações editoriais</span>
                <textarea
                  name="editorial_instructions"
                  defaultValue={dossier.editorialInstructions}
                  maxLength={12000}
                  rows={10}
                  placeholder="Define a relevância, a ordem da informação, o ângulo e a forma de reconstruir o artigo."
                />
              </label>

              <label>
                <span>Contexto a introduzir</span>
                <textarea
                  name="context_instructions"
                  defaultValue={dossier.contextInstructions}
                  maxLength={8000}
                  rows={6}
                  placeholder="Regista o contexto competitivo ou editorial que deve enquadrar a notícia."
                />
              </label>

              <div className={styles.dossierPreferences}>
                <label>
                  <span>Resultado</span>
                  <select name="output_mode" defaultValue={dossier.outputMode}>
                    <option value="single">Um artigo</option>
                    <option value="multiple">Vários artigos</option>
                  </select>
                </label>
                <label>
                  <span>Quantidade</span>
                  <select name="output_count" defaultValue={String(dossier.outputCount)}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </label>
                <label>
                  <span>Extensão</span>
                  <select name="length_mode" defaultValue={dossier.lengthMode}>
                    {Object.entries(lengthModeLabels).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Género</span>
                  <select name="article_kind" defaultValue={dossier.articleKind}>
                    {Object.entries(articleKindLabels).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <p className={styles.dossierLanguageNote}>
                Língua de saída: Português de Portugal. A tradução será uma etapa autónoma numa fase posterior.
              </p>

              <button type="submit">Guardar Dossiê</button>
            </form>
          </section>

          <aside className={styles.dossierSourcesPanel} aria-labelledby="dossier-sources-title">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Proveniência congelada</p>
                <h2 id="dossier-sources-title">Fontes</h2>
              </div>
              <p>A ordem indica a prioridade inicial definida na criação.</p>
            </div>

            <ol className={styles.dossierSourceList}>
              {dossier.sources.map((source, index) => (
                <li key={source.id}>
                  <div className={styles.dossierSourceHeading}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{source.articleTitle}</strong>
                      <small>
                        {sourceNames.get(source.sourceCode) ?? source.sourceCode}
                        {" · "}
                        {roleLabels[source.sourceRole]}
                      </small>
                    </div>
                  </div>
                  <dl>
                    <div><dt>Estado</dt><dd>{processingStatusLabels[source.processingStatus]}</dd></div>
                    <div><dt>Snapshot</dt><dd>{source.newsroomSnapshotId}</dd></div>
                    <div><dt>Extração</dt><dd>{formatDate(source.snapshotExtractedAt)}</dd></div>
                    <div><dt>Blocos</dt><dd>{source.snapshotBodyBlockCount}</dd></div>
                  </dl>
                  <a href={`/admin/editorial/redacao-automatica?articleId=${encodeURIComponent(source.newsroomArticleId)}`}>
                    Abrir artigo-fonte
                  </a>
                </li>
              ))}
            </ol>

            <p className={styles.dossierFrozenNote}>
              Alterações ou novas extrações das fontes não substituem silenciosamente estes snapshots.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
