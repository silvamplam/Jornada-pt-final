import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  buildEditorialArticleProvenance,
  type EditorialArticleProvenance,
  type ProvenanceAssignmentRow,
  type ProvenanceDossierRow,
  type ProvenanceDossierSourceRow,
  type ProvenanceGenerationRow,
  type ProvenanceNewsroomArticleRow,
  type ProvenancePlanRow,
  type ProvenanceSnapshotRow,
} from "@/lib/redacao-automatica/editorial-article-provenance-internal";

function uuidList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

export type EditorialArticleProvenanceResult =
  | Readonly<{ ok: true; value: EditorialArticleProvenance | null }>
  | Readonly<{ ok: false; error: "read_unavailable" | "relation_invalid" }>;

export async function getEditorialArticleProvenance(
  editorialArticleId: string,
  editorialArticleStatus: string | null,
): Promise<EditorialArticleProvenanceResult> {
  try {
    const plans = await fetchSupabaseAdminTable<ProvenancePlanRow>(
      "newsroom_editorial_dossier_article_plans"
      + "?select=id,dossier_id,editorial_article_id,working_title,article_kind,length_mode,status,editorial_instructions,created_at"
      + `&editorial_article_id=eq.${encodeURIComponent(editorialArticleId)}&limit=1`,
    );
    const plan = plans[0];
    if (!plan) {
      return { ok: true, value: null };
    }

    const [dossiers, assignments, generationRows] = await Promise.all([
      fetchSupabaseAdminTable<ProvenanceDossierRow>(
        "newsroom_editorial_dossiers?select=id,title,status,output_language"
        + `&id=eq.${encodeURIComponent(plan.dossier_id)}&limit=1`,
      ),
      fetchSupabaseAdminTable<ProvenanceAssignmentRow>(
        "newsroom_editorial_dossier_article_plan_sources?select=dossier_source_id,sort_order"
        + `&dossier_id=eq.${encodeURIComponent(plan.dossier_id)}`
        + `&article_plan_id=eq.${encodeURIComponent(plan.id)}`
        + "&order=sort_order.asc,dossier_source_id.asc&limit=100",
      ),
      fetchSupabaseAdminTable<ProvenanceGenerationRow>(
        "newsroom_editorial_dossier_article_plan_generations"
        + "?select=provider,model,prompt_version,provider_response_id,input_hash,input_tokens,output_tokens,created_at"
        + `&dossier_id=eq.${encodeURIComponent(plan.dossier_id)}`
        + `&article_plan_id=eq.${encodeURIComponent(plan.id)}&limit=1`,
      ),
    ]);
    const dossier = dossiers[0];
    if (!dossier || plan.editorial_article_id !== editorialArticleId) {
      return { ok: false, error: "relation_invalid" };
    }

    const sourceIds = assignments.map((assignment) => assignment.dossier_source_id);
    const dossierSources = sourceIds.length > 0
      ? await fetchSupabaseAdminTable<ProvenanceDossierSourceRow>(
          "newsroom_editorial_dossier_sources"
          + "?select=id,newsroom_article_id,newsroom_snapshot_id,source_role,sort_order,editorial_note,title_snapshot,published_at_snapshot"
          + `&dossier_id=eq.${encodeURIComponent(plan.dossier_id)}`
          + `&id=in.(${uuidList(sourceIds)})&limit=${sourceIds.length}`,
        )
      : [];
    const articleIds = dossierSources.map((source) => source.newsroom_article_id);
    const snapshotIds = dossierSources.map((source) => source.newsroom_snapshot_id);
    const [newsroomArticles, snapshots] = await Promise.all([
      articleIds.length > 0
        ? fetchSupabaseAdminTable<ProvenanceNewsroomArticleRow>(
            "newsroom_articles?select=id,source_code,title,original_url,normalized_url,published_at"
            + `&id=in.(${uuidList(articleIds)})&limit=${articleIds.length}`,
          )
        : [],
      snapshotIds.length > 0
        ? fetchSupabaseAdminTable<ProvenanceSnapshotRow>(
            "newsroom_article_snapshots?select=id,article_id,content_hash,source_metadata,extracted_at"
            + `&id=in.(${uuidList(snapshotIds)})&limit=${snapshotIds.length}`,
          )
        : [],
    ]);

    return {
      ok: true,
      value: buildEditorialArticleProvenance({
        editorialArticleId,
        editorialArticleStatus,
        plan,
        dossier,
        assignments,
        dossierSources,
        newsroomArticles,
        snapshots,
        generation: generationRows[0] ?? null,
      }),
    };
  } catch {
    return { ok: false, error: "read_unavailable" };
  }
}
