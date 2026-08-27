export type ManagedMatchdayEditorialDeskRow = Readonly<{
  matchday_id: string;
}>;

export type ManagedMatchdayEditorialDeskResolution =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "single"; matchdayId: string }>
  | Readonly<{ kind: "multiple"; count: number }>;

export function resolveManagedMatchdayEditorialDesk(
  rows: readonly ManagedMatchdayEditorialDeskRow[],
): ManagedMatchdayEditorialDeskResolution {
  if (rows.length === 0) return { kind: "none" };
  if (rows.length > 1) return { kind: "multiple", count: rows.length };

  const matchdayId = rows[0]?.matchday_id.trim();

  if (!matchdayId) return { kind: "none" };

  return { kind: "single", matchdayId };
}
