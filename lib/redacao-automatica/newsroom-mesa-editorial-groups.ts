/** Editorial identity is the source group, never the publication batch or output count. */
export type MesaSourceRef = Readonly<{ newsroomArticleId: string; newsroomSnapshotId: string }>;
export type MesaMaterialRef = Readonly<{ key: string; versionId: string | null; sources: readonly MesaSourceRef[] }>;
export type MesaEditorialGroup = Readonly<{
  key: string; versionId: string | null; title: string; href: string;
  sources: readonly MesaSourceRef[]; articleIds: readonly string[];
}>;
export type MesaMaterialVersion = Readonly<{
  id: string; material_key: string; title: string; source_refs: readonly MesaSourceRef[];
  article_ids: readonly string[]; revision: number; production_dossier_id: string | null; publication_event_id?: string | null; parent_version_id?: string | null;
}>;
export type MesaThemeMaterial = Readonly<{ theme_id: string; material_key: string; version_id: string }>;
export type MesaProductionContext = Readonly<{ dossier_id: string; theme_id: string | null; material_refs: readonly MesaMaterialRef[] }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 30;
const sourcePosition = (v: unknown, fallback: number): number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 999999 ? Number(v) : fallback;
const used = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

export function isMesaMaterialKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return uuid(parts[1]) && (parts[0] === "dossier" ? parts.length === 2
    : parts[0] === "package" && parts.length === 3 && /^(?:[1-9]|[12][0-9]|30)$/.test(parts[2]));
}

/** A conflicting version of the same source needs an explicit editorial decision. */
export function mergeMesaSourceRefs(lists: readonly (readonly MesaSourceRef[])[]): readonly MesaSourceRef[] {
  const refs = new Map<string, MesaSourceRef>();
  for (const list of lists) for (const ref of list) {
    if (!ref || !uuid(ref.newsroomArticleId) || !uuid(ref.newsroomSnapshotId)) throw new Error("mesa-material-source-invalid");
    const key = ref.newsroomArticleId.toLowerCase();
    const previous = refs.get(key);
    if (previous && previous.newsroomSnapshotId !== ref.newsroomSnapshotId.toLowerCase()) throw new Error("mesa-material-version-conflict");
    refs.set(key, { newsroomArticleId: key, newsroomSnapshotId: ref.newsroomSnapshotId.toLowerCase() });
  }
  return [...refs.values()].sort((a, b) => a.newsroomArticleId.localeCompare(b.newsroomArticleId));
}

export function isMesaMaterialRef(value: unknown): value is MesaMaterialRef {
  const row = object(value);
  if (!row || !isMesaMaterialKey(row.key) || !(row.versionId === null || uuid(row.versionId))
    || !Array.isArray(row.sources) || row.sources.length < 2 || row.sources.length > 200) return false;
  try { return mergeMesaSourceRefs([row.sources]).length === row.sources.length; } catch { return false; }
}

export type MesaPackageUsage = Readonly<{
  newsroomArticleId: string; newsroomSnapshotId: string; packageId: string;
  year: string; month: string; articlePosition: number; sourcePosition: number;
  publishedArticleId: string; usedAt: string;
}>;

/** Supports persisted v2/v3 entries and the v4 output -> source-group mapping. */
export function mesaPackageUsage(manifestValue: unknown): readonly MesaPackageUsage[] {
  const manifest = object(manifestValue);
  if (!manifest || !uuid(manifest.packageId) || !/^\d{4}$/.test(String(manifest.year))
    || !/^(0[1-9]|1[0-2])$/.test(String(manifest.month)) || !Array.isArray(manifest.entries)) return [];
  const entries = manifest.entries.map(object).filter((row): row is Record<string, unknown> => row !== null);
  const outputs = Array.isArray(manifest.outputs) ? manifest.outputs.map(object).filter((row): row is Record<string, unknown> => row !== null) : [];
  const result = new Map<string, MesaPackageUsage>();
  for (const [index, entry] of entries.entries()) {
    if (entry.status !== "prepared" || !positive(entry.articlePosition) || !uuid(entry.newsroomArticleId) || !uuid(entry.newsroomSnapshotId)) continue;
    const entrySourcePosition = sourcePosition(entry.position, index + 1);
    const proofs = outputs.filter((out) => out.sourceArticlePosition === entry.articlePosition && uuid(out.publishedArticleId) && used(out.usedAt));
    if (uuid(entry.publishedArticleId) && used(entry.usedAt)) proofs.push(entry);
    for (const proof of proofs) {
      const articleId = String(proof.publishedArticleId).toLowerCase();
      const ref = { newsroomArticleId: entry.newsroomArticleId.toLowerCase(), newsroomSnapshotId: entry.newsroomSnapshotId.toLowerCase(),
        packageId: manifest.packageId.toLowerCase(), year: String(manifest.year), month: String(manifest.month),
        articlePosition: entry.articlePosition, sourcePosition: entrySourcePosition, publishedArticleId: articleId, usedAt: String(proof.usedAt) };
      result.set(`${ref.articlePosition}:${ref.sourcePosition}:${ref.newsroomArticleId}:${ref.newsroomSnapshotId}:${articleId}`, ref);
    }
  }
  return [...result.values()].sort((left, right) => (
    left.articlePosition - right.articlePosition
    || left.newsroomArticleId.localeCompare(right.newsroomArticleId)
    || right.sourcePosition - left.sourcePosition
    || left.publishedArticleId.localeCompare(right.publishedArticleId)
  ));
}

/** Caller supplies canonical publication proof, never a client-side status flag. */
export function recoverMesaPackageGroups(manifestValue: unknown, publishedArticleIds: ReadonlySet<string>): readonly MesaEditorialGroup[] {
  const manifest = object(manifestValue);
  if (!manifest) return [];
  const usage = mesaPackageUsage(manifest).filter((ref) => publishedArticleIds.has(ref.publishedArticleId));
  const positions = [...new Set(usage.map((ref) => ref.articlePosition))].sort((a, b) => a - b);
  return positions.map((position) => {
    const group = usage.filter((ref) => ref.articlePosition === position);
    const first = group[0];
    const latestBySource = new Map<string, MesaPackageUsage>();
    for (const ref of group) {
      const previous = latestBySource.get(ref.newsroomArticleId);
      if (!previous || ref.sourcePosition > previous.sourcePosition) { latestBySource.set(ref.newsroomArticleId, ref); continue; }
      if (ref.sourcePosition === previous.sourcePosition && ref.newsroomSnapshotId !== previous.newsroomSnapshotId) {
        throw new Error("mesa-material-version-conflict");
      }
    }
    const entries = (manifest.entries as unknown[]).map(object).filter((row) => row?.articlePosition === position);
    const title = entries.map((row) => row?.title).find((title) => typeof title === "string" && title.trim());
    return { key: `package:${first.packageId}:${position}`, versionId: null,
      title: typeof title === "string" ? title : `Grupo editorial ${position}`,
      href: `/admin/editorial/redacao-automatica/pacotes/${first.year}/${first.month}/${first.packageId}`,
      sources: mergeMesaSourceRefs([[...latestBySource.values()]]), articleIds: [...new Set(group.map((ref) => ref.publishedArticleId))].sort() };
  });
}

/** Only explicitly selected materials. Never traverse other Themes through shared sources. */
export function mesaSelectedSources(sources: readonly MesaSourceRef[], materials: readonly MesaMaterialRef[]): readonly MesaSourceRef[] {
  if (materials.some((ref) => !isMesaMaterialRef(ref)) || new Set(materials.map((ref) => ref.key.toLowerCase())).size !== materials.length) {
    throw new Error("mesa-material-selection-invalid");
  }
  return mergeMesaSourceRefs([sources, ...materials.map((material) => material.sources)]);
}
