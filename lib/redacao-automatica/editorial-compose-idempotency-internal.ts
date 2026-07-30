import { createHash } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 180;
const MAX_INSTRUCTION_LENGTH = 6000;
const MAX_CONTEXT_LENGTH = 4000;
const MAX_SOURCES = 20;

export type EditorialComposeSourceInput = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  priority: number;
  sourceRole: "primary" | "corroboration" | "context" | "complementary";
  editorialNote: string;
}>;

export type EditorialComposeInput = Readonly<{
  submissionId: string;
  workingTitle: string;
  combineInstructions: string;
  highlightInstructions: string;
  contextInstructions: string;
  avoidInstructions: string;
  articleKind: "news" | "analysis" | "preview" | "summary";
  lengthMode: "brief" | "standard" | "developed";
  outputLanguage: "pt-PT";
  sources: readonly EditorialComposeSourceInput[];
}>;

export type NormalizedEditorialComposeInput = EditorialComposeInput & Readonly<{
  fingerprint: string;
  editorialInstructions: string;
}>;

function cleanText(value: string): string {
  return value.trim().replace(/\r\n?/g, "\n");
}

function validUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isEditorialComposeSubmissionId(value: string): boolean {
  return validUuid(value.trim().toLowerCase());
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

export function normalizeEditorialComposeInput(
  input: EditorialComposeInput,
): NormalizedEditorialComposeInput | null {
  const submissionId = input.submissionId.trim().toLowerCase();
  const workingTitle = cleanText(input.workingTitle);
  const combineInstructions = cleanText(input.combineInstructions);
  const highlightInstructions = cleanText(input.highlightInstructions);
  const contextInstructions = cleanText(input.contextInstructions);
  const avoidInstructions = cleanText(input.avoidInstructions);

  if (
    !validUuid(submissionId)
    || !workingTitle
    || workingTitle.length > MAX_TITLE_LENGTH
    || !combineInstructions
    || combineInstructions.length > MAX_INSTRUCTION_LENGTH
    || !highlightInstructions
    || highlightInstructions.length > MAX_INSTRUCTION_LENGTH
    || contextInstructions.length > MAX_CONTEXT_LENGTH
    || avoidInstructions.length > MAX_CONTEXT_LENGTH
    || !["news", "analysis", "preview", "summary"].includes(input.articleKind)
    || !["brief", "standard", "developed"].includes(input.lengthMode)
    || input.outputLanguage !== "pt-PT"
    || input.sources.length < 1
    || input.sources.length > MAX_SOURCES
  ) {
    return null;
  }

  const orderedSources = input.sources.map((source) => ({
    newsroomArticleId: source.newsroomArticleId.trim().toLowerCase(),
    newsroomSnapshotId: source.newsroomSnapshotId.trim().toLowerCase(),
    priority: Number.isInteger(source.priority) ? source.priority : -1,
    sourceRole: source.sourceRole,
    editorialNote: cleanText(source.editorialNote),
  })).sort((left, right) => (
    left.priority - right.priority
    || left.newsroomArticleId.localeCompare(right.newsroomArticleId)
    || left.newsroomSnapshotId.localeCompare(right.newsroomSnapshotId)
  ));
  const sources = orderedSources.some((source) => source.sourceRole === "primary")
    ? orderedSources
    : orderedSources.map((source, index) => (
        index === 0 ? { ...source, sourceRole: "primary" as const } : source
      ));
  const articleIds = new Set<string>();
  for (const source of sources) {
    if (
      !validUuid(source.newsroomArticleId)
      || !validUuid(source.newsroomSnapshotId)
      || source.priority < 1
      || source.priority > 99
      || !["primary", "corroboration", "context", "complementary"].includes(source.sourceRole)
      || source.editorialNote.length > 3000
      || articleIds.has(source.newsroomArticleId)
    ) {
      return null;
    }
    articleIds.add(source.newsroomArticleId);
  }

  const editorialInstructions = [
    `Como combinar as fontes:\n${combineInstructions}`,
    `Assuntos a destacar e tratamento pretendido:\n${highlightInstructions}`,
    avoidInstructions ? `Informação a evitar:\n${avoidInstructions}` : "",
  ].filter(Boolean).join("\n\n");
  const canonicalPayload = {
    submissionId,
    workingTitle,
    sources,
    articleKind: input.articleKind,
    lengthMode: input.lengthMode,
    outputLanguage: input.outputLanguage,
    combineInstructions,
    highlightInstructions,
    contextInstructions,
    avoidInstructions,
  };
  const fingerprint = createHash("sha256")
    .update(canonicalJson(canonicalPayload), "utf8")
    .digest("hex");

  return {
    ...canonicalPayload,
    editorialInstructions,
    fingerprint,
  };
}

export type EditorialComposePrepared = Readonly<{
  submissionId: string;
  fingerprint: string;
  dossierId: string;
  articlePlanId: string;
  editorialArticleId: string;
  compositionAction: "created" | "reused";
  generationStatus: "ready" | "in_progress" | "failed" | "completed";
}>;

export type EditorialComposeClaim = Readonly<{
  action: "claimed" | "in_progress" | "completed";
  editorialArticleId: string;
}>;

export function validPreparedCompose(value: EditorialComposePrepared | null): value is EditorialComposePrepared {
  return Boolean(
    value
    && validUuid(value.submissionId)
    && /^[0-9a-f]{64}$/.test(value.fingerprint)
    && validUuid(value.dossierId)
    && validUuid(value.articlePlanId)
    && validUuid(value.editorialArticleId)
    && ["created", "reused"].includes(value.compositionAction)
    && ["ready", "in_progress", "failed", "completed"].includes(value.generationStatus),
  );
}

export function validComposeClaim(value: EditorialComposeClaim | null): value is EditorialComposeClaim {
  return Boolean(
    value
    && ["claimed", "in_progress", "completed"].includes(value.action)
    && validUuid(value.editorialArticleId),
  );
}

export type RunEditorialComposeGenerationResult =
  | Readonly<{
      ok: true;
      editorialArticleId: string;
      action: "generated" | "reused" | "in_progress";
    }>
  | Readonly<{ ok: false; error: string }>;

export async function runEditorialComposeGeneration(
  input: Readonly<{
    dossierId: string;
    articlePlanId: string;
    editorialArticleId: string;
  }>,
  dependencies: Readonly<{
    claim(): Promise<EditorialComposeClaim | null>;
    generate(): Promise<
      | Readonly<{
          ok: true;
          value: Readonly<{
            editorialArticleId: string;
            action: "generated" | "reused";
          }>;
        }>
      | Readonly<{ ok: false; error: Readonly<{ code: string }> }>
    >;
    fail(errorCode: string): Promise<void>;
    complete(): Promise<void>;
  }>,
): Promise<RunEditorialComposeGenerationResult> {
  const claim = await dependencies.claim();
  if (!claim || claim.editorialArticleId !== input.editorialArticleId) {
    return { ok: false, error: "generation_claim_failed" };
  }
  if (claim.action === "completed") {
    return {
      ok: true,
      editorialArticleId: input.editorialArticleId,
      action: "reused",
    };
  }
  if (claim.action === "in_progress") {
    return {
      ok: true,
      editorialArticleId: input.editorialArticleId,
      action: "in_progress",
    };
  }

  const generation = await dependencies.generate();
  if (!generation.ok) {
    await dependencies.fail(generation.error.code);
    return { ok: false, error: generation.error.code };
  }
  if (generation.value.editorialArticleId !== input.editorialArticleId) {
    await dependencies.fail("generation_article_mismatch");
    return { ok: false, error: "generation_apply_conflict" };
  }

  await dependencies.complete();
  return {
    ok: true,
    editorialArticleId: input.editorialArticleId,
    action: generation.value.action,
  };
}
