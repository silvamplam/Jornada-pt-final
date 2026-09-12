"use client";

import {
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import type {
  EditorialDossierArticlePlan,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import type {
  EditorialDossierImage,
  EditorialDossierPublishedContext,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-repository";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import {
  EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
  EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
  preflightEditorialArticleBatchForSourcePackage,
  type EditorialBatchTransferSourcePackage,
} from "@/lib/redacao-automatica/editorial-batch-transfer";

import styles from "./workspace.module.css";

const WORKSPACE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/workspace";
const ARTICLE_IMAGE_SIGN_ROUTE = "/api/admin/editorial/artigos/upload-image/sign";

type WorkspaceSource = Readonly<{
  id: string;
  newsroomArticleId: string;
  title: string;
  sourceLabel: string;
  included: boolean;
}>;

type WorkspaceDossier = Readonly<{
  id: string;
  articleKind: EditorialDossierArticleKind;
  lengthMode: EditorialDossierLengthMode;
  outputCount: number;
  initialOutputCount: number;
  workspaceContractVersion: 1 | 2;
}>;

type WorkspaceVisualSeed = Readonly<{
  source: WorkspaceSource;
  image: EditorialDossierImage | null;
}>;

type CommandResponse = Readonly<{
  ok?: boolean;
  code?: string;
  message?: string;
  partialPersistence?: boolean;
  articlePlanId?: string;
  publicationCount?: number;
  sourceCount?: number;
  restoredThemeMembershipCount?: number;
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
  bucket: string;
  path: string;
  signedUrl: string;
  publicUrl: string;
  fileName: string;
}>;

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

function imageSelectValue(
  plan: EditorialDossierArticlePlan | null,
  defaultImageId: string | null,
): string {
  if (!plan || plan.imageChoice.mode === "unselected") {
    return defaultImageId ? `dossier_image:${defaultImageId}` : "unselected";
  }
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

function ImageBank({
  dossierId,
  images,
  sources,
  publishedContexts,
}: Readonly<{
  dossierId: string;
  images: readonly EditorialDossierImage[];
  sources: readonly WorkspaceSource[];
  publishedContexts: readonly EditorialDossierPublishedContext[];
}>) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState<SignedUpload | null>(null);

  async function registerUpload(upload: SignedUpload) {
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
    if (!response.ok || !result?.ok) {
      throw new Error(
        result?.message
        || "O ficheiro foi carregado, mas ainda não ficou registado no banco do Dossiê.",
      );
    }
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

      const registration: SignedUpload = {
        bucket: signed.bucket,
        path: signed.path,
        signedUrl: signed.signedUrl,
        publicUrl: signed.publicUrl,
        fileName: file.name,
      };
      setPendingRegistration(registration);
      setMessage("A registar a imagem no banco do Dossiê…");
      await registerUpload(registration);
      setPendingRegistration(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Imagem disponível no banco comum.");
      router.refresh();
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
      await registerUpload(pendingRegistration);
      setPendingRegistration(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Imagem disponível no banco comum.");
      router.refresh();
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
    <details className={styles.imageBankPanel}>
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
                <img src={image.frozenUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
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
}: Readonly<{
  position: number;
  imageUrl: string | null;
  startingPoint: WorkspaceSource | null;
}>) {
  return (
    <div className={styles.outputIdentity}>
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : <span className={styles.outputFallback} aria-hidden="true">J</span>}
      <span>
        <strong>OUTPUT {String(position).padStart(2, "0")}</strong>
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
  images,
}: Readonly<{
  dossier: WorkspaceDossier;
  plan: EditorialDossierArticlePlan | null;
  cardKey: string;
  position: number;
  visualSeed: WorkspaceVisualSeed | null;
  hidden: boolean;
  contexts: readonly EditorialDossierPublishedContext[];
  images: readonly EditorialDossierImage[];
}>) {
  const [destination, setDestination] = useState<"new" | "update">(
    plan?.destination ?? "new",
  );
  const [targetId, setTargetId] = useState(plan?.updateTargetEditorialArticleId ?? "");
  const defaultImageValue = visualSeed?.image
    ? `dossier_image:${visualSeed.image.id}`
    : "unselected";
  const initialImage = imageSelectValue(
    plan,
    plan?.editorialArticleId ? null : visualSeed?.image?.id ?? null,
  );
  const [imageChoices, setImageChoices] = useState<Readonly<Record<"new" | "update", string>>>({
    new: initialImage === "preserve_published" ? "unselected" : initialImage,
    update: initialImage,
  });
  const selectedImage = imageChoices[destination];
  // A autoridade já existente é o conjunto de PUBLICADAS persistido no workspace.
  // A interface só o apresenta: não tenta voltar a inferir elegibilidade no browser.
  const eligibleTargets = contexts.filter((context) => context.status === "published");
  const selectedTarget = contexts.find(
    (context) => context.editorialArticleId === targetId,
  ) ?? null;
  const selectedImageUrl = selectedImage.startsWith("dossier_image:")
    ? images.find((image) => image.id === selectedImage.slice("dossier_image:".length))?.frozenUrl ?? null
    : selectedImage === "preserve_published"
      ? selectedTarget?.currentImageUrl ?? null
      : null;
  const visualStartingPoint = selectedImage === defaultImageValue
    ? visualSeed?.source ?? null
    : null;

  if (plan?.editorialArticleId) {
    return (
      <article className={styles.planCard} data-materialized="true" hidden={hidden}>
        <div className={styles.articleNumber}>{String(position).padStart(2, "0")}</div>
        <OutputIdentity
          position={position}
          imageUrl={selectedImageUrl}
          startingPoint={visualStartingPoint}
        />
        <div className={styles.materializedState}>
          <span>Artigo já materializado · {plan.destination === "update" ? "UPDATE" : "NOVO"}</span>
          <strong>{plan.workingTitle}</strong>
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
          />
        </label>

        <div className={styles.planFields}>
          <label>
            <span>Género</span>
            <select
              name={planField(cardKey, "article_kind")}
              defaultValue={plan?.articleKind ?? dossier.articleKind}
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

        {destination === "new" && eligibleTargets.length > 0 ? (
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
              >
                <option value="">Escolher artigo publicado</option>
                {eligibleTargets.map((context) => (
                  <option key={context.editorialArticleId} value={context.editorialArticleId}>
                    {context.title}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : null}

        <fieldset className={styles.imageChoices}>
          <legend>Imagem</legend>
          <div>
            <label data-selected={selectedImage === "unselected"}>
              <input
                type="radio"
                name={planField(cardKey, "image_control")}
                checked={selectedImage === "unselected"}
                onChange={() => setImageChoices((current) => ({
                  ...current,
                  [destination]: "unselected",
                }))}
              />
              <span className={styles.noImageChoice}>Sem imagem</span>
            </label>
            {destination === "update" ? (
              <label data-selected={selectedImage === "preserve_published"}>
                <input
                  type="radio"
                  name={planField(cardKey, "image_control")}
                  checked={selectedImage === "preserve_published"}
                  onChange={() => setImageChoices((current) => ({
                    ...current,
                    update: "preserve_published",
                  }))}
                />
                {selectedTarget?.currentImageUrl ? (
                  <img src={selectedTarget.currentImageUrl} alt="" loading="lazy" />
                ) : <span className={styles.noImageChoice}>Atual</span>}
                <small>MANTER IMAGEM PUBLICADA</small>
              </label>
            ) : null}
            {images.map((image) => {
              const value = "dossier_image:" + image.id;
              return (
                <label key={image.id} data-selected={selectedImage === value}>
                  <input
                    type="radio"
                    name={planField(cardKey, "image_control")}
                    checked={selectedImage === value}
                    onChange={() => setImageChoices((current) => ({
                      ...current,
                      [destination]: value,
                    }))}
                  />
                  <img src={image.frozenUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <small>{imageOriginLabel(image)}</small>
                </label>
              );
            })}
            <a className={styles.addImageChoice} href="#workspace-images-title">
              <span aria-hidden="true">+</span>
              <small>Adicionar</small>
            </a>
          </div>
        </fieldset>

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
      window.sessionStorage.setItem(EDITORIAL_BATCH_TRANSFER_STORAGE_KEY, text);
      window.sessionStorage.setItem(
        EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
        JSON.stringify(value.sourcePackage),
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
      router.refresh();
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
  images,
  plans,
  visualSourceOrder,
}: Readonly<{
  dossier: WorkspaceDossier;
  sources: readonly WorkspaceSource[];
  publishedContexts: readonly EditorialDossierPublishedContext[];
  images: readonly EditorialDossierImage[];
  plans: readonly EditorialDossierArticlePlan[];
  visualSourceOrder: readonly string[];
}>) {
  const router = useRouter();
  const activePlans = plans.filter((plan) => plan.status !== "cancelled");
  const activePlanCount = activePlans.length;
  const materializedPlanCount = activePlans.filter((plan) => plan.editorialArticleId).length;
  const initialOutputCount = Math.min(
    MAX_OUTPUT_COUNT,
    Math.max(
      1,
      activePlanCount > 0
        ? Math.max(dossier.outputCount, activePlanCount)
        : Math.max(dossier.outputCount, dossier.initialOutputCount),
    ),
  );
  const [outputCount, setOutputCount] = useState(
    () => initialOutputCount,
  );
  const [cardCapacity, setCardCapacity] = useState(() => initialOutputCount);
  const [savedPlanIds, setSavedPlanIds] = useState<Record<string, string>>({});
  const [savingProduction, setSavingProduction] = useState(false);
  const [productionMessage, setProductionMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [packageVersion, setPackageVersion] = useState(0);

  const newsroomImageByArticleId = new Map<string, EditorialDossierImage>();
  for (const image of images) {
    if (image.origin === "newsroom" && !newsroomImageByArticleId.has(image.newsroomArticleId)) {
      newsroomImageByArticleId.set(image.newsroomArticleId, image);
    }
  }
  const includedSources = sources.filter((source) => source.included);
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
  const visualSeeds: WorkspaceVisualSeed[] = visualSeedSources
    .map((source) => ({
      source,
      image: newsroomImageByArticleId.get(source.newsroomArticleId) ?? null,
    }));
  const cards: Array<{
    key: string;
    plan: EditorialDossierArticlePlan | null;
    position: number;
    visualSeed: WorkspaceVisualSeed | null;
  }> = Array.from({ length: cardCapacity }, (_, index) => ({
    key: activePlans[index]?.id ?? `output:draft:${index + 1}`,
    plan: activePlans[index] ?? null,
    position: index + 1,
    visualSeed: visualSeeds[index] ?? null,
  }));
  const visibleCards = cards.slice(0, outputCount);
  const allPlansPersisted = visibleCards.every(
    (card) => Boolean(card.plan?.id || savedPlanIds[card.key]),
  );
  const packageDisabled = savingProduction
    || dirty
    || !allPlansPersisted
    || dossier.outputCount !== outputCount;

  async function saveProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProduction) return;
    if (outputCount < 1 || outputCount > MAX_OUTPUT_COUNT) {
      setProductionMessage(`A publicação em lote aceita entre 1 e ${MAX_OUTPUT_COUNT} artigos.`);
      return;
    }

    const data = new FormData(event.currentTarget);
    const nextSavedPlanIds = { ...savedPlanIds };
    setSavingProduction(true);
    setProductionMessage(`A guardar ${outputCount} ${outputCount === 1 ? "artigo" : "artigos"}…`);

    try {
      for (const card of visibleCards) {
        if (card.plan?.editorialArticleId) {
          nextSavedPlanIds[card.key] = card.plan.id;
          continue;
        }
        const destination = String(data.get(planField(card.key, "destination")) ?? "new");
        const targetId = String(data.get(planField(card.key, "target_id")) ?? "");
        const response = await fetch(WORKSPACE_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_article_plan",
            dossierId: dossier.id,
            articlePlanId: card.plan?.id ?? nextSavedPlanIds[card.key] ?? null,
            priority: card.position,
            articleKind: String(data.get(planField(card.key, "article_kind")) ?? "news"),
            lengthMode: String(data.get(planField(card.key, "length_mode")) ?? "standard"),
            editorialInstructions: String(
              data.get(planField(card.key, "editorial_instructions")) ?? "",
            ),
            destination,
            updateTargetEditorialArticleId: destination === "update" ? targetId : null,
            imageChoice: imageChoice(
              String(data.get(planField(card.key, "image_choice")) ?? "unselected"),
            ),
          }),
        });
        const result = await response.json().catch(() => null) as CommandResponse | null;
        if (!response.ok || !result?.ok || !result.articlePlanId) {
          throw new Error(
            result?.message
            || `Não foi possível guardar o artigo ${String(card.position).padStart(2, "0")}.`,
          );
        }
        nextSavedPlanIds[card.key] = result.articlePlanId;
        setSavedPlanIds({ ...nextSavedPlanIds });
      }

      const countResponse = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_output_count",
          dossierId: dossier.id,
          outputCount,
          articlePlanIds: visibleCards.map((card) => card.plan?.id ?? nextSavedPlanIds[card.key]),
        }),
      });
      const countResult = await countResponse.json().catch(() => null) as CommandResponse | null;
      if (!countResponse.ok || !countResult?.ok) {
        throw new Error(countResult?.message || "Os artigos foram guardados, mas falhou o total da produção.");
      }

      setDirty(false);
      setPackageVersion((current) => current + 1);
      setProductionMessage("Produção guardada. Já podes descarregar imagens ou copiar o pacote.");
      router.refresh();
    } catch (error) {
      setSavedPlanIds(nextSavedPlanIds);
      setProductionMessage(
        error instanceof Error
          ? `${error.message} Os artigos anteriores desta tentativa mantêm-se guardados.`
          : "Não foi possível guardar toda a produção.",
      );
    } finally {
      setSavingProduction(false);
    }
  }

  return (
    <>
      <section className={styles.outputCount} aria-labelledby="output-count-title">
        <label>
          <strong id="output-count-title">Artigos a produzir</strong>
          <input
            aria-label="Número total de artigos a produzir"
            type="number"
            min={Math.max(1, materializedPlanCount)}
            max={MAX_OUTPUT_COUNT}
            value={outputCount}
            onChange={(event) => {
              const next = Math.min(
                MAX_OUTPUT_COUNT,
                Math.max(Math.max(1, materializedPlanCount), Number(event.currentTarget.value) || 1),
              );
              setOutputCount(next);
              setCardCapacity((current) => Math.max(current, next));
              setDirty(true);
              setProductionMessage("");
            }}
          />
          <span>artigos no total</span>
        </label>
      </section>

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
          <ImageBank
            dossierId={dossier.id}
            images={images}
            sources={sources}
            publishedContexts={publishedContexts}
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
              hidden={card.position > outputCount}
              contexts={publishedContexts}
              images={images}
            />
          ))}
        </div>

      </form>

      <ProductionActions
        key={packageVersion}
        dossierId={dossier.id}
        articleCount={outputCount}
        imageCount={images.length}
        disabled={packageDisabled}
        saving={savingProduction}
        packageVersion={packageVersion}
      />
      <AbandonProduction dossierId={dossier.id} />
      {productionMessage ? (
        <p className={styles.productionMessage} role="status" aria-live="polite">
          {productionMessage}
        </p>
      ) : null}
    </>
  );
}
