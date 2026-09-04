import {
  EDITORIAL_PROFILES,
  type EditorialProfileZoneKey,
} from "@/lib/editorial-profiles";
import {
  parseLiveLayoutZoneId,
  type LiveLayoutZoneId,
  type MatchdayLiveLayoutZone,
} from "@/lib/editorial-matchday-live-layout-physical";

export type LiveLayoutLegacyProjectionRow = Readonly<{
  matchdayId: string;
  legacyZoneKey: EditorialProfileZoneKey;
  zoneId: LiveLayoutZoneId;
}>;

export type LiveLayoutLegacyCompatibility = Readonly<{
  compatibility: "representable" | "notLegacyRepresentable";
  projection: readonly LiveLayoutLegacyProjectionRow[];
  additionalPhysicalZoneIds: readonly LiveLayoutZoneId[];
}>;

const EXPECTED_LEGACY_ZONE_KEYS: readonly EditorialProfileZoneKey[] =
  EDITORIAL_PROFILES.liga_portugal_v1.zones.map((zone) => zone.key);
const EXPECTED_LEGACY_ZONE_KEY_SET = new Set<string>(EXPECTED_LEGACY_ZONE_KEYS);

function adapterError(code: string): never {
  throw new Error(`matchday-live-layout-compatibility-${code}`);
}

function recordValue(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return adapterError(code);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return adapterError(code);
  return value.trim();
}

function parseLegacyZoneKey(value: unknown): EditorialProfileZoneKey {
  const candidate = requiredText(value, "projection-key-invalid");
  const key = EXPECTED_LEGACY_ZONE_KEYS.find((current) => current === candidate);
  if (!key) return adapterError("projection-key-invalid");
  return key;
}

export function buildLiveLayoutLegacyCompatibility(
  matchdayId: string,
  zones: readonly MatchdayLiveLayoutZone[],
  rawProjection: unknown,
): LiveLayoutLegacyCompatibility {
  const cleanMatchdayId = requiredText(matchdayId, "matchday-invalid");
  if (!Array.isArray(rawProjection)) return adapterError("projection-invalid");
  const zoneIds = new Set<LiveLayoutZoneId>();
  for (const zone of zones) {
    if (zoneIds.has(zone.id)) return adapterError("physical-zone-duplicate");
    zoneIds.add(zone.id);
  }

  const projection: LiveLayoutLegacyProjectionRow[] = [];
  const projectedKeys = new Set<EditorialProfileZoneKey>();
  const projectedZoneIds = new Set<LiveLayoutZoneId>();

  for (const value of rawProjection) {
    const row = recordValue(value, "projection-row-invalid");
    if (requiredText(row.matchday_id, "projection-matchday-invalid") !== cleanMatchdayId) {
      return adapterError("projection-matchday-mismatch");
    }
    const legacyZoneKey = parseLegacyZoneKey(row.legacy_zone_key);
    const zoneId = parseLiveLayoutZoneId(row.zone_id);
    if (!zoneIds.has(zoneId)) return adapterError("projection-zone-unknown");
    if (projectedKeys.has(legacyZoneKey)) {
      return adapterError("projection-key-duplicate");
    }
    if (projectedZoneIds.has(zoneId)) {
      return adapterError("projection-zone-duplicate");
    }
    projectedKeys.add(legacyZoneKey);
    projectedZoneIds.add(zoneId);
    projection.push({ matchdayId: cleanMatchdayId, legacyZoneKey, zoneId });
  }

  for (const key of EXPECTED_LEGACY_ZONE_KEYS) {
    if (!projectedKeys.has(key)) return adapterError("projection-key-missing");
  }
  if (projection.length !== EXPECTED_LEGACY_ZONE_KEY_SET.size) {
    return adapterError("projection-cardinality-invalid");
  }

  projection.sort((left, right) => (
    EXPECTED_LEGACY_ZONE_KEYS.indexOf(left.legacyZoneKey)
    - EXPECTED_LEGACY_ZONE_KEYS.indexOf(right.legacyZoneKey)
  ));
  const additionalPhysicalZoneIds = zones
    .filter((zone) => !projectedZoneIds.has(zone.id))
    .map((zone) => zone.id);

  return {
    compatibility: additionalPhysicalZoneIds.length === 0
      ? "representable"
      : "notLegacyRepresentable",
    projection,
    additionalPhysicalZoneIds,
  };
}

export function liveLayoutZoneIdForLegacyZoneKey(
  state: LiveLayoutLegacyCompatibility,
  legacyZoneKey: EditorialProfileZoneKey,
): LiveLayoutZoneId {
  const row = state.projection.find((candidate) => (
    candidate.legacyZoneKey === legacyZoneKey
  ));
  if (!row) return adapterError("legacy-zone-not-mapped");
  return row.zoneId;
}

export function legacyZoneKeyForLiveLayoutZoneId(
  state: LiveLayoutLegacyCompatibility,
  zoneId: LiveLayoutZoneId,
): EditorialProfileZoneKey {
  const row = state.projection.find((candidate) => candidate.zoneId === zoneId);
  if (!row) return adapterError("physical-zone-not-legacy-representable");
  return row.legacyZoneKey;
}
