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
import {
  editorialMesaWorkspaceInitialOutputCount,
  editorialMesaWorkspaceVisualSourceOrder,
} from "@/lib/redacao-automatica/editorial-mesa-workspace-defaults";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  MesaProductionWorkspaceClient,
} from "./_workspace-client";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";

type ProductionWorkspacePageProps = Readonly<{
  params: Promise<{ dossierId: string }>;
}>;

type ProductionContextRow = Readonly<{
  theme_id: string | null;
  selection_payload: unknown;
  source_refs: unknown;
  material_refs: unknown;
  workspace_contract_version?: number | null;
  workspace_state?: string | null;
}>;

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
  const [parentResult, contextResult] = await Promise.all([
    fetchSupabaseAdminTable<{ theme_id: string }>(
      "newsroom_editorial_theme_dossiers?select=theme_id&dossier_id=eq."
      + encodeURIComponent(dossierId) + "&limit=1",
    ).then((rows) => ({ ok: true as const, rows })).catch(() => ({ ok: false as const, rows: [] })),
    fetchSupabaseAdminTable<ProductionContextRow>(
      "newsroom_mesa_production_contexts?select=theme_id,selection_payload,source_refs,material_refs,workspace_contract_version,workspace_state"
      + "&dossier_id=eq." + encodeURIComponent(dossierId) + "&limit=1",
    ).then((rows) => ({ ok: true as const, rows })).catch(() => ({ ok: false as const, rows: [] })),
  ]);
  const context = contextResult.rows[0] ?? null;
  if (!contextResult.ok) return <ReadError />;
  if (context?.workspace_state && context.workspace_state !== "active") notFound();
  const parentThemeId = context?.theme_id ?? parentResult.rows[0]?.theme_id ?? null;
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

        {!parentResult.ok ? (
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
            initialOutputCount: editorialMesaWorkspaceInitialOutputCount(
              context?.selection_payload,
              includedSourceCount,
            ),
            workspaceContractVersion: context?.workspace_contract_version === 2 ? 2 : 1,
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
          visualSourceOrder={editorialMesaWorkspaceVisualSourceOrder(
            context?.selection_payload,
            context?.material_refs,
            dossier.sources.filter((source) => source.included).map((source) => source.newsroomArticleId),
          )}
        />
      </div>
    </main>
  );
}
