import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  listEditorialDossierProductionArticlePlans,
  type EditorialDossierProductionArticlePlan,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import {
  getEditorialDossierProductionWorkspace,
  type EditorialDossierProductionWorkspace,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-repository";
import {
  createEditorialDossierProductionReadSession,
} from "@/lib/redacao-automatica/editorial-dossier-production-read-session";
import {
  getEditorialDossierForProduction,
  type EditorialDossierProductionDetail,
} from "@/lib/redacao-automatica/editorial-dossier-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditorialDossierProductionLoad = Readonly<{
  dossier: EditorialDossierProductionDetail;
  plans: readonly EditorialDossierProductionArticlePlan[];
  workspace: EditorialDossierProductionWorkspace;
  parentThemeId: string | null;
  organizationReadable: boolean;
}>;

export type EditorialDossierProductionLoadResult =
  | Readonly<{ ok: true; value: EditorialDossierProductionLoad | null }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "read_unavailable" | "context_contract_invalid";
        message: string;
      }>;
    }>;

export async function loadEditorialDossierProduction(
  dossierIdValue: string | null | undefined,
  options: Readonly<{
    includePlans?: boolean;
    includeParentTheme?: boolean;
    workspaceDetail?: "full" | "page" | "context";
  }> = {},
): Promise<EditorialDossierProductionLoadResult> {
  const dossierId = dossierIdValue?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(dossierId)) return { ok: true, value: null };

  const readSession = createEditorialDossierProductionReadSession(dossierId);
  const includePlans = options.includePlans !== false;
  const [dossierResult, plansResult, workspaceResult] = await Promise.all([
    getEditorialDossierForProduction(dossierId, readSession),
    includePlans
      ? listEditorialDossierProductionArticlePlans(dossierId, readSession)
      : Promise.resolve({ ok: true as const, value: [] as readonly EditorialDossierProductionArticlePlan[] }),
    getEditorialDossierProductionWorkspace(dossierId, {
      readSession,
      detail: options.workspaceDetail ?? "page",
    }),
  ]);

  if (!workspaceResult.ok) return workspaceResult;
  if (!dossierResult.ok || !plansResult.ok) {
    return {
      ok: false,
      error: {
        code: "read_unavailable",
        message: "Não foi possível reconstruir esta produção a partir do estado persistente.",
      },
    };
  }
  if (!dossierResult.value || !workspaceResult.value) return { ok: true, value: null };

  const workspace = workspaceResult.value;
  const contextThemeIds = workspace.contextMode === "contexts"
    ? Array.from(new Set(workspace.productionContexts.flatMap((item) => (
        item.themeId ? [item.themeId] : []
      ))))
    : [];
  let parentThemeId = contextThemeIds.length === 1
    ? contextThemeIds[0]
    : workspace.mesaContext?.themeId ?? null;
  let organizationReadable = true;

  if (options.includeParentTheme && !parentThemeId) {
    try {
      const rows = await fetchSupabaseAdminTable<{ theme_id: string }>(
        "newsroom_editorial_theme_dossiers?select=theme_id&dossier_id=eq."
        + encodeURIComponent(dossierId) + "&limit=1",
      );
      parentThemeId = rows[0]?.theme_id ?? null;
    } catch {
      organizationReadable = false;
    }
  }

  return {
    ok: true,
    value: {
      dossier: dossierResult.value,
      plans: plansResult.value,
      workspace,
      parentThemeId,
      organizationReadable,
    },
  };
}
