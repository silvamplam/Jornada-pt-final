import { editorialVisualFamilyDefinition } from "./editorial-visual-families";
import type { EditorialColumnGroupMember } from "./editorial-column-groups";

type ColumnZone = Readonly<{
  key: string;
  visualFamily: string;
  slots: readonly Readonly<{ item: unknown | null }>[];
  columnGroup?: EditorialColumnGroupMember;
}>;
export type PublicEditorialColumnRun<Zone> = Readonly<{
  kind: "column_run";
  key: string;
  zones: readonly Zone[];
  publicTitle?: string;
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
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const zone = resolveZone(block);
    if (zone?.columnGroup) {
      flush();
      const group = zone.columnGroup;
      const members: Zone[] = [zone];
      while (index + 1 < blocks.length) {
        const next = resolveZone(blocks[index + 1]);
        if (next?.columnGroup?.id !== group.id) break;
        members.push(next); index += 1;
      }
      // Disabled work remains stored. An invalid group cannot leak a partial run.
      if (group.enabled && members.length === 5 && members.every((member, position) =>
        member.visualFamily === "five_news_column" && member.columnGroup?.position === position + 1
        && member.columnGroup.enabled && member.columnGroup.publicTitle === group.publicTitle
        && member.slots.some((slot) => slot.item))) {
        result.push({ kind: "column_run", key: `column-group:${group.id}`, zones: members, publicTitle: group.publicTitle });
      }
    } else if (zone && editorialVisualFamilyDefinition(zone.visualFamily)?.columnRun) {
      if (zone.slots.some((slot) => slot.item)) pending.push(zone);
    } else {
      flush();
      result.push(block);
    }
  }
  flush();
  return result;
}
