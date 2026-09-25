import { unstable_cache } from "next/cache";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  type SupabaseBroadcastChannel,
  type SupabaseCompetition,
  type SupabaseSeason,
  type SupabaseTeam,
} from "@/lib/supabase";

// Opt-in for the public Jornada page only. Matches, participants, matchdays and
// editorial authority deliberately remain on the existing fresh readers.
export type PublicMatchdayStructuralReaders = {
  competitions(slug: string): Promise<SupabaseCompetition[]>;
  seasons(competitionId: string, requestedLabel: string): Promise<SupabaseSeason[]>;
  teams(ids: string[]): Promise<SupabaseTeam[]>;
  channels(ids: string[]): Promise<SupabaseBroadcastChannel[]>;
};

export const PUBLIC_STRUCTURE_TTL = { seasons: 300, teams: 600, channels: 600 } as const;
const SEASON_FIELDS = "id,competition_id,label,starts_on,ends_on,is_current";
const COMPETITION_FIELDS = "id,name,slug,country_id,country,logo_url,accent_color,is_active";

// A missing row is a usable fresh response, but not a negative cache entry.
class IncompleteStructure extends Error {
  constructor(readonly rows: unknown[]) { super("Incomplete public structure; not cached"); }
}

type Row = Record<string, unknown>;
function validateRows<T>(value: T[], required: string[], nullable: string[], booleans: string[] = []): T[] {
  if (!Array.isArray(value) || value.some((item) => {
    if (!item || typeof item !== "object") return true;
    const row = item as Row;
    return required.some((key) => typeof row[key] !== "string" || !row[key]) ||
      nullable.some((key) => row[key] !== null && typeof row[key] !== "string") ||
      booleans.some((key) => typeof row[key] !== "boolean");
  })) throw new Error("Malformed public structural response");
  return value;
}

function complete<T extends { id: string }>(rows: T[], ids?: string[]): T[] {
  if (!rows.length || (ids && ids.some((id) => !rows.some((row) => row.id === id)))) {
    throw new IncompleteStructure(rows);
  }
  return rows;
}

async function allowMissing<T>(read: () => Promise<T[]>): Promise<T[]> {
  try { return await read(); }
  catch (error) {
    if (error instanceof IncompleteStructure) return error.rows as T[];
    throw error;
  }
}

function projectScope() {
  const config = getSupabaseServiceConfig();
  if (!config) throw new Error("Supabase public structure is not configured");
  return config.url; // Separate projects in the Data Cache; never include credentials.
}

async function freshSeasons(competitionId?: string) {
  return validateRows(await fetchSupabaseAdminTable<SupabaseSeason>(
    `seasons?select=${SEASON_FIELDS}${competitionId ? `&competition_id=eq.${encodeURIComponent(competitionId)}` : ""}&order=label.desc&limit=${competitionId ? 100 : 500}`
  ), ["id", "competition_id", "label"], ["starts_on", "ends_on"], ["is_current"]);
}

const cachedSeasons = unstable_cache(
  async (_project: string, competitionId: string) => complete(await freshSeasons(competitionId)),
  ["public-jornada-structure-v1", "competition-seasons"], { revalidate: PUBLIC_STRUCTURE_TTL.seasons },
);
const cachedMenuSeasons = unstable_cache(
  async (_project: string) => complete(await freshSeasons()),
  ["public-jornada-structure-v1", "menu-seasons"], { revalidate: PUBLIC_STRUCTURE_TTL.seasons },
);
const cachedTeams = unstable_cache(
  async (_project: string, ids: string[]) => complete(validateRows(
    await fetchSupabaseAdminTable<SupabaseTeam>(
      `teams?select=id,name,public_name,short_name,code,slug,country,logo_url,primary_color&id=in.(${ids.map(encodeURIComponent).join(",")})&limit=1000`
    ), ["id", "name", "slug"], ["public_name", "short_name", "code", "country", "logo_url", "primary_color"]
  ), ids),
  ["public-jornada-structure-v1", "teams"], { revalidate: PUBLIC_STRUCTURE_TTL.teams },
);
const cachedChannels = unstable_cache(
  async (_project: string, ids: string[]) => complete(validateRows(
    await fetchSupabaseAdminTable<SupabaseBroadcastChannel>(
      `broadcast_channels?select=id,name,platform,country,logo_url&id=in.(${ids.map(encodeURIComponent).join(",")})&limit=500`
    ), ["id", "name"], ["platform", "country", "logo_url"]
  ), ids),
  ["public-jornada-structure-v1", "channels"], { revalidate: PUBLIC_STRUCTURE_TTL.channels },
);

function sortedIds(ids: string[]) { return [...new Set(ids.filter(Boolean))].sort(); }
const seasonSegment = (label: string) => label.trim().toLowerCase().replace(/\//g, "-");

export async function readPublicTeamMetadata(ids: string[]) {
  const unique = sortedIds(ids);
  return unique.length ? allowMissing(() => cachedTeams(projectScope(), unique)) : [];
}

export async function readPublicBroadcastChannelMetadata(ids: string[]) {
  const unique = sortedIds(ids);
  return unique.length ? allowMissing(() => cachedChannels(projectScope(), unique)) : [];
}

export async function readPublicCompetitionSeasons(competitionId: string, requestedLabel: string) {
  const rows = await allowMissing(() => cachedSeasons(projectScope(), competitionId));
  // A newly created season must not become a cached "not found" page.
  if (rows.length && !rows.some((row) => seasonSegment(row.label) === seasonSegment(requestedLabel))) {
    return freshSeasons(competitionId);
  }
  return rows;
}

// One instance per page render. The active competition catalogue is FRESH and
// shared with the menu, so deactivation never waits for a metadata TTL.
export function createPublicMatchdayStructuralReaders() {
  let catalogue: Promise<SupabaseCompetition[]> | undefined;
  const menuCompetitions = () => catalogue ??= fetchSupabaseAdminTable<SupabaseCompetition>(
    `competitions?select=${COMPETITION_FIELDS}&is_active=eq.true&order=name.asc&limit=100`
  );
  const diagnostic: PublicMatchdayStructuralReaders = {
    async competitions(slug) {
      const rows = await menuCompetitions().catch(() => []);
      const competition = rows.find((row) => row.slug === slug);
      if (competition) return [competition];
      // Inactive, missing or outside the menu's 100-row window: keep the old lookup.
      return fetchSupabaseAdminTable<SupabaseCompetition>(
        `competitions?select=${COMPETITION_FIELDS}&slug=eq.${encodeURIComponent(slug)}&limit=1`
      );
    },
    seasons: readPublicCompetitionSeasons,
    teams: readPublicTeamMetadata,
    channels: readPublicBroadcastChannelMetadata,
  };
  return {
    diagnostic,
    menu: {
      competitions: menuCompetitions,
      seasons: () => allowMissing(() => cachedMenuSeasons(projectScope())),
    },
  };
}
