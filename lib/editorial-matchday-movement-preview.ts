import type { EditorialProfileZoneKey } from "@/lib/editorial-profiles";

export type MatchdayEditorialPreviewPlacement =
  | Readonly<{ kind: "opening"; slotPosition: number }>
  | Readonly<{
      kind: "zone";
      zoneKey: EditorialProfileZoneKey;
      slotPosition: number;
    }>
  | Readonly<{ kind: "faixa"; slotPosition: number }>
  | Readonly<{ kind: "selection"; slotPosition: number }>
  | Readonly<{ kind: "video_highlight"; slotPosition: 1 }>
  | Readonly<{ kind: "bank" }>
  | Readonly<{ kind: "tracking" }>;

export type MatchdayEditorialVacantZoneSlot = Readonly<{
  zoneKey: EditorialProfileZoneKey;
  slotPosition: number;
}>;

export type MatchdayEditorialMovementPreviewState = Readonly<{
  displacedIdentities: readonly string[];
  vacantZoneSlots: readonly MatchdayEditorialVacantZoneSlot[];
  vacantFaixaSlots: readonly number[];
}>;

export type MatchdayEditorialPreviewMovement = Readonly<{
  incomingIdentity: string;
  source: MatchdayEditorialPreviewPlacement | null;
  target: MatchdayEditorialPreviewPlacement;
  displacedIdentity: string | null;
}>;

function cleanIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function zoneSlotKey(slot: MatchdayEditorialVacantZoneSlot): string {
  return `${slot.zoneKey}:${slot.slotPosition}`;
}

function samePlacement(
  left: MatchdayEditorialPreviewPlacement | null,
  right: MatchdayEditorialPreviewPlacement,
): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "zone" && right.kind === "zone") {
    return left.zoneKey === right.zoneKey
      && left.slotPosition === right.slotPosition;
  }
  if (
    left.kind === "opening"
    || left.kind === "faixa"
    || left.kind === "selection"
    || left.kind === "video_highlight"
  ) {
    return right.kind === left.kind
      && left.slotPosition === right.slotPosition;
  }
  return true;
}

export function applyMatchdayEditorialMovementPreview(
  state: MatchdayEditorialMovementPreviewState,
  movements: readonly MatchdayEditorialPreviewMovement[],
): MatchdayEditorialMovementPreviewState {
  const displaced = new Set(
    state.displacedIdentities.map(cleanIdentity).filter(Boolean),
  );
  const vacantByKey = new Map(
    state.vacantZoneSlots.map((slot) => [zoneSlotKey(slot), slot] as const),
  );
  const vacantFaixaSlots = new Set(state.vacantFaixaSlots);

  for (const movement of movements) {
    const incomingIdentity = cleanIdentity(movement.incomingIdentity);
    const displacedIdentity = movement.displacedIdentity
      ? cleanIdentity(movement.displacedIdentity)
      : null;

    if (!incomingIdentity) {
      throw new Error("matchday-editorial-preview-movement-invalid-incoming");
    }

    displaced.delete(incomingIdentity);

    if (
      displacedIdentity
      && displacedIdentity !== incomingIdentity
    ) {
      displaced.add(displacedIdentity);
    }

    if (
      movement.source?.kind === "zone"
      && !samePlacement(movement.source, movement.target)
    ) {
      const vacant = {
        zoneKey: movement.source.zoneKey,
        slotPosition: movement.source.slotPosition,
      } as const;
      vacantByKey.set(zoneSlotKey(vacant), vacant);
    }

    if (
      movement.source?.kind === "faixa"
      && !samePlacement(movement.source, movement.target)
    ) {
      vacantFaixaSlots.add(movement.source.slotPosition);
    }
  }

  // All sources are vacated first. A target in the same batch then occupies
  // its slot, so the final preview never exposes a false empty position.
  for (const movement of movements) {
    if (movement.target.kind === "zone") {
      vacantByKey.delete(zoneSlotKey({
        zoneKey: movement.target.zoneKey,
        slotPosition: movement.target.slotPosition,
      }));
    }
    if (movement.target.kind === "faixa") {
      vacantFaixaSlots.delete(movement.target.slotPosition);
    }
  }

  return {
    displacedIdentities: Array.from(displaced).sort(),
    vacantZoneSlots: Array.from(vacantByKey.values()).sort((left, right) => (
      left.zoneKey.localeCompare(right.zoneKey)
      || left.slotPosition - right.slotPosition
    )),
    vacantFaixaSlots: Array.from(vacantFaixaSlots).sort((left, right) => (
      left - right
    )),
  };
}
