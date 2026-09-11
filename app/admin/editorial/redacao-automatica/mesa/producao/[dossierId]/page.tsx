import Link from "next/link";
import { notFound } from "next/navigation";

import {
  listEditorialDossierArticlePlans,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import {
  getEditorialDossierProductionWorkspace,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-repository";
import {
  getEditorialDossierById,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

import { MesaProductionWorkspaceClient } from "./_workspace-client";
import { fetchSupabaseAdminTable } from "@/lib/supabase";
import { loadOperationalDeskReadModel } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { MesaSourceChanges } from "../../_mesa-source-changes";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";

type ProductionWorkspacePageProps = Readonly<{
  params: Promise<{ dossierId: string }>;
}>;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(date);
}

function ReadError() {
  return (
    <main className={styles.shell}>
      <section className={styles.errorState} role="alert">
        <p>Mesa da Redação</p>
        <h1>Workspace indisponível</h1>
        <p>Não foi possível reconstruir esta produção a partir do estado persistente.</p>
        <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
      </section>
    </main>
  );
}

export default async function ProductionWorkspacePage({
  params,
}: ProductionWorkspacePageProps) {
  const { dossierId } = await params;
  const [dossierResult, plansResult, productionResult] = await Promise.all([
    getEditorialDossierById(dossierId),
    listEditorialDossierArticlePlans(dossierId),
    getEditorialDossierProductionWorkspace(dossierId),
  ]);

  if (!dossierResult.ok || !plansResult.ok || !productionResult.ok) {
    return <ReadError />;
  }
  if (!dossierResult.value || !productionResult.value) notFound();

  const dossier = dossierResult.value;
  const plans = plansResult.value;
  const production = productionResult.value;
  let parentRows: { theme_id: string }[] = [];
  let parentReadFailed = false;
  const [parentResult, currentSources] = await Promise.all([
    fetchSupabaseAdminTable<{ theme_id: string }>(
      `newsroom_editorial_theme_dossiers?select=theme_id&dossier_id=eq.${encodeURIComponent(dossierId)}&limit=1`,
    ).then((rows) => ({ ok: true as const, rows })).catch(() => ({ ok: false as const, rows: [] })),
    loadOperationalDeskReadModel({ sourceIds: dossier.sources.map((source) => source.newsroomArticleId) }),
  ]);
  parentRows = parentResult.rows;
  parentReadFailed = !parentResult.ok;
  const parentThemeId = parentRows[0]?.theme_id ?? null;
  const latestSources = new Map(currentSources.ok ? currentSources.value.sources.map((source) => [source.newsroomArticleId, source]) : []);

  const sourceNames = new Map(
    listRegisteredSources().map((source) => [source.code, source.name]),
  );

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div>
            <p>Mesa · Produção persistente</p>
            <h1>{dossier.title}</h1>
            <span>
              Dossiê {dossier.id} · atualizado {formatDate(dossier.updatedAt)}
            </span>
          </div>
          <nav aria-label="Navegação do workspace">
            <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
            {parentThemeId ? <Link href={`/admin/editorial/redacao-automatica/mesa/temas/${parentThemeId}`}>Voltar ao Tema</Link> : null}
            <Link href={`/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(dossier.id)}`}>
              Gestão legacy
            </Link>
            <Link href="/admin/editorial/artigos">Artigos</Link>
          </nav>
        </header>

        <section className={styles.summary} aria-label="Resumo da produção">
          <div><span>FONTES REUNIDAS</span><strong>{dossier.sources.length}</strong></div>
          <div><span>ARTIGOS DE CONTEXTO</span><strong>{production.publishedContexts.length}</strong></div>
          <div><span>IMAGENS</span><strong>{production.images.length}</strong></div>
          <div><span>ARTICLE PLANS</span><strong>{plans.length}</strong></div>
        </section>

        {parentReadFailed ? <p role="alert">Não foi possível verificar o Tema deste Dossiê. Confirma a migration de organização; não foi alterada nenhuma relação.</p> : null}
        {!currentSources.ok ? <p role="alert">Não foi possível verificar novas versões das fontes. Os snapshots desta produção foram preservados.</p> : null}
        <section className={styles.section} aria-labelledby="workspace-sources-title">
          <header className={styles.sectionHeader}>
            <div>
              <p>Material reunido</p>
              <h2 id="workspace-sources-title">Fontes desta produção</h2>
            </div>
            <span>O texto abaixo vem do snapshot explicitamente congelado em PREPARAR.</span>
          </header>

          {dossier.sources.length > 0 ? (
            <ol className={styles.sourceList}>
              {dossier.sources.map((source) => {
                const image = production.images.find(
                  (candidate) => candidate.origin === "newsroom"
                    && candidate.newsroomArticleId === source.newsroomArticleId,
                );
                const latest = latestSources.get(source.newsroomArticleId);
                return (
                  <li key={source.id}>
                    {image ? (
                      <img
                        src={image.frozenUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <div>
                      <header>
                        <span>{sourceNames.get(source.sourceCode) ?? source.sourceCode}</span>
                        <strong>{source.articleTitle}</strong>
                      </header>
                      <dl>
                        <div><dt>newsroom_article</dt><dd>{source.newsroomArticleId}</dd></div>
                        <div><dt>snapshot congelado</dt><dd>{source.newsroomSnapshotId}</dd></div>
                        <div><dt>hash</dt><dd>{source.snapshotContentHash}</dd></div>
                        <div><dt>extraído</dt><dd>{formatDate(source.snapshotExtractedAt)}</dd></div>
                        <div><dt>blocos úteis</dt><dd>{source.snapshotBodyBlockCount}</dd></div>
                      </dl>
                      {latest?.snapshot && latest.snapshot.id !== source.newsroomSnapshotId ? (
                        <MesaSourceChanges sourceId={source.newsroomArticleId} beforeId={source.newsroomSnapshotId}
                          afterId={latest.snapshot.id} title={source.articleTitle} detectedAt={latest.snapshot.extractedAt} />
                      ) : null}
                      <details className={styles.snapshotDetails}>
                        <summary>Ver conteúdo do snapshot</summary>
                        <div>
                          {source.snapshotBody.map((block, index) => block.type === "heading"
                            ? <h3 key={`${source.id}:block:${index}`}>{block.text}</h3>
                            : <p key={`${source.id}:block:${index}`}>{block.text}</p>)}
                        </div>
                      </details>
                      {source.articleUrl ? (
                        <a href={source.articleUrl} target="_blank" rel="noopener noreferrer">
                          Abrir fonte original
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.empty}>Esta produção foi preparada apenas com contexto publicado.</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="workspace-published-title">
          <header className={styles.sectionHeader}>
            <div>
              <p>Memória editorial canónica</p>
              <h2 id="workspace-published-title">PUBLICADAS de contexto</h2>
            </div>
            <span>Contexto não significa UPDATE. O destino é decidido por cada Article Plan.</span>
          </header>

          {production.publishedContexts.length > 0 ? (
            <ol className={styles.publishedList}>
              {production.publishedContexts.map((context) => {
                const image = production.images.find(
                  (candidate) => candidate.origin === "published"
                    && candidate.editorialArticleId === context.editorialArticleId,
                );
                return (
                  <li key={context.id}>
                    {image ? <img src={image.frozenUrl} alt="" loading="lazy" /> : null}
                    <div>
                      <span>editorial_article · {context.status}</span>
                      <strong>{context.title}</strong>
                      <small>{context.editorialArticleId}</small>
                      <small>Publicada {formatDate(context.publishedAt)}</small>
                      <Link href={`/admin/editorial/artigos?articleId=${encodeURIComponent(context.editorialArticleId)}`}>
                        Abrir artigo existente
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.empty}>Sem PUBLICADAS de contexto nesta produção.</p>
          )}
        </section>

        <MesaProductionWorkspaceClient
          dossier={{
            id: dossier.id,
            articleKind: dossier.articleKind,
            lengthMode: dossier.lengthMode,
          }}
          sources={dossier.sources.map((source) => ({
            id: source.id,
            newsroomArticleId: source.newsroomArticleId,
            title: source.articleTitle,
            sourceLabel: sourceNames.get(source.sourceCode) ?? source.sourceCode,
            included: source.included,
          }))}
          publishedContexts={production.publishedContexts}
          images={production.images}
          plans={plans}
        />
      </div>
    </main>
  );
}
