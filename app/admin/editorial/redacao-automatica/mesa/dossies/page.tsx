import Link from "next/link";
import { notFound } from "next/navigation";
import {
  isMesaUuid,
  loadMesaDossierOrganization,
} from "@/lib/redacao-automatica/newsroom-mesa-organization";
import { isMesaMaterialKey } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";
import {
  MesaDossierSelectionToggle,
  MesaSelectionProvider,
  MesaSelectionTray,
} from "../_mesa-selection-client";
import styles from "../mesa.module.css";

export const dynamic = "force-dynamic";

/** An editorial group reads only its concrete key, versions and source identities. */
export default async function MesaDossierPage({ searchParams }: Readonly<{
  searchParams: Promise<{ material?: string; version?: string }>;
}>) {
  const { material: key, version: requestedVersion } = await searchParams;
  if (!isMesaMaterialKey(key) || (requestedVersion !== undefined && !isMesaUuid(requestedVersion))) {
    notFound();
  }
  let scoped;
  try {
    scoped = await loadMesaDossierOrganization(key, requestedVersion);
  } catch {
    return <main className={styles.shell}><section className={styles.errorState} role="alert">
      <h1>Dossiê indisponível</h1>
      <p>Não foi possível verificar o grupo e o seu histórico. Nenhum material foi alterado.</p>
      <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
    </section></main>;
  }
  if (!scoped) notFound();

  const { group, versions, origins, themes, sources, baseHref } = scoped;
  const byId = new Map(sources.map((row) => [row.newsroomArticleId, row]));
  const classificationKeys = new Set(group.sources.map((ref) => (
    byId.get(ref.newsroomArticleId)?.classification.classificationKey ?? null
  )));
  const classificationKey = classificationKeys.size === 1 ? [...classificationKeys][0] : null;
  const hrefForVersion = (id: string) => (
    `/admin/editorial/redacao-automatica/mesa/dossies?material=${encodeURIComponent(key)}&version=${id}`
  );

  return <main className={styles.shell}><div className={styles.container}>
    <MesaSelectionProvider themes={themes}>
      <header className={styles.hero}><div><p className={styles.eyebrow}>Dossiê · grupo editorial</p><h1>{group.title}</h1></div>
        <nav className={styles.heroLinks}><Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link></nav></header>
      <section className={`${styles.workspaceChrome} ${styles.dossierReader}`}>
        <div className={styles.controlStrip}>
          <span>{group.sources.length} fontes distintas · {group.articleIds.length} artigos publicados</span>
          <MesaDossierSelectionToggle material={{
            key,
            versionId: group.versionId,
            sources: group.sources,
            title: group.title,
            classificationKey,
          }} />
        </div>
        <section aria-label="Fontes do grupo"><ol>
          {group.sources.map((ref) => {
            const source = byId.get(ref.newsroomArticleId);
            return <li key={ref.newsroomArticleId}>
              <strong>{source?.title ?? "Fonte conservada"}</strong>
              <p>Snapshot: {ref.newsroomSnapshotId}</p>
              {source?.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">Fonte original</a> : null}
            </li>;
          })}
        </ol></section>
        <details className={styles.themeAllSources}>
          <summary>Artigos Jornada associados ({group.articleIds.length})</summary><ol>
            {group.articleIds.map((id) => <li key={id}>
              <Link href={`/admin/editorial/artigos?articleId=${id}`}>Abrir artigo {id}</Link>
            </li>)}
          </ol>
        </details>
        <details className={styles.themeAllSources}><summary>Histórico e associações</summary>
          <p>Esta seleção usa apenas a versão mostrada. As versões e produções anteriores não são substituídas.</p>
          {versions.length ? <ol>{versions.map((row) => <li key={row.id}>
            <Link href={hrefForVersion(row.id)}>
              {row.id === group.versionId ? "Versão mostrada" : "Consultar versão"}: {row.source_refs.length} fontes · {row.article_ids.length} artigos
            </Link> · {row.publication_event_id ? "consolidada após publicação" : "referência de origem"}
          </li>)}</ol> : <p>Grupo recuperado do registo original; ainda sem novas revisões.</p>}
          {origins.map((origin) => <p key={origin.id}>
            <Link href={`/admin/editorial/redacao-automatica/mesa/dossies?material=${encodeURIComponent(origin.material_key)}&version=${origin.parent_version_id}`}>
              Dossiê de origem: {origin.title}
            </Link>
          </p>)}
          {themes.map((theme) => <p key={theme.id}>
            <Link href={`/admin/editorial/redacao-automatica/mesa/temas/${theme.id}`}>{theme.title}</Link> · versão própria conservada
          </p>)}
          {baseHref ? <p><Link href={baseHref}>
            Abrir {key.startsWith("package:") ? "lote de origem, que pode conter outros grupos" : "produção de origem, sem alterações"}
          </Link></p> : null}
          {group.href && group.href !== baseHref ? <p><Link href={group.href}>Abrir produção desta revisão</Link></p> : null}
        </details>
        <MesaSelectionTray />
      </section>
    </MesaSelectionProvider>
  </div></main>;
}
