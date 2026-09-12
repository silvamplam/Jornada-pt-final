import { mergeMesaSourceRefs, type MesaEditorialGroup, type MesaMaterialRef, type MesaMaterialVersion,
  type MesaThemeMaterial, type MesaProductionContext } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";
import { isArticleClassificationKey, type ArticleClassificationKey } from "@/lib/editorial-classifications";
import type { OperationalDeskSourceItem } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

export type MesaThemeRow = Readonly<{
  id: string; title: string; classification_key: ArticleClassificationKey;
  status: "open" | "archived"; updated_at: string;
}>;
export type MesaDossierRow = Readonly<{
  id: string; title: string; status: string; created_at: string; updated_at: string;
}>;
export type MesaThemeDossierRow = Readonly<{ theme_id: string; dossier_id: string }>;
export type MesaThemeSourceRow = Readonly<{
  theme_id: string; newsroom_article_id: string; reference_snapshot_id: string | null;
}>;
export type MesaDossierSourceRow = Readonly<{
  dossier_id: string; newsroom_article_id: string; newsroom_snapshot_id: string; included: boolean;
}>;
export type MesaPublishedLink = Readonly<{ dossier_id: string; editorial_article_id: string }>;
export type MesaDossierCard = Readonly<{
  id: string; kind: "dossier" | "package_group";
  material?: MesaMaterialRef;
  themeIds?: readonly string[];
  articleIds?: readonly string[]; title: string; status: string;
  href?: string;
  classificationKeys?: readonly ArticleClassificationKey[];
  hasUnclassified?: boolean;
  themeId: string | null; sourceCount: number; articleCount: number; updatedSourceCount: number;
}>;
export type MesaThemeCard = Readonly<{
  id: string; title: string; classificationKey: ArticleClassificationKey; status: "open" | "archived";
  sourceCount: number; articleCount: number; updatedSourceCount: number;
  dossiers: readonly MesaDossierCard[];
}>;
export type MesaOrganization = Readonly<{
  themes: readonly MesaThemeCard[];
  unlinkedDossiers: readonly MesaDossierCard[];
  availableDossiers?: readonly MesaDossierCard[];
  groupedSourceIds?: readonly string[];
}>;
export type MesaOrganizationRecords = Readonly<{
  completedProductionIds?: readonly string[];
  packageGroups?: readonly MesaEditorialGroup[];
  materialVersions?: readonly MesaMaterialVersion[];
  themeMaterials?: readonly MesaThemeMaterial[];
  productionContexts?: readonly MesaProductionContext[];
  themes: readonly MesaThemeRow[]; dossiers: readonly MesaDossierRow[];
  themeDossiers: readonly MesaThemeDossierRow[]; themeSources: readonly MesaThemeSourceRow[];
  dossierSources: readonly MesaDossierSourceRow[]; publishedLinks: readonly MesaPublishedLink[];
  themeArticles: readonly Readonly<{ theme_id: string; editorial_article_id: string }>[];
}>;

const uniqueCount = (values: readonly string[]) => new Set(values).size;

/** Membership and publication proof remain separate: this only builds presentation. */
export function buildMesaOrganization(
  records: MesaOrganizationRecords,
  sources: readonly OperationalDeskSourceItem[],
): MesaOrganization {
  const sourceById = new Map(sources.map((source) => [source.newsroomArticleId, source]));
  const themesById = new Map(records.themes.map((theme) => [theme.id, theme]));
  const bases = new Map<string, MesaEditorialGroup>();
  for (const dossier of records.dossiers) {
    bases.set(`dossier:${dossier.id}`, {
      key: `dossier:${dossier.id}`, versionId: null, title: dossier.title,
      href: `/admin/editorial/redacao-automatica/mesa/producao/${dossier.id}`,
      sources: mergeMesaSourceRefs([records.dossierSources.filter((row) => row.dossier_id === dossier.id && row.included)
        .map((row) => ({ newsroomArticleId: row.newsroom_article_id, newsroomSnapshotId: row.newsroom_snapshot_id }))]),
      articleIds: [...new Set(records.publishedLinks.filter((row) => row.dossier_id === dossier.id).map((row) => row.editorial_article_id))],
    });
  }
  for (const group of records.packageGroups ?? []) bases.set(group.key, group);
  const versions = new Map((records.materialVersions ?? []).map((version) => [version.id, version]));
  const fromVersion = (version: MesaMaterialVersion): MesaEditorialGroup => ({
    key: version.material_key, versionId: version.id, title: version.title,
    href: bases.get(version.material_key)?.href ?? `/admin/editorial/redacao-automatica/mesa/producao/${version.production_dossier_id}`,
    sources: mergeMesaSourceRefs([version.source_refs]), articleIds: version.article_ids,
  });
  const completedProductionIds = new Set(records.completedProductionIds ?? []);
  const technicalContextIds = new Set((records.productionContexts ?? []).flatMap((row) => {
    const isExplicitTechnical = row.workspace_role === "technical"
      || row.workspace_contract_version === 2;
    const isUnpublishedHistoricalWorkspace = !completedProductionIds.has(row.dossier_id);
    return isExplicitTechnical || isUnpublishedHistoricalWorkspace ? [row.dossier_id] : [];
  }));
  const latest = new Map([...bases].filter(([key, group]) => group.articleIds.length > 0
    && (!key.startsWith("dossier:") || !technicalContextIds.has(key.slice(8)))));
  // A baseline captured later must never replace an already-published revision in the catalogue.
  for (const version of [...versions.values()].sort((a, b) =>
    Number(Boolean(a.publication_event_id)) - Number(Boolean(b.publication_event_id)) || a.revision - b.revision)) {
    latest.set(version.material_key, fromVersion(version));
  }
  // Links pin a version. A newer publication never expands another Theme by shared identity.
  const members = new Map<string, Map<string, MesaEditorialGroup>>();
  const associate = (themeId: string, group: MesaEditorialGroup | undefined) => {
    if (!themesById.has(themeId) || !group) throw new Error("mesa-organization-relation-invalid");
    const linked = members.get(themeId) ?? new Map<string, MesaEditorialGroup>();
    linked.set(group.key, group); members.set(themeId, linked);
  };
  for (const link of records.themeDossiers) {
    if (!technicalContextIds.has(link.dossier_id)) {
      associate(link.theme_id, bases.get(`dossier:${link.dossier_id}`));
    }
  }
  for (const link of records.themeMaterials ?? []) {
    const version = versions.get(link.version_id);
    if (!version || version.material_key !== link.material_key) throw new Error("mesa-organization-relation-invalid");
    associate(link.theme_id, fromVersion(version));
  }
  const parentIds = (key: string) => [...members].filter(([, groups]) => groups.has(key)).map(([id]) => id);
  const card = (group: MesaEditorialGroup, themeId: string | null = null): MesaDossierCard => ({
    id: group.key.startsWith("dossier:") ? group.key.slice(8) : group.key,
    kind: group.key.startsWith("package:") ? "package_group" : "dossier",
    title: group.title, status: group.articleIds.length ? "published" : "draft", href: group.href,
    themeId, themeIds: parentIds(group.key), articleIds: group.articleIds,
    ...(group.sources.length >= 2 ? { material: { key: group.key, versionId: group.versionId, sources: group.sources } } : {}),
    sourceCount: group.sources.length, articleCount: uniqueCount(group.articleIds),
    classificationKeys: [...new Set(group.sources.flatMap((ref) => {
      const key = sourceById.get(ref.newsroomArticleId)?.classification.classificationKey;
      return key ? [key] : [];
    }))],
    hasUnclassified: group.sources.some((ref) => !sourceById.get(ref.newsroomArticleId)?.classification.classificationKey),
    updatedSourceCount: group.sources.filter((ref) => {
      const current = sourceById.get(ref.newsroomArticleId)?.snapshot?.id;
      return current && current !== ref.newsroomSnapshotId;
    }).length,
  });
  // One successful consolidation is shown once; origin identities remain in the historical links.
  // Never collapse different events, baselines, or different frozen source sets.
  const collapsedCards = (groups: readonly MesaEditorialGroup[], themeId: string | null = null) => {
    const sets = new Map<string, { group: MesaEditorialGroup; keys: string[] }>();
    for (const group of groups.filter((item) => item.sources.length >= 2 && item.articleIds.length > 0)) {
      const version = group.versionId ? versions.get(group.versionId) : undefined;
      const key = version?.publication_event_id ? `event:${version.publication_event_id}` : group.key;
      const old = sets.get(key);
      if (!old) { sets.set(key, { group, keys: [group.key] }); continue; }
      if (JSON.stringify(old.group.sources) !== JSON.stringify(group.sources)) throw new Error("mesa-organization-revision-conflict");
      const chosen = group.key === `dossier:${version?.production_dossier_id}` ? group : old.group;
      sets.set(key, { keys: [...old.keys, group.key], group: { ...chosen,
        articleIds: [...new Set([...old.group.articleIds, ...group.articleIds])].sort() } });
    }
    return [...sets.values()].map(({ group, keys }) => ({ ...card(group, themeId),
      themeIds: [...new Set(keys.flatMap(parentIds))] }));
  };
  const allCards = collapsedCards([...latest.values()]);
  return {
    themes: records.themes.map((theme) => {
      const linked = [...(members.get(theme.id)?.values() ?? [])];
      const sourceMembers = records.themeSources.filter((member) => member.theme_id === theme.id);
      const articleIds = [...records.themeArticles.filter((row) => row.theme_id === theme.id).map((row) => row.editorial_article_id),
        ...linked.flatMap((group) => group.articleIds)];
      return { id: theme.id, title: theme.title, classificationKey: theme.classification_key, status: theme.status,
        dossiers: collapsedCards(linked, theme.id),
        sourceCount: uniqueCount([...sourceMembers.map((row) => row.newsroom_article_id), ...linked.flatMap((group) => group.sources.map((ref) => ref.newsroomArticleId))]),
        articleCount: uniqueCount(articleIds),
        updatedSourceCount: uniqueCount(sourceMembers.filter((row) => {
          const current = sourceById.get(row.newsroom_article_id)?.snapshot?.id;
          return row.reference_snapshot_id && current && current !== row.reference_snapshot_id;
        }).map((row) => row.newsroom_article_id)),
      };
    }),
    availableDossiers: allCards,
    unlinkedDossiers: allCards.filter((item) => !item.themeIds?.length),
    groupedSourceIds: [...new Set([...latest.values()].filter((group) => group.sources.length >= 2)
      .flatMap((group) => group.sources.map((ref) => ref.newsroomArticleId)))],
  };
}

export function sourceIsUnassigned(source: OperationalDeskSourceItem): boolean {
  return source.lifecycle === "new" && source.themeMembership.themeIds.length === 0
    && (source.dossierMembership?.length ?? 0) === 0;
}

export function suggestedThemeClassification(
  selections: readonly Readonly<{ classificationKey: ArticleClassificationKey | null }>[],
): ArticleClassificationKey | null {
  const keys = new Set(selections.map((source) => source.classificationKey));
  const key = [...keys][0];
  return keys.size === 1 && isArticleClassificationKey(key) ? key : null;
}

/** Independent progressive windows. A filter never mutates or deletes its source records. */
export function visibleMesaItems<T>(items: readonly T[], visibleCount: number): readonly T[] {
  return items.slice(0, Math.max(24, Number.isSafeInteger(visibleCount) ? visibleCount : 24));
}

export function filterMesaOrganization(organization: MesaOrganization, classification: string): MesaOrganization {
  if (classification === "all") return organization;
  const matches = (dossier: MesaDossierCard) => classification === "unclassified"
    ? dossier.hasUnclassified : dossier.classificationKeys?.some((key) => key === classification);
  return { ...organization,
    themes: organization.themes.filter((theme) => theme.classificationKey === classification),
    unlinkedDossiers: organization.unlinkedDossiers.filter(matches),
    availableDossiers: organization.availableDossiers?.filter(matches),
  };
}
