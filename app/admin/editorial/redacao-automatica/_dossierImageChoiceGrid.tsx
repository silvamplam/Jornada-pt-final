"use client";

import BackofficeImage from "@/components/admin/BackofficeImage";
import { useState } from "react";
import FreezeEditorialImage from "@/components/admin/FreezeEditorialImage";
import { editorialImageOriginalPath } from "@/lib/editorial-image-authority";
import styles from "./dossier-image-choice-grid.module.css";

export type DossierImageChoice = Readonly<{
  id: string;
  imageUrl: string;
  label: string;
  // Legacy packages sometimes use output IDs, which are not dossier rows.
  freezeDossierImageId?: string | null;
}>;

type DossierImageChoiceGridProps = Readonly<{
  value: string;
  images: readonly DossierImageChoice[];
  name: string;
  legend?: string;
  disabled?: boolean;
  compact?: boolean;
  allowNoImage?: boolean;
  allowPreservePublished?: boolean;
  preservePublishedImageUrl?: string | null;
  onChange: (value: string, frozenUrl?: string) => void;
  onAddImage?: () => void;
  addImageControls?: string;
  prepareBeforeSave?: boolean;
}>;

export default function DossierImageChoiceGrid({
  value,
  images,
  name,
  legend = "Imagem",
  disabled = false,
  compact = false,
  allowNoImage = false,
  allowPreservePublished = false,
  preservePublishedImageUrl = null,
  onChange,
  onAddImage,
  addImageControls,
  prepareBeforeSave = false,
}: DossierImageChoiceGridProps) {
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  return (
    <fieldset className={styles.imageChoices} data-compact={compact ? "true" : "false"}>
      <legend>{legend}</legend>
      <div>
        {allowNoImage ? (
          <label data-selected={value === "unselected"}>
            <input
              type="radio"
              name={name}
              checked={value === "unselected"}
              disabled={disabled}
              onChange={() => onChange("unselected")}
            />
            <span className={styles.noImageChoice}>Sem imagem</span>
          </label>
        ) : null}

        {allowPreservePublished ? (
          <label data-selected={value === "preserve_published"}>
            <input
              type="radio"
              name={name}
              checked={value === "preserve_published"}
              disabled={disabled}
              onChange={() => onChange("preserve_published")}
            />
            {preservePublishedImageUrl ? (
              <BackofficeImage previewWidth={320} src={preservePublishedImageUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.noImageChoice}>Atual</span>
            )}
            <small>MANTER IMAGEM PUBLICADA</small>
          </label>
        ) : null}

        {images.map((image) => {
          const imageValue = `dossier_image:${image.id}`;
          const imageUrl = confirmed[image.id] ?? image.imageUrl;
          if (!editorialImageOriginalPath(imageUrl)) return (
            <div key={image.id} className={styles.externalChoice}>
              <button className={styles.candidateChoice} type="button" disabled={disabled || !prepareBeforeSave}
                aria-label={`Escolher imagem · ${image.label}`} onClick={() => onChange(imageValue)}>
                <BackofficeImage previewWidth={320} src={imageUrl} alt="Candidata da fonte" loading="lazy" referrerPolicy="no-referrer" />
                <small>{image.label}</small>
              </button>
              {!prepareBeforeSave && !disabled ? <details className={styles.imageReview}>
                <summary>Rever imagem</summary>
                <FreezeEditorialImage sourceUrl={image.imageUrl} dossierImageId={image.freezeDossierImageId === null ? undefined : image.freezeDossierImageId ?? image.id} onConfirm={(url) => {
                  setConfirmed(current => ({ ...current, [image.id]: url }));
                  onChange(imageValue, url);
                }} />
              </details> : null}
            </div>
          );
          return (
            <label key={image.id} data-selected={value === imageValue}>
              <input
                type="radio"
                name={name}
                checked={value === imageValue}
                disabled={disabled}
                onChange={() => onChange(imageValue)}
              />
              <BackofficeImage previewWidth={320} src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <small>{image.label}</small>
            </label>
          );
        })}

        {onAddImage ? (
          <button
            className={styles.addImageChoice}
            type="button"
            aria-controls={addImageControls}
            aria-label="Adicionar imagem ao banco da produção"
            disabled={disabled}
            onClick={onAddImage}
          >
            <span aria-hidden="true">+</span>
            <small>Adicionar</small>
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
