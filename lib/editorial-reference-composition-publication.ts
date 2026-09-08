import type { ReferenceCompositionPresentationMode } from "@/lib/editorial-hierarchical-composition";

export type HistoricalReferenceCompositionRepublishContext = Readonly<{
  hasContinuityTransition: boolean;
  sourceDeskIsManaged: boolean | null;
}>;

export type ReferenceCompositionPublicationAuthorityContext =
  HistoricalReferenceCompositionRepublishContext & Readonly<{
    physicalAuthority: boolean;
  }>;

export type HistoricalPublishedReferenceCompositionAuthorityContext =
  HistoricalReferenceCompositionRepublishContext & Readonly<{
    sourceCompositionId: string | null;
    currentPublishedCompositionId: string | null;
  }>;

export function isHistoricalReferenceCompositionRepublishContext(
  context: HistoricalReferenceCompositionRepublishContext,
) {
  return context.hasContinuityTransition && context.sourceDeskIsManaged === false;
}

export function isHistoricalPublishedReferenceCompositionAuthority(
  context: HistoricalPublishedReferenceCompositionAuthorityContext,
) {
  const sourceCompositionId = context.sourceCompositionId?.trim() || null;
  const currentPublishedCompositionId =
    context.currentPublishedCompositionId?.trim() || null;

  return isHistoricalReferenceCompositionRepublishContext(context)
    && sourceCompositionId !== null
    && currentPublishedCompositionId !== null
    && currentPublishedCompositionId !== sourceCompositionId;
}

export function shouldRejectNonStandardPhysicalReferenceComposition(
  context: ReferenceCompositionPublicationAuthorityContext & {
    presentationMode: ReferenceCompositionPresentationMode;
  },
) {
  return context.physicalAuthority
    && context.presentationMode !== "standard"
    && !isHistoricalReferenceCompositionRepublishContext(context);
}
