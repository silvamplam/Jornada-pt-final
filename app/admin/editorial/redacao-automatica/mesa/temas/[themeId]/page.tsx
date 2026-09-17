import Link from "next/link";
import { notFound } from "next/navigation";
import {
  isMesaUuid,
  loadMesaThemeOrganization,
} from "@/lib/redacao-automatica/newsroom-mesa-organization";
import { MesaSelectionProvider, MesaSelectionTray } from "../../_mesa-selection-client";
import { MesaSourceWindow, MesaDossierCardView } from "../../_mesa-organization-client";
import { MesaSourceItem } from "../../_mesa-source-item";
import { ThemeContinuityClient } from "./_theme-continuity-client";
import styles from "../../mesa.module.css";

export const dynamic = "force-dynamic";

export default async function MesaThemePage({
  params,
}: Readonly<{ params: Promise<{ themeId: string }> }>) {
  const { themeId } = await params;
  if (!isMesaUuid(themeId)) notFound();
  let scoped;
  try {
    scoped = await loadMesaThemeOrganization(themeId);
  } catch {
    return <main className={styles.shell}><section className={styles.errorState} role="alert">
      <h1>Tema indisponível</h1>
      <p>Não foi possível ler a organização persistida. Não foi alterado nenhum material.</p>
      <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
    </section></main>;
  }
  if (!scoped) notFound();

  const { records, organization } = scoped;
  const theme = records.themes[0];
  const members = records.themeSources;
  const dossierIds = new Set(records.themeDossiers.map((link) => link.dossier_id));
  const dossierMembers = records.dossierSources.filter((source) => (
    dossierIds.has(source.dossier_id) && source.included
  ));
  const pinnedVersionIds = new Set(records.themeMaterials?.map((row) => row.version_id));
  const pinnedSources = records.materialVersions
    ?.filter((row) => pinnedVersionIds.has(row.id))
    .flatMap((row) => row.source_refs) ?? [];
  const currentThemeSourceIds = new Set(members.map((member) => member.newsroom_article_id));
  const context = organization.themes[0];
  const inDossier = new Set(context.dossiers.flatMap((card) => (
    card.material?.sources.map((ref) => ref.newsroomArticleId) ?? []
  )));
  const allSources = scoped.sources.map((source) => {
    const reference = members.find((member) => (
      member.newsroom_article_id === source.newsroomArticleId
    ))?.reference_snapshot_id ?? null;
    const changed = Boolean(reference && source.snapshot && reference !== source.snapshot.id);
    return {
      ...source,
      comparisonSnapshotId: reference,
      sourceUpdated: changed,
      sourceUpdatedAt: changed ? source.snapshot?.extractedAt ?? null : null,
    };
  });
  const sources = allSources.filter((source) => (
    currentThemeSourceIds.has(source.newsroomArticleId)
    || pinnedSources.some((ref) => ref.newsroomArticleId === source.newsroomArticleId)
    || dossierMembers.some((member) => member.newsroom_article_id === source.newsroomArticleId)
  ));
  const loose = sources.filter((source) => !inDossier.has(source.newsroomArticleId));

  return <main className={styles.shell}>
    <div className={styles.container}>
      <MesaSelectionProvider themes={organization.themes} themeContext={{ id: themeId, title: theme.title }}>
        <header className={styles.hero}><div className={styles.heroIdentity}><div>
          <p className={styles.eyebrow}>Tema · {theme.status === "archived" ? "Arquivado" : "Cobertura em trabalho"}</p>
          <h1>{theme.title}</h1>
        </div></div><nav className={styles.heroLinks}><Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link></nav></header>
        <section className={styles.workspaceChrome}>
          <ThemeContinuityClient themeId={themeId} disabled={theme.status !== "open"} />
          <div className={styles.controlStrip}>
            <span>{sources.length} fontes · {context.dossiers.length} Dossiês · {context.articleCount} artigos publicados</span>
            <span>As fontes organizadas não regressam às listas gerais.</span>
          </div>
          <section className={styles.sourcesWorkspace}>
            <section className={styles.sourcePanel} data-lifecycle="new">
              <header className={styles.panelHeader}><h2>MATERIAL DO TEMA</h2><span>{loose.length} fontes fora dos Dossiês</span></header>
              <MesaSourceWindow
                storageKey={`jornada.mesa.tema.${themeId}.material`}
                empty="O material reunido está nos Dossiês deste Tema."
                items={loose.map((source) => <MesaSourceItem
                  key={source.newsroomArticleId}
                  item={source}
                  themeId={themeId}
                  allowDiscard={false}
                  allowRemove
                />)}
              />
              {inDossier.size > 0 ? <details className={styles.themeAllSources}>
                <summary>Consultar todas as fontes do Tema ({sources.length})</summary>
                <ol className={styles.sourceGrid}>{sources.map((source) => <MesaSourceItem
                  key={source.newsroomArticleId}
                  item={source}
                  themeId={themeId}
                  allowDiscard={false}
                />)}</ol>
              </details> : null}
              <p className={styles.emptyPanel}>
                <Link href="/admin/editorial/redacao-automatica/mesa?tab=novas&classification=all">
                  Adicionar material a partir da Mesa
                </Link>
              </p>
            </section>
            <section className={styles.sourcePanel} data-organization="true">
              <header className={styles.panelHeader}><h2>DOSSIÊS</h2></header>
              <MesaSourceWindow
                storageKey={`jornada.mesa.tema.${themeId}.dossies`}
                empty="Seleciona fontes deste Tema para preparar a primeira produção."
                items={context.dossiers.map((card) => <li key={card.id} className={styles.organizationItem}>
                  <MesaDossierCardView card={card} themes={organization.themes} />
                </li>)}
              />
            </section>
          </section>
          {context.articleCount > 0 ? (
            <p className={styles.selectionMessage} role="status">
              Este Tema já tem artigos publicados. Para voltar à Produção, usa «Voltar a levar à Produção» em Continuidade editorial acima; os artigos existentes serão revistos antes de qualquer artigo novo.
            </p>
          ) : <MesaSelectionTray />}
        </section>
      </MesaSelectionProvider>
    </div>
  </main>;
}
