import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createEditorialDossierArticlePlanGenerationService,
  type ApplyEditorialDossierGenerationInput,
  type ApplyEditorialDossierGenerationResult,
  type EditorialDossierArticlePlanGenerationContext,
  type EditorialDossierGenerationSource,
  type ExistingEditorialDossierGeneration,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
  EditorialDossierSourceRole,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import { openAiEditorialGenerationProvider } from "@/lib/redacao-automatica/openai-editorial-generation-provider";
import type { ArticleBodyBlock } from "@/lib/redacao-automatica/types";

export type {
  EditorialDossierArticlePlanGenerationErrorCode,
  EditorialDossierArticlePlanGenerationResult,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal";

type DossierRow = {
  id: string;
  title: string;
  editorial_instructions: string;
  context_instructions: string;
  output_language: string;
};

type ArticlePlanRow = {
  id: string;
  dossier_id: string;
  status: string;
  working_title: string;
  article_kind: string;
  length_mode: string;
  editorial_instructions: string;
  editorial_article_id: string | null;
};

type EditorialArticleRow = {
  id: string;
  status: string;
  body: string | null;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  dossier_id: string;
  article_plan_id: string;
  dossier_source_id: string;
  sort_order: number;
};

type DossierSourceRow = {
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  source_role: string;
  editorial_note: string | null;
};

type NewsroomArticleRow = {
  id: string;
  source_code: string;
  title: string;
};

type SnapshotRow = {
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
};

type GenerationRow = {
  id: string;
  dossier_id: string;
  article_plan_id: string;
  editorial_article_id: string;
  provider: string;
  model: string;
  prompt_version: string;
  created_at: string;
};

type ApplyGenerationRpcRow = {
  generation_id: string;
  editorial_article_id: string;
  generation_action: string;
};

function uuidList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

function planStatus(value: string): "planned" | "ready" | "cancelled" {
  return ["planned", "ready", "cancelled"].includes(value)
    ? value as "planned" | "ready" | "cancelled"
    : "planned";
}

function articleKind(value: string): EditorialDossierArticleKind {
  return ["news", "analysis", "preview", "summary"].includes(value)
    ? value as EditorialDossierArticleKind
    : "news";
}

function lengthMode(value: string): EditorialDossierLengthMode {
  return ["brief", "standard", "developed"].includes(value)
    ? value as EditorialDossierLengthMode
    : "standard";
}

function sourceRole(value: string): EditorialDossierSourceRole {
  return ["primary", "corroboration", "context", "complementary"].includes(value)
    ? value as EditorialDossierSourceRole
    : "complementary";
}

function articleBody(value: unknown): readonly ArticleBodyBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate): ArticleBodyBlock[] => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const block = candidate as { type?: unknown; text?: unknown };
    if (
      (block.type !== "paragraph" && block.type !== "heading")
      || typeof block.text !== "string"
      || block.text.trim().length < 1
    ) {
      return [];
    }

    return [{
      type: block.type,
      text: block.text,
    }];
  });
}

async function findGeneration(
  dossierId: string,
  articlePlanId: string,
): Promise<ExistingEditorialDossierGeneration | null> {
  const rows = await fetchSupabaseAdminTable<GenerationRow>(
    "newsroom_editorial_dossier_article_plan_generations"
    + "?select=id,dossier_id,article_plan_id,editorial_article_id,provider,model,prompt_version,created_at"
    + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
    + `&article_plan_id=eq.${encodeURIComponent(articlePlanId)}`
    + "&limit=1",
  );
  const row = rows[0];

  if (
    !row
    || row.dossier_id !== dossierId
    || row.article_plan_id !== articlePlanId
  ) {
    return null;
  }

  return {
    id: row.id,
    editorialArticleId: row.editorial_article_id,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
  };
}

async function readContext(
  dossierId: string,
  articlePlanId: string,
): Promise<EditorialDossierArticlePlanGenerationContext | null> {
  const plans = await fetchSupabaseAdminTable<ArticlePlanRow>(
    "newsroom_editorial_dossier_article_plans"
    + "?select=id,dossier_id,status,working_title,article_kind,length_mode,editorial_instructions,editorial_article_id"
    + `&id=eq.${encodeURIComponent(articlePlanId)}`
    + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
    + "&limit=1",
  );
  const plan = plans[0];

  if (!plan) {
    return null;
  }

  const [dossiers, assignments] = await Promise.all([
    fetchSupabaseAdminTable<DossierRow>(
      "newsroom_editorial_dossiers"
      + "?select=id,title,editorial_instructions,context_instructions,output_language"
      + `&id=eq.${encodeURIComponent(dossierId)}`
      + "&limit=1",
    ),
    fetchSupabaseAdminTable<AssignmentRow>(
      "newsroom_editorial_dossier_article_plan_sources"
      + "?select=id,dossier_id,article_plan_id,dossier_source_id,sort_order"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + `&article_plan_id=eq.${encodeURIComponent(articlePlanId)}`
      + "&order=sort_order.asc,id.asc&limit=100",
    ),
  ]);
  const dossier = dossiers[0];

  if (!dossier) {
    return null;
  }

  const articlePromise = plan.editorial_article_id
    ? fetchSupabaseAdminTable<EditorialArticleRow>(
        "editorial_articles?select=id,status,body,updated_at"
        + `&id=eq.${encodeURIComponent(plan.editorial_article_id)}`
        + "&limit=1",
      )
    : Promise.resolve([]);

  const dossierSourceIds = assignments.map((assignment) => assignment.dossier_source_id);
  const sourceRowsPromise = dossierSourceIds.length > 0
    ? fetchSupabaseAdminTable<DossierSourceRow>(
        "newsroom_editorial_dossier_sources"
        + "?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,source_role,editorial_note"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + `&id=in.(${uuidList(dossierSourceIds)})`
        + `&limit=${dossierSourceIds.length}`,
      )
    : Promise.resolve([]);

  const [articleRows, sourceRows] = await Promise.all([
    articlePromise,
    sourceRowsPromise,
  ]);
  const newsroomArticleIds = sourceRows.map((source) => source.newsroom_article_id);
  const snapshotIds = sourceRows.map((source) => source.newsroom_snapshot_id);

  const [newsroomArticles, snapshots] = await Promise.all([
    newsroomArticleIds.length > 0
      ? fetchSupabaseAdminTable<NewsroomArticleRow>(
          "newsroom_articles?select=id,source_code,title"
          + `&id=in.(${uuidList(newsroomArticleIds)})`
          + `&limit=${newsroomArticleIds.length}`,
        )
      : Promise.resolve([]),
    snapshotIds.length > 0
      ? fetchSupabaseAdminTable<SnapshotRow>(
          "newsroom_article_snapshots?select=id,article_id,content_hash,body"
          + `&id=in.(${uuidList(snapshotIds)})`
          + `&limit=${snapshotIds.length}`,
        )
      : Promise.resolve([]),
  ]);

  const dossierSourcesById = new Map(sourceRows.map((source) => [source.id, source]));
  const newsroomArticlesById = new Map(newsroomArticles.map((article) => [article.id, article]));
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const sources = assignments.flatMap((assignment): EditorialDossierGenerationSource[] => {
    const dossierSource = dossierSourcesById.get(assignment.dossier_source_id);
    if (!dossierSource || dossierSource.dossier_id !== dossierId) {
      return [];
    }

    const newsroomArticle = newsroomArticlesById.get(dossierSource.newsroom_article_id);
    const snapshot = snapshotsById.get(dossierSource.newsroom_snapshot_id);
    if (
      !newsroomArticle
      || !snapshot
      || snapshot.article_id !== newsroomArticle.id
    ) {
      return [];
    }

    return [{
      dossierSourceId: dossierSource.id,
      newsroomArticleId: newsroomArticle.id,
      newsroomSnapshotId: snapshot.id,
      sourceCode: newsroomArticle.source_code,
      articleTitle: newsroomArticle.title,
      sourceRole: sourceRole(dossierSource.source_role),
      sortOrder: assignment.sort_order,
      editorialNote: dossierSource.editorial_note,
      contentHash: snapshot.content_hash,
      body: articleBody(snapshot.body),
    }];
  });

  const editorialArticle = articleRows[0] ?? null;

  return {
    dossier: {
      id: dossier.id,
      title: dossier.title,
      editorialInstructions: dossier.editorial_instructions,
      contextInstructions: dossier.context_instructions,
      outputLanguage: dossier.output_language,
    },
    plan: {
      id: plan.id,
      dossierId: plan.dossier_id,
      status: planStatus(plan.status),
      workingTitle: plan.working_title,
      articleKind: articleKind(plan.article_kind),
      lengthMode: lengthMode(plan.length_mode),
      editorialInstructions: plan.editorial_instructions,
      editorialArticleId: plan.editorial_article_id,
    },
    article: editorialArticle
      ? {
          id: editorialArticle.id,
          status: editorialArticle.status === "published" ? "published" : "draft",
          body: editorialArticle.body ?? "",
          updatedAt: editorialArticle.updated_at,
        }
      : null,
    sources,
  };
}

async function applyGeneration(
  input: ApplyEditorialDossierGenerationInput,
): Promise<ApplyEditorialDossierGenerationResult | null> {
  const rows = await writeSupabaseAdminReturning<ApplyGenerationRpcRow>(
    "rpc/newsroom_apply_editorial_dossier_article_plan_generation",
    {
      method: "POST",
      body: JSON.stringify({
        p_dossier_id: input.dossierId,
        p_article_plan_id: input.articlePlanId,
        p_editorial_article_id: input.editorialArticleId,
        p_expected_article_updated_at: input.expectedArticleUpdatedAt,
        p_generated_body: input.generatedBody,
        p_provider: input.provider,
        p_model: input.model,
        p_prompt_version: input.promptVersion,
        p_provider_response_id: input.providerResponseId,
        p_input_hash: input.inputHash,
        p_input_snapshot: input.inputSnapshot,
        p_input_tokens: input.inputTokens,
        p_output_tokens: input.outputTokens,
        p_total_tokens: input.totalTokens,
      }),
    },
  );
  const row = rows[0];

  if (
    !row
    || (row.generation_action !== "applied" && row.generation_action !== "reused")
  ) {
    return null;
  }

  return {
    generationId: row.generation_id,
    editorialArticleId: row.editorial_article_id,
    action: row.generation_action,
  };
}

const generateWithOpenAi = createEditorialDossierArticlePlanGenerationService(
  {
    isConfigured() {
      return Boolean(getSupabaseServiceConfig());
    },
    readContext,
    findGeneration,
    applyGeneration,
  },
  openAiEditorialGenerationProvider,
);

export function generateEditorialDossierArticlePlanDraftBody(
  dossierId: string,
  articlePlanId: string,
) {
  return generateWithOpenAi(dossierId, articlePlanId);
}
