import { thematicEditorialIdentity } from "@/lib/editorial-matchday-profile-desk-operations";

export const MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS =
  [1, 2, 3, 4] as const;

export type MatchdayEditorialProfileSelectionPosition =
  (typeof MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS)[number];

export type MatchdayEditorialProfileSelection =
  readonly (string | null)[];

export type MatchdayEditorialProfileSelectionCandidateIdentity = Readonly<{
  bankItemId: string;
  sourceType: string | null;
  sourceId: string | null;
}>;

export type MatchdayEditorialProfileSelectionDrag = Readonly<{
  bankItemId: string;
  sourcePosition: MatchdayEditorialProfileSelectionPosition;
}>;

const SELECTION_DRAG_KIND = "jornada-matchday-editorial-selection";

function selectionIndex(
  position: MatchdayEditorialProfileSelectionPosition,
): number {
  return position - 1;
}

function validatedSelection(
  selection: MatchdayEditorialProfileSelection,
): (string | null)[] {
  if (
    selection.length
    !== MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS.length
  ) {
    throw new Error("matchday-editorial-profile-selection-invalid-length");
  }

  return [...selection];
}

export function promoteMatchdayEditorialProfileSelection(
  selection: MatchdayEditorialProfileSelection,
  targetPosition: MatchdayEditorialProfileSelectionPosition,
  bankItemId: string,
): MatchdayEditorialProfileSelection {
  const cleanBankItemId = bankItemId.trim();

  if (!cleanBankItemId) {
    throw new Error("matchday-editorial-profile-selection-invalid-bank-item");
  }

  const next = validatedSelection(selection).map(
    (value) => value === cleanBankItemId ? null : value,
  );

  next[selectionIndex(targetPosition)] = cleanBankItemId;

  return next;
}

export function removeMatchdayEditorialProfileSelection(
  selection: MatchdayEditorialProfileSelection,
  position: MatchdayEditorialProfileSelectionPosition,
): MatchdayEditorialProfileSelection {
  const next = validatedSelection(selection);
  next[selectionIndex(position)] = null;
  return next;
}

export function matchdayEditorialProfileSelectionBankItemByIdentity(
  candidates:
    readonly MatchdayEditorialProfileSelectionCandidateIdentity[],
): ReadonlyMap<string, string> {
  return new Map(
    candidates.flatMap((candidate) => {
      const sourceType = candidate.sourceType?.trim();
      const sourceId = candidate.sourceId?.trim();
      const bankItemId = candidate.bankItemId.trim();

      return sourceType && sourceId && bankItemId
        ? [[
            thematicEditorialIdentity(sourceType, sourceId),
            bankItemId,
          ] as const]
        : [];
    }),
  );
}

export function serializeMatchdayEditorialProfileSelectionDrag(
  drag: MatchdayEditorialProfileSelectionDrag,
): string {
  return JSON.stringify({
    kind: SELECTION_DRAG_KIND,
    bankItemId: drag.bankItemId,
    sourcePosition: drag.sourcePosition,
  });
}

export function parseMatchdayEditorialProfileSelectionDrag(
  value: string,
): MatchdayEditorialProfileSelectionDrag | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (
      parsed.kind !== SELECTION_DRAG_KIND
      || typeof parsed.bankItemId !== "string"
      || !parsed.bankItemId.trim()
      || typeof parsed.sourcePosition !== "number"
      || !MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS.includes(
        parsed.sourcePosition as MatchdayEditorialProfileSelectionPosition,
      )
    ) {
      return null;
    }

    return {
      bankItemId: parsed.bankItemId.trim(),
      sourcePosition:
        parsed.sourcePosition as MatchdayEditorialProfileSelectionPosition,
    };
  } catch {
    return null;
  }
}
