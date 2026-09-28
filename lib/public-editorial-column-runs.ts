import { editorialVisualFamilyDefinition } from "./editorial-visual-families";

type ColumnZone = Readonly<{
  key: string;
  visualFamily: string;
  slots: readonly Readonly<{ item: unknown | null }>[];
}>;
export type PublicEditorialColumnRun<Zone> = Readonly<{
  kind: "column_run";
  key: string;
  zones: readonly Zone[];
}>;

/** Call after editorial ordering, before filtering hidden blocks or inserting ads. */
export function composePublicEditorialColumnRuns<Block, Zone extends ColumnZone>(
  blocks: readonly Block[],
  resolveZone: (block: Block) => Zone | undefined,
): (Block | PublicEditorialColumnRun<Zone>)[] {
  const result: (Block | PublicEditorialColumnRun<Zone>)[] = [];
  let pending: Zone[] = [];
  const flush = () => {
    if (pending.length) result.push({ kind: "column_run", key: `column-run:${pending[0].key}`, zones: pending });
    pending = [];
  };
  for (const block of blocks) {
    const zone = resolveZone(block);
    if (zone && editorialVisualFamilyDefinition(zone.visualFamily)?.columnRun) {
      if (zone.slots.some((slot) => slot.item)) pending.push(zone);
    } else {
      flush();
      result.push(block);
    }
  }
  flush();
  return result;
}
