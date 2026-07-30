import {
  publishedAtPrecisionFromSourceMetadata,
  type PublishedAtPrecision,
} from "@/lib/redacao-automatica/types";
import {
  isManualNewsroomSource,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";

export type ProvenanceValueOrigin = "frozen" | "legacy_current_article" | "missing";

export type EditorialArticleProvenanceSource = Readonly<{
  dossierSourceId: string;
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  sourceRole: string;
  sortOrder: number;
  priority: number;
  editorialNote: string | null;
  sourceCode: string | null;
  sourceCodeOrigin: ProvenanceValueOrigin;
  title: string | null;
  titleOrigin: ProvenanceValueOrigin;
  originalUrl: string | null;
  originalUrlOrigin: ProvenanceValueOrigin;
  normalizedUrl: string | null;
  normalizedUrlOrigin: ProvenanceValueOrigin;
  publishedAt: string | null;
  publishedAtOrigin: ProvenanceValueOrigin;
  publishedAtPrecision: PublishedAtPrecision | null;
  contentHash: string | null;
  extractedAt: string | null;
  snapshotMatchesArticle: boolean;
  isManualEntry: boolean;
}>;

export type EditorialArticleProvenance = Readonly<{
  dossier: Readonly<{
    id: string;
    title: string;
    status: string;
  }>;
  plan: Readonly<{
    id: string;
    workingTitle: string;
    articleKind: string;
    lengthMode: string;
    outputLanguage: string;
    status: string;
    createdAt: string;
    editorialInstructions: string;
  }>;
  article: Readonly<{
    id: string;
    status: string | null;
    planId: string;
  }>;
  sources: readonly EditorialArticleProvenanceSource[];
  generation: Readonly<{
    provider: string;
    model: string;
    promptVersion: string;
    providerResponseId: string | null;
    generatedAt: string;
    inputTokens: number | null;
    outputTokens: number | null;
    inputHash: string;
    generatedBodyHash: string | null;
    editorialProfile: Readonly<{
      profileId: string;
      profileCode: string | null;
      profileName: string | null;
      versionId: string;
      versionNumber: number;
      contentHash: string;
      stateAtGeneration: string;
      versionCreatedAt: string;
      pinnedAt: string;
    }> | null;
    status: "completed";
  }> | null;
}>;

export type ProvenancePlanRow = Readonly<{
  id: string;
  dossier_id: string;
  editorial_article_id: string | null;
  working_title: string;
  article_kind: string;
  length_mode: string;
  status: string;
  editorial_instructions: string;
  created_at: string;
  editorial_profile_id?: string | null;
  editorial_profile_version_id?: string | null;
  editorial_profile_pinned_at?: string | null;
}>;

export type ProvenanceDossierRow = Readonly<{
  id: string;
  title: string;
  status: string;
  output_language: string;
}>;

export type ProvenanceAssignmentRow = Readonly<{
  dossier_source_id: string;
  sort_order: number;
}>;

export type ProvenanceDossierSourceRow = Readonly<{
  id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  source_role: string;
  sort_order: number;
  editorial_note: string | null;
  title_snapshot: string | null;
  published_at_snapshot: string | null;
}>;

export type ProvenanceNewsroomArticleRow = Readonly<{
  id: string;
  source_code: string;
  title: string;
  original_url: string | null;
  normalized_url: string | null;
  published_at: string | null;
}>;

export type ProvenanceSnapshotRow = Readonly<{
  id: string;
  article_id: string;
  content_hash: string;
  source_metadata: unknown;
  extracted_at: string;
}>;

export type ProvenanceGenerationRow = Readonly<{
  provider: string;
  model: string;
  prompt_version: string;
  provider_response_id: string | null;
  input_hash: string;
  input_tokens: number | null;
  output_tokens: number | null;
  editorial_profile_id?: string | null;
  editorial_profile_version_id?: string | null;
  editorial_profile_version_number?: number | null;
  editorial_profile_content_hash?: string | null;
  editorial_profile_state_at_generation?: string | null;
  editorial_profile_version_created_at?: string | null;
  editorial_profile_pinned_at?: string | null;
  generated_body_hash?: string | null;
  created_at: string;
}>;

export type ProvenanceEditorialProfileRow = Readonly<{
  id: string;
  code: string;
  name: string;
}>;

function recordValue(value: unknown): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function frozenOrLegacy(
  frozen: unknown,
  legacy: unknown,
): Readonly<{ value: string | null; origin: ProvenanceValueOrigin }> {
  const frozenValue = cleanText(frozen);
  if (frozenValue) {
    return { value: frozenValue, origin: "frozen" };
  }

  const legacyValue = cleanText(legacy);
  return legacyValue
    ? { value: legacyValue, origin: "legacy_current_article" }
    : { value: null, origin: "missing" };
}

export function buildEditorialArticleProvenance(input: Readonly<{
  editorialArticleId: string;
  editorialArticleStatus: string | null;
  plan: ProvenancePlanRow;
  dossier: ProvenanceDossierRow;
  assignments: readonly ProvenanceAssignmentRow[];
  dossierSources: readonly ProvenanceDossierSourceRow[];
  newsroomArticles: readonly ProvenanceNewsroomArticleRow[];
  snapshots: readonly ProvenanceSnapshotRow[];
  generation: ProvenanceGenerationRow | null;
  editorialProfile?: ProvenanceEditorialProfileRow | null;
}>): EditorialArticleProvenance {
  const sourcesById = new Map(input.dossierSources.map((source) => [source.id, source]));
  const articlesById = new Map(input.newsroomArticles.map((article) => [article.id, article]));
  const snapshotsById = new Map(input.snapshots.map((snapshot) => [snapshot.id, snapshot]));

  const sources = input.assignments.flatMap((assignment, index) => {
    const dossierSource = sourcesById.get(assignment.dossier_source_id);
    if (!dossierSource) {
      return [];
    }

    const article = articlesById.get(dossierSource.newsroom_article_id);
    const snapshot = snapshotsById.get(dossierSource.newsroom_snapshot_id);
    const snapshotMatchesArticle = snapshot?.article_id === dossierSource.newsroom_article_id;
    const metadata = snapshotMatchesArticle ? recordValue(snapshot?.source_metadata) : {};
    const isManualEntry = isManualNewsroomSource(article?.source_code, metadata);
    const sourceCode = frozenOrLegacy(metadata.sourceCode, article?.source_code);
    const title = frozenOrLegacy(dossierSource.title_snapshot, article?.title);
    const originalUrl = isManualEntry
      ? { value: null, origin: "missing" as const }
      : frozenOrLegacy(metadata.originalUrl, article?.original_url);
    const normalizedUrl = isManualEntry
      ? { value: null, origin: "missing" as const }
      : frozenOrLegacy(
          metadata.normalizedUrl ?? metadata.finalUrl,
          article?.normalized_url,
        );
    const publishedAt = frozenOrLegacy(dossierSource.published_at_snapshot, article?.published_at);
    const publishedAtPrecision = snapshotMatchesArticle
      ? publishedAtPrecisionFromSourceMetadata(snapshot?.source_metadata)
      : null;

    return [{
      dossierSourceId: dossierSource.id,
      newsroomArticleId: dossierSource.newsroom_article_id,
      newsroomSnapshotId: dossierSource.newsroom_snapshot_id,
      sourceRole: dossierSource.source_role,
      sortOrder: dossierSource.sort_order,
      priority: assignment.sort_order || index + 1,
      editorialNote: dossierSource.editorial_note,
      sourceCode: sourceCode.value,
      sourceCodeOrigin: sourceCode.origin,
      title: title.value,
      titleOrigin: title.origin,
      originalUrl: originalUrl.value,
      originalUrlOrigin: originalUrl.origin,
      normalizedUrl: normalizedUrl.value,
      normalizedUrlOrigin: normalizedUrl.origin,
      publishedAt: publishedAt.value,
      publishedAtOrigin: publishedAt.origin,
      publishedAtPrecision,
      contentHash: snapshotMatchesArticle ? snapshot?.content_hash ?? null : null,
      extractedAt: snapshotMatchesArticle ? snapshot?.extracted_at ?? null : null,
      snapshotMatchesArticle,
      isManualEntry,
    }];
  });

  return {
    dossier: {
      id: input.dossier.id,
      title: input.dossier.title,
      status: input.dossier.status,
    },
    plan: {
      id: input.plan.id,
      workingTitle: input.plan.working_title,
      articleKind: input.plan.article_kind,
      lengthMode: input.plan.length_mode,
      outputLanguage: input.dossier.output_language,
      status: input.plan.status,
      createdAt: input.plan.created_at,
      editorialInstructions: input.plan.editorial_instructions,
    },
    article: {
      id: input.editorialArticleId,
      status: input.editorialArticleStatus,
      planId: input.plan.id,
    },
    sources,
    generation: input.generation
      ? {
          provider: input.generation.provider,
          model: input.generation.model,
          promptVersion: input.generation.prompt_version,
          providerResponseId: input.generation.provider_response_id,
          generatedAt: input.generation.created_at,
          inputTokens: input.generation.input_tokens,
          outputTokens: input.generation.output_tokens,
          inputHash: input.generation.input_hash,
          generatedBodyHash: input.generation.generated_body_hash ?? null,
          editorialProfile:
            input.generation.editorial_profile_id
            && input.generation.editorial_profile_version_id
            && typeof input.generation.editorial_profile_version_number ===
              "number"
            && input.generation.editorial_profile_content_hash
            && input.generation.editorial_profile_state_at_generation
            && input.generation.editorial_profile_version_created_at
            && input.generation.editorial_profile_pinned_at
              ? {
                  profileId: input.generation.editorial_profile_id,
                  profileCode:
                    input.editorialProfile?.id ===
                    input.generation.editorial_profile_id
                      ? input.editorialProfile.code
                      : null,
                  profileName:
                    input.editorialProfile?.id ===
                    input.generation.editorial_profile_id
                      ? input.editorialProfile.name
                      : null,
                  versionId: input.generation.editorial_profile_version_id,
                  versionNumber:
                    input.generation.editorial_profile_version_number,
                  contentHash:
                    input.generation.editorial_profile_content_hash,
                  stateAtGeneration:
                    input.generation.editorial_profile_state_at_generation,
                  versionCreatedAt:
                    input.generation.editorial_profile_version_created_at,
                  pinnedAt: input.generation.editorial_profile_pinned_at,
                }
              : null,
          status: "completed",
        }
      : null,
  };
}
