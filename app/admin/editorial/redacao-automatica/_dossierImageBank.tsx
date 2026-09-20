"use client";

import { useRef, useState } from "react";

import type { DossierImageChoice } from "./_dossierImageChoiceGrid";
import styles from "./dossier-image-bank.module.css";

const WORKSPACE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/workspace";
const ARTICLE_IMAGE_SIGN_ROUTE = "/api/admin/editorial/artigos/upload-image/sign";

type SignedUpload = Readonly<{
  bucket: string;
  path: string;
  signedUrl: string;
  publicUrl: string;
  fileName: string;
}>;

export type RegisteredDossierUploadImage = Readonly<{
  id: string;
  dossierId: string;
  origin: "upload";
  frozenUrl: string;
  fileName: string;
  storageBucket: string;
  storagePath: string;
}>;

type RegisteredImageResponse = Readonly<{
  ok?: boolean;
  message?: string;
  image?: Readonly<{
    id?: string;
    dossierId?: string;
    origin?: string;
    frozenUrl?: string;
    fileName?: string;
    storageBucket?: string;
    storagePath?: string;
  }>;
}>;

export function openDossierImageBank(panelId: string) {
  const panel = document.getElementById(panelId);
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

export default function DossierImageBank({
  panelId,
  dossierId,
  images,
  onRegisteredImage,
}: Readonly<{
  panelId: string;
  dossierId: string;
  images: readonly DossierImageChoice[];
  onRegisteredImage: (image: RegisteredDossierUploadImage) => void;
}>) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState<SignedUpload | null>(null);

  async function registerUpload(upload: SignedUpload): Promise<RegisteredDossierUploadImage> {
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
    const result = await response.json().catch(() => null) as RegisteredImageResponse | null;
    if (
      !response.ok || !result?.ok || result.image?.origin !== "upload"
      || result.image.dossierId !== dossierId || !result.image.id
      || !result.image.frozenUrl || !result.image.storageBucket
      || !result.image.storagePath || !result.image.fileName
    ) {
      throw new Error(
        result?.message
        || "O ficheiro foi carregado, mas ainda não ficou registado no banco da Produção.",
      );
    }
    return {
      id: result.image.id,
      dossierId,
      origin: "upload",
      frozenUrl: result.image.frozenUrl,
      fileName: result.image.fileName,
      storageBucket: result.image.storageBucket,
      storagePath: result.image.storagePath,
    };
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
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      });
      const signed = await signResponse.json().catch(() => null) as Partial<SignedUpload> | null;
      if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.signedUrl || !signed.publicUrl) {
        throw new Error("Não foi possível preparar o upload da imagem.");
      }
      setMessage("A carregar a imagem…");
      const uploadResponse = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Não foi possível carregar a imagem.");
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

  return (
    <details id={panelId} className={styles.imageBankPanel}>
      <summary>
        <span>
          <strong>Banco de imagens da produção</strong>
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
                <img src={image.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <div><strong>{image.label}</strong></div>
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
