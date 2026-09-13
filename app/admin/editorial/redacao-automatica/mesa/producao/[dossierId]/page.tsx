import Link from "next/link";
import { notFound } from "next/navigation";

import {
  loadEditorialDossierProduction,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import {
  editorialMesaWorkspaceInitialOutputCount,
  editorialMesaWorkspaceVisualSourceOrder,
} from "@/lib/redacao-automatica/editorial-mesa-workspace-defaults";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

import {
  MesaProductionWorkspaceClient,
} from "./_workspace-client";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";

type ProductionWorkspacePageProps = Readonly<{
  params: Promise<{ dossierId: string }>;
}>;

function ReadError({ message = "Não foi possível reconstruir esta produção a partir do estado persistente." }: Readonly<{ message?: string }>) {
  return (
    <main className={styles.shell}>
      <section className={styles.errorState} role="alert">
        <p>Mesa da Redação</p>
        <h1>Workspace indisponível</h1>
        <p>{message}</p>
        <Link href="/admin/editorial/redacao-automatica/mesa">Voltar à Mesa</Link>
      </section>
    </main>
  );
}

export default async function ProductionWorkspacePage({
  params,
}: ProductionWorkspacePageProps) {
  const { dossierId } = await params;
  const productionResult = await loadEditorialDossierProduction(dossierId, {
    includeParentTheme: true,
  });
  if (!productionResult.ok) return <ReadError message={productionResult.error.message} />;
  if (!productionResult.value) notFound();

  const {
    dossier,
    plans,
    workspace: production,
    parentThemeId,
    organizationReadable,
  } = productionResult.value;
  const context = production.mesaContext;
  if (context?.workspaceState && context.workspaceState !== "active") notFound();
  const sourceNames = new Map(
    listRegisteredSources().map((source) => [source.code, source.name]),
  );
  const includedSourceCount = dossier.sources.filter((source) => source.included).length;

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.breadcrumb}>Admin · Editorial · Redação automática · Mesa</p>
            <h1>Produção</h1>
            <span>Preparar artigos a partir do material selecionado.</span>
          </div>
          <nav aria-label="Navegação do workspace">
            <Link className={styles.backLink} href="/admin/editorial/redacao-automatica/mesa">
              <span aria-hidden="true">←</span> Voltar à Mesa
            </Link>
            <details className={styles.moreNavigation}>
              <summary aria-label="Mais destinos">•••</summary>
              <div>
                {parentThemeId ? (
                  <Link href={"/admin/editorial/redacao-automatica/mesa/temas/" + parentThemeId}>
                    Abrir Tema
                  </Link>
                ) : null}
                <Link href={"/admin/editorial/redacao-automatica/dossies/" + encodeURIComponent(dossier.id)}>
                  Gestão avançada
                </Link>
                <Link href="/admin/editorial/artigos">Artigos</Link>
              </div>
            </details>
          </nav>
        </header>

        {!organizationReadable ? (
          <p className={styles.alert} role="alert">
            Não foi possível verificar toda a organização da Mesa. As relações persistidas não foram alteradas.
          </p>
        ) : null}
        <MesaProductionWorkspaceClient
          dossier={{
            id: dossier.id,
            articleKind: dossier.articleKind,
            lengthMode: dossier.lengthMode,
            outputCount: dossier.outputCount,
            initialOutputCount: production.contextMode === "contexts"
              ? production.productionContexts.length
              : editorialMesaWorkspaceInitialOutputCount(
                  context?.selectionPayload,
                  includedSourceCount,
                ),
            workspaceContractVersion: context?.workspaceContractVersion === 2 ? 2 : 1,
            contextMode: production.contextMode,
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
          productionContexts={production.productionContexts}
          planContexts={production.planContexts}
          visualSourceOrder={editorialMesaWorkspaceVisualSourceOrder(
            context?.selectionPayload,
            context?.materialRefs,
            dossier.sources.filter((source) => source.included).map((source) => source.newsroomArticleId),
          )}
        />
      </div>
    </main>
  );
}
