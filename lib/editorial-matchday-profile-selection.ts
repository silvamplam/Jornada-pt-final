import type { EditorialProfile } from "@/lib/editorial-profiles";
import type { MatchdayEditorialProfileDeskAutomaticItem } from "@/lib/editorial-matchday-profile-desk";
import {
  returnMatchdayEditorialItemsToAutomatic,
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

export type ExclusiveMatchdayEditorialProfileSelectionRemoval = Readonly<{
  selection: MatchdayEditorialProfileSelection;
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  workedIdentity: string | null;
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

function selectionCandidateIdentity(
  candidate: MatchdayEditorialProfileSelectionCandidateIdentity | undefined,
): string | null {
  const sourceType = candidate?.sourceType?.trim().toLowerCase() ?? "";
  const sourceId = candidate?.sourceId?.trim().toLowerCase() ?? "";
  return sourceType === "editorial_article" && sourceId
    ? thematicEditorialIdentity(sourceType, sourceId)
    : null;
}

export function matchdayEditorialProfileSelectionIdentities(
  selection: MatchdayEditorialProfileSelection,
  candidates: readonly MatchdayEditorialProfileSelectionCandidateIdentity[],
): readonly string[] {
  const candidateByBankItemId = new Map(
    candidates.map((candidate) => [candidate.bankItemId.trim().toLowerCase(), candidate] as const),
  );
  return Array.from(new Set(
    validatedSelection(selection).flatMap((bankItemId) => {
      if (!bankItemId) return [];
      const itemIdentity = selectionCandidateIdentity(
        candidateByBankItemId.get(bankItemId.trim().toLowerCase()),
      );
      return itemIdentity ? [itemIdentity] : [];
    }),
  ));
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

  const next = validatedSelection(selection);
  const targetIndex = selectionIndex(targetPosition);
  const sourceIndex = next.findIndex(
    (value) => value === cleanBankItemId,
  );

  if (sourceIndex === targetIndex) {
    return next;
  }

  if (sourceIndex >= 0) {
    const targetBankItemId = next[targetIndex];
    next[targetIndex] = cleanBankItemId;
    next[sourceIndex] = targetBankItemId;
    return next;
  }

  next[targetIndex] = cleanBankItemId;

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
    (item) => item.bankItemId.trim().toLowerCase() === bankItemId.toLowerCase(),
  );
  const workedIdentity = selectionCandidateIdentity(candidate);
  const sourceId = candidate?.sourceId?.trim().toLowerCase() ?? "";

  if (!workedIdentity || !sourceId) {
    return {
      selection,
      overrides: input.overrides,
      opening: input.opening,
      workedIdentity: null,
    };
  }

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

  const selectionIdentities = Array.from(new Set([
    ...matchdayEditorialProfileSelectionIdentities(
      input.selection,
      input.candidates,
    ),
    ...matchdayEditorialProfileSelectionIdentities(
      selection,
      input.candidates,
    ),
  ]));
  const activeByIdentity = new Map(input.activeItems.map((item) => [
    thematicEditorialIdentity(item.sourceType, item.sourceId),
    item,
  ] as const));
  const opening = selectionIdentities.reduce((current, itemIdentity) => {
    const selectedItem = activeByIdentity.get(itemIdentity);
    return selectedItem
      ? removeMatchdayEditorialProfileItemFromOpening(
          current,
          selectedItem.sourceId,
        )
      : current;
  }, input.opening);

  return {
    selection,
    overrides: returnMatchdayEditorialItemsToAutomatic(
      input.profile,
      input.overrides,
      selectionIdentities,
    ),
    opening,
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
  const selection = validatedSelection(input.selection);
  const selectedIdentities = matchdayEditorialProfileSelectionIdentities(
    selection,
    input.candidates,
  );
  const activeByIdentity = new Map(input.activeItems.map((item) => [
    thematicEditorialIdentity(item.sourceType, item.sourceId),
    item,
  ] as const));
  const opening = selectedIdentities.reduce((current, itemIdentity) => {
    const selectedItem = activeByIdentity.get(itemIdentity);
    return selectedItem
      ? removeMatchdayEditorialProfileItemFromOpening(
          current,
          selectedItem.sourceId,
        )
      : current;
  }, input.opening);

  return {
    selection,
    overrides: returnMatchdayEditorialItemsToAutomatic(
      input.profile,
      input.overrides,
      selectedIdentities,
    ),
    opening,
  };
}

export function removeExclusiveMatchdayEditorialProfileSelection(input: Readonly<{
  profile: EditorialProfile;
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  selection: MatchdayEditorialProfileSelection;
  candidates: readonly MatchdayEditorialProfileSelectionCandidateIdentity[];
  position: MatchdayEditorialProfileSelectionPosition;
}>): ExclusiveMatchdayEditorialProfileSelectionRemoval {
  const bankItemId = validatedSelection(input.selection)[selectionIndex(input.position)];
  const candidate = bankItemId
    ? input.candidates.find((item) => (
        item.bankItemId.trim().toLowerCase() === bankItemId.trim().toLowerCase()
      ))
    : undefined;
  const workedIdentity = selectionCandidateIdentity(candidate);

  return {
    selection: removeMatchdayEditorialProfileSelection(
      input.selection,
      input.position,
    ),
    overrides: workedIdentity
      ? returnMatchdayEditorialItemsToAutomatic(
          input.profile,
          input.overrides,
          [workedIdentity],
        )
      : input.overrides,
    workedIdentity,
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
