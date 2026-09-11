import Link from "next/link";
import { notFound } from "next/navigation";
import { isMesaUuid, readMesaOrganizationRecords } from "@/lib/redacao-automatica/newsroom-mesa-organization";
import { buildMesaOrganization } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { loadOperationalDeskReadModel } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { MesaSelectionProvider, MesaSelectionTray } from "../../_mesa-selection-client";
import { MesaSourceWindow, MesaDossierCardView } from "../../_mesa-organization-client";
import { MesaSourceItem } from "../../_mesa-source-item";
import styles from "../../mesa.module.css";

export const dynamic = "force-dynamic";

export default async function MesaThemePage({ params }: Readonly<{ params: Promise<{ themeId: string }> }>) {
  const { themeId } = await params;
  if (!isMesaUuid(themeId)) notFound();
  let records;
  try { records = await readMesaOrganizationRecords(); }
  catch { return <main className={styles.shell}><section className={styles.errorState} role="alert">
    <h1>Tema indisponível</h1><p>Não foi possível ler a organização persistida. Não foi alterado nenhum material.</p>
    <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
  </section></main>; }
  const theme = records.themes.find((item) => item.id === themeId);
  if (!theme) notFound();
  const members = records.themeSources.filter((member) => member.theme_id === themeId);
  const dossierIds = new Set(records.themeDossiers.filter((link) => link.theme_id === themeId).map((link) => link.dossier_id));
  const dossierMembers = records.dossierSources.filter((source) => dossierIds.has(source.dossier_id) && source.included);
  const pinnedVersionIds = new Set(records.themeMaterials?.filter((row) => row.theme_id === themeId).map((row) => row.version_id));
  const pinnedSources = records.materialVersions?.filter((row) => pinnedVersionIds.has(row.id)).flatMap((row) => row.source_refs) ?? [];
  const sourceIds = [...new Set([...pinnedSources.map((ref) => ref.newsroomArticleId), ...members.map((member) => member.newsroom_article_id), ...dossierMembers.map((source) => source.newsroom_article_id)])];
  const material = await loadOperationalDeskReadModel({ sourceIds });
  if (!material.ok) return <main className={styles.shell}><section className={styles.errorState} role="alert">
    <h1>Material indisponível</h1><p>{material.error.message}</p><Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
  </section></main>;
  const organization = buildMesaOrganization(records, material.value.sources);
  const context = organization.themes.find((item) => item.id === themeId)!;
  const inDossier = new Set(context.dossiers.flatMap((card) => card.material?.sources.map((ref) => ref.newsroomArticleId) ?? []));
  const sources = material.value.sources.map((source) => {
    const reference = members.find((member) => member.newsroom_article_id === source.newsroomArticleId)?.reference_snapshot_id ?? null;
    const changed = Boolean(reference && source.snapshot && reference !== source.snapshot.id);
    return { ...source, comparisonSnapshotId: reference, sourceUpdated: changed,
      sourceUpdatedAt: changed ? source.snapshot?.extractedAt ?? null : null };
  });
  const loose = sources.filter((source) => !inDossier.has(source.newsroomArticleId));
  return <main className={styles.shell}>
    <div className={styles.container}>
      <MesaSelectionProvider themes={organization.themes} themeContext={{ id: themeId, title: theme.title }}>
        <header className={styles.hero}><div className={styles.heroIdentity}><div>
          <p className={styles.eyebrow}>Tema · {theme.status === "archived" ? "Arquivado" : "Cobertura em trabalho"}</p>
          <h1>{theme.title}</h1>
        </div></div><nav className={styles.heroLinks}><Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link></nav></header>
        <section className={styles.workspaceChrome}>
          <div className={styles.controlStrip}><span>{sources.length} fontes · {context.dossiers.length} Dossiês · {context.articleCount} artigos publicados</span>
            <span>As fontes organizadas não regressam às listas gerais.</span></div>
          <section className={styles.sourcesWorkspace}>
            <section className={styles.sourcePanel} data-lifecycle="new">
              <header className={styles.panelHeader}><h2>MATERIAL DO TEMA</h2><span>{loose.length} fontes fora dos Dossiês</span></header>
              <MesaSourceWindow storageKey={`jornada.mesa.tema.${themeId}.material`} empty="O material reunido está nos Dossiês deste Tema."
                items={loose.map((source) => <MesaSourceItem key={source.newsroomArticleId} item={source} themeId={themeId} allowDiscard={false} allowRemove />)} />
              {inDossier.size > 0 ? <details className={styles.themeAllSources}><summary>Consultar todas as fontes do Tema ({sources.length})</summary>
                <ol className={styles.sourceGrid}>{sources.map((source) => <MesaSourceItem key={source.newsroomArticleId}
                  item={source} themeId={themeId} allowDiscard={false} />)}</ol>
              </details> : null}
            </section>
            <section className={styles.sourcePanel} data-organization="true"><header className={styles.panelHeader}><h2>DOSSIÊS</h2></header>
              <MesaSourceWindow storageKey={`jornada.mesa.tema.${themeId}.dossies`} empty="Seleciona fontes deste Tema para preparar a primeira produção."
                items={context.dossiers.map((card) => <li key={card.id} className={styles.organizationItem}><MesaDossierCardView card={card} themes={organization.themes} /></li>)} />
            </section>
          </section>
          {(organization.preparedProductions ?? []).some((card) => card.themeId === themeId) ? <details className={styles.themeAllSources}>
            <summary>Produções preparadas deste Tema</summary>
            {(organization.preparedProductions ?? []).filter((card) => card.themeId === themeId).map((card) =>
              <MesaDossierCardView key={card.id} card={{ ...card, material: undefined }} />)}
          </details> : null}
          <MesaSelectionTray />
        </section>
      </MesaSelectionProvider>
    </div>
  </main>;
}
