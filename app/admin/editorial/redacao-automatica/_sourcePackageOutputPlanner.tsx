"use client";

import { useState } from "react";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS,
  EDITORIAL_SOURCE_PACKAGE_MAX_OUTPUTS,
  EDITORIAL_SOURCE_PACKAGE_OUTPUT_FOCUS_MAX_LENGTH,
  type EditorialSourcePackageOutput,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

import styles from "./redacao-automatica.module.css";

type OutputImageCandidate = Readonly<{
  sourceArticlePosition: number;
  newsroomArticleId: string;
  sourceName: string;
  title: string;
  imageUrl: string;
}>;

type SourcePackageOutputPlannerProps = Readonly<{
  actionUrl: string;
  sourceArticlePositions: readonly number[];
  outputs: readonly EditorialSourcePackageOutput[];
  imageCandidates: readonly OutputImageCandidate[];
}>;

type OutputImageChoice =
  | Readonly<{ kind: "source"; newsroomArticleId: string }>
  | Readonly<{ kind: "external"; url: string; fileName: string }>
  | Readonly<{ kind: "none" }>;

type OutputUploadState = Readonly<{
  status: "uploading" | "error";
  previewUrl: string;
  fileName: string;
  message: string;
}>;

type SignedUploadResponse = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  signedUrl?: string;
  publicUrl?: string;
}>;

const ARTICLE_IMAGE_SIGN_ROUTE = "/api/admin/editorial/artigos/upload-image/sign";
const EXTERNAL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function initialChoice(
  output: EditorialSourcePackageOutput | undefined,
  imageCandidates: readonly OutputImageCandidate[],
  sourceArticlePosition: number,
): OutputImageChoice {
  if (output?.externalImage) {
    return {
      kind: "external",
      url: output.externalImage.url,
      fileName: output.externalImage.fileName,
    };
  }

  const newsroomArticleId = output?.imageNewsroomArticleId
    ?? imageCandidates.find(
      (candidate) => candidate.sourceArticlePosition === sourceArticlePosition,
    )?.newsroomArticleId
    ?? "";

  return newsroomArticleId
    ? { kind: "source", newsroomArticleId }
    : { kind: "none" };
}

function imageContentType(file: File): string {
  const declared = file.type.trim().toLowerCase();
  if (declared) {
    return declared;
  }

  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function supportedImage(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension)
    && (!mime || SUPPORTED_IMAGE_MIME_TYPES.has(mime));
}

function previewDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(
      typeof reader.result === "string" ? reader.result : "",
    ), { once: true });
    reader.addEventListener("error", () => resolve(""), { once: true });
    reader.readAsDataURL(file);
  });
}

function uploadFailure(
  payload: SignedUploadResponse | null,
  fallback: string,
): string {
  return payload?.detail?.trim()
    || payload?.error?.trim()
    || fallback;
}

export default function SourcePackageOutputPlanner({
  actionUrl,
  sourceArticlePositions,
  outputs,
  imageCandidates,
}: SourcePackageOutputPlannerProps) {
  const minimumOutputCount = Math.max(1, sourceArticlePositions.length);
  const maximumOutputCount = Math.min(
    EDITORIAL_SOURCE_PACKAGE_MAX_OUTPUTS,
    Math.max(
      EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS,
      sourceArticlePositions.length * EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS,
    ),
  );
  const initialOutputCount = Math.max(minimumOutputCount, outputs.length);
  const [outputCount, setOutputCount] = useState(initialOutputCount);
  const [sourceGroups, setSourceGroups] = useState<Readonly<Record<number, number>>>(() => (
    Object.fromEntries(
      Array.from({ length: initialOutputCount }, (_, index) => [
        index + 1,
        outputs[index]?.sourceArticlePosition
          ?? sourceArticlePositions[index % sourceArticlePositions.length]
          ?? 1,
      ]),
    )
  ));
  const [choices, setChoices] = useState<Readonly<Record<number, OutputImageChoice>>>(() => (
    Object.fromEntries(
      Array.from(
        { length: initialOutputCount },
        (_, index) => {
          const sourceArticlePosition = outputs[index]?.sourceArticlePosition
            ?? sourceArticlePositions[index % sourceArticlePositions.length]
            ?? 1;
          return [
            index + 1,
            initialChoice(outputs[index], imageCandidates, sourceArticlePosition),
          ];
        },
      ),
    )
  ));
  const [uploads, setUploads] = useState<Readonly<Record<number, OutputUploadState>>>({});
  const [formError, setFormError] = useState("");

  const rows = Array.from({ length: outputCount }, (_, index) => {
    const position = index + 1;
    const existing = outputs[index];
    const sourceArticlePosition = sourceGroups[position]
      ?? existing?.sourceArticlePosition
      ?? sourceArticlePositions[index % sourceArticlePositions.length]
      ?? 1;

    return {
      position,
      sourceArticlePosition,
      focus: existing?.focus ?? `Artigo ${String(position).padStart(2, "0")}`,
      choice: choices[position]
        ?? initialChoice(existing, imageCandidates, sourceArticlePosition),
      upload: uploads[position] ?? null,
      imageCandidates: imageCandidates.filter(
        (candidate) => candidate.sourceArticlePosition === sourceArticlePosition,
      ),
    };
  });

  const uploading = rows.some((row) => row.upload?.status === "uploading");
  const uploadFailed = rows.some((row) => row.upload?.status === "error");

  function changeOutputCount(nextCount: number) {
    setOutputCount(nextCount);
    setSourceGroups((current) => {
      const next = { ...current };
      for (let position = 1; position <= nextCount; position += 1) {
        next[position] ??= outputs[position - 1]?.sourceArticlePosition
          ?? sourceArticlePositions[(position - 1) % sourceArticlePositions.length]
          ?? 1;
      }
      return next;
    });
    setChoices((current) => {
      const next = { ...current };
      for (let position = 1; position <= nextCount; position += 1) {
        const sourceArticlePosition = sourceGroups[position]
          ?? outputs[position - 1]?.sourceArticlePosition
          ?? sourceArticlePositions[(position - 1) % sourceArticlePositions.length]
          ?? 1;
        next[position] ??= initialChoice(
          outputs[position - 1],
          imageCandidates,
          sourceArticlePosition,
        );
      }
      return next;
    });
    setFormError("");
  }

  function chooseSourceGroup(position: number, sourceArticlePosition: number) {
    setSourceGroups((current) => ({ ...current, [position]: sourceArticlePosition }));
    setChoices((current) => {
      const currentChoice = current[position];
      if (currentChoice?.kind === "external") {
        return current;
      }

      return {
        ...current,
        [position]: initialChoice(undefined, imageCandidates, sourceArticlePosition),
      };
    });
    setUploads((current) => {
      const next = { ...current };
      delete next[position];
      return next;
    });
    setFormError("");
  }

  function chooseSource(position: number, newsroomArticleId: string) {
    setChoices((current) => ({
      ...current,
      [position]: { kind: "source", newsroomArticleId },
    }));
    setUploads((current) => {
      const next = { ...current };
      delete next[position];
      return next;
    });
    setFormError("");
  }

  async function chooseExternal(position: number, file: File | undefined) {
    if (!file) {
      return;
    }

    const previewUrl = await previewDataUrl(file);
    if (!supportedImage(file)) {
      setUploads((current) => ({
        ...current,
        [position]: {
          status: "error",
          previewUrl,
          fileName: file.name,
          message: "Escolhe uma imagem JPG, JPEG, PNG ou WEBP.",
        },
      }));
      return;
    }

    setUploads((current) => ({
      ...current,
      [position]: {
        status: "uploading",
        previewUrl,
        fileName: file.name,
        message: "A carregar a imagem…",
      },
    }));
    setFormError("");

    try {
      const contentType = imageContentType(file);
      const signResponse = await fetch(ARTICLE_IMAGE_SIGN_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          size: file.size,
        }),
      });
      const signPayload = await signResponse.json().catch(() => null) as SignedUploadResponse | null;

      if (!signResponse.ok || !signPayload?.ok || !signPayload.signedUrl || !signPayload.publicUrl) {
        throw new Error(uploadFailure(
          signPayload,
          `Não foi possível preparar o upload de ${file.name}.`,
        ));
      }

      const uploadResponse = await fetch(signPayload.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "max-age=31536000",
          "x-upsert": "false",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        const detail = await uploadResponse.text().catch(() => "");
        throw new Error(detail.trim() || `Falhou o upload de ${file.name}.`);
      }

      setChoices((current) => ({
        ...current,
        [position]: {
          kind: "external",
          url: signPayload.publicUrl as string,
          fileName: file.name,
        },
      }));
      setUploads((current) => {
        const next = { ...current };
        delete next[position];
        return next;
      });
    } catch (error) {
      setUploads((current) => ({
        ...current,
        [position]: {
          status: "error",
          previewUrl,
          fileName: file.name,
          message: error instanceof Error
            ? error.message
            : "Não foi possível carregar a imagem.",
        },
      }));
    }
  }

  function removeExternal(position: number) {
    setChoices((current) => ({ ...current, [position]: { kind: "none" } }));
    setUploads((current) => {
      const next = { ...current };
      delete next[position];
      return next;
    });
    setFormError("");
  }

  return (
    <section
      className={styles.sourcePackageOutputPlanner}
      aria-labelledby="source-package-outputs-title"
    >
      <div className={styles.sourcePackageOutputPlannerHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Saídas editoriais do Dossiê</p>
          <h3 id="source-package-outputs-title">Artigos a produzir</h3>
          <p>
            As fontes continuam juntas no mesmo Dossiê. Define quantos artigos devem nascer dele,
            o foco de cada peça e a respetiva imagem.
          </p>
        </div>

        <label>
          <span>Quantidade</span>
          <select
            value={outputCount}
            onChange={(event) => changeOutputCount(Number(event.target.value))}
          >
            {Array.from(
              { length: maximumOutputCount - minimumOutputCount + 1 },
              (_, index) => (
                <option
                  key={minimumOutputCount + index}
                  value={minimumOutputCount + index}
                >
                  {minimumOutputCount + index}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <form
        action={actionUrl}
        method="post"
        className={styles.sourcePackageOutputForm}
        onSubmit={(event) => {
          if (uploading || uploadFailed || rows.some((row) => row.choice.kind === "none")) {
            event.preventDefault();
            setFormError(
              uploading
                ? "Aguarda pela conclusão do upload da imagem."
                : uploadFailed
                  ? "Resolve ou remove a imagem externa que não foi carregada."
                  : "Escolhe uma imagem de fonte ou adiciona outra imagem em cada artigo.",
            );
          }
        }}
      >
        <input type="hidden" name="update_mode" value="outputs" />
        <input type="hidden" name="output_count" value={outputCount} />

        <div className={styles.sourcePackageOutputRows}>
          {rows.map((row) => {
            const externalChoice = row.choice.kind === "external" ? row.choice : null;
            const externalPreview = row.upload?.previewUrl || externalChoice?.url || "";
            const externalFileName = row.upload?.fileName || externalChoice?.fileName || "";

            return (
              <section className={styles.sourcePackageOutputCard} key={row.position}>
                <div className={styles.sourcePackageOutputNumber}>
                  {String(row.position).padStart(2, "0")}
                </div>

                <input
                  type="hidden"
                  name={`output_source_group_${row.position}`}
                  value={row.sourceArticlePosition}
                />
                <input
                  type="hidden"
                  name={`output_external_image_url_${row.position}`}
                  value={externalChoice?.url ?? ""}
                />
                <input
                  type="hidden"
                  name={`output_external_image_name_${row.position}`}
                  value={externalChoice?.fileName ?? ""}
                />

                <label className={styles.sourcePackageOutputFocus}>
                  <span>Foco editorial</span>
                  <input
                    type="text"
                    name={`output_focus_${row.position}`}
                    defaultValue={row.focus}
                    maxLength={EDITORIAL_SOURCE_PACKAGE_OUTPUT_FOCUS_MAX_LENGTH}
                    required
                    placeholder="Ex.: Crónica do jogo, Reações, Arbitragem"
                  />
                </label>

                {sourceArticlePositions.length > 1 ? (
                  <label className={styles.sourcePackageOutputSourceGroup}>
                    <span>Dossiê de fontes</span>
                    <select
                      value={row.sourceArticlePosition}
                      onChange={(event) => chooseSourceGroup(
                        row.position,
                        Number(event.target.value),
                      )}
                    >
                      {sourceArticlePositions.map((position) => (
                        <option key={position} value={position}>
                          Dossiê {String(position).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <fieldset className={styles.sourcePackageOutputImages}>
                  <legend>Imagem deste artigo</legend>

                  <div className={styles.sourcePackageOutputImageGrid}>
                    {row.imageCandidates.map((candidate) => (
                      <label
                        className={styles.sourcePackageOutputImageOption}
                        key={candidate.newsroomArticleId}
                      >
                        <input
                          type="radio"
                          name={`output_image_${row.position}`}
                          value={candidate.newsroomArticleId}
                          checked={
                            row.choice.kind === "source"
                            && row.choice.newsroomArticleId === candidate.newsroomArticleId
                          }
                          onChange={() => chooseSource(row.position, candidate.newsroomArticleId)}
                        />
                        <img src={candidate.imageUrl} alt="" loading="lazy" />
                        <span>
                          <strong>{candidate.sourceName}</strong>
                          <small>{candidate.title}</small>
                        </span>
                      </label>
                    ))}

                    <div className={styles.sourcePackageOutputExternalOption}>
                      {externalPreview ? (
                        <img src={externalPreview} alt={`Pré-visualização de ${externalFileName}`} />
                      ) : (
                        <span className={styles.sourcePackageOutputExternalPlaceholder} aria-hidden="true">+</span>
                      )}

                      <div>
                        <strong>{externalFileName || "Imagem externa"}</strong>
                        <label htmlFor={`output_external_image_${row.position}`}>
                          {externalPreview ? "Substituir" : "Adicionar outra imagem"}
                        </label>
                        <input
                          id={`output_external_image_${row.position}`}
                          className={styles.sourcePackageOutputExternalInput}
                          type="file"
                          accept={EXTERNAL_IMAGE_ACCEPT}
                          disabled={row.upload?.status === "uploading"}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            void chooseExternal(row.position, file);
                          }}
                        />
                        {row.upload ? (
                          <small
                            className={row.upload.status === "error"
                              ? styles.sourcePackageOutputExternalError
                              : undefined}
                            role="status"
                          >
                            {row.upload.message}
                          </small>
                        ) : externalChoice ? (
                          <small>Imagem externa escolhida para esta peça.</small>
                        ) : (
                          <small>JPG, JPEG, PNG ou WEBP.</small>
                        )}
                      </div>

                      {externalChoice || row.upload ? (
                        <button
                          type="button"
                          disabled={row.upload?.status === "uploading"}
                          onClick={() => removeExternal(row.position)}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {row.imageCandidates.length === 0 ? (
                    <input type="hidden" name={`output_image_${row.position}`} value="" />
                  ) : null}
                </fieldset>
              </section>
            );
          })}
        </div>

        <div id="source-package-output-actions" className={styles.sourcePackageOutputActions}>
          <button type="submit" disabled={uploading}>Guardar artigos e imagens</button>
          <p>
            Depois de guardar, o pacote enviado ao ChatGPT exigirá exatamente este número de artigos.
          </p>
          {formError ? <p className={styles.sourcePackageOutputExternalError} role="alert">{formError}</p> : null}
        </div>
      </form>
    </section>
  );
}
