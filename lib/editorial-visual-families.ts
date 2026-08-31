export const EDITORIAL_VISUAL_FAMILIES = [
  "six_news",
  "five_news_balanced",
  "five_news_secondary",
] as const;

export type EditorialVisualFamily =
  (typeof EDITORIAL_VISUAL_FAMILIES)[number];

export type EditorialVisualFamilyDefinition = Readonly<{
  label: string;
  capacity: number;
}>;

export const EDITORIAL_VISUAL_FAMILY_DEFINITIONS: Readonly<
  Record<
    EditorialVisualFamily,
    EditorialVisualFamilyDefinition
  >
> = Object.freeze({
  six_news: {
    label: "6 notícias",
    capacity: 6,
  },
  five_news_balanced: {
    label: "5 notícias equilibradas",
    capacity: 5,
  },
  five_news_secondary: {
    label: "5 notícias secundárias",
    capacity: 5,
  },
});

export function editorialVisualFamilyCapacity(
  family: EditorialVisualFamily,
): number {
  return EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].capacity;
}
