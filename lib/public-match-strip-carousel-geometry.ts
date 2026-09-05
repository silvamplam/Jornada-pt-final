// Eight cards plus seven 8px gaps extend 20px past each editorial edge.
export const CARD_WIDTH = 148;
export const CARD_HEIGHT = 112;
export const CARD_GAP = 8;
export const CARD_STEP = CARD_WIDTH + CARD_GAP;
export const CARD_INLINE_PADDING = 10;
export const CARD_BORDER_WIDTH = 1;
export const CARD_TEAM_COLUMN_WIDTH = (
  CARD_WIDTH - (2 * CARD_BORDER_WIDTH) - (2 * CARD_INLINE_PADDING) - CARD_GAP
) / 2;
export const ARROW_ZONE_WIDTH = 32;
export const VISIBLE_CARD_COUNTS = [8, 6, 4, 2, 1] as const;

export type VisibleCardCount = (typeof VISIBLE_CARD_COUNTS)[number];

export function getMatchCarouselViewportWidth(count: VisibleCardCount): number {
  return (count * CARD_WIDTH) + ((count - 1) * CARD_GAP);
}

export function getMatchCarouselShellWidth(count: VisibleCardCount): number {
  return getMatchCarouselViewportWidth(count) + (2 * ARROW_ZONE_WIDTH);
}

export function selectMatchCarouselVisibleCardCount(availableWidth: number): VisibleCardCount {
  return VISIBLE_CARD_COUNTS.find(
    (count) => getMatchCarouselViewportWidth(count) <= availableWidth
  ) ?? 1;
}
