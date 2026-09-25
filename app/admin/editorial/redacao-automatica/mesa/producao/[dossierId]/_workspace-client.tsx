"use client";

import BackofficeImage from "@/components/admin/BackofficeImage";
import { completeEditorialImagePreviews } from "@/lib/editorial-image-preview-upload";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import type {
  EditorialDossierProductionArticlePlan,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import type {
  EditorialDossierImage,
  EditorialDossierPublishedContext,
  EditorialMesaArticlePlanContext,
  EditorialMesaProductionContext,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-repository";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import {
  editorialMesaContextVisualSeedAssignments,
  editorialMesaResolvedVisualImageChoice,
} from "@/lib/redacao-automatica/editorial-mesa-workspace-defaults";
import { editorialMesaContextualImages } from "@/lib/redacao-automatica/editorial-mesa-workspace-images";
import {
  EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
  EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
  preflightEditorialArticleBatchForSourcePackage,
  type EditorialBatchTransferSourcePackage,
} from "@/lib/redacao-automatica/editorial-batch-transfer";
import type {
  ThemeContinuityFrozenContract,
  ThemeContinuitySlot,
} from "@/lib/redacao-automatica/newsroom-theme-continuity-contract";
import DossierImageChoiceGrid from "../../../_dossierImageChoiceGrid";
import DossierImageBank, {
  openDossierImageBank,
  type RegisteredDossierUploadImage,
} from "../../../_dossierImageBank";

import { mesaProductionIntentSlots, type MesaProductionIntentsFrozen } from "@/lib/redacao-automatica/newsroom-mesa-production-intents-contract";
import type { MesaNewOutputGrouping } from "@/lib/redacao-automatica/newsroom-mesa-new-output-groups";
import { NewOutputGroupingPlanner } from "./_new-output-grouping";
import type { ArticleClassificationKey } from "@/lib/editorial-classifications";
import {
  articlePlanAssignedClassificationSourceIds,
  type ArticlePlanClassificationDecision,
  type ArticlePlanClassificationSource,
} from "@/lib/redacao-automatica/article-plan-classification";
import { ArticlePlanClassificationEditor } from "./_article-plan-classification";
import {
  confirmedProductionClassifications,
  productionClassificationNeedsSave,
  productionPackageDisabled,
} from "./_production-package-state";
type WorkspaceContinuitySlot = ThemeContinuitySlot | ReturnType<typeof mesaProductionIntentSlots>[number];
import styles from "./workspace.module.css";

const WORKSPACE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/workspace";
const ARTICLE_IMAGE_SIGN_ROUTE = "/api/admin/editorial/artigos/upload-image/sign";

type WorkspaceSource = Readonly<{
  id: string;
  newsroomArticleId: string;
  title: string;
  sourceLabel: string;
  included: boolean;
  classificationKey: ArticleClassificationKey | null;
  classificationSource: "automatic" | "manual" | null;
}>;

type WorkspaceDossier = Readonly<{
  id: string;
  articleKind: EditorialDossierArticleKind;
  lengthMode: EditorialDossierLengthMode;
  outputCount: number;
  initialOutputCount: number;
  workspaceContractVersion: 1 | 2;
  contextMode: "historical" | "contexts";
}>;

type WorkspaceVisualSeed = Readonly<{
  source: WorkspaceSource;
  image: EditorialDossierImage | null;
}>;

type SavedBatchOutput = Readonly<{
  clientKey: string;
  priority: number;
  articlePlanId: string;
  created: boolean;
  materialized: boolean;
}>;

type CommandResponse = Readonly<{
  ok?: boolean;
  code?: string;
  stage?: "article_plan" | "production_state" | "output_count";
  message?: string;
  partialPersistence?: boolean;
  articlePlanId?: string;
  failedOutput?: Readonly<{ clientKey: string; priority: number }> | null;
  savedOutputs?: readonly SavedBatchOutput[];
  outputs?: readonly SavedBatchOutput[];
  publicationCount?: number;
  sourceCount?: number;
  restoredThemeMembershipCount?: number;
  outputCount?: number;
  image?: RegisteredDossierUploadImage;
  continuityResolution?: Readonly<{
    noChangeOutputIds: readonly string[];
    materializedOutputIds: readonly string[];
  }>;
}>;

type PreparedSourcePackage = Readonly<{
  contentUrl: string;
  imagesUrl: string;
  imagesFileName: string;
  imageSourceCount: number;
  articleCount: number;
  genreLabel: string;
  sourcePackage: EditorialBatchTransferSourcePackage;
}>;

type SignedUpload = Readonly<{
  previewTicket?: string;
  bucket: string;
  path: string;
  signedUrl: string;
  publicUrl: string;
  fileName: string;
}>;

type RegisteredUploadImage = RegisteredDossierUploadImage;

const MAX_OUTPUT_COUNT = 30;
const PRODUCTION_FORM_ID = "mesa-production-article-plans";

const articleKindLabels: Record<EditorialDossierArticleKind, string> = {
  news: "Notícia",
  analysis: "Análise",
  preview: "Antevisão",
  summary: "Síntese",
};

const lengthModeLabels: Record<EditorialDossierLengthMode, string> = {
  brief: "Curta",
  standard: "Média",
  developed: "Longa",
};

function explicitImageSelectValue(
  plan: EditorialDossierProductionArticlePlan | null,
): string | null {
  if (!plan || plan.imageChoice.mode === "unselected") return null;
  if (plan.imageChoice.mode === "preserve_published") return "preserve_published";
  return `dossier_image:${plan.imageChoice.dossierImageId}`;
}

function imageChoice(value: string) {
  if (value === "preserve_published") return { mode: "preserve_published" } as const;
  if (value.startsWith("dossier_image:")) {
    return {
      mode: "dossier_image" as const,
      dossierImageId: value.slice("dossier_image:".length),
    };
  }
  return { mode: "unselected" } as const;
}

function planField(cardKey: string, field: string): string {
  return `plan:${cardKey}:${field}`;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy_failed");
  } finally {
    textarea.remove();
  }
}

function imageOriginLabel(image: EditorialDossierImage): string {
  if (image.origin === "upload") return "Upload";
  if (image.origin === "published") return "Publicada";
  return "Fonte";
}

function openWorkspaceImageUpload() {
  const panel = document.getElementById("workspace-image-bank");
  if (!(panel instanceof HTMLDetailsElement)) return;

  panel.open = true;
  const input = panel.querySelector<HTMLInputElement>('input[type="file"]');
  const focusTarget = input?.disabled
    ? panel.querySelector<HTMLButtonElement>('button:not(:disabled)')
    : input;

  (focusTarget ?? panel).scrollIntoView({ block: "center" });
  focusTarget?.focus({ preventScroll: true });

  if (input && !input.disabled) input.click();
}

function ImageBank({
  dossierId,
  images,
  sources,
  publishedContexts,
  onRegisteredImage,
}: Readonly<{
  dossierId: string;
  images: readonly EditorialDossierImage[];
  sources: readonly WorkspaceSource[];
  publishedContexts: readonly EditorialDossierPublishedContext[];
  onRegisteredImage: (image: RegisteredUploadImage) => void;
}>) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState<SignedUpload | null>(null);

  async function registerUpload(upload: SignedUpload): Promise<RegisteredUploadImage> {
    const response = await fetch(WORKSPACE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register_upload_image",
        dossierId,
        bucket: upload.bucket,
        path: upload.path,
        publicUrl: upload.publicUrl,
        fileName: upload.fileName,
      }),
    });
    const result = await response.json().catch(() => null) as CommandResponse | null;
    if (
      !response.ok
      || !result?.ok
      || !result.image
      || result.image.origin !== "upload"
      || result.image.dossierId !== dossierId
      || !result.image.id
      || !result.image.frozenUrl
      || !result.image.storageBucket
      || !result.image.storagePath
      || !result.image.fileName
    ) {
      throw new Error(
        result?.message
        || "O ficheiro foi carregado, mas ainda não ficou registado no banco da Produção.",
      );
    }
    return result.image;
  }

  async function uploadSelectedFile() {
    const file = fileInput.current?.files?.[0] ?? null;
    if (!file) {
      setMessage("Escolhe um ficheiro JPG, PNG, WEBP ou AVIF.");
      return;
    }

    setUploading(true);
    setMessage("A pedir autorização de upload…");

    try {
      const signResponse = await fetch(ARTICLE_IMAGE_SIGN_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const signed = await signResponse.json().catch(() => null) as Partial<SignedUpload> | null;
      if (
        !signResponse.ok
        || !signed?.bucket
        || !signed.path
        || !signed.signedUrl
        || !signed.publicUrl
      ) {
        throw new Error("Não foi possível preparar o upload da imagem.");
      }

      setMessage("A carregar a imagem…");
      const uploadResponse = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Não foi possível carregar a imagem.");
      }

      await completeEditorialImagePreviews(signed);

      const registration: SignedUpload = {
        bucket: signed.bucket,
        path: signed.path,
        signedUrl: signed.signedUrl,
        publicUrl: signed.publicUrl,
        fileName: file.name,
      };
      setPendingRegistration(registration);
      setMessage("A registar a imagem no banco da Produção…");
      onRegisteredImage(await registerUpload(registration));
      setPendingRegistration(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Imagem disponível no banco comum.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível guardar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function retryRegistration() {
    if (!pendingRegistration) return;
    setUploading(true);
    setMessage("A tentar registar novamente a imagem já carregada…");
    try {
      onRegisteredImage(await registerUpload(pendingRegistration));
      setPendingRegistration(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Imagem disponível no banco comum.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  function originLabel(image: EditorialDossierImage): string {
    if (image.origin === "upload") return `UPLOAD · ${image.fileName}`;
    if (image.origin === "newsroom") {
      const source = sources.find(
        (candidate) => candidate.newsroomArticleId === image.newsroomArticleId,
      );
      return source ? `NOVA · ${source.sourceLabel}` : "NOVA";
    }
    const context = publishedContexts.find(
      (candidate) => candidate.editorialArticleId === image.editorialArticleId,
    );
    return context ? `PUBLICADA · ${context.title}` : "PUBLICADA";
  }

  return (
    <details id="workspace-image-bank" className={styles.imageBankPanel}>
      <summary>
        <span>
          <strong id="workspace-images-title">Banco de imagens da produção</strong>
          <small>{images.length} {images.length === 1 ? "imagem" : "imagens"}</small>
        </span>
        <span>Ver todas</span>
      </summary>

      <div className={styles.imageBankBody}>
        <p>A mesma imagem pode ser escolhida por vários Article Plans.</p>
        {images.length > 0 ? (
          <ol className={styles.imageBank}>
            {images.map((image) => (
              <li key={image.id}>
                <BackofficeImage previewWidth={320} src={image.frozenUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <div>
                  <strong>{originLabel(image)}</strong>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className={styles.empty}>Ainda não existem imagens disponíveis.</p>}

        <div className={styles.uploadBar}>
          <label>
            <span>Adicionar ao banco comum</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading || Boolean(pendingRegistration)}
            />
          </label>
          {pendingRegistration ? (
            <button type="button" onClick={retryRegistration} disabled={uploading}>
              Registar upload já concluído
            </button>
          ) : (
            <button type="button" onClick={uploadSelectedFile} disabled={uploading}>
              {uploading ? "A carregar…" : "Adicionar imagem"}
            </button>
          )}
        </div>
        {message ? <p className={styles.commandMessage} role="status">{message}</p> : null}
      </div>
    </details>
  );
}

function OutputIdentity({
  position,
  imageUrl,
  startingPoint,
  slot,
}: Readonly<{
  position: number;
  imageUrl: string | null;
  startingPoint: WorkspaceSource | null;
  slot: WorkspaceContinuitySlot | null;
}>) {
  return (
    <div className={styles.outputIdentity}>
      {imageUrl ? (
        <BackofficeImage previewWidth={320} src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : <span className={styles.outputFallback} aria-hidden="true">J</span>}
      <span>
        <strong>{slot?.slot ?? `OUTPUT ${String(position).padStart(2, "0")}`}</strong>
        <small title={startingPoint ? `${startingPoint.sourceLabel} · ${startingPoint.title}` : undefined}>
          {startingPoint
            ? `Ponto de partida visual · ${startingPoint.title}`
            : "Material completo da produção"}
        </small>
      </span>
    </div>
  );
}

function PlanEditor({
  dossier,
  plan,
  cardKey,
  position,
  visualSeed,
  hidden,
  contexts,
  productionContexts,
  productionContextId,
  onProductionContextChange,
  images,
  saving,
  continuitySlot,
  classificationSources,
  assignedClassificationSourceIds,
  onClassificationDecision,
}: Readonly<{
  dossier: WorkspaceDossier;
  plan: EditorialDossierProductionArticlePlan | null;
  cardKey: string;
  position: number;
  visualSeed: WorkspaceVisualSeed | null;
  hidden: boolean;
  contexts: readonly EditorialDossierPublishedContext[];
  productionContexts: readonly EditorialMesaProductionContext[];
  productionContextId: string;
  onProductionContextChange: (productionContextId: string) => void;
  images: readonly EditorialDossierImage[];
  saving: boolean;
  continuitySlot: WorkspaceContinuitySlot | null;
  classificationSources: readonly ArticlePlanClassificationSource[];
  assignedClassificationSourceIds: readonly string[];
  onClassificationDecision: () => void;
}>) {
  const [destination, setDestination] = useState<"new" | "update">(
    continuitySlot?.kind === "existing" ? "update" : continuitySlot ? "new" : plan?.destination ?? "new",
  );
  const [targetId, setTargetId] = useState(
    continuitySlot?.targetEditorialArticleId ?? plan?.updateTargetEditorialArticleId ?? "",
  );
  const selectedProductionContext = productionContexts.find((context) => context.id === productionContextId) ?? null;
  const automaticImageId = plan?.editorialArticleId
    ? null
    : visualSeed?.image?.id ?? null;
  const initialExplicitImage = explicitImageSelectValue(plan);
  const [imageChoices, setImageChoices] = useState<Readonly<Record<"new" | "update", string | null>>>({
    new: initialExplicitImage === "preserve_published" ? "unselected" : initialExplicitImage,
    update: initialExplicitImage,
  });
  const selectedImage = editorialMesaResolvedVisualImageChoice(
    imageChoices[destination],
    automaticImageId,
  );
  const [showAllImages, setShowAllImages] = useState(false);
  const visualSeedImage = editorialMesaResolvedVisualImageChoice(
    null,
    visualSeed?.image?.id ?? null,
  );
  // A autoridade já existente é o conjunto de PUBLICADAS persistido no workspace.
  // A interface só o apresenta: não tenta voltar a inferir elegibilidade no browser.
  const eligibleTargets = contexts.filter((context) => context.status === "published");
  const selectedTarget = contexts.find(
    (context) => context.editorialArticleId === targetId,
  ) ?? null;
  const frozenTarget = continuitySlot?.kind === "existing"
    ? {
        editorialArticleId: continuitySlot.targetEditorialArticleId!,
        title: continuitySlot.targetTitle ?? continuitySlot.targetEditorialArticleId,
        slug: continuitySlot.targetSlug ?? "",
      }
    : null;
  const selectedImageUrl = selectedImage.startsWith("dossier_image:")
    ? images.find((image) => image.id === selectedImage.slice("dossier_image:".length))?.frozenUrl ?? null
    : selectedImage === "preserve_published"
      ? selectedTarget?.currentImageUrl ?? null
      : null;
  const visualStartingPoint = imageChoices[destination] === null
    && selectedImage === visualSeedImage
    ? visualSeed?.source ?? null
    : null;
  const focusSourceIds = continuitySlot && "focusSourceIds" in continuitySlot
    ? continuitySlot.focusSourceIds ?? []
    : null;
  const contextualImages = focusSourceIds === null
    ? { images, allImages: images, relevantCount: images.length }
    : editorialMesaContextualImages(images, focusSourceIds, selectedImage);
  const displayedImages = showAllImages ? contextualImages.allImages : contextualImages.images;
  const hasAdditionalImages = focusSourceIds !== null
    && contextualImages.images.length < images.length;

  if (plan?.editorialArticleId) {
    return (
      <article className={styles.planCard} data-materialized="true" hidden={hidden}>
        <div className={styles.articleNumber}>{String(position).padStart(2, "0")}</div>
        <OutputIdentity
          position={position}
          imageUrl={selectedImageUrl}
          startingPoint={visualStartingPoint}
          slot={continuitySlot}
        />
        <div className={styles.materializedState}>
          <span>Artigo já materializado · {plan.destination === "update" ? "UPDATE" : "NOVO"}</span>
          <strong>{plan.workingTitle}</strong>
          {selectedProductionContext ? <small>
            Contexto: {selectedProductionContext.kind === "theme" ? "Tema" : selectedProductionContext.kind === "selection" ? "Seleção" : "Fonte"} · {selectedProductionContext.title}
          </small> : null}
          <a href={"/admin/editorial/artigos?articleId=" + encodeURIComponent(plan.editorialArticleId)}>
            Abrir artigo
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className={styles.planCard} data-destination={destination} hidden={hidden}>
      <div className={styles.articleNumber}>{String(position).padStart(2, "0")}</div>
      <OutputIdentity
        position={position}
        imageUrl={selectedImageUrl}
        startingPoint={visualStartingPoint}
        slot={continuitySlot}
      />

      <div className={styles.planEditor}>
        <label className={styles.instructionsField}>
          <span>Foco editorial (opcional)</span>
          <textarea
            name={planField(cardKey, "editorial_instructions")}
            defaultValue={plan?.editorialInstructions ?? ""}
            maxLength={12000}
            rows={1}
            placeholder="Ex.: impacto no plantel, reação do clube…"
            disabled={saving}
          />
        </label>

        <div className={styles.planFields} data-context-mode={dossier.contextMode}>
          {dossier.contextMode === "contexts" ? <label className={styles.contextField}>
            <span>Contexto</span>
            <select
              name={planField(cardKey, "context_id")}
              value={productionContextId}
              required
              disabled={saving || Boolean(continuitySlot)}
              onChange={(event) => onProductionContextChange(event.currentTarget.value)}
            >
              {productionContexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.kind === "theme" ? "Tema" : context.kind === "selection" ? "Seleção" : "Fonte"} · {context.title}
                </option>
              ))}
            </select>
          </label> : null}
          <label>
            <span>Género</span>
            <select
              name={planField(cardKey, "article_kind")}
              defaultValue={plan?.articleKind ?? dossier.articleKind}
              disabled={saving}
            >
              {Object.entries(articleKindLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Extensão</span>
            <select
              name={planField(cardKey, "length_mode")}
              defaultValue={plan?.lengthMode ?? dossier.lengthMode}
              disabled={saving}
            >
              {Object.entries(lengthModeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Destino</span>
            <select
              name={planField(cardKey, "destination_control")}
              value={destination}
              disabled={saving || Boolean(continuitySlot)}
              onChange={(event) => setDestination(
                event.currentTarget.value === "update" ? "update" : "new",
              )}
            >
              <option value="new">NOVO</option>
              <option value="update" disabled={eligibleTargets.length === 0}>UPDATE</option>
            </select>
          </label>
        </div>

        <input type="hidden" name={planField(cardKey, "destination")} value={destination} />
        <input type="hidden" name={planField(cardKey, "target_id")} value={targetId} />
        <input type="hidden" name={planField(cardKey, "image_choice")} value={selectedImage} />
        <ArticlePlanClassificationEditor
          fieldPrefix={planField(cardKey, "")}
          persisted={plan}
          assignedSourceIds={assignedClassificationSourceIds}
          sources={classificationSources}
          disabled={saving}
          className={styles.classificationChoice}
          onDecision={onClassificationDecision}
        />

        {continuitySlot ? (
          <p className={styles.updateHint} data-continuity-slot={continuitySlot.kind}>
            <strong>{continuitySlot.slot}</strong>
            {continuitySlot.kind === "existing"
              ? ` · UPDATE fixo para ${frozenTarget?.title}${frozenTarget?.slug ? ` · /noticias/${frozenTarget.slug}` : ""}`
              : " · destino NEW fixo pelo contrato de continuidade"}
          </p>
        ) : null}

        {!continuitySlot && destination === "new" && eligibleTargets.length > 0 ? (
          <p className={styles.updateHint}>
            {eligibleTargets.length === 1
              ? "Há 1 artigo publicado elegível para UPDATE."
              : `Há ${eligibleTargets.length} artigos publicados elegíveis para UPDATE.`}
            {" "}A decisão continua a ser tua.
          </p>
        ) : null}

        <p className={styles.srOnly}>
          UPDATE nunca é inferido. A decisão e o target são humanos.
        </p>
        {destination === "update" ? (
          <fieldset className={styles.targetPanel}>
            <legend>Destino do Article Plan</legend>
            <label>
              <span>Artigo publicado de destino</span>
              <select
                name={planField(cardKey, "target_control")}
                value={targetId}
                onChange={(event) => setTargetId(event.currentTarget.value)}
                required
                disabled={saving || continuitySlot?.kind === "existing"}
              >
                <option value="">Escolher artigo publicado</option>
                {frozenTarget && !eligibleTargets.some((context) => (
                  context.editorialArticleId === frozenTarget.editorialArticleId
                )) ? (
                  <option value={frozenTarget.editorialArticleId}>{frozenTarget.title}</option>
                ) : null}
                {eligibleTargets.map((context) => (
                  <option key={context.editorialArticleId} value={context.editorialArticleId}>
                    {context.title}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : null}

        <DossierImageChoiceGrid
          compact
          name={planField(cardKey, "image_control")}
          value={selectedImage}
          legend="Imagens deste artigo"
          images={displayedImages.map((image) => ({
            id: image.id,
            imageUrl: image.frozenUrl,
            label: imageOriginLabel(image),
          }))}
          disabled={saving}
          allowNoImage
          allowPreservePublished={destination === "update"}
          preservePublishedImageUrl={selectedTarget?.currentImageUrl}
          onChange={(value) => setImageChoices((current) => ({
            ...current,
            [destination]: value,
          }))}
          onAddImage={() => openDossierImageBank("workspace-image-bank")}
          addImageControls="workspace-image-bank"
        />
        {focusSourceIds !== null && contextualImages.relevantCount === 0 && !showAllImages ? (
          <p className={styles.contextualImagesEmpty}>
            Não há imagens diretamente ligadas ao ponto de partida deste artigo.
          </p>
        ) : null}
        {hasAdditionalImages || showAllImages ? (
          <button
            className={styles.toggleContextualImages}
            type="button"
            disabled={saving}
            aria-expanded={showAllImages}
            onClick={() => setShowAllImages((current) => !current)}
          >
            {showAllImages ? "Mostrar imagens deste artigo" : "Ver todas as imagens"}
          </button>
        ) : null}

      </div>
    </article>
  );
}

function ProductionActions({
  dossierId,
  articleCount,
  imageCount,
  disabled,
  saving,
  packageVersion,
}: Readonly<{
  dossierId: string;
  articleCount: number;
  imageCount: number;
  disabled: boolean;
  saving: boolean;
  packageVersion: number;
}>) {
  const [prepared, setPrepared] = useState<PreparedSourcePackage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("");
  const [manualResponse, setManualResponse] = useState("");

  async function ensurePackage(): Promise<PreparedSourcePackage> {
    if (prepared) return prepared;
    if (preparing) throw new Error("package_preparing");
    setPreparing(true);
    setStatus("A preparar o pacote editorial…");
    try {
      const response = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare_source_package", dossierId }),
      });
      const result = await response.json().catch(() => null) as
        (CommandResponse & Partial<PreparedSourcePackage>) | null;
      if (
        !response.ok
        || !result?.ok
        || !result.contentUrl
        || !result.imagesUrl
        || !result.imagesFileName
        || !result.sourcePackage
        || typeof result.articleCount !== "number"
        || typeof result.imageSourceCount !== "number"
        || !result.genreLabel
      ) {
        throw new Error(result?.message || "Não foi possível preparar o pacote editorial.");
      }
      const value: PreparedSourcePackage = {
        contentUrl: result.contentUrl,
        imagesUrl: result.imagesUrl,
        imagesFileName: result.imagesFileName,
        imageSourceCount: result.imageSourceCount,
        articleCount: result.articleCount,
        genreLabel: result.genreLabel,
        sourcePackage: result.sourcePackage,
      };
      setPrepared(value);
      return value;
    } finally {
      setPreparing(false);
    }
  }

  async function copyPackage() {
    if (disabled || preparing) return;
    try {
      const value = await ensurePackage();
      const response = await fetch(value.contentUrl, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("package_unavailable");
      await copyText(await response.text());
      setStatus(`Pacote com ${value.articleCount} ${value.articleCount === 1 ? "artigo" : "artigos"} copiado.`);
    } catch (error) {
      if (error instanceof Error && error.message !== "package_preparing") {
        setStatus(error.message === "package_unavailable"
          ? "Não foi possível copiar o pacote neste momento."
          : error.message);
      }
    }
  }

  async function downloadImages() {
    if (disabled || preparing) return;
    try {
      const value = await ensurePackage();
      if (value.imageSourceCount < 1) {
        setStatus("Esta produção não tem imagens selecionadas para download.");
        return;
      }
      setStatus(`A preparar ${value.imageSourceCount} ${value.imageSourceCount === 1 ? "imagem" : "imagens"}…`);
      window.location.assign(value.imagesUrl);
    } catch (error) {
      if (error instanceof Error && error.message !== "package_preparing") setStatus(error.message);
    }
  }

  async function importText(text: string) {
    if (disabled) {
      setStatus("Guarda primeiro todos os artigos e imagens desta produção.");
      return false;
    }
    try {
      const value = await ensurePackage();
      const preflight = preflightEditorialArticleBatchForSourcePackage(
        text,
        value.sourcePackage,
      );
      if (!preflight.ready) {
        setStatus(
          preflight.issues[0]?.message
          ?? "A resposta ainda não respeita integralmente o formato JORNADA_ARTIGO_V1.",
        );
        return false;
      }
      if (preflight.total !== articleCount) {
        setStatus(`A produção tem ${articleCount} artigos, mas a resposta contém ${preflight.total}.`);
        return false;
      }
      const validationResponse = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate_ai_response",
          dossierId,
          sourcePackage: value.sourcePackage,
          response: text,
        }),
      });
      const validation = await validationResponse.json().catch(() => null) as CommandResponse | null;
      if (!validationResponse.ok || !validation?.ok) {
        throw new Error(
          validation?.message
          || "A proveniência da resposta não corresponde a esta produção.",
        );
      }
      const transferSourcePackage = value.sourcePackage.themeContinuity || value.sourcePackage.productionIntents
        ? validation.continuityResolution
          ? {
              ...value.sourcePackage,
              continuityResolution: validation.continuityResolution,
            }
          : null
        : value.sourcePackage;
      if (!transferSourcePackage) {
        throw new Error("A resposta não resolveu integralmente os slots de continuidade.");
      }
      window.sessionStorage.setItem(EDITORIAL_BATCH_TRANSFER_STORAGE_KEY, text);
      window.sessionStorage.setItem(
        EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
        JSON.stringify(transferSourcePackage),
      );
      setStatus("Resposta reconhecida. A abrir Publicação em lote…");
      window.location.assign("/admin/editorial/redacao-automatica/publicacao-lote");
      return true;
    } catch (error) {
      if (error instanceof Error && error.message !== "package_preparing") setStatus(error.message);
      return false;
    }
  }

  function importPastedResponse(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText.trim()) return;
    event.preventDefault();
    setManualResponse(pastedText);
    void importText(pastedText);
  }

  function handleManualKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void importText(manualResponse);
    }
  }

  return (
    <section className={styles.productionActions} aria-labelledby={`production-actions-${packageVersion}`}>
      <header>
        <h2 id={`production-actions-${packageVersion}`}>Ações</h2>
        <p>Guarda a produção antes de preparar o pacote para o ChatGPT.</p>
      </header>
      <div className={styles.productionActionButtons}>
        <button className={styles.primaryAction} type="submit" form={PRODUCTION_FORM_ID} disabled={saving}>
          {saving ? "A guardar…" : "Guardar artigos e imagens"}
        </button>
        <button type="button" onClick={downloadImages} disabled={disabled || preparing}>
          Descarregar imagens (.zip) — {prepared?.imageSourceCount ?? imageCount}
        </button>
        <button type="button" onClick={copyPackage} disabled={disabled || preparing}>
          {preparing ? "A preparar pacote…" : "Copiar pacote para ChatGPT"}
        </button>
      </div>
      <label className={styles.responseField}>
        <span>Colar resposta do ChatGPT</span>
        <textarea
          value={manualResponse}
          onChange={(event) => setManualResponse(event.currentTarget.value)}
          onPaste={importPastedResponse}
          onKeyDown={handleManualKeyDown}
          rows={5}
          placeholder="Cola aqui os artigos gerados pelo ChatGPT. O texto será validado antes de seguir para a publicação em lote."
        />
      </label>
      {status ? <p className={styles.commandMessage} role="status" aria-live="polite">{status}</p> : null}
    </section>
  );
}

function AbandonProduction({ dossierId }: Readonly<{ dossierId: string }>) {
  const router = useRouter();
  const [preview, setPreview] = useState<Readonly<{
    publicationCount: number;
    sourceCount: number;
  }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function command(action: "preview_abandon" | "abandon_production") {
    setBusy(true);
    setMessage(action === "preview_abandon" ? "A confirmar o estado da produção…" : "A abandonar a produção…");
    try {
      const response = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          dossierId,
          ...(action === "abandon_production" ? { confirmed: true } : {}),
        }),
      });
      const result = await response.json().catch(() => null) as CommandResponse | null;
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Não foi possível abandonar a produção.");
      if (action === "preview_abandon") {
        setPreview({
          publicationCount: result.publicationCount ?? 0,
          sourceCount: result.sourceCount ?? 0,
        });
        setMessage("");
        return;
      }
      router.push("/admin/editorial/redacao-automatica/mesa");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abandonar a produção.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.abandonProduction} aria-label="Abandonar produção">
      {!preview ? (
        <button type="button" disabled={busy} onClick={() => void command("preview_abandon")}>
          Abandonar produção
        </button>
      ) : (
        <div>
          <p>
            {preview.sourceCount} fontes regressam ao estado editorial anterior. Snapshots, histórico e proveniência
            técnica são preservados.
          </p>
          {preview.publicationCount > 0 ? (
            <strong>Existe publicação efetiva; o abandono está bloqueado.</strong>
          ) : (
            <button type="button" disabled={busy} onClick={() => void command("abandon_production")}>
              Confirmar abandono
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => setPreview(null)}>Voltar</button>
        </div>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

export function MesaProductionWorkspaceClient({
  dossier,
  sources,
  publishedContexts,
  images: initialImages,
  plans,
  productionContexts,
  planContexts,
  visualSourceOrder,
  themeContinuity,
  productionIntents = null,
  newOutputGrouping = null,
  newOutputGroupingFixture = false,
}: Readonly<{
  dossier: WorkspaceDossier;
  sources: readonly WorkspaceSource[];
  publishedContexts: readonly EditorialDossierPublishedContext[];
  images: readonly EditorialDossierImage[];
  plans: readonly EditorialDossierProductionArticlePlan[];
  productionContexts: readonly EditorialMesaProductionContext[];
  planContexts: readonly EditorialMesaArticlePlanContext[];
  visualSourceOrder: readonly string[];
  themeContinuity: ThemeContinuityFrozenContract | null;
  productionIntents?: MesaProductionIntentsFrozen | null;
  newOutputGrouping?: MesaNewOutputGrouping | null;
  newOutputGroupingFixture?: boolean;
}>) {
  const frozenSlots = productionIntents ? mesaProductionIntentSlots(productionIntents) : themeContinuity?.slots;
  const [suppressedPlanIds, setSuppressedPlanIds] = useState<readonly string[]>([]);
  const suppressedPlanIdSet = new Set(suppressedPlanIds);
  const activePlans = plans.filter((plan) => (
    plan.status !== "cancelled" && !suppressedPlanIdSet.has(plan.id)
  ));
  const contextByPlanId = new Map(planContexts.map((assignment) => (
    [assignment.articlePlanId, assignment.productionContextId]
  )));
  const activePlanCount = activePlans.length;
  const materializedPlanCount = activePlans.filter((plan) => plan.editorialArticleId).length;
  const initialOutputCount = frozenSlots?.length ?? Math.min(
    MAX_OUTPUT_COUNT,
    Math.max(
      1,
      activePlanCount > 0
        ? Math.max(dossier.outputCount, activePlanCount)
        : Math.max(dossier.outputCount, dossier.initialOutputCount),
    ),
  );
  const [editableOutputCount, setEditableOutputCount] = useState(
    () => initialOutputCount,
  );
  const [editableCardCapacity, setEditableCardCapacity] = useState(() => initialOutputCount);
  const effectiveOutputCount = frozenSlots?.length ?? editableOutputCount;
  const effectiveCardCapacity = frozenSlots?.length ?? editableCardCapacity;
  const [productionContextOverrides, setProductionContextOverrides] = useState<Record<string, string>>({});
  const [savedPlanIds, setSavedPlanIds] = useState<Record<string, string>>({});
  const [confirmedClassifications, setConfirmedClassifications] = useState<
    Record<string, ArticlePlanClassificationDecision>
  >({});
  const [savingProduction, setSavingProduction] = useState(false);
  const savingProductionRef = useRef(false);
  const [productionMessage, setProductionMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [packageVersion, setPackageVersion] = useState(0);
  const [persistedOutputCount, setPersistedOutputCount] = useState(dossier.outputCount);
  const [workspaceImages, setWorkspaceImages] = useState<readonly EditorialDossierImage[]>(
    () => initialImages,
  );

  const newsroomImageByArticleId = new Map<string, EditorialDossierImage>();
  for (const image of workspaceImages) {
    if (
      image.origin === "newsroom"
      && image.frozenUrl.trim()
      && !newsroomImageByArticleId.has(image.newsroomArticleId)
    ) {
      newsroomImageByArticleId.set(image.newsroomArticleId, image);
    }
  }
  const includedSources = sources.filter((source) => source.included);
  const classificationSources: ArticlePlanClassificationSource[] = includedSources.map((source) => ({
    sourceId: source.newsroomArticleId,
    classificationKey: source.classificationKey,
    classificationSource: source.classificationSource,
  }));
  const sourceByArticleId = new Map(
    includedSources.map((source) => [source.newsroomArticleId, source]),
  );
  const visualSeedSources: WorkspaceSource[] = [];
  const seededSourceIds = new Set<string>();
  for (const newsroomArticleId of visualSourceOrder) {
    const source = sourceByArticleId.get(newsroomArticleId);
    if (!source || seededSourceIds.has(source.newsroomArticleId)) continue;
    seededSourceIds.add(source.newsroomArticleId);
    visualSeedSources.push(source);
  }
  for (const source of includedSources) {
    if (seededSourceIds.has(source.newsroomArticleId)) continue;
    seededSourceIds.add(source.newsroomArticleId);
    visualSeedSources.push(source);
  }
  // Estes pares fonte/imagem só evitam configuração repetitiva no browser.
  // Não limitam assignments e nunca alimentam a proveniência da publicação.
  const historicalVisualSeeds: WorkspaceVisualSeed[] = visualSeedSources
    .map((source) => ({
      source,
      image: newsroomImageByArticleId.get(source.newsroomArticleId) ?? null,
    }));
  const baseCards: Array<{
    key: string;
    plan: EditorialDossierProductionArticlePlan | null;
    position: number;
    productionContextId: string;
  }> = Array.from({ length: effectiveCardCapacity }, (_, index) => {
    const frozenSlot = frozenSlots?.[index];
    const plan = frozenSlot
      ? activePlans.find((candidate) => candidate.id === frozenSlot.outputId) ?? null
      : activePlans[index] ?? null;
    const key = plan?.id ?? frozenSlot?.outputId ?? `output:draft:${index + 1}`;
    const assignedContextId = plan ? contextByPlanId.get(plan.id) ?? null : null;
    const defaultContextId = productionContexts[
      index % Math.max(1, productionContexts.length)
    ]?.id ?? "";
    return {
      key,
      plan,
      position: index + 1,
      productionContextId: dossier.contextMode === "contexts"
        ? productionContextOverrides[key] ?? assignedContextId ?? defaultContextId
        : "",
    };
  });
  const contextVisualSeedByOutputKey = new Map(
    editorialMesaContextVisualSeedAssignments(
      productionContexts,
      baseCards.slice(0, effectiveOutputCount).map((card) => ({
        key: card.key,
        productionContextId: card.productionContextId,
      })),
      [...newsroomImageByArticleId.keys()],
    ).map((assignment) => {
      const source = assignment.newsroomArticleId
        ? sourceByArticleId.get(assignment.newsroomArticleId) ?? null
        : null;
      const image = assignment.newsroomArticleId
        ? newsroomImageByArticleId.get(assignment.newsroomArticleId) ?? null
        : null;
      return [
        assignment.outputKey,
        source && image ? { source, image } : null,
      ] as const;
    }),
  );
  // O modo histórico conserva a distribuição visual global. No modo 2C, cada
  // seed vem apenas das fontes congeladas do contexto atribuído ao Article Plan.
  const cards = baseCards.map((card, index) => {
    const assignedContext = dossier.contextMode === "contexts"
      ? productionContexts.find((context) => context.id === card.productionContextId) ?? null
      : null;
    const persistedSourceIds = new Set(
      card.plan?.sources.map((source) => source.dossierSourceId) ?? [],
    );
    const assignedSources = assignedContext
      ? assignedContext.sources.flatMap((source) => {
          const assigned = includedSources.find(
            (candidate) => candidate.newsroomArticleId === source.newsroomArticleId,
          );
          return assigned ? [assigned] : [];
        })
      : card.plan
        ? includedSources.filter((source) => persistedSourceIds.has(source.id))
        : includedSources;
    return {
      ...card,
      assignedSources,
      assignedClassificationSourceIds: articlePlanAssignedClassificationSourceIds({
        plan: card.plan,
        groups: newOutputGrouping?.groups,
        outputs: productionIntents?.outputs,
      }),
      visualSeed: dossier.contextMode === "contexts"
        ? contextVisualSeedByOutputKey.get(card.key) ?? null
        : historicalVisualSeeds[index] ?? null,
    };
  });
  const visibleCards = cards.slice(0, effectiveOutputCount);
  const classificationNeedsSave = productionClassificationNeedsSave(
    visibleCards, classificationSources, confirmedClassifications,
  );
  const allPlansPersisted = visibleCards.every(
    (card) => Boolean(card.plan?.id || savedPlanIds[card.key]),
  );
  const packageDisabled = productionPackageDisabled({
    saving: savingProduction,
    dirty,
    classificationNeedsSave,
    allPlansPersisted,
    persistedOutputCount: frozenSlots ? frozenSlots.length : persistedOutputCount,
    outputCount: effectiveOutputCount,
  });

  async function saveProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProductionRef.current) return;
    if (effectiveOutputCount < 1 || effectiveOutputCount > MAX_OUTPUT_COUNT) {
      setProductionMessage(`A publicação em lote aceita entre 1 e ${MAX_OUTPUT_COUNT} artigos.`);
      return;
    }

    const data = new FormData(event.currentTarget);
    const nextSavedPlanIds = { ...savedPlanIds };
    savingProductionRef.current = true;
    setSavingProduction(true);
    setProductionMessage(`A guardar ${effectiveOutputCount} ${effectiveOutputCount === 1 ? "artigo" : "artigos"}…`);

    try {
      const outputs = visibleCards.map((card) => {
        const destination = String(
          data.get(planField(card.key, "destination"))
          ?? card.plan?.destination
          ?? "new",
        );
        const targetId = String(
          data.get(planField(card.key, "target_id"))
          ?? card.plan?.updateTargetEditorialArticleId
          ?? "",
        );
        return {
          clientKey: card.key,
          articlePlanId: card.plan?.id ?? nextSavedPlanIds[card.key] ?? null,
          priority: card.position,
          articleKind: String(
            data.get(planField(card.key, "article_kind"))
            ?? card.plan?.articleKind
            ?? dossier.articleKind,
          ),
          lengthMode: String(
            data.get(planField(card.key, "length_mode"))
            ?? card.plan?.lengthMode
            ?? dossier.lengthMode,
          ),
          editorialInstructions: String(
            data.get(planField(card.key, "editorial_instructions"))
            ?? card.plan?.editorialInstructions
            ?? "",
          ),
          destination,
          updateTargetEditorialArticleId: destination === "update" ? targetId : null,
          imageChoice: imageChoice(String(
            data.get(planField(card.key, "image_choice"))
            ?? explicitImageSelectValue(card.plan),
          )),
          classificationKey: String(
            data.get(planField(card.key, "classification_key"))
            ?? card.plan?.classificationKey
            ?? "",
          ) || null,
          classificationMode: String(
            data.get(planField(card.key, "classification_mode")) ?? "",
          ) || null,
          ...(dossier.contextMode === "contexts" ? {
            productionContextId: String(
              data.get(planField(card.key, "context_id"))
              ?? card.productionContextId,
            ),
          } : {}),
        };
      });
      const response = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_article_plans_batch",
          dossierId: dossier.id,
          outputCount: effectiveOutputCount,
          outputs,
        }),
      });
      const result = await response.json().catch(() => null) as CommandResponse | null;
      const persistedOutputs = result?.ok ? result.outputs : result?.savedOutputs;
      for (const output of persistedOutputs ?? []) {
        nextSavedPlanIds[output.clientKey] = output.articlePlanId;
      }
      setSavedPlanIds({ ...nextSavedPlanIds });
      const nextConfirmedClassifications = confirmedProductionClassifications(outputs, result?.outputs);
      if (
        !response.ok
        || !result?.ok
        || result.outputCount !== effectiveOutputCount
        || !nextConfirmedClassifications
      ) {
        const failedPosition = result?.failedOutput?.priority;
        throw new Error(
          result?.message
          || (failedPosition
            ? `Não foi possível guardar o artigo ${String(failedPosition).padStart(2, "0")}.`
            : "Não foi possível guardar toda a produção."),
        );
      }

      const retainedPlanIds = new Set(visibleCards.map((card) => (
        card.plan?.id ?? nextSavedPlanIds[card.key]
      )));
      const visibleCardKeys = new Set(visibleCards.map((card) => card.key));
      setSuppressedPlanIds((current) => Array.from(new Set([
        ...current,
        ...activePlans.flatMap((plan) => retainedPlanIds.has(plan.id) ? [] : [plan.id]),
      ])));
      setSavedPlanIds(Object.fromEntries(
        Object.entries(nextSavedPlanIds).filter(([key]) => visibleCardKeys.has(key)),
      ));
      setConfirmedClassifications(nextConfirmedClassifications);
      setPersistedOutputCount(result.outputCount);
      setDirty(false);
      setPackageVersion((current) => current + 1);
      setProductionMessage("Produção guardada. Já podes descarregar imagens ou copiar o pacote.");
    } catch (error) {
      setSavedPlanIds(nextSavedPlanIds);
      setDirty(true);
      setProductionMessage(
        error instanceof Error
          ? `${error.message} Os artigos anteriores desta tentativa mantêm-se guardados.`
          : "Não foi possível guardar toda a produção.",
      );
    } finally {
      savingProductionRef.current = false;
      setSavingProduction(false);
    }
  }

  return (
    <>
      {newOutputGrouping?.state === "planned" ? <NewOutputGroupingPlanner
        initialGrouping={newOutputGrouping}
        fixtureMode={newOutputGroupingFixture}
      /> : (
      <section className={styles.outputCount} aria-labelledby="output-count-title">
        <label>
          <strong id="output-count-title">Artigos a produzir</strong>
          <input
            aria-label="Número total de artigos a produzir"
            type="number"
            min={Math.max(1, materializedPlanCount)}
            max={MAX_OUTPUT_COUNT}
            value={effectiveOutputCount}
            disabled={savingProduction || Boolean(frozenSlots)}
            onChange={(event) => {
              const next = Math.min(
                MAX_OUTPUT_COUNT,
                Math.max(Math.max(1, materializedPlanCount), Number(event.currentTarget.value) || 1),
              );
              setEditableOutputCount(next);
              setEditableCardCapacity((current) => Math.max(current, next));
              setDirty(true);
              setProductionMessage("");
            }}
          />
          <span>artigos no total</span>
        </label>
        {productionIntents ? (
          <div className={styles.continuitySummary}>
            <strong>Trabalho pedido por contexto</strong>
            <span>{productionIntents.totals.reviews} artigos Jornada a avaliar · {productionIntents.totals.newArticles} novos
              {" · "}{productionIntents.totals.contexts} contextos · {productionIntents.totals.sources} fontes</span>
            <span>Capturas já guardadas. Os anteriores sem revisão pedida ficam apenas como referência.</span>
          </div>
        ) : themeContinuity ? (
          <div className={styles.continuitySummary}>
            <strong>Contrato de continuidade congelado</strong>
            <span>
              {themeContinuity.publishedArticleCount} EXISTING · {themeContinuity.newArticleCount} NEW
              {" · "}{themeContinuity.sourceDiff.length} Sources
              {" · baseline "}{themeContinuity.baselineDossierId ?? "primeira Produção"}
            </span>
          </div>
        ) : null}
      </section>)}

      {newOutputGrouping?.state === "planned" ? null : <>
      <form
        id={PRODUCTION_FORM_ID}
        className={styles.articlesSection}
        aria-labelledby="workspace-plans-title"
        onSubmit={saveProduction}
        onChange={(event) => {
          const name = event.target instanceof Element ? event.target.getAttribute("name") ?? "" : "";
          if (name.startsWith("plan:")) {
            setDirty(true);
            setProductionMessage("");
          }
        }}
      >
        <header className={styles.articlesHeader}>
          <div>
            <h2 id="workspace-plans-title">Artigos</h2>
            <p>Configura cada artigo. O foco editorial é opcional.</p>
          </div>
          <DossierImageBank
            panelId="workspace-image-bank"
            dossierId={dossier.id}
            images={workspaceImages.map((image) => ({
              id: image.id,
              imageUrl: image.frozenUrl,
              label: image.origin === "upload"
                ? `UPLOAD · ${image.fileName}`
                : image.origin === "newsroom"
                  ? `NOVA · ${sources.find((source) => (
                      source.newsroomArticleId === image.newsroomArticleId
                    ))?.sourceLabel ?? "Fonte"}`
                  : `PUBLICADA · ${publishedContexts.find((context) => (
                      context.editorialArticleId === image.editorialArticleId
                    ))?.title ?? "Artigo"}`,
            }))}
            onRegisteredImage={(image) => {
              setWorkspaceImages((current) => {
                const existing = current.find((candidate) => candidate.id === image.id);
                const registered: EditorialDossierImage = {
                  ...image,
                  createdAt: existing?.createdAt ?? "",
                };
                return existing
                  ? current.map((candidate) => candidate.id === image.id ? registered : candidate)
                  : [...current, registered];
              });
            }}
          />
        </header>

        <div className={styles.planList}>
          {cards.map((card) => (
            <PlanEditor
              key={card.key}
              dossier={dossier}
              plan={card.plan}
              cardKey={card.key}
              position={card.position}
              visualSeed={card.visualSeed}
              hidden={card.position > effectiveOutputCount}
              contexts={productionIntents ? publishedContexts.filter((item) => {
                const intentContext = productionIntents.contexts.find((c) => c.productionContextId === card.productionContextId);
                const referenceArticles = intentContext?.candidateArticles ?? intentContext?.publishedArticles ?? [];
                return referenceArticles.some((a) => a.editorialArticleId === item.editorialArticleId);
              }) : publishedContexts}
              productionContexts={productionContexts}
              productionContextId={card.productionContextId}
              onProductionContextChange={(productionContextId) => {
                setProductionContextOverrides((current) => ({
                  ...current,
                  [card.key]: productionContextId,
                }));
              }}
              images={workspaceImages}
              saving={savingProduction}
              continuitySlot={frozenSlots?.find((slot) => slot.outputId === card.key) ?? null}
              assignedClassificationSourceIds={card.assignedClassificationSourceIds}
              classificationSources={classificationSources}
              onClassificationDecision={() => {
                setDirty(true);
                setProductionMessage("");
              }}
            />
          ))}
        </div>

      </form>

      <ProductionActions
        key={packageVersion}
        dossierId={dossier.id}
        articleCount={effectiveOutputCount}
        imageCount={workspaceImages.length}
        disabled={packageDisabled}
        saving={savingProduction}
        packageVersion={packageVersion}
      />
      </>}
      <AbandonProduction dossierId={dossier.id} />
      {productionMessage ? (
        <p className={styles.productionMessage} role="status" aria-live="polite">
          {productionMessage}
        </p>
      ) : null}
    </>
  );
}
