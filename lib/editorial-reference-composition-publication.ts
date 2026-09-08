import type { ReferenceCompositionPresentationMode } from "@/lib/editorial-hierarchical-composition";

export type ReferenceCompositionPublicationAuthorityContext = Readonly<{
  physicalAuthority: boolean;
  hasContinuityTransition: boolean;
  sourceDeskIsManaged: boolean | null;
}>;

export function isHistoricalReferenceCompositionRepublishContext(
  context: ReferenceCompositionPublicationAuthorityContext,
) {
  return context.hasContinuityTransition && context.sourceDeskIsManaged === false;
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
