import { parseMesaProductionIntents } from "@/lib/redacao-automatica/newsroom-mesa-production-intents-contract";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  loadEditorialDossierProduction,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import {
  editorialMesaWorkspaceInitialOutputCount,
  editorialMesaWorkspaceVisualSourceOrder,
} from "@/lib/redacao-automatica/editorial-mesa-workspace-defaults";
import {
  parseThemeContinuityFrozenContract,
} from "@/lib/redacao-automatica/newsroom-theme-continuity-contract";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";
import { readMesaNewOutputGrouping } from "@/lib/redacao-automatica/newsroom-mesa-new-output-groups-repository";
import type { MesaNewOutputGrouping } from "@/lib/redacao-automatica/newsroom-mesa-new-output-groups";
import {
  getNewsroomArticleClassificationsByIds,
} from "@/lib/redacao-automatica/newsroom-article-classification-repository";

import {
  MesaProductionWorkspaceClient,
} from "./_workspace-client";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";

type ProductionWorkspacePageProps = Readonly<{
  params: Promise<{ dossierId: string }>;
  searchParams: Promise<{ grouping_fixture?: string }>;
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
  searchParams,
}: ProductionWorkspacePageProps) {
  const { dossierId } = await params;
  const query = await searchParams;
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
  const sourceClassifications = await getNewsroomArticleClassificationsByIds(
    dossier.sources.map((source) => source.newsroomArticleId),
  );
  if (!sourceClassifications.ok) {
    return <ReadError message="Não foi possível ler as classificações manuais das fontes desta Produção." />;
  }
  const classificationByArticleId = new Map(
    dossier.sources.map((source, index) => {
      const state = sourceClassifications.value[index];
      return [
        source.newsroomArticleId,
        state?.status === "classified"
          ? state.classification
          : null,
      ] as const;
    }),
  );
  const themeContinuity = parseThemeContinuityFrozenContract(context?.selectionPayload);
  const rawIntents = context?.selectionPayload && typeof context.selectionPayload === "object"
    ? (context.selectionPayload as Record<string, unknown>).productionIntents : undefined;
  const productionIntents = parseMesaProductionIntents(rawIntents);
  if (rawIntents !== undefined && (!productionIntents || productionIntents.dossierId !== dossierId)) {
    return <ReadError message="O plano de intenções desta Produção não é válido. A preparação foi preservada." />;
  }
  if (context?.workspaceState && context.workspaceState !== "active") notFound();
  const sourceNames = new Map(
    listRegisteredSources().map((source) => [source.code, source.name]),
  );
  const groupingMarker = context?.selectionPayload && typeof context.selectionPayload === "object"
    ? (context.selectionPayload as Record<string, unknown>).productionGroupingV2 : undefined;
  const expectsGrouping = Boolean(groupingMarker && typeof groupingMarker === "object"
    && (groupingMarker as Record<string, unknown>).version === 2);
  let newOutputGrouping: MesaNewOutputGrouping | null = null;
  try {
    newOutputGrouping = await readMesaNewOutputGrouping(dossierId);
  } catch {
    if (expectsGrouping) return <ReadError message="Não foi possível reconstruir o planeamento dos novos artigos." />;
  }
  if (expectsGrouping && !newOutputGrouping) {
    return <ReadError message="O planeamento dos novos artigos não está disponível." />;
  }
  const includedSourceCount = dossier.sources.filter((source) => source.included).length;
  const fixtureMode = process.env.NODE_ENV !== "production" && query.grouping_fixture === "1";
  const fixtureContextId = production.productionContexts[0]?.id ?? dossier.id;
  const fixtureSources = dossier.sources.filter((source) => source.included).slice(0, 4);
  const fixtureSourceRows = fixtureSources.map((source) => {
    const image = production.images.find((candidate) => (
      candidate.origin === "newsroom" && candidate.newsroomArticleId === source.newsroomArticleId
    )) ?? null;
    return {
      dossierSourceId: source.id,
      newsroomArticleId: source.newsroomArticleId,
      title: source.articleTitle,
      sourceLabel: sourceNames.get(source.sourceCode) ?? source.sourceCode,
      imageId: image?.id ?? null,
      imageUrl: image?.frozenUrl ?? null,
    };
  });
  const fixtureSyntheticSources = Array.from({ length: 11 }, (_, index) => ({
    dossierSourceId: `f2000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    newsroomArticleId: `f1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Fonte temática ${index + 1}`,
    sourceLabel: "Fonte",
    imageId: null,
    imageUrl: null,
  }));
  const fixtureAllSources = [...fixtureSourceRows, ...fixtureSyntheticSources];
  const fixtureThemeAId = "f4000000-0000-4000-8000-000000000001";
  const fixtureThemeBId = "f4000000-0000-4000-8000-000000000002";
  const fixtureThemeASeeds = fixtureAllSources.slice(0, 15).map((source) => source.newsroomArticleId);
  const fixtureThemeBSeeds = fixtureAllSources.slice(0, 8).map((source) => source.newsroomArticleId);
  const fixtureThemeGroups = [
    ...Array.from({ length: 5 }, (_, index) => ({ themeId: fixtureThemeAId, seeds: fixtureThemeASeeds, index })),
    ...Array.from({ length: 3 }, (_, index) => ({ themeId: fixtureThemeBId, seeds: fixtureThemeBSeeds, index: index + 5 })),
  ];
  const groupingFixture: MesaNewOutputGrouping | null = fixtureMode && fixtureSources.length === 4 ? {
    version: 2,
    dossierId: dossier.id,
    productionContextId: fixtureContextId,
    targetCount: 2,
    revision: 1,
    state: "planned",
    sources: fixtureAllSources,
    looseSourceIds: fixtureSourceRows.map((source) => source.newsroomArticleId),
    themes: [
      { themeId: fixtureThemeAId, title: "Tema A", position: 1, targetCount: 5, seedSourceIds: fixtureThemeASeeds },
      { themeId: fixtureThemeBId, title: "Tema B", position: 2, targetCount: 3, seedSourceIds: fixtureThemeBSeeds },
    ],
    groups: [
      ...fixtureThemeGroups.map((group) => ({
        groupId: `f3000000-0000-4000-8000-${String(group.index + 1).padStart(12, "0")}`,
        productionContextId: fixtureContextId,
        seedKind: "theme" as const,
        seedThemeId: group.themeId,
        seedSourceIds: group.seeds,
        position: group.index + 1,
        outputId: null,
        articlePlanId: null,
        state: "planned" as const,
      })),
      ...fixtureSources.map((source, index) => ({
      groupId: source.id,
      productionContextId: fixtureContextId,
      seedKind: "selection" as const,
      seedThemeId: null,
      seedSourceIds: [source.newsroomArticleId],
      position: fixtureThemeGroups.length + index + 1,
      outputId: null,
      articlePlanId: null,
      state: "planned" as const,
    })),
    ],
    existingOutputs: [1, 2].map((index) => ({
      slot: `EXISTING_0${index}`,
      kind: "existing" as const,
      outputId: `f5000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      productionContextId: fixtureContextId,
      targetEditorialArticleId: `f6000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      targetSlug: `artigo-existente-${index}`,
      targetTitle: `Artigo existente ${index}`,
      targetMatchdayId: null,
    })),
  } : null;
  const sourceMetadata = new Map(dossier.sources.map((source) => [source.newsroomArticleId, source]));
  const labelledGrouping = newOutputGrouping ? {
    ...newOutputGrouping,
    sources: newOutputGrouping.sources.map((source) => {
      const metadata = sourceMetadata.get(source.newsroomArticleId);
      return {
        ...source,
        sourceLabel: metadata ? sourceNames.get(metadata.sourceCode) ?? metadata.sourceCode : source.sourceLabel,
      };
    }),
  } : null;

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
            classificationKey: classificationByArticleId.get(source.newsroomArticleId)?.classificationKey ?? null,
            classificationSource: classificationByArticleId.get(source.newsroomArticleId)?.classificationSource ?? null,
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
          themeContinuity={themeContinuity}
          productionIntents={productionIntents}
          newOutputGrouping={groupingFixture ?? labelledGrouping}
          newOutputGroupingFixture={Boolean(groupingFixture)}
        />
      </div>
    </main>
  );
}
