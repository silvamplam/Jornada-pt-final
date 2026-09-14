import "server-only";
import {
  isMesaMaterialKey,
  mergeMesaSourceRefs,
  mesaPackageUsage,
  recoverMesaPackageGroups,
  type MesaEditorialGroup,
  type MesaMaterialVersion,
  type MesaProductionContext,
  type MesaThemeMaterial,
} from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";
import { isArticleClassificationKey } from "@/lib/editorial-classifications";

import { fetchSupabaseAdminTable, writeSupabaseAdminReturning } from "@/lib/supabase";
import { buildMesaOrganization, type MesaOrganizationRecords, type MesaThemeRow, type MesaDossierRow,
  type MesaThemeDossierRow, type MesaThemeSourceRow, type MesaDossierSourceRow,
} from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { loadOperationalDeskReadModel } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";

export const MESA_ORGANIZATION_MIGRATION = "jornada-mesa-grupos-temas-v2-aplicar.sql";
export const MESA_APPLIED_ORGANIZATION_MIGRATION = "20260911100419";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isMesaUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

type MesaThemeSummaryRow = Readonly<{
  id: string;
  title: string;
  classification_key: MesaThemeRow["classification_key"];
  status: MesaThemeRow["status"];
  source_count: number;
  article_count: number;
  updated_source_count: number;
  production_ready: boolean;
  updated_at: string;
}>;

type MesaLatestSnapshotIdentity = Readonly<{ id: string; article_id: string }>;

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

async function readMesaThemeSummaries(themeIds?: readonly string[]) {
  if (themeIds?.some((id) => !isMesaUuid(id))) throw new Error("mesa-organization-invalid-input");
  const themeFilter = themeIds
    ? `&p_theme_ids=${encodeURIComponent(`{${themeIds.join(",")}}`)}`
    : "";
  const rows = await readMesaRows<MesaThemeSummaryRow>(
    "rpc/newsroom_mesa_theme_summaries_v1?select=id,title,classification_key,status,source_count,article_count,updated_source_count,production_ready,updated_at"
    + themeFilter
    + "&order=updated_at.desc,id.asc",
  );
  if (
    new Set(rows.map((row) => row.id)).size !== rows.length
    || rows.some((row) => (
      !isMesaUuid(row.id)
      || typeof row.title !== "string"
      || row.title.trim().length === 0
      || !isArticleClassificationKey(row.classification_key)
      || (row.status !== "open" && row.status !== "archived")
      || !Number.isSafeInteger(row.source_count)
      || row.source_count < 0
      || !Number.isSafeInteger(row.article_count)
      || row.article_count < 0
      || !Number.isSafeInteger(row.updated_source_count)
      || row.updated_source_count < 0
      || typeof row.production_ready !== "boolean"
      || Number.isNaN(Date.parse(row.updated_at))
    ))
  ) throw new Error("mesa-organization-relation-invalid");
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    classificationKey: row.classification_key,
    status: row.status,
    sourceCount: row.source_count,
    articleCount: row.article_count,
    updatedSourceCount: row.updated_source_count,
    sourceRefs: [],
    productionReady: row.production_ready,
    dossiers: [],
  }));
}

export async function loadMesaOrganizationSummary() {
  return {
    themes: await readMesaThemeSummaries(),
    unlinkedDossiers: [],
  } satisfies import("@/lib/redacao-automatica/newsroom-mesa-organization-internal").MesaOrganization;
}

export async function readMesaThemeSummary(themeId: string) {
  const rows = await readMesaThemeSummaries([themeId]);
  if (rows.length !== 1) throw new Error("mesa-organization-theme-unavailable");
  return rows[0];
}

export async function readMesaThemeCurrentSourceRefs(themeId: string) {
  if (!isMesaUuid(themeId)) throw new Error("mesa-organization-invalid-input");
  const memberships = await readMesaRows<MesaThemeSourceRow>(
    "newsroom_editorial_theme_sources"
    + "?select=theme_id,newsroom_article_id,reference_snapshot_id"
    + `&theme_id=eq.${themeId}&order=newsroom_article_id.asc`,
  );
  const identities = (await Promise.all(
    Array.from({ length: Math.ceil(memberships.length / 100) }, (_, index) => (
      memberships.slice(index * 100, (index + 1) * 100)
    )).map((batch) => fetchSupabaseAdminTable<MesaLatestSnapshotIdentity>(
      "rpc/newsroom_latest_snapshot_summaries"
      + `?p_article_ids=${encodeURIComponent(`{${batch.map((row) => row.newsroom_article_id).join(",")}}`)}`,
    )),
  )).flat();
  const snapshotByArticle = new Map(identities.map((row) => [row.article_id, row.id]));
  return memberships.flatMap((membership) => {
    const snapshotId = snapshotByArticle.get(membership.newsroom_article_id);
    return snapshotId ? [{
      newsroomArticleId: membership.newsroom_article_id,
      newsroomSnapshotId: snapshotId,
    }] : [];
  });
}

export async function readMesaThemeOrganizationRecords(
  themeId: string,
): Promise<MesaOrganizationRecords> {
  if (!isMesaUuid(themeId)) throw new Error("mesa-organization-invalid-input");
  const [themes, themeDossiers, themeSources, themeMaterials, themeArticles] = await Promise.all([
    readMesaRows<MesaThemeRow>(
      "newsroom_editorial_themes?select=id,title,classification_key,status,updated_at"
      + `&id=eq.${themeId}&order=id.asc`,
    ),
    readMesaRows<MesaThemeDossierRow>(
      "newsroom_editorial_theme_dossiers?select=theme_id,dossier_id"
      + `&theme_id=eq.${themeId}&order=dossier_id.asc`,
    ),
    readMesaRows<MesaThemeSourceRow>(
      "newsroom_editorial_theme_sources?select=theme_id,newsroom_article_id,reference_snapshot_id"
      + `&theme_id=eq.${themeId}&order=newsroom_article_id.asc`,
    ),
    readMesaRows<MesaThemeMaterial>(
      "newsroom_mesa_theme_materials?select=theme_id,material_key,version_id"
      + `&theme_id=eq.${themeId}&order=material_key.asc`,
    ),
    readMesaRows<{ theme_id: string; editorial_article_id: string }>(
      "newsroom_editorial_theme_articles?select=theme_id,editorial_article_id"
      + `&theme_id=eq.${themeId}&order=editorial_article_id.asc`,
    ),
  ]);
  if (themes.length > 1) throw new Error("mesa-organization-relation-invalid");

  const dossierIds = themeDossiers.map((row) => row.dossier_id);
  const versionIds = themeMaterials.map((row) => row.version_id);
  const [dossiers, dossierSources, planLinks, materialVersions, productionContexts, publicationEvents] = await Promise.all([
    readMesaRowsByIds<MesaDossierRow>(dossierIds, (ids) => (
      "newsroom_editorial_dossiers?select=id,title,status,created_at,updated_at"
      + `&id=in.(${ids})&order=updated_at.desc,id.asc`
    )),
    readMesaRowsByIds<MesaDossierSourceRow>(dossierIds, (ids) => (
      "newsroom_editorial_dossier_sources?select=dossier_id,newsroom_article_id,newsroom_snapshot_id,included"
      + `&dossier_id=in.(${ids})&order=dossier_id.asc,id.asc`
    )),
    readMesaRowsByIds<{ dossier_id: string; editorial_article_id: string }>(dossierIds, (ids) => (
      "newsroom_editorial_dossier_article_plans?select=dossier_id,editorial_article_id"
      + `&dossier_id=in.(${ids})&editorial_article_id=not.is.null&order=dossier_id.asc,id.asc`
    )),
    readMesaRowsByIds<MesaMaterialVersion>(versionIds, (ids) => (
      "newsroom_mesa_material_versions"
      + "?select=id,material_key,title,source_refs,article_ids,revision,production_dossier_id,publication_event_id,parent_version_id"
      + `&id=in.(${ids})&order=revision.asc`
    )),
    readMesaRowsByIds<MesaProductionContext>(dossierIds, (ids) => (
      "newsroom_mesa_production_contexts"
      + "?select=dossier_id,theme_id,material_refs,workspace_role,workspace_contract_version,workspace_state"
      + `&dossier_id=in.(${ids})&order=dossier_id.asc`
    )),
    readMesaRowsByIds<{ dossier_id: string }>(dossierIds, (ids) => (
      "newsroom_mesa_publication_events?select=dossier_id"
      + `&dossier_id=in.(${ids})&order=created_at.asc,id.asc`
    )),
  ]);
  const publishedIds = new Set((await readMesaRowsByIds<{ id: string }>([
    ...planLinks.map((row) => row.editorial_article_id),
    ...themeArticles.map((row) => row.editorial_article_id),
    ...materialVersions.flatMap((row) => row.article_ids),
  ], (ids) => (
    `editorial_articles?select=id&id=in.(${ids})&status=eq.published&order=id.asc`
  ))).map((row) => row.id));

  return {
    themes,
    themeDossiers,
    themeSources,
    dossiers,
    dossierSources,
    completedProductionIds: [...new Set(publicationEvents.map((row) => row.dossier_id))],
    packageGroups: [],
    materialVersions: materialVersions.map((row) => ({
      ...row,
      article_ids: row.article_ids.filter((id) => publishedIds.has(id)),
    })),
    themeMaterials,
    productionContexts,
    publishedLinks: planLinks.filter((row) => publishedIds.has(row.editorial_article_id)),
    themeArticles: themeArticles.filter((row) => publishedIds.has(row.editorial_article_id)),
  };
}

export async function loadMesaThemeOrganization(themeId: string) {
  const records = await readMesaThemeOrganizationRecords(themeId);
  if (records.themes.length !== 1) return null;
  const sourceIds = [...new Set([
    ...records.themeSources.map((row) => row.newsroom_article_id),
    ...records.dossierSources.map((row) => row.newsroom_article_id),
    ...(records.materialVersions ?? []).flatMap((row) => (
      row.source_refs.map((ref) => ref.newsroomArticleId)
    )),
  ])];
  const material = await loadOperationalDeskReadModel({ sourceIds });
  if (!material.ok) throw new Error(material.error.code);
  return {
    records,
    sources: material.value.sources,
    organization: buildMesaOrganization(records, material.value.sources),
  };
}

export async function loadMesaDossierOrganization(
  key: string,
  requestedVersion?: string,
) {
  if (!isMesaMaterialKey(key) || (requestedVersion !== undefined && !isMesaUuid(requestedVersion))) {
    throw new Error("mesa-organization-invalid-input");
  }
  const encodedKey = encodeURIComponent(key);
  const versionRows = await readMesaRows<MesaMaterialVersion>(
    "newsroom_mesa_material_versions"
    + "?select=id,material_key,title,source_refs,article_ids,revision,production_dossier_id,publication_event_id,parent_version_id"
    + `&material_key=eq.${encodedKey}&order=revision.desc`,
  );
  const publishedIds = new Set((await readMesaRowsByIds<{ id: string }>(
    versionRows.flatMap((row) => row.article_ids),
    (ids) => `editorial_articles?select=id&id=in.(${ids})&status=eq.published&order=id.asc`,
  )).map((row) => row.id));
  const versions = versionRows.map((row) => ({
    ...row,
    article_ids: row.article_ids.filter((id) => publishedIds.has(id)),
  }));
  const version = requestedVersion
    ? versions.find((row) => row.id === requestedVersion)
    : versions.sort((left, right) => (
      Number(Boolean(right.publication_event_id)) - Number(Boolean(left.publication_event_id))
      || right.revision - left.revision
    ))[0];
  if (requestedVersion && !version) return null;

  let base: MesaEditorialGroup | undefined;
  if (key.startsWith("dossier:")) {
    const dossierId = key.slice("dossier:".length);
    const [dossiers, dossierSources, planLinks] = await Promise.all([
      readMesaRows<MesaDossierRow>(
        "newsroom_editorial_dossiers?select=id,title,status,created_at,updated_at"
        + `&id=eq.${dossierId}&order=id.asc`,
      ),
      readMesaRows<MesaDossierSourceRow>(
        "newsroom_editorial_dossier_sources?select=dossier_id,newsroom_article_id,newsroom_snapshot_id,included"
        + `&dossier_id=eq.${dossierId}&order=id.asc`,
      ),
      readMesaRows<{ dossier_id: string; editorial_article_id: string }>(
        "newsroom_editorial_dossier_article_plans?select=dossier_id,editorial_article_id"
        + `&dossier_id=eq.${dossierId}&editorial_article_id=not.is.null&order=id.asc`,
      ),
    ]);
    const native = dossiers[0];
    if (native) {
      const nativePublishedIds = new Set((await readMesaRowsByIds<{ id: string }>(
        planLinks.map((row) => row.editorial_article_id),
        (ids) => `editorial_articles?select=id&id=in.(${ids})&status=eq.published&order=id.asc`,
      )).map((row) => row.id));
      base = {
        key,
        versionId: null,
        title: native.title,
        href: `/admin/editorial/redacao-automatica/mesa/producao/${dossierId}`,
        sources: mergeMesaSourceRefs([dossierSources.filter((row) => row.included).map((row) => ({
          newsroomArticleId: row.newsroom_article_id,
          newsroomSnapshotId: row.newsroom_snapshot_id,
        }))]),
        articleIds: planLinks.flatMap((row) => (
          nativePublishedIds.has(row.editorial_article_id) ? [row.editorial_article_id] : []
        )),
      };
    }
  } else if (key.startsWith("package:")) {
    const packageId = key.split(":")[1];
    const packages = await readMesaRows<{ id: string; manifest: unknown }>(
      "newsroom_editorial_source_packages?select=id,manifest"
      + `&id=eq.${packageId}&order=id.asc`,
    );
    if (packages.length > 1) throw new Error("mesa-organization-relation-invalid");
    const packageUsage = packages.flatMap((row) => mesaPackageUsage(row.manifest));
    const packagePublishedIds = new Set((await readMesaRowsByIds<{ id: string }>(
      packageUsage.map((row) => row.publishedArticleId),
      (ids) => `editorial_articles?select=id&id=in.(${ids})&status=eq.published&order=id.asc`,
    )).map((row) => row.id));
    base = packages.flatMap((row) => recoverMesaPackageGroups(row.manifest, packagePublishedIds))
      .find((row) => row.key === key);
  }

  const group: MesaEditorialGroup | undefined = version ? {
    key,
    versionId: version.id,
    title: version.title,
    sources: version.source_refs,
    articleIds: version.article_ids,
    href: version.production_dossier_id
      ? `/admin/editorial/redacao-automatica/mesa/producao/${version.production_dossier_id}`
      : base?.href ?? "",
  } : base;
  if (!group || group.sources.length < 2 || (!version && group.articleIds.length === 0)) return null;

  const [materialThemes, dossierThemes, originRows] = await Promise.all([
    readMesaRows<MesaThemeMaterial>(
      "newsroom_mesa_theme_materials?select=theme_id,material_key,version_id"
      + `&material_key=eq.${encodedKey}&order=theme_id.asc`,
    ),
    key.startsWith("dossier:")
      ? readMesaRows<MesaThemeDossierRow>(
        "newsroom_editorial_theme_dossiers?select=theme_id,dossier_id"
        + `&dossier_id=eq.${key.slice("dossier:".length)}&order=theme_id.asc`,
      )
      : Promise.resolve([]),
    version?.publication_event_id
      ? readMesaRows<MesaMaterialVersion>(
        "newsroom_mesa_material_versions"
        + "?select=id,material_key,title,source_refs,article_ids,revision,production_dossier_id,publication_event_id,parent_version_id"
        + `&publication_event_id=eq.${version.publication_event_id}`
        + "&parent_version_id=not.is.null&order=revision.asc",
      )
      : Promise.resolve([]),
  ]);
  const themeIds = [...new Set([
    ...materialThemes.map((row) => row.theme_id),
    ...dossierThemes.map((row) => row.theme_id),
  ])];
  const [themes, material] = await Promise.all([
    readMesaThemeSummaries(themeIds),
    loadOperationalDeskReadModel({
      sourceIds: group.sources.map((row) => row.newsroomArticleId),
    }),
  ]);
  if (!material.ok) throw new Error(material.error.code);

  return {
    group,
    versions,
    origins: originRows,
    themes,
    sources: material.value.sources,
    baseHref: base?.href ?? null,
  };
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
