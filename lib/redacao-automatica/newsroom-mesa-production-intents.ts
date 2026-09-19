/**
 * Production decisions are independent of Theme membership and publication history.
 * Pure planning foundation: no I/O, membership writes, article writes or legacy changes.
 * The caller must supply server-read authorities; browser counts are not authorities.
 */
export const MESA_INTENT_LIMITS = { contexts: 20, sources: 20, outputs: 30 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{64}$/;

export type MesaThemeIntent =
  | Readonly<{ themeId: string; action: "defer" }>
  | Readonly<{
      themeId: string;
      action: "prepare";
      reviewPublished: boolean;
      newArticleCount: number;
    }>;

export type MesaLooseSourceIntent =
  | Readonly<{ sourceId: string; destination: "defer" }>
  | Readonly<{ sourceId: string; destination: "independent"; newArticleCount: number }>
  | Readonly<{ sourceId: string; destination: "theme"; themeId: string }>;

export type MesaSelectionIntent = Readonly<{
  sourceIds: readonly string[];
  reviewArticleIds: readonly string[];
  newArticleCount: number;
}>;

export type MesaProductionIntent = Readonly<{
  version: 1;
  preparationKey: string;
  title: string;
  themes: readonly MesaThemeIntent[];
  sources: readonly MesaLooseSourceIntent[];
  selection?: MesaSelectionIntent;
}>;

export type MesaSourceCapture = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  capturedAt: string;
}>;

export type MesaSourceAuthority = Readonly<{
  newsroomArticleId: string;
  latestSnapshot: Readonly<{ id: string; capturedAt: string; usable: boolean }> | null;
}>;

export type MesaPublishedArticleAuthority = Readonly<{
  editorialArticleId: string;
  slug: string;
  title: string;
  matchdayId: string | null;
  // Hash the canonical content, not just title/date. Used again before publication.
  contentFingerprint: string;
}>;

export type MesaThemeAuthority = Readonly<{
  themeId: string;
  title: string;
  status: "open" | "archived";
  sources: readonly MesaSourceAuthority[];
  publishedArticles: readonly MesaPublishedArticleAuthority[];
}>;

export type MesaProductionAuthorities = Readonly<{
  readAt: string;
  themes: readonly MesaThemeAuthority[];
  sources: readonly MesaSourceAuthority[];
  /** Global canonical candidates for the technical selection context. */
  selectionPublishedArticles?: readonly MesaPublishedArticleAuthority[];
}>;

export type MesaIntentIssue = Readonly<{
  code: string;
  contextKey: string | null;
  message: string;
}>;

type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{
  ok: false;
  issues: readonly MesaIntentIssue[];
}>;

export type MesaIntentContext = Readonly<{
  key: string;
  kind: "theme" | "source" | "selection";
  themeId: string | null;
  sourceId: string | null;
  title: string;
  reviewPublished: boolean;
  newArticleCount: number;
  sources: readonly MesaSourceCapture[];
  // Reference-only articles are never represented by an EXISTING slot.
  publishedArticles: readonly MesaPublishedArticleAuthority[];
}>;

export type MesaIntentOutput = Readonly<{
  slot: string;
  contextKey: string;
  kind: "existing" | "new";
  target: MesaPublishedArticleAuthority | null;
}>;

export type MesaProductionIntentPlan = Readonly<{
  contractVersion: 1;
  preparationKey: string;
  title: string;
  capturedAt: string;
  contexts: readonly MesaIntentContext[];
  outputs: readonly MesaIntentOutput[];
  // These are proposed membership writes. Previewing this plan must not execute them.
  incorporations: readonly Readonly<{ themeId: string; sourceId: string }>[];
  deferred: Readonly<{ themeIds: readonly string[]; sourceIds: readonly string[] }>;
  totals: Readonly<{ contexts: number; sources: number; reviews: number; newArticles: number }>;
}>;

function issue(code: string, message: string, contextKey: string | null = null): MesaIntentIssue {
  return { code, contextKey, message };
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

function count(value: unknown, min = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= MESA_INTENT_LIMITS.outputs;
}

function iso(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === value;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** Explicit versioning prevents a legacy boolean or an absent count from becoming intent. */
export function parseMesaProductionIntent(value: unknown): Result<MesaProductionIntent> {
  const row = object(value);
  const baseKeys = ["version", "preparationKey", "title", "themes", "sources"] as const;
  if (!row || !(exactKeys(row, baseKeys) || exactKeys(row, [...baseKeys, "selection"]))
    || row.version !== 1 || !uuid(row.preparationKey)
    || typeof row.title !== "string" || !row.title.trim() || row.title.trim().length > 180
    || !Array.isArray(row.themes) || row.themes.length > 20
    || !Array.isArray(row.sources) || row.sources.length > 200) {
    return { ok: false, issues: [issue("intent_invalid", "O pedido de preparação está incompleto ou não é válido.")] };
  }
  const themes: MesaThemeIntent[] = [];
  const sources: MesaLooseSourceIntent[] = [];
  let selection: MesaSelectionIntent | undefined;
  for (const candidate of row.themes) {
    const item = object(candidate), themeId = uuid(item?.themeId);
    if (!item || !themeId) return { ok: false, issues: [issue("theme_intent_invalid", "A decisão do Tema não é válida.")] };
    if (item.action === "defer" && exactKeys(item, ["themeId", "action"])) themes.push({ themeId, action: "defer" });
    else if (item.action === "prepare" && exactKeys(item, ["themeId", "action", "reviewPublished", "newArticleCount"])
      && typeof item.reviewPublished === "boolean" && count(item.newArticleCount)) {
      themes.push({ themeId, action: "prepare", reviewPublished: item.reviewPublished, newArticleCount: item.newArticleCount });
    } else return { ok: false, issues: [issue("theme_intent_invalid", "Indica se pretendes rever os publicados e quantos artigos novos preparar.", `theme:${themeId}`)] };
  }
  for (const candidate of row.sources) {
    const item = object(candidate), sourceId = uuid(item?.sourceId);
    if (!item || !sourceId) return { ok: false, issues: [issue("source_intent_invalid", "A decisão da fonte não é válida.")] };
    if (item.destination === "defer" && exactKeys(item, ["sourceId", "destination"])) sources.push({ sourceId, destination: "defer" });
    else if (item.destination === "theme" && uuid(item.themeId) && exactKeys(item, ["sourceId", "destination", "themeId"])) {
      sources.push({ sourceId, destination: "theme", themeId: uuid(item.themeId)! });
    } else if (item.destination === "independent" && count(item.newArticleCount, 1)
      && exactKeys(item, ["sourceId", "destination", "newArticleCount"])) {
      sources.push({ sourceId, destination: "independent", newArticleCount: item.newArticleCount });
    } else return { ok: false, issues: [issue("source_intent_invalid", "Indica o destino e o trabalho pretendido para esta fonte.", `source:${sourceId}`)] };
  }
  if (Object.hasOwn(row, "selection")) {
    const item = object(row.selection);
    if (!item || !exactKeys(item, ["sourceIds", "reviewArticleIds", "newArticleCount"])
      || !Array.isArray(item.sourceIds) || item.sourceIds.length < 1 || item.sourceIds.length > MESA_INTENT_LIMITS.sources
      || !Array.isArray(item.reviewArticleIds) || item.reviewArticleIds.length > MESA_INTENT_LIMITS.outputs
      || !count(item.newArticleCount)) {
      return { ok: false, issues: [issue("selection_intent_invalid", "A decisão sobre a seleção não é válida.", "selection")] };
    }
    const sourceIds = item.sourceIds.map(uuid), reviewArticleIds = item.reviewArticleIds.map(uuid);
    if (sourceIds.some((id) => id === null) || reviewArticleIds.some((id) => id === null)
      || !unique(sourceIds as string[]) || !unique(reviewArticleIds as string[])
      || reviewArticleIds.length + item.newArticleCount < 1) {
      return { ok: false, issues: [issue("selection_intent_invalid", "A seleção contém fontes, artigos ou contagens inválidas.", "selection")] };
    }
    selection = {
      sourceIds: (sourceIds as string[]).sort(),
      reviewArticleIds: (reviewArticleIds as string[]).sort(),
      newArticleCount: item.newArticleCount,
    };
  }
  if (!unique(themes.map((item) => item.themeId)) || !unique(sources.map((item) => item.sourceId))
    || selection?.sourceIds.some((sourceId) => sources.some((item) => item.sourceId === sourceId))) {
    return { ok: false, issues: [issue("intent_duplicate", "Há Temas ou fontes repetidos no pedido.")] };
  }
  return { ok: true, value: { version: 1, preparationKey: uuid(row.preparationKey)!, title: row.title.trim(), themes, sources,
    ...(selection ? { selection } : {}) } };
}

function sourceCapture(value: MesaSourceAuthority, readAt: string): MesaSourceCapture | null {
  if (!uuid(value.newsroomArticleId) || !value.latestSnapshot || !uuid(value.latestSnapshot.id)
    || value.latestSnapshot.usable !== true || !iso(value.latestSnapshot.capturedAt)
    || value.latestSnapshot.capturedAt > readAt) return null;
  return {
    newsroomArticleId: uuid(value.newsroomArticleId)!,
    newsroomSnapshotId: uuid(value.latestSnapshot.id)!,
    capturedAt: value.latestSnapshot.capturedAt,
  };
}

function articleValid(article: MesaPublishedArticleAuthority): boolean {
  return Boolean(uuid(article.editorialArticleId) && typeof article.slug === "string" && article.slug.trim()
    && typeof article.title === "string" && article.title.trim()
    && (article.matchdayId === null || uuid(article.matchdayId)) && FINGERPRINT.test(article.contentFingerprint));
}

/** No history count supplied by the browser participates in this decision. */
export function resolveMesaProductionIntent(
  rawIntent: unknown,
  authority: MesaProductionAuthorities,
): Result<MesaProductionIntentPlan> {
  const parsed = parseMesaProductionIntent(rawIntent);
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  if (!iso(authority.readAt)
    || !unique(authority.themes.map((item) => item.themeId.toLowerCase()))
    || !unique(authority.sources.map((item) => item.newsroomArticleId.toLowerCase()))) {
    return { ok: false, issues: [issue("authority_invalid", "A leitura atual da seleção não é consistente.")] };
  }
  const themes = new Map(authority.themes.map((item) => [item.themeId.toLowerCase(), item]));
  const loose = new Map(authority.sources.map((item) => [item.newsroomArticleId.toLowerCase(), item]));
  const issues: MesaIntentIssue[] = [];
  const contexts: MesaIntentContext[] = [];
  const incorporations: { themeId: string; sourceId: string }[] = [];
  const deferred = {
    themeIds: input.themes.filter((item) => item.action === "defer").map((item) => item.themeId),
    sourceIds: input.sources.filter((item) => item.destination === "defer").map((item) => item.sourceId),
  };
  for (const assignment of input.sources) {
    if (assignment.destination === "theme"
      && !input.themes.some((item) => item.themeId === assignment.themeId && item.action === "prepare")) {
      issues.push(issue("incorporation_target_inactive", "A fonte só pode ser incorporada num Tema explicitamente incluído nesta preparação.", `source:${assignment.sourceId}`));
    }
  }
  for (const intent of input.themes) {
    if (intent.action === "defer") continue;
    const key = `theme:${intent.themeId}`, theme = themes.get(intent.themeId);
    if (!theme || theme.status !== "open") {
      issues.push(issue("theme_unavailable", "O Tema não está disponível. Podes deixá-lo para depois e preparar as fontes independentes.", key));
      continue;
    }
    if (!unique(theme.sources.map((source) => source.newsroomArticleId.toLowerCase()))) {
      issues.push(issue("theme_sources_invalid", "A leitura devolveu fontes repetidas neste Tema.", key));
      continue;
    }
    if (theme.publishedArticles.some((article) => !articleValid(article))
      || !unique(theme.publishedArticles.map((article) => article.editorialArticleId.toLowerCase()))) {
      issues.push(issue("published_history_invalid", "Não foi possível confirmar o histórico de artigos publicados deste Tema.", key));
      continue;
    }
    if (intent.reviewPublished && theme.publishedArticles.length === 0) {
      issues.push(issue("nothing_to_review", "Este Tema ainda não tem artigos Jornada publicados. Só pode preparar artigos novos.", key));
    }
    if (!intent.reviewPublished && intent.newArticleCount === 0) {
      issues.push(issue("theme_work_missing", "Escolhe revisão, artigos novos ou deixa explicitamente este Tema para depois.", key));
    }
    const captures = new Map<string, MesaSourceCapture>();
    const add = (source: MesaSourceAuthority | undefined, sourceId: string) => {
      const capture = source ? sourceCapture(source, authority.readAt) : null;
      if (!capture) {
        issues.push(issue("source_snapshot_unavailable", `A fonte ${sourceId} não tem uma captura atual utilizável.`, key));
        return;
      }
      const previous = captures.get(capture.newsroomArticleId);
      if (previous && previous.newsroomSnapshotId !== capture.newsroomSnapshotId) {
        issues.push(issue("source_version_conflict", "A mesma fonte tem versões incompatíveis nesta leitura. Volta a ler a seleção.", key));
      }
      captures.set(capture.newsroomArticleId, capture);
    };
    for (const source of theme.sources) add(source, source.newsroomArticleId);
    for (const source of input.sources) {
      if (source.destination !== "theme" || source.themeId !== intent.themeId) continue;
      const wasMember = theme.sources.some((item) => item.newsroomArticleId.toLowerCase() === source.sourceId);
      add(loose.get(source.sourceId), source.sourceId);
      if (!wasMember) incorporations.push({ themeId: intent.themeId, sourceId: source.sourceId });
    }
    if (captures.size === 0) issues.push(issue("theme_sources_missing", "O Tema não tem fontes utilizáveis para esta preparação.", key));
    contexts.push({
      key, kind: "theme", themeId: intent.themeId, sourceId: null, title: theme.title,
      reviewPublished: intent.reviewPublished, newArticleCount: intent.newArticleCount,
      sources: [...captures.values()].sort((a, b) => a.newsroomArticleId.localeCompare(b.newsroomArticleId)),
      publishedArticles: theme.publishedArticles.map((article) => ({
        ...article,
        editorialArticleId: uuid(article.editorialArticleId)!,
        matchdayId: article.matchdayId === null ? null : uuid(article.matchdayId)!,
      })).sort((a, b) => a.editorialArticleId.localeCompare(b.editorialArticleId)),
    });
  }
  for (const source of input.sources) {
    if (source.destination !== "independent") continue;
    const key = `source:${source.sourceId}`, found = loose.get(source.sourceId);
    const capture = found ? sourceCapture(found, authority.readAt) : null;
    if (!capture) {
      issues.push(issue("source_snapshot_unavailable", "A fonte independente não tem uma captura atual utilizável.", key));
      continue;
    }
    contexts.push({ key, kind: "source", themeId: null, sourceId: source.sourceId,
      title: "Fonte independente", reviewPublished: false, newArticleCount: source.newArticleCount,
      sources: [capture], publishedArticles: [] });
  }
  if (input.selection) {
    const key = `selection:${input.preparationKey}`;
    const candidates = authority.selectionPublishedArticles ?? [];
    if (candidates.some((article) => !articleValid(article))
      || !unique(candidates.map((article) => article.editorialArticleId.toLowerCase()))) {
      issues.push(issue("published_history_invalid", "Não foi possível confirmar os artigos publicados relacionados com esta seleção.", key));
    }
    const byId = new Map(candidates.map((article) => [article.editorialArticleId.toLowerCase(), article]));
    if (input.selection.reviewArticleIds.some((articleId) => !byId.has(articleId))) {
      issues.push(issue("selection_target_unavailable", "Um artigo escolhido para revisão já não pertence aos candidatos confirmados desta seleção.", key));
    }
    const captures: MesaSourceCapture[] = [];
    for (const sourceId of input.selection.sourceIds) {
      const found = loose.get(sourceId), capture = found ? sourceCapture(found, authority.readAt) : null;
      if (!capture) {
        issues.push(issue("source_snapshot_unavailable", `A fonte ${sourceId} não tem uma captura atual utilizável.`, key));
        continue;
      }
      captures.push(capture);
    }
    contexts.push({
      key, kind: "selection", themeId: null, sourceId: null, title: input.title,
      reviewPublished: input.selection.reviewArticleIds.length > 0, newArticleCount: input.selection.newArticleCount,
      sources: captures.sort((a, b) => a.newsroomArticleId.localeCompare(b.newsroomArticleId)),
      publishedArticles: input.selection.reviewArticleIds.flatMap((articleId) => {
        const article = byId.get(articleId);
        return article ? [{
          ...article,
          editorialArticleId: uuid(article.editorialArticleId)!,
          matchdayId: article.matchdayId === null ? null : uuid(article.matchdayId)!,
        }] : [];
      }).sort((a, b) => a.editorialArticleId.localeCompare(b.editorialArticleId)),
    });
  }
  contexts.sort((a, b) => a.key.localeCompare(b.key));
  const sourceVersions = new Map<string, string>();
  for (const context of contexts) for (const source of context.sources) {
    const previous = sourceVersions.get(source.newsroomArticleId);
    if (previous && previous !== source.newsroomSnapshotId) {
      issues.push(issue("source_version_conflict", "A mesma fonte tem capturas diferentes em dois contextos.", context.key));
    }
    sourceVersions.set(source.newsroomArticleId, source.newsroomSnapshotId);
  }
  const outputs: MesaIntentOutput[] = [];
  const targetIds = new Set<string>();
  for (const context of contexts.filter((item) => item.reviewPublished)) {
    for (const target of context.publishedArticles) {
      if (targetIds.has(target.editorialArticleId)) issues.push(issue("review_target_conflict",
        "O mesmo artigo não pode receber duas atualizações concorrentes nesta preparação. Escolhe apenas um contexto responsável pela revisão.", context.key));
      targetIds.add(target.editorialArticleId);
      outputs.push({ slot: `EXISTING_${String(outputs.length + 1).padStart(2, "0")}`, contextKey: context.key, kind: "existing", target });
    }
  }
  const reviews = outputs.length;
  let newArticles = 0;
  for (const context of contexts) for (let i = 0; i < context.newArticleCount; i++) {
    newArticles++;
    outputs.push({ slot: `NEW_${String(newArticles).padStart(2, "0")}`, contextKey: context.key, kind: "new", target: null });
  }
  if (!outputs.length) issues.push(issue("no_work_requested", "Não há trabalho editorial pedido. A seleção fica preservada."));
  if (contexts.length > MESA_INTENT_LIMITS.contexts) issues.push(issue("context_limit", "O máximo atual é 20 contextos por Produção. Nada foi dividido."));
  if (sourceVersions.size > MESA_INTENT_LIMITS.sources) issues.push(issue("source_limit", "O máximo atual é 20 fontes distintas por Produção. Nenhuma foi cortada."));
  if (outputs.length > MESA_INTENT_LIMITS.outputs) issues.push(issue("output_limit", "Revisões e novos artigos ultrapassam os 30 resultados aceites por Produção."));
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { contractVersion: 1, preparationKey: input.preparationKey,
    title: input.title, capturedAt: authority.readAt, contexts, outputs,
    incorporations: incorporations.sort((a, b) => `${a.themeId}:${a.sourceId}`.localeCompare(`${b.themeId}:${b.sourceId}`)),
    deferred: { themeIds: [...deferred.themeIds].sort(), sourceIds: [...deferred.sourceIds].sort() },
    totals: { contexts: contexts.length, sources: sourceVersions.size, reviews, newArticles } } };
}

/** Hash this canonical value on the server and compare it again in the write transaction.
 * readAt itself is excluded: a repeated read with identical material is not a change.
 * Content fingerprints and exact snapshot IDs are included, even in reference-only history.
 */
export function mesaProductionIntentAuthorityMaterial(plan: MesaProductionIntentPlan): string {
  const { capturedAt: _readAt, ...authority } = plan;
  return JSON.stringify(authority);
}

export type MesaIntentPublicationDecision = Readonly<{
  slot: string;
  decision: "UPDATE" | "SEM_ALTERAÇÃO" | "NEW";
  // Supplied from authoritative publication rows, never trusted from pasted editorial text.
  publishedArticle: Readonly<{ id: string; slug: string; matchdayId: string | null }> | null;
}>;

export type MesaArticleCaptureReceipt = Readonly<{
  contextKey: string;
  themeId: string | null;
  articleId: string;
  slot: string;
  decision: "UPDATE" | "SEM_ALTERAÇÃO" | "NEW";
  capturedAt: string;
  sources: readonly MesaSourceCapture[];
}>;

/** Produce audit receipts only for a complete, validated cycle. No implicit SEM_ALTERAÇÃO. */
export function resolveMesaIntentPublication(
  plan: MesaProductionIntentPlan,
  decisions: readonly MesaIntentPublicationDecision[],
): Result<readonly MesaArticleCaptureReceipt[]> {
  if (decisions.length !== plan.outputs.length || !unique(decisions.map((item) => item.slot))) {
    return { ok: false, issues: [issue("resolution_incomplete", "Faltam decisões ou há resultados repetidos. O ciclo não foi marcado como revisto.")] };
  }
  const bySlot = new Map(decisions.map((item) => [item.slot, item]));
  const history = new Set(plan.contexts.flatMap((context) => context.publishedArticles.map((article) => article.editorialArticleId)));
  const publishedIds = new Set<string>();
  const receipts: MesaArticleCaptureReceipt[] = [];
  for (const output of plan.outputs) {
    const context = plan.contexts.find((item) => item.key === output.contextKey);
    const result = bySlot.get(output.slot);
    const target = output.target;
    if (!context || !result || (output.kind === "new" ? result.decision !== "NEW"
      : result.decision !== "UPDATE" && result.decision !== "SEM_ALTERAÇÃO")) {
      return { ok: false, issues: [issue("resolution_invalid", "Uma decisão não corresponde ao trabalho pedido.", output.contextKey)] };
    }
    const published = result.publishedArticle;
    if (result.decision === "SEM_ALTERAÇÃO") {
      if (published !== null || !context.reviewPublished || !target) {
        return { ok: false, issues: [issue("no_change_invalid", "SEM ALTERAÇÃO só é válido numa revisão pedida e não pode publicar outro artigo.", output.contextKey)] };
      }
    } else {
      if (!published || uuid(published.id) !== published.id || typeof published.slug !== "string" || !published.slug.trim()
        || published.matchdayId !== null && uuid(published.matchdayId) !== published.matchdayId
        || publishedIds.has(published.id)
        || result.decision === "NEW" && history.has(published.id)
        || result.decision === "UPDATE" && (!target || !context.reviewPublished
          || published.id !== target.editorialArticleId || published.slug !== target.slug
          || published.matchdayId !== target.matchdayId)) {
        return { ok: false, issues: [issue("publication_identity_invalid", "O resultado não preserva a identidade ou o contexto editorial autorizado.", output.contextKey)] };
      }
      publishedIds.add(published.id);
    }
    receipts.push({
      contextKey: context.key, themeId: context.themeId, articleId: target?.editorialArticleId ?? published!.id,
      slot: output.slot, decision: result.decision, capturedAt: plan.capturedAt,
      sources: context.sources.map((source) => ({ ...source })),
    });
  }
  return { ok: true, value: receipts };
}

/** Append-only receipts: publishing NEW must not move the baseline of an older article.
 * A delayed older production also must not overwrite a newer article review.
 * Missing history means UNKNOWN, not UNCHANGED.
 */
export function compareMesaArticleSourceCaptureByArticle(
  articleId: string,
  current: readonly MesaSourceCapture[],
  receipts: readonly MesaArticleCaptureReceipt[],
): readonly Readonly<{ sourceId: string; change: "UNKNOWN" | "NEW_SOURCE" | "UPDATED_SOURCE" | "UNCHANGED_SOURCE" }>[] {
  const latest = receipts.filter((item) => item.articleId === articleId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  const sameTime = latest ? receipts.filter((item) => item.articleId === articleId
    && item.capturedAt === latest.capturedAt) : [];
  const captureKey = (sources: readonly MesaSourceCapture[]) => JSON.stringify(sources.map((source) => (
    [source.newsroomArticleId, source.newsroomSnapshotId]
  )).sort((a, b) => a[0].localeCompare(b[0])));
  const ambiguous = new Set(sameTime.map((item) => captureKey(item.sources))).size > 1;
  const baseline = new Map(latest?.sources.map((source) => [source.newsroomArticleId, source.newsroomSnapshotId]) ?? []);
  return current.map((source) => ({ sourceId: source.newsroomArticleId,
    change: !latest || ambiguous ? "UNKNOWN" : !baseline.has(source.newsroomArticleId) ? "NEW_SOURCE"
      : baseline.get(source.newsroomArticleId) !== source.newsroomSnapshotId ? "UPDATED_SOURCE" : "UNCHANGED_SOURCE" }));
}

/** Compatibility view for Theme-specific UI. Article continuity itself is global. */
export function compareMesaArticleSourceCapture(
  themeId: string,
  articleId: string,
  current: readonly MesaSourceCapture[],
  receipts: readonly MesaArticleCaptureReceipt[],
) {
  return compareMesaArticleSourceCaptureByArticle(
    articleId,
    current,
    receipts.filter((item) => item.themeId === themeId),
  );
}
