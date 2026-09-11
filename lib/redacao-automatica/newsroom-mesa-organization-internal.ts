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
  id: string; kind: "dossier" | "package"; title: string; status: string;
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
}>;
export type MesaOrganizationRecords = Readonly<{
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
  const themeIds = new Set(records.themes.map((theme) => theme.id));
  const dossierParents = new Map<string, string>();
  for (const link of records.themeDossiers) {
    if (!themeIds.has(link.theme_id) || dossierParents.has(link.dossier_id)) {
      throw new Error("mesa-organization-relation-invalid");
    }
    dossierParents.set(link.dossier_id, link.theme_id);
  }
  const nativeCards = records.dossiers.map((dossier): MesaDossierCard => {
    const rows = records.dossierSources.filter((source) => source.dossier_id === dossier.id && source.included);
    return {
      id: dossier.id, kind: "dossier", title: dossier.title, status: dossier.status,
      themeId: dossierParents.get(dossier.id) ?? null,
      sourceCount: uniqueCount(rows.map((source) => source.newsroom_article_id)),
      classificationKeys: [...new Set(rows.flatMap((row) => {
        const key = sourceById.get(row.newsroom_article_id)?.classification.classificationKey;
        return key ? [key] : [];
      }))],
      hasUnclassified: rows.some((row) => sourceById.get(row.newsroom_article_id)?.classification.status === "unclassified"),
      articleCount: uniqueCount(records.publishedLinks.filter((link) => link.dossier_id === dossier.id)
        .map((link) => link.editorial_article_id)),
      updatedSourceCount: uniqueCount(rows.filter((row) => {
        const current = sourceById.get(row.newsroom_article_id)?.snapshot?.id;
        return current && current !== row.newsroom_snapshot_id;
      }).map((row) => row.newsroom_article_id)),
    };
  });
  // Earlier Source Packages stay in their actual groups. Never infer their parent Theme.
  const packages = new Map<string, { sourceIds: Set<string>; articleIds: Set<string>; updated: Set<string>; href?: string; title?: string }>();
  for (const source of sources) {
    for (const contribution of source.publishedContributions) {
      if (contribution.origin !== "legacy_source_package") continue;
      const group = packages.get(contribution.packageId) ?? {
        sourceIds: new Set<string>(), articleIds: new Set<string>(), updated: new Set<string>(),
      };
      if (contribution.packageYear && contribution.packageMonth && /^\d{4}$/.test(contribution.packageYear)
        && /^(0[1-9]|1[0-2])$/.test(contribution.packageMonth)) {
        group.href = `/admin/editorial/redacao-automatica/pacotes/${contribution.packageYear}/${contribution.packageMonth}/${contribution.packageId}`;
      }
      group.title ??= contribution.title;
      group.sourceIds.add(source.newsroomArticleId);
      group.articleIds.add(contribution.editorialArticleId);
      if (source.snapshot && source.snapshot.id !== contribution.newsroomSnapshotId) group.updated.add(source.newsroomArticleId);
      packages.set(contribution.packageId, group);
    }
  }
  const packageCards = [...packages].map(([id, group]): MesaDossierCard => ({
    id, kind: "package", title: group.title ? `Dossiê · ${group.title}` : "Dossiê do circuito anterior", status: "published", themeId: null,
    href: group.href,
    classificationKeys: [...new Set([...group.sourceIds].flatMap((id) => {
      const key = sourceById.get(id)?.classification.classificationKey;
      return key ? [key] : [];
    }))],
    hasUnclassified: [...group.sourceIds].some((id) => sourceById.get(id)?.classification.status === "unclassified"),
    sourceCount: group.sourceIds.size, articleCount: group.articleIds.size, updatedSourceCount: group.updated.size,
  }));
  return {
    themes: records.themes.map((theme) => {
      const members = records.themeSources.filter((member) => member.theme_id === theme.id);
      const dossiers = nativeCards.filter((card) => card.themeId === theme.id);
      const publishedIds = records.themeArticles.filter((article) => article.theme_id === theme.id)
        .map((article) => article.editorial_article_id);
      for (const dossier of dossiers) publishedIds.push(...records.publishedLinks
        .filter((link) => link.dossier_id === dossier.id).map((link) => link.editorial_article_id));
      return {
        id: theme.id, title: theme.title, classificationKey: theme.classification_key, status: theme.status,
        sourceCount: uniqueCount(members.map((member) => member.newsroom_article_id)),
        articleCount: uniqueCount(publishedIds), dossiers,
        updatedSourceCount: uniqueCount(members.filter((member) => {
          const current = sourceById.get(member.newsroom_article_id)?.snapshot?.id;
          return member.reference_snapshot_id && current && current !== member.reference_snapshot_id;
        }).map((member) => member.newsroom_article_id)),
      };
    }),
    unlinkedDossiers: [...nativeCards.filter((card) => card.themeId === null), ...packageCards],
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
  return {
    themes: organization.themes.filter((theme) => theme.classificationKey === classification),
    unlinkedDossiers: organization.unlinkedDossiers.filter((dossier) => classification === "unclassified"
      ? dossier.hasUnclassified : dossier.classificationKeys?.some((key) => key === classification)),
  };
}
