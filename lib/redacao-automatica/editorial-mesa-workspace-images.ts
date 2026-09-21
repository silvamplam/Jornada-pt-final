export type EditorialContextualImage = Readonly<{
  id: string;
  newsroomArticleId?: string | null;
}>;

export type EditorialMesaContextualImages<Image extends EditorialContextualImage> = Readonly<{
  images: readonly Image[];
  allImages: readonly Image[];
  relevantCount: number;
}>;

function selectedDossierImageId(imageChoice: string): string | null {
  return imageChoice.startsWith("dossier_image:")
    ? imageChoice.slice("dossier_image:".length)
    : null;
}

/**
 * Produces the visual subset for one frozen output. This is presentation only:
 * it neither restricts the workspace image bank nor expresses factual usage.
 * A selected out-of-context image is retained so a saved editorial choice can
 * never disappear from the collapsed selector.
 */
export function editorialMesaContextualImages<Image extends EditorialContextualImage>(
  images: readonly Image[],
  focusSourceIds: readonly string[],
  selectedImageChoice: string,
): EditorialMesaContextualImages<Image> {
  const focused = new Set(focusSourceIds);
  const relevant = images.filter((image) => (
    typeof image.newsroomArticleId === "string"
    && focused.has(image.newsroomArticleId)
  ));
  const selectedId = selectedDossierImageId(selectedImageChoice);
  const selected = selectedId
    ? images.find((image) => image.id === selectedId) ?? null
    : null;

  const contextual = !selected || relevant.some((image) => image.id === selected.id)
    ? relevant
    : [...relevant, selected];
  const contextualIds = new Set(contextual.map((image) => image.id));
  return {
    images: contextual,
    allImages: [
      ...contextual,
      ...images.filter((image) => !contextualIds.has(image.id)),
    ],
    relevantCount: relevant.length,
  };
}
