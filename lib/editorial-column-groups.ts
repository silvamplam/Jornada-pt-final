/** A group owns presentation and order, never the stories or slots of its zones. */
export type EditorialColumnGroup = Readonly<{
  id: string;
  publicTitle: string;
  enabled: boolean;
  zoneIds: readonly string[];
}>;

export type EditorialColumnGroupMember = Readonly<{
  id: string;
  publicTitle: string;
  enabled: boolean;
  position: number;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(reason: string): never {
  throw new Error(`editorial-column-group-${reason}`);
}

export function parseEditorialColumnGroups(value: unknown): readonly EditorialColumnGroup[] {
  if (!Array.isArray(value)) return invalid("payload-invalid");
  const groups = value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).sort().join(",") !== "enabled,id,publicTitle,zoneIds"
      || typeof raw.id !== "string" || !uuid.test(raw.id)
      || typeof raw.publicTitle !== "string" || !raw.publicTitle.trim() || raw.publicTitle.trim().length > 120
      || typeof raw.enabled !== "boolean" || !Array.isArray(raw.zoneIds)
      || raw.zoneIds.length !== 5 || raw.zoneIds.some((id: unknown) => typeof id !== "string" || !uuid.test(id))) {
      return invalid("shape-invalid");
    }
    return { id: raw.id.toLowerCase(), publicTitle: raw.publicTitle.trim(), enabled: raw.enabled,
      zoneIds: raw.zoneIds.map((id: string) => id.toLowerCase()) } as EditorialColumnGroup;
  });
  if (new Set(groups.map((group) => group.id)).size !== groups.length) return invalid("duplicate");
  const members = groups.flatMap((group) => group.zoneIds);
  if (new Set(members).size !== members.length) return invalid("member-duplicate");
  return groups;
}

export function columnGroupForZone(groups: readonly EditorialColumnGroup[] | undefined, zoneId: string) {
  return groups?.find((group) => group.zoneIds.includes(zoneId));
}

export function columnGroupMember(groups: readonly EditorialColumnGroup[] | undefined, zoneId: string): EditorialColumnGroupMember | undefined {
  const group = columnGroupForZone(groups, zoneId);
  return group ? { id: group.id, publicTitle: group.publicTitle, enabled: group.enabled,
    position: group.zoneIds.indexOf(zoneId) + 1 } : undefined;
}

export function editorialColumnGroupsFromMembers(zones: readonly Readonly<{ id: string; columnGroup?: EditorialColumnGroupMember | null }>[]): readonly EditorialColumnGroup[] {
  const groups = new Map<string, EditorialColumnGroup>();
  for (const zone of zones) {
    const member = zone.columnGroup;
    if (!member) continue;
    if (!Number.isInteger(member.position) || member.position < 1 || member.position > 5
      || Object.keys(member).sort().join(",") !== "enabled,id,position,publicTitle") return invalid("member-invalid");
    const previous = groups.get(member.id);
    if (previous && (previous.publicTitle !== member.publicTitle || previous.enabled !== member.enabled)) return invalid("inconsistent");
    const ids = [...previous?.zoneIds ?? []];
    if (ids[member.position - 1]) return invalid("member-duplicate");
    ids[member.position - 1] = zone.id;
    groups.set(member.id, { id: member.id, publicTitle: member.publicTitle, enabled: member.enabled, zoneIds: ids });
  }
  return parseEditorialColumnGroups([...groups.values()].map((group) => ({ ...group, zoneIds: Array.from(group.zoneIds) })));
}

export function columnGroupEmptyMembers(group: EditorialColumnGroup, count: (zoneId: string) => number) {
  return group.zoneIds.flatMap((id, index) => count(id) > 0 ? [] : [index + 1]);
}

export function columnGroupDiagnostic(group: EditorialColumnGroup, count: (zoneId: string) => number) {
  const empty = columnGroupEmptyMembers(group, count);
  return empty.length ? `Colunas ${empty.join(", ")} sem histórias. É necessária pelo menos uma história em cada coluna para ligar o grupo.` : null;
}

export function assertEditorialColumnGroups(
  groups: readonly EditorialColumnGroup[],
  zones: readonly Readonly<{ id: string; visualFamily: string }>[],
  orderedZoneIds: readonly (string | null)[],
  count?: (zoneId: string) => number,
): void {
  parseEditorialColumnGroups(groups);
  for (const group of groups) {
    const first = orderedZoneIds.indexOf(group.zoneIds[0]);
    if (first < 0 || group.zoneIds.some((id, position) =>
      zones.find((zone) => zone.id === id)?.visualFamily !== "five_news_column"
      || orderedZoneIds[first + position] !== id)) return invalid("members-or-order-invalid");
    if (count && group.enabled && columnGroupEmptyMembers(group, count).length) return invalid("incomplete");
  }
}

/** The anchor is the first explicit member, not an inferred consecutive run. */
export function collapseColumnGroupUnits<T>(
  ordered: readonly T[], groups: readonly EditorialColumnGroup[], zoneId: (item: T) => string | null,
): T[][] {
  const units: T[][] = [];
  for (const item of ordered) {
    const id = zoneId(item);
    const group = id ? columnGroupForZone(groups, id) : undefined;
    if (!group) units.push([item]);
    else if (group.zoneIds[0] === id) units.push(group.zoneIds.map((member) => {
      const found = ordered.find((candidate) => zoneId(candidate) === member);
      if (!found) return invalid("member-missing");
      return found;
    }));
  }
  return units;
}
