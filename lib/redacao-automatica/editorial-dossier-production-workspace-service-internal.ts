const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCES = 20;
const MAX_TITLE_LENGTH = 180;
const MAX_URL_LENGTH = 8000;
const MAX_STORAGE_VALUE_LENGTH = 1000;
const EDITORIAL_IMAGES_BUCKET = "editorial-images";

export type EditorialDossierArticlePlanDestination = "new" | "update";

export type EditorialDossierArticlePlanImageChoice =
  | Readonly<{ mode: "unselected" }>
  | Readonly<{ mode: "preserve_published" }>
  | Readonly<{ mode: "dossier_image"; dossierImageId: string }>;

export type PrepareEditorialDossierWorkspaceSource = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
}>;

export type PrepareEditorialDossierWorkspaceInput = Readonly<{
  preparationKey: string;
  title: string;
  sources: readonly PrepareEditorialDossierWorkspaceSource[];
  publishedContextArticleIds: readonly string[];
}>;

export type SaveEditorialDossierArticlePlanStateInput = Readonly<{
  dossierId: string;
  articlePlanId: string;
  destination: EditorialDossierArticlePlanDestination;
  updateTargetEditorialArticleId: string | null;
  dossierPublishedContextIds: readonly string[];
  imageChoice: EditorialDossierArticlePlanImageChoice;
}>;

export type AddEditorialDossierUploadImageInput = Readonly<{
  dossierId: string;
  frozenUrl: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
}>;

export type PrepareEditorialDossierWorkspaceRpcInput = Readonly<{
  p_preparation_key: string;
  p_title: string;
  p_newsroom_article_ids: readonly string[];
  p_newsroom_snapshot_ids: readonly string[];
  p_published_context_article_ids: readonly string[];
}>;

export type SaveEditorialDossierArticlePlanStateRpcInput = Readonly<{
  p_dossier_id: string;
  p_article_plan_id: string;
  p_destination: EditorialDossierArticlePlanDestination;
  p_update_target_editorial_article_id: string | null;
  p_published_context_ids: readonly string[];
  p_image_choice: EditorialDossierArticlePlanImageChoice["mode"];
  p_dossier_image_id: string | null;
}>;

export type AddEditorialDossierUploadImageRpcInput = Readonly<{
  p_dossier_id: string;
  p_frozen_url: string;
  p_storage_bucket: string;
  p_storage_path: string;
  p_file_name: string;
}>;

export type PreparedEditorialDossierWorkspace = Readonly<{
  dossierId: string;
  preparationAction: "created" | "reused";
  sourceCount: number;
  publishedContextCount: number;
  imageCount: number;
}>;

export type SavedEditorialDossierArticlePlanState = Readonly<{
  articlePlanId: string;
  destination: EditorialDossierArticlePlanDestination;
  updateTargetEditorialArticleId: string | null;
  publishedContextCount: number;
  imageChoice: EditorialDossierArticlePlanImageChoice;
}>;

export type AddedEditorialDossierUploadImage = Readonly<{
  dossierImageId: string;
  imageAction: "created" | "reused";
  frozenUrl: string;
}>;

export interface EditorialDossierProductionWorkspaceTransport {
  configuration(): Readonly<{ supabaseUrl: string }> | null;
  prepareWorkspace(
    payload: PrepareEditorialDossierWorkspaceRpcInput,
  ): Promise<PreparedEditorialDossierWorkspace | null>;
  saveArticlePlanState(
    payload: SaveEditorialDossierArticlePlanStateRpcInput,
  ): Promise<SavedEditorialDossierArticlePlanState | null>;
  addUploadImage(
    payload: AddEditorialDossierUploadImageRpcInput,
  ): Promise<AddedEditorialDossierUploadImage | null>;
}

export type EditorialDossierProductionWorkspaceErrorCode =
  | "input_invalid"
  | "service_unavailable"
  | "preparation_conflict"
  | "prepare_failed"
  | "article_plan_state_save_failed"
  | "upload_image_save_failed";

export type EditorialDossierProductionWorkspaceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialDossierProductionWorkspaceErrorCode;
        message: string;
      }>;
    }>;

function failure<T>(
  code: EditorialDossierProductionWorkspaceErrorCode,
  message: string,
): EditorialDossierProductionWorkspaceResult<T> {
  return { ok: false, error: { code, message } };
}

function normalizedUuid(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function cleanText(value: string): string {
  return value.trim();
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function expectedEditorialImagePublicUrl(
  supabaseUrl: string,
  storagePath: string,
): string {
  const baseUrl = supabaseUrl.trim().replace(/\/$/, "");
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(EDITORIAL_IMAGES_BUCKET)}/${encodeStoragePath(storagePath)}`;
}

function isPreparationConflict(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes("production_workspace_prepare_idempotency_conflict");
}

function normalizedUuidList(values: readonly string[]): readonly string[] | null {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const id = normalizedUuid(value);
    if (!id || seen.has(id)) {
      return null;
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function normalizedSources(
  values: readonly PrepareEditorialDossierWorkspaceSource[],
): readonly PrepareEditorialDossierWorkspaceSource[] | null {
  if (values.length > MAX_SOURCES) {
    return null;
  }

  const normalized: PrepareEditorialDossierWorkspaceSource[] = [];
  const seenArticles = new Set<string>();

  for (const value of values) {
    const newsroomArticleId = normalizedUuid(value.newsroomArticleId);
    const newsroomSnapshotId = normalizedUuid(value.newsroomSnapshotId);
    if (!newsroomArticleId || !newsroomSnapshotId || seenArticles.has(newsroomArticleId)) {
      return null;
    }

    seenArticles.add(newsroomArticleId);
    normalized.push({ newsroomArticleId, newsroomSnapshotId });
  }

  return normalized;
}

export function prepareEditorialDossierWorkspaceService(
  transport: EditorialDossierProductionWorkspaceTransport,
) {
  return async function prepareEditorialDossierWorkspace(
    input: PrepareEditorialDossierWorkspaceInput,
  ): Promise<EditorialDossierProductionWorkspaceResult<PreparedEditorialDossierWorkspace>> {
    const preparationKey = normalizedUuid(input.preparationKey);
    const title = cleanText(input.title);
    const sources = normalizedSources(input.sources);
    const publishedContextArticleIds = normalizedUuidList(
      input.publishedContextArticleIds,
    );

    if (
      !preparationKey
      || title.length < 1
      || title.length > MAX_TITLE_LENGTH
      || !sources
      || !publishedContextArticleIds
      || sources.length + publishedContextArticleIds.length < 1
    ) {
      return failure("input_invalid", "Os dados para preparar o Dossiê não são válidos.");
    }

    if (!transport.configuration()) {
      return failure("service_unavailable", "O workspace de produção não está configurado.");
    }

    const payload: PrepareEditorialDossierWorkspaceRpcInput = {
      p_preparation_key: preparationKey,
      p_title: title,
      p_newsroom_article_ids: sources.map((source) => source.newsroomArticleId),
      p_newsroom_snapshot_ids: sources.map((source) => source.newsroomSnapshotId),
      p_published_context_article_ids: publishedContextArticleIds,
    };

    try {
      const prepared = await transport.prepareWorkspace(payload);
      if (!prepared || prepared.dossierId.length < 1) {
        return failure("prepare_failed", "Não foi possível preparar o Dossiê.");
      }
      return { ok: true, value: prepared };
    } catch (error) {
      if (isPreparationConflict(error)) {
        return failure(
          "preparation_conflict",
          "A chave de preparação já foi usada com um pedido diferente.",
        );
      }
      return failure("prepare_failed", "Não foi possível preparar o Dossiê.");
    }
  };
}

export function saveEditorialDossierArticlePlanStateService(
  transport: EditorialDossierProductionWorkspaceTransport,
) {
  return async function saveEditorialDossierArticlePlanState(
    input: SaveEditorialDossierArticlePlanStateInput,
  ): Promise<EditorialDossierProductionWorkspaceResult<SavedEditorialDossierArticlePlanState>> {
    const dossierId = normalizedUuid(input.dossierId);
    const articlePlanId = normalizedUuid(input.articlePlanId);
    const contextIds = normalizedUuidList(input.dossierPublishedContextIds);
    const targetId = input.updateTargetEditorialArticleId
      ? normalizedUuid(input.updateTargetEditorialArticleId)
      : null;
    const imageId = input.imageChoice.mode === "dossier_image"
      ? normalizedUuid(input.imageChoice.dossierImageId)
      : null;
    const validDestination = input.destination === "new" || input.destination === "update";
    const validTarget = input.destination === "new"
      ? input.updateTargetEditorialArticleId === null
      : Boolean(targetId);
    const validImageChoice = input.imageChoice.mode === "unselected"
      || input.imageChoice.mode === "preserve_published"
      || (input.imageChoice.mode === "dossier_image" && Boolean(imageId));

    if (
      !dossierId
      || !articlePlanId
      || !contextIds
      || !validDestination
      || !validTarget
      || !validImageChoice
      || (input.imageChoice.mode === "preserve_published" && input.destination !== "update")
    ) {
      return failure("input_invalid", "O estado de produção do artigo planeado não é válido.");
    }

    if (!transport.configuration()) {
      return failure("service_unavailable", "O workspace de produção não está configurado.");
    }

    const payload: SaveEditorialDossierArticlePlanStateRpcInput = {
      p_dossier_id: dossierId,
      p_article_plan_id: articlePlanId,
      p_destination: input.destination,
      p_update_target_editorial_article_id: targetId,
      p_published_context_ids: contextIds,
      p_image_choice: input.imageChoice.mode,
      p_dossier_image_id: imageId,
    };

    try {
      const saved = await transport.saveArticlePlanState(payload);
      if (!saved || saved.articlePlanId !== articlePlanId) {
        return failure(
          "article_plan_state_save_failed",
          "Não foi possível guardar o estado de produção do artigo planeado.",
        );
      }
      return { ok: true, value: saved };
    } catch {
      return failure(
        "article_plan_state_save_failed",
        "Não foi possível guardar o estado de produção do artigo planeado.",
      );
    }
  };
}

export function addEditorialDossierUploadImageService(
  transport: EditorialDossierProductionWorkspaceTransport,
) {
  return async function addEditorialDossierUploadImage(
    input: AddEditorialDossierUploadImageInput,
  ): Promise<EditorialDossierProductionWorkspaceResult<AddedEditorialDossierUploadImage>> {
    const dossierId = normalizedUuid(input.dossierId);
    const frozenUrl = cleanText(input.frozenUrl);
    const storageBucket = cleanText(input.storageBucket);
    const storagePath = cleanText(input.storagePath);
    const fileName = cleanText(input.fileName);

    if (
      !dossierId
      || frozenUrl.length < 1
      || frozenUrl.length > MAX_URL_LENGTH
      || storageBucket !== EDITORIAL_IMAGES_BUCKET
      || storageBucket.length > MAX_STORAGE_VALUE_LENGTH
      || storagePath.length < 1
      || storagePath.length > MAX_STORAGE_VALUE_LENGTH
      || fileName.length < 1
      || fileName.length > MAX_STORAGE_VALUE_LENGTH
    ) {
      return failure("input_invalid", "A imagem carregada não é válida.");
    }

    const configuration = transport.configuration();
    if (!configuration) {
      return failure("service_unavailable", "O workspace de produção não está configurado.");
    }

    if (frozenUrl !== expectedEditorialImagePublicUrl(configuration.supabaseUrl, storagePath)) {
      return failure("input_invalid", "A imagem carregada não é válida.");
    }

    try {
      const added = await transport.addUploadImage({
        p_dossier_id: dossierId,
        p_frozen_url: frozenUrl,
        p_storage_bucket: storageBucket,
        p_storage_path: storagePath,
        p_file_name: fileName,
      });
      if (!added || added.dossierImageId.length < 1) {
        return failure(
          "upload_image_save_failed",
          "Não foi possível guardar a imagem no Dossiê.",
        );
      }
      return { ok: true, value: added };
    } catch {
      return failure(
        "upload_image_save_failed",
        "Não foi possível guardar a imagem no Dossiê.",
      );
    }
  };
}
