import "server-only";
import { mesaPackageUsage, recoverMesaPackageGroups, type MesaMaterialVersion,
  type MesaThemeMaterial, type MesaProductionContext } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";

import { fetchSupabaseAdminTable, writeSupabaseAdminReturning } from "@/lib/supabase";
import { buildMesaOrganization, type MesaOrganizationRecords, type MesaThemeRow, type MesaDossierRow,
  type MesaThemeDossierRow, type MesaThemeSourceRow, type MesaDossierSourceRow,
} from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { loadOperationalDeskReadModel } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import type { OperationalDeskSourceItem } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";
import { MESA_OPERATIONAL_CYCLE_STARTED_AT } from "@/lib/redacao-automatica/newsroom-operational-desk-contract";

export const MESA_ORGANIZATION_MIGRATION = "jornada-mesa-grupos-temas-v2-aplicar.sql";
export const MESA_APPLIED_ORGANIZATION_MIGRATION = "20260911100419";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isMesaUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export async function readMesaRows<T>(query: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await fetchSupabaseAdminTable<T>(`${query}&limit=500&offset=${offset}`);
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}

export async function readMesaRowsByIds<T>(ids: readonly string[], query: (ids: string) => string): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !isMesaUuid(id))) throw new Error("mesa-organization-invalid-input");
  const result: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    result.push(...await readMesaRows<T>(query(unique.slice(offset, offset + 100).join(","))));
  }
  return result;
}

export async function readMesaOrganizationRecords(): Promise<MesaOrganizationRecords> {
  const [themes, themeDossiers, themeSources, dossiers, dossierSources, planLinks, themeArticles, packages, materialVersions, themeMaterials, productionContexts, publicationEvents] = await Promise.all([
    readMesaRows<MesaThemeRow>("newsroom_editorial_themes?select=id,title,classification_key,status,updated_at&order=updated_at.desc,id.asc"),
    readMesaRows<MesaThemeDossierRow>("newsroom_editorial_theme_dossiers?select=theme_id,dossier_id&order=dossier_id.asc"),
    readMesaRows<MesaThemeSourceRow>("newsroom_editorial_theme_sources?select=theme_id,newsroom_article_id,reference_snapshot_id&order=theme_id.asc,newsroom_article_id.asc"),
    readMesaRows<MesaDossierRow>("newsroom_editorial_dossiers?select=id,title,status,created_at,updated_at&order=updated_at.desc,id.asc"),
    readMesaRows<MesaDossierSourceRow>("newsroom_editorial_dossier_sources?select=dossier_id,newsroom_article_id,newsroom_snapshot_id,included&order=dossier_id.asc,id.asc"),
    readMesaRows<{ dossier_id: string; editorial_article_id: string }>("newsroom_editorial_dossier_article_plans?select=dossier_id,editorial_article_id&editorial_article_id=not.is.null&order=dossier_id.asc,id.asc"),
    readMesaRows<{ theme_id: string; editorial_article_id: string }>("newsroom_editorial_theme_articles?select=theme_id,editorial_article_id&order=theme_id.asc,editorial_article_id.asc"),
    readMesaRows<{ id: string; manifest: unknown }>("newsroom_editorial_source_packages?select=id,manifest&order=id.asc"),
    readMesaRows<MesaMaterialVersion>("newsroom_mesa_material_versions?select=id,material_key,title,source_refs,article_ids,revision,production_dossier_id,publication_event_id,parent_version_id&order=revision.asc"),
    readMesaRows<MesaThemeMaterial>("newsroom_mesa_theme_materials?select=theme_id,material_key,version_id&order=theme_id.asc,material_key.asc"),
    readMesaRows<MesaProductionContext>("newsroom_mesa_production_contexts?select=dossier_id,theme_id,material_refs&order=dossier_id.asc"),
    readMesaRows<{ dossier_id: string }>("newsroom_mesa_publication_events?select=dossier_id&order=created_at.asc,id.asc"),
  ]);
  const published = new Set((await readMesaRowsByIds<{ id: string }>([
    ...packages.flatMap((row) => mesaPackageUsage(row.manifest).map((ref) => ref.publishedArticleId)),
    ...materialVersions.flatMap((row) => row.article_ids),
    ...planLinks.map((row) => row.editorial_article_id), ...themeArticles.map((row) => row.editorial_article_id),
  ], (ids) => `editorial_articles?select=id&status=eq.published&id=in.(${ids})&order=id.asc`)).map((row) => row.id));
  return { themes, themeDossiers, themeSources, dossiers, dossierSources,
    completedProductionIds: [...new Set(publicationEvents.map((event) => event.dossier_id))],
    packageGroups: packages.flatMap((row) => recoverMesaPackageGroups(row.manifest, published)),
    materialVersions: materialVersions.map((row) => ({ ...row, article_ids: row.article_ids.filter((id) => published.has(id)) })),
    themeMaterials, productionContexts,
    publishedLinks: planLinks.filter((row) => published.has(row.editorial_article_id)),
    themeArticles: themeArticles.filter((row) => published.has(row.editorial_article_id)),
  };
}

export function relevantMesaRecords(records: MesaOrganizationRecords, sources: readonly OperationalDeskSourceItem[]) {
  const currentSources = new Set(sources.map((source) => source.newsroomArticleId));
  const knownDossiers = new Set(records.themeDossiers.map((row) => row.dossier_id));
  for (const context of records.productionContexts ?? []) knownDossiers.add(context.dossier_id);
  for (const version of records.materialVersions ?? []) {
    if (version.material_key.startsWith("dossier:")) knownDossiers.add(version.material_key.slice(8));
    if (version.production_dossier_id) knownDossiers.add(version.production_dossier_id);
  }
  for (const row of records.dossierSources) if (currentSources.has(row.newsroom_article_id)) knownDossiers.add(row.dossier_id);
  return { ...records, dossiers: records.dossiers.filter((row) => knownDossiers.has(row.id)
    || row.created_at >= MESA_OPERATIONAL_CYCLE_STARTED_AT) };
}

export async function loadMesaOrganization(sources: readonly OperationalDeskSourceItem[]) {
  const records = await readMesaOrganizationRecords();
  const relevant = relevantMesaRecords(records, sources);
  const dossierIds = new Set(relevant.dossiers.map((dossier) => dossier.id));
  const knownIds = new Set(sources.map((source) => source.newsroomArticleId));
  const missingIds = [...new Set([
    ...(records.packageGroups?.flatMap((group) => group.sources.map((source) => source.newsroomArticleId)) ?? []),
    ...(records.materialVersions?.flatMap((version) => version.source_refs.map((source) => source.newsroomArticleId)) ?? []),
    ...records.themeSources.map((member) => member.newsroom_article_id),
    ...records.dossierSources.filter((source) => dossierIds.has(source.dossier_id)).map((source) => source.newsroom_article_id),
  ])].filter((id) => !knownIds.has(id));
  if (!missingIds.length) return buildMesaOrganization(relevant, sources);
  const recovered = await loadOperationalDeskReadModel({ sourceIds: missingIds });
  if (!recovered.ok) throw new Error(recovered.error.code);
  return buildMesaOrganization(relevant, [...sources, ...recovered.value.sources]);
}

export async function mesaOrganizationCommand(name: string, body: Readonly<Record<string, unknown>>) {
  return writeSupabaseAdminReturning<Record<string, unknown>>(`rpc/${name}`, {
    method: "POST", body: JSON.stringify(body),
  });
}

export async function readSourceComparison(sourceId: string, baselineId: string, currentId: string) {
  if (![sourceId, baselineId, currentId].every(isMesaUuid)) throw new Error("mesa-organization-invalid-input");
  type Snapshot = { id: string; article_id: string; body: unknown; extracted_at: string; content_hash: string };
  const rows = await fetchSupabaseAdminTable<Snapshot>(
    `newsroom_article_snapshots?select=id,article_id,body,extracted_at,content_hash&article_id=eq.${sourceId}&id=in.(${baselineId},${currentId})&limit=2`,
  );
  const before = rows.find((row) => row.id === baselineId);
  const after = rows.find((row) => row.id === currentId);
  if (!before || !after) throw new Error("mesa-organization-snapshot-unavailable");
  return { before, after };
}
