import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";

const RELATION_PAGE_SIZE = 200;

export type EditorialDossierProductionRow = Readonly<{
  id: string;
  title: string;
  output_count: number;
  length_mode: string;
  article_kind: string;
  preparation_key: string | null;
}>;

export type EditorialDossierProductionSourceRow = Readonly<{
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  sort_order: number;
  included: boolean;
  title_snapshot: string | null;
}>;

export type EditorialDossierProductionArticlePlanRow = Readonly<{
  id: string;
  dossier_id: string;
  working_title: string;
  status: string;
  sort_order: number;
  article_kind: string;
  length_mode: string;
  editorial_instructions: string;
  destination: string;
  update_target_editorial_article_id: string | null;
  image_choice: string;
  classification_key: string | null;
  classification_mode: import("./article-plan-classification").ArticlePlanClassificationMode | null;
  dossier_image_id: string | null;
  editorial_article_id: string | null;
  editorial_profile_id: string | null;
  editorial_profile_version_id: string | null;
  editorial_profile_pinned_at: string | null;
  created_at: string;
  updated_at: string;
}>;

export type EditorialDossierProductionMesaContextRow = Readonly<{
  dossier_id: string;
  theme_id: string | null;
  selection_payload: unknown;
  source_refs: unknown;
  material_refs: unknown;
  workspace_contract_version: number | null;
  workspace_state: string | null;
}>;

async function readAllRows<T>(orderedQuery: string): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const rows = await fetchSupabaseAdminTable<T>(
      `${orderedQuery}&limit=${RELATION_PAGE_SIZE}&offset=${offset}`,
    );
    allRows.push(...rows);
    if (rows.length < RELATION_PAGE_SIZE) break;
    offset += RELATION_PAGE_SIZE;
  }

  return allRows;
}

function once<T>(read: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= read();
    return pending;
  };
}

export type EditorialDossierProductionReadSession = Readonly<{
  dossierRows: () => Promise<readonly EditorialDossierProductionRow[]>;
  dossierSourceRows: () => Promise<readonly EditorialDossierProductionSourceRow[]>;
  articlePlanRows: () => Promise<readonly EditorialDossierProductionArticlePlanRow[]>;
  mesaContextRows: () => Promise<readonly EditorialDossierProductionMesaContextRow[]>;
}>;

export function createEditorialDossierProductionReadSession(
  dossierId: string,
): EditorialDossierProductionReadSession {
  const encodedDossierId = encodeURIComponent(dossierId);

  return {
    dossierRows: once(() => fetchSupabaseAdminTable<EditorialDossierProductionRow>(
      "newsroom_editorial_dossiers"
      + "?select=id,title,output_count,length_mode,article_kind,preparation_key"
      + `&id=eq.${encodedDossierId}&limit=1`,
    )),
    dossierSourceRows: once(() => readAllRows<EditorialDossierProductionSourceRow>(
      "newsroom_editorial_dossier_sources"
      + "?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,sort_order,included,title_snapshot"
      + `&dossier_id=eq.${encodedDossierId}`
      + "&order=included.desc,sort_order.asc,id.asc",
    )),
    articlePlanRows: once(() => readAllRows<EditorialDossierProductionArticlePlanRow>(
      "newsroom_editorial_dossier_article_plans"
      + "?select=id,dossier_id,working_title,status,sort_order,article_kind,length_mode,editorial_instructions,destination,update_target_editorial_article_id,image_choice,dossier_image_id,classification_key,classification_mode,editorial_article_id,editorial_profile_id,editorial_profile_version_id,editorial_profile_pinned_at,created_at,updated_at"
      + `&dossier_id=eq.${encodedDossierId}`
      + "&order=sort_order.asc,id.asc",
    )),
    mesaContextRows: once(() => fetchSupabaseAdminTable<EditorialDossierProductionMesaContextRow>(
      "newsroom_mesa_production_contexts"
      + "?select=dossier_id,theme_id,selection_payload,source_refs,material_refs,workspace_contract_version,workspace_state"
      + `&dossier_id=eq.${encodedDossierId}&limit=1`,
    )),
  };
}
