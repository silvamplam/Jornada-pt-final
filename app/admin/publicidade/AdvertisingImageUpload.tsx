"use client";

import { useState } from "react";

type Props = {
  initialImageUrl: string;
};

type SignedUpload = {
  error?: string;
  signedUrl?: string;
  publicUrl?: string;
};

export default function AdvertisingImageUpload({
  initialImageUrl,
}: Props) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file || uploading) {
      if (!file) setStatus("Escolhe primeiro uma imagem.");
      return;
    }

    setUploading(true);
    setStatus("A preparar upload...");

    try {
      const signResponse = await fetch(
        "/api/admin/editorial/conteudos/upload-image/sign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        },
      );

      const signed = (await signResponse.json()) as SignedUpload;

      if (!signResponse.ok || !signed.signedUrl || !signed.publicUrl) {
        throw new Error(signed.error || "sign-failed");
      }

      setStatus("A carregar imagem...");

      const response = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "Cache-Control": "max-age=31536000",
          "x-upsert": "false",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("upload-failed");
      }

      setImageUrl(signed.publicUrl);
      setStatus("Imagem carregada. Guarda agora a publicidade.");
    } catch {
      setStatus("Não foi possível carregar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="ad-image-manager">
      <label className="ad-field">
        <span>Imagem</span>
        <input
          type="text"
          name="image_url"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="URL da imagem"
        />
      </label>

      <div className="ad-upload">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setStatus("");
          }}
        />

        <button type="button" onClick={upload} disabled={uploading}>
          {uploading ? "A carregar..." : "Carregar imagem"}
        </button>
      </div>

      {status ? <p className="ad-status">{status}</p> : null}

      {imageUrl ? (
        <div className="ad-preview">
          <strong>Pré-visualização</strong>
          <img src={imageUrl} alt="" />
        </div>
      ) : null}
    </div>
  );
}