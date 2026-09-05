import type {
  EditorialVisualFamilyRendererKey,
} from "@/lib/editorial-visual-families";

export function resolvePublicFlexibleZoneRenderer<T>(
  renderers: Readonly<
    Record<EditorialVisualFamilyRendererKey, T>
  >,
  rendererKey: string,
): T {
  if (
    !Object.prototype.hasOwnProperty.call(
      renderers,
      rendererKey,
    )
  ) {
    throw new Error(
      `Unknown public flexible zone renderer: ${rendererKey}`,
    );
  }

  return renderers[
    rendererKey as EditorialVisualFamilyRendererKey
  ];
}
