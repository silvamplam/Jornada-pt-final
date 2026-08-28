import type { EditorialProfile } from "@/lib/editorial-profiles";
import type { MatchdayEditorialProfileDeskAutomaticItem } from "@/lib/editorial-matchday-profile-desk";
import {
  moveMatchdayEditorialItemsToBank,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  removeMatchdayEditorialProfileItemFromOpening,
  type MatchdayEditorialProfileOpening,
} from "@/lib/editorial-matchday-profile-workspace";

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

export type ExclusiveMatchdayEditorialProfileSelectionTransition = Readonly<{
  selection: MatchdayEditorialProfileSelection;
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  workedIdentity: string | null;
}>;

export type ExclusiveMatchdayEditorialProfileSelectionState = Readonly<{
  selection: MatchdayEditorialProfileSelection;
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
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

export function prepareExclusiveMatchdayEditorialProfileSelection(input: Readonly<{
  profile: EditorialProfile;
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[];
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  selection: MatchdayEditorialProfileSelection;
  candidates: readonly MatchdayEditorialProfileSelectionCandidateIdentity[];
  targetPosition: MatchdayEditorialProfileSelectionPosition;
  bankItemId: string;
}>): ExclusiveMatchdayEditorialProfileSelectionTransition {
  const bankItemId = input.bankItemId.trim();
  const selection = promoteMatchdayEditorialProfileSelection(
    input.selection,
    input.targetPosition,
    bankItemId,
  );
  const candidate = input.candidates.find(
    (item) => item.bankItemId.trim() === bankItemId,
  );
  const sourceType = candidate?.sourceType?.trim().toLowerCase() ?? "";
  const sourceId = candidate?.sourceId?.trim().toLowerCase() ?? "";

  if (sourceType !== "editorial_article" || !sourceId) {
    return {
      selection,
      overrides: input.overrides,
      opening: input.opening,
      workedIdentity: null,
    };
  }

  const workedIdentity = thematicEditorialIdentity(sourceType, sourceId);
  if (!input.activeItems.some((item) => (
    thematicEditorialIdentity(item.sourceType, item.sourceId) === workedIdentity
  ))) {
    return {
      selection,
      overrides: input.overrides,
      opening: input.opening,
      workedIdentity: null,
    };
  }

  return {
    selection,
    overrides: moveMatchdayEditorialItemsToBank(
      input.profile,
      input.activeItems,
      input.overrides,
      [workedIdentity],
    ),
    opening: removeMatchdayEditorialProfileItemFromOpening(
      input.opening,
      sourceId,
    ),
    workedIdentity,
  };
}

export function prepareExclusiveMatchdayEditorialProfileSelectionState(input: Readonly<{
  profile: EditorialProfile;
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[];
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  selection: MatchdayEditorialProfileSelection;
  candidates: readonly MatchdayEditorialProfileSelectionCandidateIdentity[];
}>): ExclusiveMatchdayEditorialProfileSelectionState {
  let selection = validatedSelection(input.selection);
  let overrides = input.overrides;
  let opening = input.opening;

  for (const position of MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS) {
    const bankItemId = selection[selectionIndex(position)];

    if (!bankItemId) continue;

    const transition = prepareExclusiveMatchdayEditorialProfileSelection({
      profile: input.profile,
      activeItems: input.activeItems,
      overrides,
      opening,
      selection,
      candidates: input.candidates,
      targetPosition: position,
      bankItemId,
    });

    selection = [...transition.selection];
    overrides = transition.overrides;
    opening = transition.opening;
  }

  return {
    selection,
    overrides,
    opening,
  };
}

export function withoutMatchdayEditorialProfileSelectionBankItems(
  selection: MatchdayEditorialProfileSelection,
  bankItemIds: readonly string[],
): MatchdayEditorialProfileSelection {
  const removed = new Set(bankItemIds.map((value) => value.trim()).filter(Boolean));
  return validatedSelection(selection).map((value) => (
    value !== null && removed.has(value) ? null : value
  ));
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
