"use client";

import {
  FormEvent,
  useRef,
  useState,
} from "react";

import {
  MANUAL_NEWSROOM_BODY_MAX_LENGTH,
  MANUAL_NEWSROOM_TITLE_MAX_LENGTH,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const ALLOWED_IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|avif)$/i;

type SignResponse = Readonly<{
  signedUrl?: unknown;
  publicUrl?: unknown;
  maxUploadMb?: unknown;
  error?: unknown;
}>;

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function localImageError(file: File): string | null {
  if (
    !ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())
    || !ALLOWED_IMAGE_EXTENSION.test(file.name)
  ) {
    return "Escolhe uma imagem JPG, PNG, WebP ou AVIF.";
  }
  if (file.size <= 0) {
    return "A imagem escolhida está vazia.";
  }
  return null;
}

export default function ManualNewsEntryForm({
  submissionId,
  maxDate,
  initiallyOpen,
}: Readonly<{
  submissionId: string;
  maxDate: string;
  initiallyOpen: boolean;
}>) {
  const [open, setOpen] = useState(initiallyOpen);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const submittingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }

    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      submittingRef.current = true;
      setSubmitting(true);
      setStatusMessage("A guardar a notícia no arquivo…");
      return;
    }

    event.preventDefault();
    const localError = localImageError(file);
    if (localError) {
      setStatusMessage(localError);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setStatusMessage("A preparar a imagem…");

    try {
      const signResponse = await fetch("/api/admin/editorial/artigos/upload-image/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const signPayload = await signResponse.json().catch(() => null) as SignResponse | null;
      if (!signResponse.ok) {
        if (signPayload?.error === "image-too-large") {
          const limit = Number(signPayload.maxUploadMb);
          throw new Error(Number.isFinite(limit) ? `A imagem excede ${limit} MB.` : "A imagem é demasiado grande.");
        }
        throw new Error("Não foi possível preparar o upload da imagem.");
      }

      const signedUrl = textValue(signPayload?.signedUrl);
      const publicUrl = textValue(signPayload?.publicUrl);
      if (!signedUrl || !publicUrl) {
        throw new Error("Não foi possível preparar o upload da imagem.");
      }

      setStatusMessage("A carregar a imagem…");
      const uploadResponse = await fetch(signedUrl, {
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

      if (!imageUrlRef.current) {
        throw new Error("Não foi possível associar a imagem.");
      }
      imageUrlRef.current.value = publicUrl;
      setStatusMessage("A guardar a notícia no arquivo…");
      form.submit();
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível guardar a notícia.",
      );
    }
  }

  return (
    <div className="manual-news-entry">
      <button
        type="button"
        className="manual-news-entry-toggle"
        aria-expanded={open}
        aria-controls="manual-news-entry-panel"
        onClick={() => setOpen((current) => !current)}
      >
        Adicionar notícia manualmente
      </button>
      <section id="manual-news-entry-panel" hidden={!open}>
        <form
          action="/api/admin/editorial/redacao-automatica/manual-entry"
          method="post"
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="submission_id" value={submissionId} />
          <input ref={imageUrlRef} type="hidden" name="image_url" defaultValue="" />

          <label>
            <span>Título</span>
            <input
              name="title"
              maxLength={MANUAL_NEWSROOM_TITLE_MAX_LENGTH}
              required
            />
          </label>

          <label>
            <span>Corpo</span>
            <textarea
              name="body"
              maxLength={MANUAL_NEWSROOM_BODY_MAX_LENGTH}
              rows={12}
              required
            />
          </label>

          <label>
            <span>Data</span>
            <input
              type="date"
              name="published_date"
              max={maxDate}
              required
            />
          </label>

          <label>
            <span>Imagem</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
            />
          </label>

          <div className="manual-news-entry-submit">
            <button type="submit" disabled={submitting}>Guardar notícia</button>
            <span role="status" aria-live="polite">
              {statusMessage}
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}
