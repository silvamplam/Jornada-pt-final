export const MANUAL_NEWSROOM_SOURCE_CODE = "manual_entry";
export const MANUAL_NEWSROOM_SOURCE_LABEL = "Entrada manual";

export const MANUAL_NEWSROOM_ANTETITLE_MAX_LENGTH = 240;
export const MANUAL_NEWSROOM_TITLE_MAX_LENGTH = 180;
export const MANUAL_NEWSROOM_POST_TITLE_MAX_LENGTH = 600;
export const MANUAL_NEWSROOM_AUTHOR_MAX_LENGTH = 200;
export const MANUAL_NEWSROOM_BODY_MAX_LENGTH = 50_000;

export function isManualNewsroomSource(
  sourceCode: string | null | undefined,
  sourceMetadata?: unknown,
): boolean {
  if (sourceCode?.trim().toLowerCase() === MANUAL_NEWSROOM_SOURCE_CODE) {
    return true;
  }
  if (!sourceMetadata || Array.isArray(sourceMetadata) || typeof sourceMetadata !== "object") {
    return false;
  }

  return (sourceMetadata as Record<string, unknown>).origin === "manual";
}
