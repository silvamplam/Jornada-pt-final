/** Runtime boundary for the SQL-frozen, multi-context intent plan.
 * Preserve the exact JSON: PostgreSQL compares it with the persisted plan. Do
 * not normalize or recompute SQL fingerprints with JSON.stringify.
 */
import {
  parseMesaProductionIntent, resolveMesaProductionIntent,
  type MesaProductionIntent, type MesaProductionIntentPlan,
  type MesaIntentContext, type MesaIntentOutput, type MesaSourceCapture,
  type MesaPublishedArticleAuthority, type MesaArticleCaptureReceipt,
} from "./newsroom-mesa-production-intents";

export type MesaIntentCapturedSource = MesaSourceCapture & Readonly<{
  contentFingerprint: string; snapshotFingerprint: string;
  usable: true; classificationKey: string;
}>;
export type MesaIntentCapturedArticle = MesaPublishedArticleAuthority & Readonly<{
  article: Readonly<Record<string, unknown>> & Readonly<{
    id: string; slug: string; title: string; status: "published";
    matchday_id: string | null; label: string; subtitle: string; body: string;
  }>;
}>;
export type MesaIntentFrozenContext = Omit<MesaIntentContext, "sources" | "publishedArticles" | "candidateArticles"> & Readonly<{
  productionContextId: string;
  sources: readonly MesaIntentCapturedSource[];
  publishedArticles: readonly MesaIntentCapturedArticle[];
  candidateArticles?: readonly MesaIntentCapturedArticle[];
}>;
export type MesaIntentFrozenOutput = Omit<MesaIntentOutput, "target"> & Readonly<{
  outputId: string; productionContextId: string; target: MesaIntentCapturedArticle | null;
}>;
export type MesaProductionIntentsFrozen = Omit<MesaProductionIntentPlan, "contexts" | "outputs"> & Readonly<{
  dossierId: string; authorityFingerprint: string; request: MesaProductionIntent;
  contexts: readonly MesaIntentFrozenContext[];
  outputs: readonly MesaIntentFrozenOutput[];
}>;
export type MesaProductionIntentsPreview = Omit<MesaProductionIntentsFrozen, "dossierId" | "contexts" | "outputs"> & Readonly<{
  contexts: readonly Omit<MesaIntentFrozenContext, "productionContextId">[];
  outputs: readonly Omit<MesaIntentFrozenOutput, "productionContextId" | "outputId">[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const id = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const hash = (v: unknown): v is string => typeof v === "string" && HASH.test(v);
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id) && unique(v);

/** Structural JSON equality, deliberately not a content hash. Object key order
 * is irrelevant in jsonb; array order and all property values are significant. */
export function sameMesaIntentJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((item, index) => sameMesaIntentJson(item, b[index]));
  const left = object(a), right = object(b);
  return Boolean(left && right && Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every((key) => Object.hasOwn(right, key) && sameMesaIntentJson(left[key], right[key])));
}

function capturedSource(value: unknown): value is MesaIntentCapturedSource {
  const s = object(value);
  return Boolean(s && id(s.newsroomArticleId) && id(s.newsroomSnapshotId) && date(s.capturedAt)
    && hash(s.contentFingerprint) && hash(s.snapshotFingerprint) && s.usable === true && text(s.classificationKey));
}
function capturedArticle(value: unknown): value is MesaIntentCapturedArticle {
  const v = object(value), a = object(v?.article);
  return Boolean(v && a && id(v.editorialArticleId) && text(v.slug) && text(v.title)
    && (v.matchdayId === null || id(v.matchdayId)) && hash(v.contentFingerprint)
    && a.id === v.editorialArticleId && a.slug === v.slug && a.title === v.title
    && a.matchday_id === v.matchdayId && a.status === "published"
    && [a.label, a.subtitle, a.body].every((field) => typeof field === "string"));
}

function validPlan(value: unknown, persisted: boolean): boolean {
  const p = object(value);
  if (!p || p.contractVersion !== 1 || !id(p.preparationKey) || !text(p.title) || !date(p.capturedAt)
    || !hash(p.authorityFingerprint) || (persisted && !id(p.dossierId))
    || !Array.isArray(p.contexts) || p.contexts.length < 1 || p.contexts.length > 20
    || !Array.isArray(p.outputs) || p.outputs.length < 1 || p.outputs.length > 30
    || !Array.isArray(p.incorporations) || !object(p.deferred) || !object(p.totals)) return false;
  const parsedRequest = parseMesaProductionIntent(p.request);
  if (!parsedRequest.ok || !sameMesaIntentJson(parsedRequest.value, p.request)
    || parsedRequest.value.preparationKey !== p.preparationKey || parsedRequest.value.title !== p.title) return false;
  const contexts: MesaIntentFrozenContext[] = [];
  const sourceById = new Map<string, MesaIntentCapturedSource>();
  for (const value of p.contexts) {
    const c = object(value);
    if (!c || !text(c.key) || !text(c.title) || (persisted && !id(c.productionContextId))
      || typeof c.reviewPublished !== "boolean" || !Number.isSafeInteger(c.newArticleCount)
      || Number(c.newArticleCount) < 0 || Number(c.newArticleCount) > 30
      || !Array.isArray(c.sources) || c.sources.length < 1 || c.sources.length > 20
      || !c.sources.every(capturedSource) || !unique(c.sources.map((s) => s.newsroomArticleId))
      || !Array.isArray(c.publishedArticles) || !c.publishedArticles.every(capturedArticle)
      || !unique(c.publishedArticles.map((a) => a.editorialArticleId))
      || (c.candidateArticles !== undefined && (!Array.isArray(c.candidateArticles)
        || c.candidateArticles.length > 200 || !c.candidateArticles.every(capturedArticle)
        || !unique(c.candidateArticles.map((a) => a.editorialArticleId))))) return false;
    if (c.kind === "theme") {
      const theme = object(c.theme);
      if (!id(c.themeId) || c.sourceId !== null || c.key !== `theme:${c.themeId}`
        || !theme || theme.id !== c.themeId || theme.status !== "open" || theme.title !== c.title) return false;
    } else if (c.kind === "source") {
      if (!id(c.sourceId) || c.themeId !== null || c.key !== `source:${c.sourceId}` || c.reviewPublished
        || c.publishedArticles.length || c.sources.length !== 1 || c.sources[0].newsroomArticleId !== c.sourceId) return false;
    } else if (c.kind === "selection") {
      if (c.sourceId !== null || c.themeId !== null || c.key !== `selection:${p.preparationKey}`
        || c.title !== p.title || !parsedRequest.value.selection
        || (parsedRequest.value.selection.candidateArticleIds !== undefined && !Array.isArray(c.candidateArticles))) return false;
    } else return false;
    for (const source of c.sources) {
      if (Date.parse(source.capturedAt) > Date.parse(p.capturedAt)) return false;
      const previous = sourceById.get(source.newsroomArticleId);
      if (previous && !sameMesaIntentJson(previous, source)) return false;
      sourceById.set(source.newsroomArticleId, source);
    }
    contexts.push(c as MesaIntentFrozenContext);
  }
  if (!unique(contexts.map((c) => c.key)) || (persisted && !unique(contexts.map((c) => c.productionContextId)))) return false;
  const incorporated = p.incorporations as unknown[];
  if (incorporated.some((v) => { const i=object(v); return !i || !id(i.themeId) || !id(i.sourceId); })) return false;
  const incorporationKeys = incorporated.map((v) => { const i=object(v)!; return `${i.themeId}:${i.sourceId}`; });
  if (!unique(incorporationKeys) || incorporated.some((v) => {
    const i=object(v)!;
    return !parsedRequest.value.sources.some((s) => s.destination === "theme" && s.themeId === i.themeId && s.sourceId === i.sourceId)
      || !contexts.some((c) => c.themeId === i.themeId && c.sources.some((s) => s.newsroomArticleId === i.sourceId));
  })) return false;
  const authoritySource = (s: MesaIntentCapturedSource) => ({ newsroomArticleId: s.newsroomArticleId,
    latestSnapshot: { id: s.newsroomSnapshotId, capturedAt: s.capturedAt, usable: true } });
  // Reuse the pure planner to validate the request/work/reference relationship.
  // Fingerprints and complete raw articles remain separately checked above.
  const resolved = resolveMesaProductionIntent(parsedRequest.value, {
    readAt: p.capturedAt,
    themes: contexts.filter((c) => c.kind === "theme").map((c) => ({ themeId: c.themeId!, title: c.title,
      status: "open" as const, sources: c.sources.filter((s) => !incorporationKeys.includes(`${c.themeId}:${s.newsroomArticleId}`)).map(authoritySource),
      publishedArticles: c.publishedArticles })),
    sources: [...sourceById.values()].map(authoritySource),
    selectionPublishedArticles: contexts.find((c) => c.kind === "selection")?.candidateArticles
      ?? contexts.find((c) => c.kind === "selection")?.publishedArticles ?? [],
    selectionSources: contexts.find((c) => c.kind === "selection")?.sources.map(authoritySource) ?? [],
  });
  if (!resolved.ok || !sameMesaIntentJson(p.totals, resolved.value.totals)
    || !sameMesaIntentJson(p.deferred, resolved.value.deferred)
    || !sameMesaIntentJson(p.incorporations, resolved.value.incorporations)
    || contexts.length !== resolved.value.contexts.length || p.outputs.length !== resolved.value.outputs.length) return false;
  for (let i=0; i<contexts.length; i++) {
    const c=contexts[i], expected=resolved.value.contexts[i];
    if (c.key !== expected.key || c.reviewPublished !== expected.reviewPublished || c.newArticleCount !== expected.newArticleCount
      || !sameMesaIntentJson(c.sources.map(({newsroomArticleId,newsroomSnapshotId,capturedAt}) => ({newsroomArticleId,newsroomSnapshotId,capturedAt})),expected.sources)) return false;
  }
  for (let i=0; i<p.outputs.length; i++) {
    const o=object(p.outputs[i]), expected=resolved.value.outputs[i];
    if (!o || (persisted && (!id(o.outputId) || !id(o.productionContextId))) || o.slot !== expected.slot
      || o.contextKey !== expected.contextKey || o.kind !== expected.kind) return false;
    const c=contexts.find((c) => c.key === o.contextKey)!;
    if (persisted && o.productionContextId !== c.productionContextId) return false;
    if (o.kind === "new" ? o.target !== null : !capturedArticle(o.target)
      || !sameMesaIntentJson(o.target, c.publishedArticles.find((a) => a.editorialArticleId === expected.target?.editorialArticleId))) return false;
  }
  return !persisted || unique(p.outputs.map((o) => object(o)!.outputId));
}

export function parseMesaProductionIntents(value: unknown): MesaProductionIntentsFrozen | null {
  return validPlan(value, true) ? value as MesaProductionIntentsFrozen : null;
}
export function parseMesaProductionIntentsPreview(value: unknown): MesaProductionIntentsPreview | null {
  return validPlan(value, false) ? value as MesaProductionIntentsPreview : null;
}
export function mesaProductionIntentSlots(plan: MesaProductionIntentsFrozen) {
  return plan.outputs.map((o) => ({ slot: o.slot, kind: o.kind, outputId: o.outputId,
    productionContextId: o.productionContextId, targetEditorialArticleId: o.target?.editorialArticleId ?? null,
    targetSlug: o.target?.slug, targetTitle: o.target?.title, targetMatchdayId: o.target ? o.target.matchdayId : undefined }));
}

/** Validate source IDs against their exact article/snapshot, not only UUID shape. */
export function validateMesaProductionIntentsManifest(value: unknown): MesaProductionIntentsFrozen | null {
  const m=object(value), plan=parseMesaProductionIntents(m?.productionIntents);
  if (!m || !plan || m.themeContinuity !== undefined || m.version !== 5 || m.provenanceContract !== "mesa-v2"
    || !Array.isArray(m.outputs) || !Array.isArray(m.entries) || m.outputs.length !== plan.outputs.length) return null;
  const sourceById=new Map<string, Record<string, unknown>>();
  const capturedByArticle=new Map(plan.contexts.flatMap((c) => c.sources.map((s) => [s.newsroomArticleId,s] as const)));
  for (const raw of m.entries) {
    const e=object(raw), expected=capturedByArticle.get(String(e?.newsroomArticleId));
    if (!e || e.status !== "prepared" || !id(e.provenanceSourceId) || !expected
      || e.newsroomSnapshotId !== expected.newsroomSnapshotId || sourceById.has(e.provenanceSourceId)) return null;
    sourceById.set(e.provenanceSourceId,e);
  }
  if (sourceById.size !== capturedByArticle.size || !unique([...sourceById.values()].map((s) => s.newsroomArticleId))) return null;
  for (let index=0; index<plan.outputs.length; index++) {
    const o=plan.outputs[index], output=object(m.outputs[index]), ref=object(output?.articlePlan);
    const c=plan.contexts.find((c) => c.key === o.contextKey)!;
    if (!output || !ref || output.outputId !== o.outputId || output.position !== index+1
      || ref.articlePlanId !== o.outputId || ref.dossierId !== plan.dossierId || ref.contextId !== o.productionContextId
      || ref.workspaceContractVersion !== 2 || ref.sourceScope !== "context" || ref.origin !== undefined
      || ref.destination !== (o.kind === "existing" ? "update" : "new") || !ids(output.contextSourceIds)
      || output.contextSourceIds.length !== c.sources.length
      || output.contextSourceIds.some((id) => !c.sources.some((s) => sourceById.get(id)?.newsroomArticleId === s.newsroomArticleId))) return null;
    if ((output.publishedArticleId ?? null) !== (o.target?.editorialArticleId ?? null)) return null;
  }
  return plan;
}

export function parseMesaIntentLatestReceipts(value: unknown, themeId: string): readonly MesaArticleCaptureReceipt[] | null {
  if (!Array.isArray(value)) return null;
  for (const raw of value) {
    const r=object(raw);
    if (!r || r.themeId !== themeId || r.contextKey !== `theme:${themeId}` || !id(r.articleId)
      || !date(r.capturedAt) || !text(r.slot) || !/^(EXISTING|NEW)_\d{2}$/.test(r.slot)
      || !["UPDATE","SEM_ALTERAÇÃO","NEW"].includes(String(r.decision))
      || (r.decision === "NEW") !== r.slot.startsWith("NEW_")
      || !Array.isArray(r.sources) || !r.sources.length || r.sources.length>20 || !r.sources.every(capturedSource)
      || !unique(r.sources.map((s) => s.newsroomArticleId))) return null;
  }
  return value as readonly MesaArticleCaptureReceipt[];
}


export function parseMesaIntentLatestArticleReceipts(
  value: unknown,
  articleIds: readonly string[],
): readonly MesaArticleCaptureReceipt[] | null {
  if (!Array.isArray(value) || articleIds.length > 30 || !articleIds.every(id) || !unique(articleIds)) return null;
  const requested=new Set(articleIds);
  for (const raw of value) {
    const r=object(raw);
    if (!r || !text(r.contextKey) || !/^(theme|source|selection):[0-9a-f-]{36}$/.test(String(r.contextKey))
      || !(r.themeId===null || id(r.themeId))
      || (r.themeId!==null && r.contextKey!==`theme:${r.themeId}`)
      || !id(r.articleId) || !requested.has(r.articleId)
      || !date(r.capturedAt) || !text(r.slot) || !/^(EXISTING|NEW)_\d{2}$/.test(r.slot)
      || !["UPDATE","SEM_ALTERAÇÃO","NEW"].includes(String(r.decision))
      || (r.decision === "NEW") !== r.slot.startsWith("NEW_")
      || !Array.isArray(r.sources) || !r.sources.length || r.sources.length>20 || !r.sources.every(capturedSource)
      || !unique(r.sources.map((s) => s.newsroomArticleId))) return null;
  }
  return value as readonly MesaArticleCaptureReceipt[];
}
