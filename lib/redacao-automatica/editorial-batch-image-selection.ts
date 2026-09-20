import type {
  EditorialBatchTransferDossierImage,
  EditorialBatchTransferSourcePackage,
} from "./editorial-batch-transfer";

export function editorialBatchOutputImage(
  sourcePackage: EditorialBatchTransferSourcePackage | null,
  outputId: string,
) {
  const position = sourcePackage?.batchContract?.outputIds.indexOf(outputId) ?? -1;
  return sourcePackage?.outputImages?.find((image) => (
    image.outputId === outputId
    || (!image.outputId && image.position === position + 1)
  )) ?? null;
}

export function editorialBatchDossierImages(
  sourcePackage: EditorialBatchTransferSourcePackage | null,
): readonly EditorialBatchTransferDossierImage[] {
  if (sourcePackage?.dossierImages?.length) return sourcePackage.dossierImages;
  const seen = new Set<string>();
  return (sourcePackage?.outputImages ?? []).flatMap((image) => {
    if (seen.has(image.imageUrl)) return [];
    seen.add(image.imageUrl);
    return [{
      id: image.dossierImageId
        ?? image.outputId
        ?? sourcePackage?.batchContract?.outputIds[image.position - 1]
        ?? `output-${image.position}`,
      imageUrl: image.imageUrl,
      label: image.label,
    }];
  });
}

export function editorialBatchInitialImageChoice(
  sourcePackage: EditorialBatchTransferSourcePackage | null,
  outputId: string,
  existing: boolean,
): string {
  const selected = editorialBatchOutputImage(sourcePackage, outputId);
  const dossierImage = selected
    ? editorialBatchDossierImages(sourcePackage).find((image) => (
        image.id === selected.dossierImageId || image.imageUrl === selected.imageUrl
      ))
    : null;
  return dossierImage
    ? `dossier_image:${dossierImage.id}`
    : existing
      ? "preserve_published"
      : "unselected";
}

export function withEditorialBatchOutputImageChoice(
  sourcePackage: EditorialBatchTransferSourcePackage,
  outputId: string,
  dossierImageId: string | null,
): EditorialBatchTransferSourcePackage {
  const position = (sourcePackage.batchContract?.outputIds.indexOf(outputId) ?? -1) + 1;
  if (position < 1) return sourcePackage;
  const retained = (sourcePackage.outputImages ?? []).filter((image) => (
    image.outputId !== outputId
    && !(!image.outputId && image.position === position)
  ));
  const selected = dossierImageId
    ? editorialBatchDossierImages(sourcePackage).find((image) => image.id === dossierImageId) ?? null
    : null;
  return {
    ...sourcePackage,
    outputImages: selected
      ? [...retained, {
          position,
          outputId,
          dossierImageId: selected.id,
          imageUrl: selected.imageUrl,
          label: selected.label,
        }].sort((left, right) => left.position - right.position)
      : retained,
  };
}
