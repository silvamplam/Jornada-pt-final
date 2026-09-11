import Link from "next/link";
import { notFound } from "next/navigation";
import { isMesaUuid, readMesaOrganizationRecords } from "@/lib/redacao-automatica/newsroom-mesa-organization";
import { isMesaMaterialKey, mergeMesaSourceRefs, type MesaEditorialGroup } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";
import { loadOperationalDeskReadModel } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { buildMesaOrganization } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { MesaSelectionProvider, MesaSelectionTray, MesaDossierSelectionToggle } from "../_mesa-selection-client";
import styles from "../mesa.module.css";

export const dynamic = "force-dynamic";

/** An editorial group has its own reader. The original batch/production URLs are never replaced. */
export default async function MesaDossierPage({ searchParams }: Readonly<{
  searchParams: Promise<{ material?: string; version?: string }>;
}>) {
  const { material: key, version: requestedVersion } = await searchParams;
  if (!isMesaMaterialKey(key) || (requestedVersion !== undefined && !isMesaUuid(requestedVersion))) notFound();
  let records;
  try { records = await readMesaOrganizationRecords(); }
  catch { return <main className={styles.shell}><section className={styles.errorState} role="alert">
    <h1>Dossiê indisponível</h1><p>Não foi possível verificar o grupo e o seu histórico. Nenhum material foi alterado.</p>
    <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
  </section></main>; }
  const versions = (records.materialVersions ?? []).filter((row) => row.material_key === key)
    .sort((a, b) => Number(Boolean(b.publication_event_id)) - Number(Boolean(a.publication_event_id)) || b.revision - a.revision);
  const version = requestedVersion ? versions.find((row) => row.id === requestedVersion) : versions[0];
  if (requestedVersion && !version) notFound();
  let base = records.packageGroups?.find((row) => row.key === key);
  if (key.startsWith("dossier:")) {
    const id = key.slice(8);
    const native = records.dossiers.find((row) => row.id === id);
    if (native) base = { key, versionId: null, title: native.title,
      href: `/admin/editorial/redacao-automatica/mesa/producao/${id}`,
      sources: mergeMesaSourceRefs([records.dossierSources.filter((row) => row.dossier_id === id && row.included)
        .map((row) => ({ newsroomArticleId: row.newsroom_article_id, newsroomSnapshotId: row.newsroom_snapshot_id }))]),
      articleIds: records.publishedLinks.filter((row) => row.dossier_id === id).map((row) => row.editorial_article_id) };
  }
  const group: MesaEditorialGroup | undefined = version ? { key, versionId: version.id, title: version.title,
    sources: version.source_refs, articleIds: version.article_ids,
    href: version.production_dossier_id ? `/admin/editorial/redacao-automatica/mesa/producao/${version.production_dossier_id}` : base?.href ?? "" } : base;
  if (!group || group.sources.length < 2 || (!version && group.articleIds.length === 0)) notFound();
  const result = await loadOperationalDeskReadModel({ sourceIds: group.sources.map((ref) => ref.newsroomArticleId) });
  if (!result.ok) return <main className={styles.shell}><section className={styles.errorState} role="alert">
    <h1>Fontes indisponíveis</h1><p>As referências do Dossiê foram conservadas; a leitura não foi concluída.</p>
    <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
  </section></main>;
  const byId = new Map(result.value.sources.map((row) => [row.newsroomArticleId, row]));
  const organization = buildMesaOrganization(records, result.value.sources);
  const classificationKeys = new Set(group.sources.map((ref) => byId.get(ref.newsroomArticleId)?.classification.classificationKey ?? null));
  const classificationKey = classificationKeys.size === 1 ? [...classificationKeys][0] : null;
  const associationIds = new Set((records.themeMaterials ?? []).filter((row) => row.material_key === key).map((row) => row.theme_id));
  if (key.startsWith("dossier:")) for (const row of records.themeDossiers) if (row.dossier_id === key.slice(8)) associationIds.add(row.theme_id);
  const associations = organization.themes.filter((theme) => associationIds.has(theme.id));
  const origins = version?.publication_event_id ? (records.materialVersions ?? []).filter((row) =>
    row.publication_event_id === version.publication_event_id && row.parent_version_id) : [];
  const hrefForVersion = (id: string) => `/admin/editorial/redacao-automatica/mesa/dossies?material=${encodeURIComponent(key)}&version=${id}`;
  return <main className={styles.shell}><div className={styles.container}>
    <MesaSelectionProvider themes={organization.themes}>
      <header className={styles.hero}><div><p className={styles.eyebrow}>Dossiê · grupo editorial</p><h1>{group.title}</h1></div>
        <nav className={styles.heroLinks}><Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link></nav></header>
      <section className={`${styles.workspaceChrome} ${styles.dossierReader}`}>
        <div className={styles.controlStrip}><span>{group.sources.length} fontes distintas · {group.articleIds.length} artigos publicados</span>
          <MesaDossierSelectionToggle material={{ key, versionId: group.versionId, sources: group.sources, title: group.title, classificationKey }} />
        </div>
        <section aria-label="Fontes do grupo"><ol>
          {group.sources.map((ref) => { const source = byId.get(ref.newsroomArticleId); return <li key={ref.newsroomArticleId}>
            <strong>{source?.title ?? "Fonte conservada"}</strong><p>Snapshot: {ref.newsroomSnapshotId}</p>
            {source?.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">Fonte original</a> : null}
          </li>; })}
        </ol></section>
        <details className={styles.themeAllSources}><summary>Artigos Jornada associados ({group.articleIds.length})</summary><ol>
          {group.articleIds.map((id) => <li key={id}><Link href={`/admin/editorial/artigos?articleId=${id}`}>Abrir artigo {id}</Link></li>)}
        </ol></details>
        <details className={styles.themeAllSources}><summary>Histórico e associações</summary>
          <p>Esta seleção usa apenas a versão mostrada. As versões e produções anteriores não são substituídas.</p>
          {versions.length ? <ol>{versions.map((row) => <li key={row.id}><Link href={hrefForVersion(row.id)}>
            {row.id === group.versionId ? "Versão mostrada" : "Consultar versão"}: {row.source_refs.length} fontes · {row.article_ids.length} artigos
          </Link> · {row.publication_event_id ? "consolidada após publicação" : "referência de origem"}</li>)}</ol> : <p>Grupo recuperado do registo original; ainda sem novas revisões.</p>}
          {origins.map((origin) => <p key={origin.id}><Link href={`/admin/editorial/redacao-automatica/mesa/dossies?material=${encodeURIComponent(origin.material_key)}&version=${origin.parent_version_id}`}>
            Dossiê de origem: {origin.title}
          </Link></p>)}
          {associations.map((theme) => <p key={theme.id}><Link href={`/admin/editorial/redacao-automatica/mesa/temas/${theme.id}`}>{theme.title}</Link> · versão própria conservada</p>)}
          {base?.href ? <p><Link href={base.href}>Abrir {key.startsWith("package:") ? "lote de origem, que pode conter outros grupos" : "produção de origem, sem alterações"}</Link></p> : null}
          {group.href && group.href !== base?.href ? <p><Link href={group.href}>Abrir produção desta revisão</Link></p> : null}
        </details>
        <MesaSelectionTray />
      </section>
    </MesaSelectionProvider>
  </div></main>;
}
