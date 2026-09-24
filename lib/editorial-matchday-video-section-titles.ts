export const DEFAULT_MATCHDAY_ROUNDUP_VIDEO_HEADING = "A JORNADA EM VÍDEO";

export const DEFAULT_MATCHDAY_VIDEO_HIGHLIGHT_SECTION_TITLE =
  "DESTAQUE DA JORNADA";

export function matchdayVideoSectionTitle(
  value: string | null | undefined,
  fallback: string,
): string {
  return value?.trim() || fallback;
}
