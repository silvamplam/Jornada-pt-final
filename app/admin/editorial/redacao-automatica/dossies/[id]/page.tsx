import { notFound } from "next/navigation";

import {
  getEditorialDossierById,
  type EditorialDossierArticleKind,
  type EditorialDossierLengthMode,
  type EditorialDossierOutputMode,
  type EditorialDossierSourceRole,
  type EditorialDossierStatus,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import {
  listEditorialDossierArticlePlans,
  type EditorialDossierArticlePlan,
  type EditorialDossierArticlePlanStatus,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import {
  listNewsroomArticles,
  type NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
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

const articlePlanStatusLabels: Record<EditorialDossierArticlePlanStatus, string> = {
  planned: "Planeado",
  ready: "Pronto",
  cancelled: "Cancelado",
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}


function positivePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function canJoinDossier(article: NewsroomArticleSummary): boolean {
  return ["detected", "normalized", "ready_for_review"].includes(article.processingStatus)
    && article.hasUsableSnapshot;
}

function sourcePriority(sortOrder: number, fallback: number): number {
  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    return fallback;
  }

  return Math.max(1, Math.round(sortOrder / 10));
}

function articlePlanPriority(sortOrder: number, fallback: number): number {
  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    return fallback;
  }

  return Math.max(1, Math.round(sortOrder / 10));
}

function articlePlanSourcePriority(
  plan: EditorialDossierArticlePlan,
  dossierSourceId: string,
  fallback: number,
): number {
  const assignment = plan.sources.find((source) => source.dossierSourceId === dossierSourceId);
  return assignment
    ? articlePlanPriority(assignment.sortOrder, fallback)
    : fallback;
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
  const sourcePage = positivePage(firstQueryValue(query.source_page));
  const [result, inboxResult, articlePlansResult] = await Promise.all([
    getEditorialDossierById(id),
    listNewsroomArticles({ page: sourcePage, pageSize: 12 }),
    listEditorialDossierArticlePlans(id),
  ]);

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
  const existingArticleIds = new Set(dossier.sources.map((source) => source.newsroomArticleId));
  const availableSources = inboxResult.ok
    ? inboxResult.value.items.filter((article) => (
        canJoinDossier(article) && !existingArticleIds.has(article.id)
      ))
    : [];
  const includedSourceCount = dossier.sources.filter((source) => source.included).length;
  const excludedSourceCount = dossier.sources.length - includedSourceCount;
  const articlePlans = articlePlansResult.ok ? articlePlansResult.value : [];
  const dossierSourcesById = new Map(dossier.sources.map((source) => [source.id, source]));
  const activeArticlePlanCount = articlePlans.filter((plan) => plan.status !== "cancelled").length;
  const state = firstQueryValue(query.dossier_state);
  const errorCode = firstQueryValue(query.dossier_error);
  const errorMessages: Record<string, string> = {
    input_invalid: "Revê os dados do Dossiê antes de guardar.",
    service_unavailable: "O serviço dos Dossiês não está configurado.",
    dossier_not_found: "O Dossiê já não existe.",
    dossier_update_failed: "Não foi possível guardar as alterações.",
    source_not_found: "Uma das fontes já não existe ou já não pertence ao Dossiê.",
    source_not_eligible: "Uma das fontes não está disponível para inclusão no Dossiê.",
    source_snapshot_missing: "Uma das fontes não tem um snapshot normalizado utilizável.",
    source_already_in_dossier: "Uma das fontes já pertence ao Dossiê. Reativa-a na gestão das fontes.",
    source_limit_exceeded: "O Dossiê atingiu o limite de 20 fontes congeladas.",
    source_management_failed: "Não foi possível guardar a gestão das fontes.",
    source_add_failed: "Não foi possível acrescentar as fontes selecionadas.",
    article_plan_not_found: "O artigo planeado já não pertence a este Dossiê.",
    article_plan_limit_exceeded: "O Dossiê já tem quatro artigos planeados ativos.",
    article_plan_ready_incomplete: "Um artigo pronto exige orientação editorial e pelo menos uma fonte.",
    article_plan_source_not_found: "Uma das fontes já não pertence a este Dossiê.",
    article_plan_source_unavailable: "Uma fonte excluída só pode permanecer num artigo onde já estava atribuída.",
    article_plan_already_converted: "O artigo planeado já originou um artigo editorial e ficou congelado.",
    article_plan_not_ready: "Apenas um artigo planeado no estado Pronto pode originar um rascunho.",
    article_plan_incomplete: "O artigo planeado precisa de título, orientação e pelo menos uma fonte.",
    draft_creation_failed: "Não foi possível criar o rascunho editorial.",
    generation_provider_unavailable: "A geração editorial ainda não está configurada neste ambiente.",
    draft_not_found: "O rascunho editorial ligado ao plano não está disponível.",
    draft_not_empty: "O rascunho já contém texto e não será substituído automaticamente.",
    generation_input_too_large: "O conjunto de fontes excede o limite seguro desta primeira geração.",
    generation_failed: "O fornecedor não conseguiu produzir a primeira versão editorial.",
    generation_output_invalid: "A resposta recebida não contém um corpo editorial utilizável.",
    generation_apply_conflict: "O rascunho mudou durante a geração e não foi substituído.",
    article_plan_save_failed: "Não foi possível guardar o artigo planeado.",
  };
  const errorMessage = errorCode
    ? errorMessages[errorCode] ?? "Não foi possível guardar o Dossiê."
    : null;
  const successMessage = state === "created"
    ? "O Dossiê foi criado e os snapshots das fontes ficaram congelados."
    : state === "updated"
      ? "As orientações e preferências do Dossiê foram guardadas."
      : state === "sources_updated"
        ? "A ordem, os papéis, as notas e a inclusão das fontes foram guardados."
        : state === "sources_added"
          ? "As novas fontes foram acrescentadas com os snapshots atuais congelados."
          : state === "article_plan_created"
            ? "O artigo planeado foi criado."
            : state === "article_plan_updated"
              ? "O artigo planeado foi guardado."
              : state === "article_plan_cancelled"
                ? "O artigo planeado foi cancelado sem perder as fontes atribuídas."
                : state === "article_plan_reactivated"
                  ? "O artigo planeado foi reativado."
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
            <span>Fontes ativas</span>
            <strong>{includedSourceCount} / {dossier.sources.length}</strong>
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
                <h2 id="dossier-sources-title">Gestão das fontes</h2>
              </div>
              <p>
                Reordena, classifica e exclui fontes da futura composição sem apagar os snapshots.
              </p>
            </div>

            <form
              action="/api/admin/editorial/redacao-automatica/dossies"
              method="post"
              className={styles.dossierSourceManagementForm}
            >
              <input type="hidden" name="action" value="manage_sources" />
              <input type="hidden" name="dossier_id" value={dossier.id} />

              <ol className={styles.dossierSourceList}>
                {dossier.sources.map((source, index) => (
                  <li
                    key={source.id}
                    className={source.included ? undefined : styles.dossierSourceExcluded}
                  >
                    <input type="hidden" name="dossier_source_id" value={source.id} />

                    <div className={styles.dossierSourceHeading}>
                      <span>
                        {String(sourcePriority(source.sortOrder, index + 1)).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{source.articleTitle}</strong>
                        <small>
                          {sourceNames.get(source.sourceCode) ?? source.sourceCode}
                          {" · "}
                          {source.included ? "Ativa" : "Excluída"}
                        </small>
                      </div>
                    </div>

                    <div className={styles.dossierSourceControls}>
                      <label>
                        <span>Prioridade</span>
                        <input
                          type="number"
                          name={`source_priority_${source.id}`}
                          min={0}
                          max={999}
                          step={1}
                          defaultValue={sourcePriority(source.sortOrder, index + 1)}
                          required
                        />
                      </label>

                      <label>
                        <span>Papel</span>
                        <select name={`source_role_${source.id}`} defaultValue={source.sourceRole}>
                          {Object.entries(roleLabels).map(([value, label]) => (
                            <option value={value} key={value}>{label}</option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.dossierSourceIncluded}>
                        <input
                          type="checkbox"
                          name={`source_included_${source.id}`}
                          defaultChecked={source.included}
                        />
                        <span>Usar na composição</span>
                      </label>
                    </div>

                    <label className={styles.dossierSourceNote}>
                      <span>Nota editorial desta fonte</span>
                      <textarea
                        name={`source_note_${source.id}`}
                        defaultValue={source.editorialNote ?? ""}
                        maxLength={3000}
                        rows={3}
                        placeholder="Regista a função desta fonte, reservas, factos prioritários ou informação a não utilizar."
                      />
                    </label>

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

              <button type="submit">Guardar gestão das fontes</button>
            </form>

            <p className={styles.dossierFrozenNote}>
              {excludedSourceCount > 0
                ? `${excludedSourceCount} fonte(s) excluída(s). Podem ser reativadas sem perder o snapshot.`
                : "Desmarcar uma fonte exclui-a da futura composição, mas preserva a proveniência e o snapshot."}
            </p>
          </aside>
        </div>

        <section
          className={`${styles.section} ${styles.dossierArticlePlansSection}`}
          aria-labelledby="dossier-article-plans-title"
        >
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Estrutura editorial</p>
              <h2 id="dossier-article-plans-title">Artigos planeados</h2>
            </div>
            <p>
              Define cada artigo, as fontes congeladas que lhe pertencem e o momento em que fica pronto.
            </p>
          </div>

          <div className={styles.dossierArticlePlanSummary}>
            <strong>{activeArticlePlanCount} / 4 ativos</strong>
            <span>
              Planeado pode ficar incompleto. Pronto exige orientação editorial e pelo menos uma fonte.
            </span>
          </div>

          {!articlePlansResult.ok ? (
            <div className={styles.readError}>
              <strong>Planeamento indisponível</strong>
              <span>Não foi possível ler os artigos planeados neste momento.</span>
            </div>
          ) : articlePlans.length > 0 ? (
            <div className={styles.dossierArticlePlanList}>
              {articlePlans.map((plan, planIndex) => {
                const assignedSourceIds = new Set(plan.sources.map((source) => source.dossierSourceId));

                return (
                  <article
                    className={`${styles.dossierArticlePlanCard} ${plan.status === "cancelled" ? styles.dossierArticlePlanCancelled : ""}`}
                    key={plan.id}
                  >
                    <div className={styles.dossierArticlePlanHeader}>
                      <span>{String(planIndex + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{plan.workingTitle}</strong>
                        <small>{plan.generation ? "Primeira versão gerada" : plan.editorialArticleId ? "Rascunho editorial criado" : articlePlanStatusLabels[plan.status]}</small>
                      </div>
                    </div>

                    {plan.editorialArticleId ? (
                      <div className={styles.dossierArticlePlanConverted}>
                        <div className={styles.dossierArticlePlanConvertedGrid}>
                          <div>
                            <span>Estado do plano</span>
                            <strong>{articlePlanStatusLabels[plan.status]}</strong>
                          </div>
                          <div>
                            <span>Prioridade</span>
                            <strong>{articlePlanPriority(plan.sortOrder, planIndex + 1)}</strong>
                          </div>
                          <div>
                            <span>Género</span>
                            <strong>{articleKindLabels[plan.articleKind]}</strong>
                          </div>
                          <div>
                            <span>Extensão</span>
                            <strong>{lengthModeLabels[plan.lengthMode]}</strong>
                          </div>
                        </div>

                        <div className={styles.dossierArticlePlanConvertedInstructions}>
                          <span>Orientação preservada</span>
                          <p>{plan.editorialInstructions}</p>
                        </div>

                        <div className={styles.dossierArticlePlanConvertedSources}>
                          <span>Fontes preservadas</span>
                          <ol>
                            {plan.sources.map((assignment, sourceIndex) => {
                              const source = dossierSourcesById.get(assignment.dossierSourceId);

                              return (
                                <li key={assignment.id}>
                                  <strong>{source?.articleTitle ?? "Fonte congelada"}</strong>
                                  <small>
                                    Ordem {sourceIndex + 1}
                                    {source ? ` · ${sourceNames.get(source.sourceCode) ?? source.sourceCode}` : ""}
                                  </small>
                                </li>
                              );
                            })}
                          </ol>
                        </div>

                        <div className={styles.dossierArticlePlanConvertedActions}>
                          <a
                            href={`/admin/editorial/artigos?articleId=${encodeURIComponent(plan.editorialArticleId)}`}
                          >
                            Abrir rascunho editorial
                          </a>
                          <span>
                            O plano e as fontes ficaram congelados para preservar a proveniência deste artigo.
                          </span>
                        </div>

                        {plan.generation ? (
                          <div className={styles.dossierArticlePlanDraftAction}>
                            <strong>Primeira versão gerada</strong>
                            <span>
                              {plan.generation.provider} · {plan.generation.model} · {formatDate(plan.generation.createdAt)}.
                              O artigo continua em rascunho e exige revisão humana.
                            </span>
                          </div>
                        ) : plan.editorialArticleStatus === "draft" && !plan.editorialArticleHasBody ? (
                          <form
                            action="/api/admin/editorial/redacao-automatica/dossies"
                            method="post"
                            className={styles.dossierArticlePlanDraftAction}
                          >
                            <input type="hidden" name="action" value="generate_article_plan_draft_body" />
                            <input type="hidden" name="dossier_id" value={dossier.id} />
                            <input type="hidden" name="article_plan_id" value={plan.id} />
                            <button type="submit">Gerar primeira versão</button>
                            <span>
                              Usa apenas as fontes congeladas e as orientações humanas. Não publica, não traduz
                              e não substitui um rascunho que já contenha texto.
                            </span>
                          </form>
                        ) : (
                          <div className={styles.dossierArticlePlanDraftAction}>
                            <strong>Geração automática indisponível</strong>
                            <span>
                              O rascunho já contém texto ou deixou de estar no estado Rascunho. Esta fase não
                              substitui conteúdo editorial existente.
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                    <form
                      action="/api/admin/editorial/redacao-automatica/dossies"
                      method="post"
                      className={styles.dossierArticlePlanForm}
                    >
                      <input type="hidden" name="action" value="save_article_plan" />
                      <input type="hidden" name="dossier_id" value={dossier.id} />
                      <input type="hidden" name="article_plan_id" value={plan.id} />

                      <div className={styles.dossierArticlePlanGrid}>
                        <label className={styles.dossierArticlePlanTitle}>
                          <span>Título de trabalho</span>
                          <input name="working_title" defaultValue={plan.workingTitle} maxLength={180} required />
                        </label>

                        <label>
                          <span>Estado</span>
                          <select name="article_plan_status" defaultValue={plan.status}>
                            {Object.entries(articlePlanStatusLabels).map(([value, label]) => (
                              <option value={value} key={value}>{label}</option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Prioridade</span>
                          <input
                            type="number"
                            name="article_plan_priority"
                            min={1}
                            max={999}
                            step={1}
                            defaultValue={articlePlanPriority(plan.sortOrder, planIndex + 1)}
                            required
                          />
                        </label>

                        <label>
                          <span>Género</span>
                          <select name="article_kind" defaultValue={plan.articleKind}>
                            {Object.entries(articleKindLabels).map(([value, label]) => (
                              <option value={value} key={value}>{label}</option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Extensão</span>
                          <select name="length_mode" defaultValue={plan.lengthMode}>
                            {Object.entries(lengthModeLabels).map(([value, label]) => (
                              <option value={value} key={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className={styles.dossierArticlePlanInstructions}>
                        <span>Orientação específica deste artigo</span>
                        <textarea
                          name="editorial_instructions"
                          defaultValue={plan.editorialInstructions}
                          maxLength={12000}
                          rows={4}
                          placeholder="Define o ângulo, a hierarquia da informação e o resultado esperado para este artigo."
                        />
                      </label>

                      <fieldset className={styles.dossierArticlePlanSources}>
                        <legend>Fontes atribuídas</legend>
                        <p>
                          A mesma fonte pode servir vários artigos. Uma fonte excluída pode permanecer apenas onde já estava atribuída.
                        </p>
                        <ul className={styles.dossierArticlePlanSourceList}>
                          {dossier.sources.map((source, sourceIndex) => {
                            const isAssigned = assignedSourceIds.has(source.id);
                            const canSelect = source.included || isAssigned;

                            return (
                              <li
                                key={source.id}
                                className={!source.included ? styles.dossierArticlePlanSourceExcluded : undefined}
                              >
                                <label className={styles.dossierArticlePlanSourceChoice}>
                                  <input
                                    type="checkbox"
                                    name="article_plan_source_id"
                                    value={source.id}
                                    defaultChecked={isAssigned}
                                    disabled={!canSelect}
                                  />
                                  <span>
                                    <strong>{source.articleTitle}</strong>
                                    <small>
                                      {sourceNames.get(source.sourceCode) ?? source.sourceCode}
                                      {source.included ? " · Ativa" : " · Excluída do Dossiê"}
                                    </small>
                                  </span>
                                </label>
                                <label className={styles.dossierArticlePlanSourcePriority}>
                                  <span>Ordem</span>
                                  <input
                                    type="number"
                                    name={`article_plan_source_priority_${source.id}`}
                                    min={1}
                                    max={999}
                                    step={1}
                                    defaultValue={articlePlanSourcePriority(plan, source.id, sourceIndex + 1)}
                                    disabled={!canSelect}
                                  />
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </fieldset>

                      <div className={styles.dossierArticlePlanActions}>
                        <button type="submit">Guardar artigo planeado</button>
                        <span>Snapshot e proveniência não são alterados por esta operação.</span>
                      </div>
                    </form>
                        {plan.status === "ready" ? (
                          <form
                            action="/api/admin/editorial/redacao-automatica/dossies"
                            method="post"
                            className={styles.dossierArticlePlanDraftAction}
                          >
                            <input type="hidden" name="action" value="create_article_plan_draft" />
                            <input type="hidden" name="dossier_id" value={dossier.id} />
                            <input type="hidden" name="article_plan_id" value={plan.id} />
                            <button type="submit">Criar rascunho editorial</button>
                            <span>
                              O título será pré-preenchido. O corpo ficará vazio para redação humana no editor.
                            </span>
                          </form>
                        ) : null}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.inboxEmpty}>
              <strong>Ainda não existem artigos planeados</strong>
              <span>Cria o primeiro plano abaixo. Nenhum texto será gerado nesta fase.</span>
            </div>
          )}

          {articlePlansResult.ok && activeArticlePlanCount < 4 ? (
            <div className={styles.dossierArticlePlanCreate}>
              <div>
                <h3>Criar artigo planeado</h3>
                <p>O plano pode ser guardado sem fontes enquanto estiver em preparação.</p>
              </div>

              <form
                action="/api/admin/editorial/redacao-automatica/dossies"
                method="post"
                className={styles.dossierArticlePlanForm}
              >
                <input type="hidden" name="action" value="save_article_plan" />
                <input type="hidden" name="dossier_id" value={dossier.id} />

                <div className={styles.dossierArticlePlanGrid}>
                  <label className={styles.dossierArticlePlanTitle}>
                    <span>Título de trabalho</span>
                    <input
                      name="working_title"
                      maxLength={180}
                      required
                      placeholder="Ex.: FC Porto prepara o próximo jogo após a apresentação"
                    />
                  </label>

                  <label>
                    <span>Estado inicial</span>
                    <select name="article_plan_status" defaultValue="planned">
                      <option value="planned">Planeado</option>
                      <option value="ready">Pronto</option>
                    </select>
                  </label>

                  <label>
                    <span>Prioridade</span>
                    <input
                      type="number"
                      name="article_plan_priority"
                      min={1}
                      max={999}
                      step={1}
                      defaultValue={activeArticlePlanCount + 1}
                      required
                    />
                  </label>

                  <label>
                    <span>Género</span>
                    <select name="article_kind" defaultValue={dossier.articleKind}>
                      {Object.entries(articleKindLabels).map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
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
                </div>

                <label className={styles.dossierArticlePlanInstructions}>
                  <span>Orientação específica deste artigo</span>
                  <textarea
                    name="editorial_instructions"
                    maxLength={12000}
                    rows={4}
                    placeholder="Define o ângulo, a hierarquia da informação e o resultado esperado para este artigo."
                  />
                </label>

                <fieldset className={styles.dossierArticlePlanSources}>
                  <legend>Fontes iniciais</legend>
                  <p>Seleciona apenas fontes ativas. A ordem será congelada no plano, não no snapshot.</p>
                  {dossier.sources.some((source) => source.included) ? (
                    <ul className={styles.dossierArticlePlanSourceList}>
                      {dossier.sources.filter((source) => source.included).map((source, sourceIndex) => (
                        <li key={source.id}>
                          <label className={styles.dossierArticlePlanSourceChoice}>
                            <input type="checkbox" name="article_plan_source_id" value={source.id} />
                            <span>
                              <strong>{source.articleTitle}</strong>
                              <small>{sourceNames.get(source.sourceCode) ?? source.sourceCode}</small>
                            </span>
                          </label>
                          <label className={styles.dossierArticlePlanSourcePriority}>
                            <span>Ordem</span>
                            <input
                              type="number"
                              name={`article_plan_source_priority_${source.id}`}
                              min={1}
                              max={999}
                              step={1}
                              defaultValue={sourceIndex + 1}
                            />
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.inboxEmpty}>
                      <strong>Sem fontes ativas</strong>
                      <span>Podes criar o plano em preparação e atribuir fontes depois de as reativares.</span>
                    </div>
                  )}
                </fieldset>

                <div className={styles.dossierArticlePlanActions}>
                  <button type="submit">Criar artigo planeado</button>
                  <span>Não será criado rascunho nem executada geração automática.</span>
                </div>
              </form>
            </div>
          ) : articlePlansResult.ok ? (
            <div className={styles.dossierArticlePlanLimit}>
              <strong>Limite de quatro artigos ativos atingido</strong>
              <span>Cancela um plano ativo antes de criar ou reativar outro.</span>
            </div>
          ) : null}
        </section>

        <section
          className={`${styles.section} ${styles.dossierAddSourcesSection}`}
          aria-labelledby="dossier-add-sources-title"
        >
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Ampliação controlada</p>
              <h2 id="dossier-add-sources-title">Acrescentar fontes</h2>
            </div>
            <p>
              As novas fontes congelam o snapshot atual. As fontes já guardadas mantêm os snapshots anteriores.
            </p>
          </div>

          {!inboxResult.ok ? (
            <div className={styles.readError}>
              <strong>Caixa de entrada indisponível</strong>
              <span>Não foi possível procurar novas fontes neste momento.</span>
            </div>
          ) : availableSources.length > 0 ? (
            <form
              action="/api/admin/editorial/redacao-automatica/dossies"
              method="post"
              className={styles.dossierAddSourcesForm}
            >
              <input type="hidden" name="action" value="add_sources" />
              <input type="hidden" name="dossier_id" value={dossier.id} />

              <ul className={styles.dossierAvailableSourceList}>
                {availableSources.map((article) => (
                  <li key={article.id}>
                    <div className={styles.dossierAvailableSourceHeading}>
                      <div>
                        <span>{sourceNames.get(article.sourceCode) ?? article.sourceCode}</span>
                        <strong>{article.title}</strong>
                      </div>
                      <small>{processingStatusLabels[article.processingStatus]}</small>
                    </div>

                    <dl>
                      <div><dt>Deteção</dt><dd>{formatDate(article.detectedAt)}</dd></div>
                      <div><dt>Snapshot atual</dt><dd>{article.latestSnapshotId ?? "—"}</dd></div>
                    </dl>

                    <div className={styles.dossierAvailableSourceControls}>
                      <label className={styles.dossierSourceIncluded}>
                        <input type="checkbox" name="newsroom_article_id" value={article.id} />
                        <span>Acrescentar ao Dossiê</span>
                      </label>

                      <label>
                        <span>Papel inicial</span>
                        <select
                          name={`source_add_role_${article.id}`}
                          defaultValue="complementary"
                        >
                          {Object.entries(roleLabels).map(([value, label]) => (
                            <option value={value} key={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <a href={`/admin/editorial/redacao-automatica?articleId=${encodeURIComponent(article.id)}`}>
                      Abrir artigo-fonte
                    </a>
                  </li>
                ))}
              </ul>

              <button type="submit">Acrescentar fontes selecionadas</button>
            </form>
          ) : (
            <div className={styles.inboxEmpty}>
              <strong>Sem novas fontes disponíveis nesta página</strong>
              <span>
                As fontes já pertencentes ao Dossiê são geridas acima, mesmo quando estão excluídas.
              </span>
            </div>
          )}

          {inboxResult.ok && (inboxResult.value.hasPreviousPage || inboxResult.value.hasNextPage) ? (
            <nav className={styles.pagination} aria-label="Paginação das fontes disponíveis">
              {inboxResult.value.hasPreviousPage ? (
                <a href={`?source_page=${inboxResult.value.page - 1}`}>Página anterior</a>
              ) : <span />}
              <span>Página {inboxResult.value.page}</span>
              {inboxResult.value.hasNextPage ? (
                <a href={`?source_page=${inboxResult.value.page + 1}`}>Página seguinte</a>
              ) : <span />}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
