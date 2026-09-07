import {
  parseLiveLayoutZoneId,
  type LiveLayoutZoneId,
} from "@/lib/editorial-matchday-live-layout-physical";
import {
  buildLiveLayoutWorkspaceState,
  type LiveLayoutWorkspaceState,
  type MatchdayLiveLayoutWorkspaceReaderRow,
} from "@/lib/editorial-matchday-live-layout-workspace";

export type LiveLayoutLatestCompanion = Readonly<{
  matchdayId: string;
  zoneId: LiveLayoutZoneId;
  createdAt: string;
  updatedAt: string;
}>;

export type MatchdayLiveLayoutWorkspaceReaderRowV22 =
  MatchdayLiveLayoutWorkspaceReaderRow
  & Readonly<{
    latest_companion: unknown;
  }>;

export type LiveLayoutWorkspaceStateV22 =
  LiveLayoutWorkspaceState
  & Readonly<{
    latestCompanion: LiveLayoutLatestCompanion | null;
  }>;

function v22Error(code: string): never {
  throw new Error(
    `matchday-live-layout-workspace-v22-${code}`,
  );
}

function objectValue(
  value: unknown,
  code: string,
): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return v22Error(code);
  }

  return value as Record<string, unknown>;
}

function requiredText(
  value: unknown,
  code: string,
): string {
  if (
    typeof value !== "string"
    || !value.trim()
  ) {
    return v22Error(code);
  }

  return value.trim();
}

function timestampText(
  value: unknown,
  code: string,
): string {
  const text = requiredText(value, code);

  if (Number.isNaN(Date.parse(text))) {
    return v22Error(code);
  }

  return text;
}

function exactCompanionKeys(
  row: Record<string, unknown>,
): void {
  const actual = Object.keys(row).sort();
  const expected = [
    "created_at",
    "matchday_id",
    "updated_at",
    "zone_id",
  ];

  if (
    actual.length !== expected.length
    || actual.some(
      (key, index) => key !== expected[index],
    )
  ) {
    v22Error("latest-companion-shape-invalid");
  }
}

function parseLatestCompanion(
  value: unknown,
  matchdayId: string,
): LiveLayoutLatestCompanion | null {
  if (value === null) return null;

  const row = objectValue(
    value,
    "latest-companion-invalid",
  );

  exactCompanionKeys(row);

  const companionMatchdayId = requiredText(
    row.matchday_id,
    "latest-companion-matchday-invalid",
  ).toLowerCase();

  if (
    companionMatchdayId
    !== matchdayId.trim().toLowerCase()
  ) {
    return v22Error(
      "latest-companion-matchday-mismatch",
    );
  }

  return {
    matchdayId: companionMatchdayId,
    zoneId: parseLiveLayoutZoneId(row.zone_id),
    createdAt: timestampText(
      row.created_at,
      "latest-companion-created-at-invalid",
    ),
    updatedAt: timestampText(
      row.updated_at,
      "latest-companion-updated-at-invalid",
    ),
  };
}

export function buildLiveLayoutWorkspaceStateV22(
  matchdayId: string,
  raw: MatchdayLiveLayoutWorkspaceReaderRowV22,
): LiveLayoutWorkspaceStateV22 {
  const workspace = buildLiveLayoutWorkspaceState(
    matchdayId,
    raw,
  );

  const latestCompanion = parseLatestCompanion(
    raw.latest_companion,
    workspace.matchdayId,
  );

  if (latestCompanion !== null) {
    const hostZone = workspace.zones.find(
      (zone) => zone.id === latestCompanion.zoneId,
    );

    if (
      !hostZone
      || hostZone.visualFamily !== "four_news"
    ) {
      return v22Error(
        "latest-companion-host-invalid",
      );
    }
  }

  return {
    ...workspace,
    latestCompanion,
  };
}