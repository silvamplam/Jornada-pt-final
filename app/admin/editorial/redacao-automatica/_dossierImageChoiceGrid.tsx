"use client";

import styles from "./dossier-image-choice-grid.module.css";

export type DossierImageChoice = Readonly<{
  id: string;
  imageUrl: string;
  label: string;
}>;

type DossierImageChoiceGridProps = Readonly<{
  value: string;
  images: readonly DossierImageChoice[];
  name: string;
  disabled?: boolean;
  compact?: boolean;
  allowNoImage?: boolean;
  allowPreservePublished?: boolean;
  preservePublishedImageUrl?: string | null;
  onChange: (value: string) => void;
  onAddImage?: () => void;
  addImageControls?: string;
}>;

export default function DossierImageChoiceGrid({
  value,
  images,
  name,
  disabled = false,
  compact = false,
  allowNoImage = false,
  allowPreservePublished = false,
  preservePublishedImageUrl = null,
  onChange,
  onAddImage,
  addImageControls,
}: DossierImageChoiceGridProps) {
  return (
    <fieldset className={styles.imageChoices} data-compact={compact ? "true" : "false"}>
      <legend>Imagem</legend>
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
              <img src={preservePublishedImageUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.noImageChoice}>Atual</span>
            )}
            <small>MANTER IMAGEM PUBLICADA</small>
          </label>
        ) : null}

        {images.map((image) => {
          const imageValue = `dossier_image:${image.id}`;
          return (
            <label key={image.id} data-selected={value === imageValue}>
              <input
                type="radio"
                name={name}
                checked={value === imageValue}
                disabled={disabled}
                onChange={() => onChange(imageValue)}
              />
              <img src={image.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
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
