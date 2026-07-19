import type { BroadcastOverride } from "@/lib/jornada";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export type SupabaseServiceConfig = {
  url: string;
  serviceRoleKey: string;
};

export type SupabaseCountry = {
  id: string;
  name: string;
  slug: string;
  iso2: string | null;
  flag_emoji: string | null;
  is_active: boolean;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseCompetition = {
  id: string;
  name: string;
  slug: string;
  country_id?: string | null;
  country: string | null;
  logo_url: string | null;
  accent_color?: string | null;
  is_active: boolean;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseSeason = {
  id: string;
  competition_id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseSeasonTeam = {
  id: string;
  season_id: string;
  team_id: string;
  display_order: number;
  status: string;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseMatchday = {
  id: string;
  season_id: string;
  number: number;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  context_summary: string | null;
  editorial_title?: string | null;
  editorial_summary?: string | null;
  hero_image_url?: string | null;
  video_url?: string | null;
  display_order?: number | null;
  is_featured?: boolean | null;
  memory_note?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseMatchdayEditorial = {
  id: string;
  matchday_id: string;
  title: string | null;
  summary: string | null;
  title_color: string | null;
  image_url: string | null;
  headline_link_url?: string | null;
  below_headline_mode?: "highlights" | "roundup";
  below_headline_heading?: string | null;
  below_headline_heading_color?: string | null;
  complementary_mode?: "none" | "roundup_video" | "complementary_story";
  complementary_roundup_item_id?: string | null;
  complementary_label?: string | null;
  complementary_title?: string | null;
  complementary_text?: string | null;
  complementary_image_url?: string | null;
  complementary_link_url?: string | null;
  complementary_status?: "draft" | "published";
  roundup_video_heading?: string | null;
  roundup_video_heading_color?: string | null;
  side_block_status?: "draft" | "published";
  side_block_type?: string | null;
  side_block_label?: string | null;
  side_block_title?: string | null;
  side_block_title_color?: string | null;
  side_block_author?: string | null;
  side_block_text?: string | null;
  side_block_image_url?: string | null;
  side_block_link_url?: string | null;
  latest_zone_mode?: "latest_news" | "editorial_line";
  latest_zone_title?: string | null;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

export type SupabaseMatchdayHighlight = {
  id: string;
  matchday_id: string;
  label: string | null;
  title: string | null;
  image_url: string | null;
  sort_order: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

export type SupabaseMatchdayRoundupItem = {
  id: string;
  matchday_id: string;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  video_url: string | null;
  duration: string | null;
  type: "video" | "golos" | "resumo" | "noticia";
  sort_order: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

export type SupabaseMatchdayLatestNews = {
  id: string;
  matchday_id: string;
  time_label: string | null;
  title: string | null;
  subtitle?: string | null;
  image_url: string | null;
  link_url?: string | null;
  article_id?: string | null;
  sort_order: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

export type SupabaseTeam = {
  id: string;
  name: string;
  short_name: string;
  public_name?: string | null;
  slug: string;
  code?: string | null;
  country: string | null;
  logo_url: string | null;
  primary_color: string | null;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type AdminTeamPublicNameCompetition = {
  id: string;
  name: string;
  slug: string;
  isCurrent: boolean;
};

export type AdminTeamPublicNameCountry = {
  key: string;
  id: string | null;
  name: string;
  source: "normalized" | "legacy" | "missing";
};

export type AdminTeamPublicNameTeam = {
  id: string;
  name: string;
  publicName: string | null;
  shortName: string;
  slug: string;
  code: string | null;
  country: string | null;
  countryId: string | null;
  resolvedCountry: AdminTeamPublicNameCountry;
  logoUrl: string | null;
  primaryColor: string | null;
  competitions: AdminTeamPublicNameCompetition[];
};

export type SupabaseBroadcastChannel = {
  id: string;
  name: string;
  platform: string | null;
  country: string | null;
  logo_url: string | null;
};

export type SupabaseMatch = {
  id: string;
  source_key?: string | null;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: string;
  minute: number | null;
  scheduled_date: string | null;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  broadcast_channel_id: string | null;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  external_match_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseAdminMatch = SupabaseMatch & {
  competition: SupabaseCompetition | null;
  season: SupabaseSeason | null;
  matchday: SupabaseMatchday | null;
  homeTeam: SupabaseTeam | null;
  awayTeam: SupabaseTeam | null;
  broadcastChannel: SupabaseBroadcastChannel | null;
};

export type SupabaseAdminMatchday = SupabaseMatchday & {
  season: SupabaseSeason | null;
  competition: SupabaseCompetition | null;
  matchCount: number;
  articleCount: number;
  headlineCount: number;
};

export type SupabaseStanding = {
  id: string;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  moment_label: string | null;
  generated_at: string;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseStandingRow = {
  id: string;
  standing_id: string;
  team_id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  home_played: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  away_played: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
  data_source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  manual_override?: boolean | null;
};

export type SupabaseAdminStandingRow = SupabaseStandingRow & {
  team: SupabaseTeam | null;
};

export type SupabaseAdminStanding = SupabaseStanding & {
  competition: SupabaseCompetition | null;
  season: SupabaseSeason | null;
  matchday: SupabaseMatchday | null;
  rows: SupabaseAdminStandingRow[];
};

export type SupabaseAdminSeasonTeam = SupabaseSeasonTeam & {
  competition: SupabaseCompetition | null;
  season: SupabaseSeason | null;
  team: SupabaseTeam | null;
  sourceMatches: SupabaseParticipantSourceMatch[];
};

export type SupabaseParticipantSourceMatch = {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_date: string | null;
  kickoff_at: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  homeTeam: SupabaseTeam | null;
  awayTeam: SupabaseTeam | null;
};

export type AdminOverview = {
  configured: boolean;
  error?: string;
  countries: SupabaseCountry[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  matchdays: SupabaseAdminMatchday[];
  teams: SupabaseTeam[];
  broadcastChannels: SupabaseBroadcastChannel[];
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function getSupabaseServiceConfig(): SupabaseServiceConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey };
}

async function fetchSupabaseTable<T>(path: string): Promise<T[]> {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("Supabase environment variables are missing.");
  }

  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${path}`;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  return response.json() as Promise<T[]>;
}

export async function fetchSupabaseAdminTable<T>(path: string): Promise<T[]> {
  const config = getSupabaseServiceConfig();

  if (!config) {
    throw new Error("Supabase service role key is missing.");
  }

  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${path}`;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  return response.json() as Promise<T[]>;
}

export async function writeSupabaseAdmin(path: string, init: RequestInit): Promise<void> {
  const config = getSupabaseServiceConfig();

  if (!config) {
    throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel.");
  }

  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${path}`;
  const response = await fetch(endpoint, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }
}

export async function writeSupabaseAdminReturning<T>(path: string, init: RequestInit): Promise<T[]> {
  const config = getSupabaseServiceConfig();

  if (!config) {
    throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel.");
  }

  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${path}`;
  const response = await fetch(endpoint, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return [];
  }

  return response.json() as Promise<T[]>;
}

type SupabaseReadTable = <T>(path: string) => Promise<T[]>;

const ADMIN_READ_PAGE_SIZE = 1000;

async function readAllAdminRows<T>(path: string): Promise<T[]> {
  const serviceConfig = getSupabaseServiceConfig();
  const publicConfig = getSupabaseConfig();
  const config = serviceConfig
    ? { url: serviceConfig.url, key: serviceConfig.serviceRoleKey }
    : publicConfig
      ? { url: publicConfig.url, key: publicConfig.anonKey }
      : null;
  if (!config) {
    throw new Error("Supabase environment variables are missing.");
  }

  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  let total: number | null = null;

  for (let offset = 0; total === null || offset < total; ) {
    const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${path}${separator}limit=${ADMIN_READ_PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Prefer: "count=exact"
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Supabase request failed with status ${response.status}`);
    }

    const contentRange = response.headers.get("content-range");
    const totalValue = contentRange?.match(/\/(\d+)$/u)?.[1];
    if (!totalValue) {
      throw new Error("Supabase did not return an exact row count for the administrative list.");
    }
    total = Number(totalValue);

    const page = (await response.json()) as T[];
    rows.push(...page);

    if (rows.length >= total) {
      return rows.slice(0, total);
    }
    if (page.length === 0) {
      throw new Error("Supabase administrative pagination ended before the declared row count.");
    }
    offset += page.length;
  }

  return rows;
}

async function readCountriesWithFallback(readTable: SupabaseReadTable): Promise<SupabaseCountry[]> {
  try {
    return await readTable<SupabaseCountry>(
      "countries?select=id,name,slug,iso2,flag_emoji,is_active,data_source,external_provider,external_id,last_synced_at,sync_status,manual_override&order=name.asc"
    );
  } catch {
    return [];
  }
}

async function readCompetitionsWithFallback(readTable: SupabaseReadTable, includeSync = false): Promise<SupabaseCompetition[]> {
  const syncFields = includeSync
    ? ",data_source,external_provider,external_id,last_synced_at,sync_status,manual_override"
    : "";

  try {
    return await readTable<SupabaseCompetition>(
      `competitions?select=id,name,slug,country_id,country,logo_url,accent_color,is_active${syncFields}&order=name.asc`
    );
  } catch {
    return readTable<SupabaseCompetition>(
      `competitions?select=id,name,slug,country,logo_url,accent_color,is_active${syncFields}&order=name.asc`
    );
  }
}

export async function getAdminCountries(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  countries: SupabaseCountry[];
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      countries: []
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const countries = await readCountriesWithFallback(readTable);

    return {
      configured: true,
      writeConfigured,
      countries
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler paises.",
      countries: []
    };
  }
}

export async function getAdminTeams(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  teams: SupabaseTeam[];
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      teams: []
    };
  }

  try {
    const teams = writeConfigured
      ? await fetchSupabaseAdminTable<SupabaseTeam>(
          "teams?select=id,name,short_name,public_name,slug,country,logo_url,primary_color&order=name.asc"
        )
      : await fetchSupabaseTable<SupabaseTeam>(
          "teams?select=id,name,short_name,public_name,slug,country,logo_url,primary_color&order=name.asc"
        );

    return {
      configured: true,
      writeConfigured,
      teams
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler clubes.",
      teams: []
    };
  }
}

type AdminTeamPublicNameRow = {
  id: string;
  name: string;
  public_name: string | null;
  short_name: string;
  slug: string;
  code: string | null;
  country: string | null;
  country_id: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type AdminTeamPublicNameCountryRow = {
  id: string;
  name: string;
};

type AdminTeamPublicNameCompetitionRow = {
  id: string;
  name: string;
  slug: string;
};

type AdminTeamPublicNameSeasonRow = {
  id: string;
  competition_id: string;
  is_current: boolean;
};

type AdminTeamPublicNameSeasonTeamRow = {
  season_id: string;
  team_id: string;
};

function adminDisplayText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compareAdminLabels(left: string, right: string): number {
  return left.localeCompare(right, "pt-PT", { sensitivity: "base" });
}

export async function getAdminTeamPublicNameManagement(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  teams: AdminTeamPublicNameTeam[];
  competitions: AdminTeamPublicNameCompetition[];
  countries: AdminTeamPublicNameCountry[];
}> {
  const readConfigured = Boolean(getSupabaseConfig() || getSupabaseServiceConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      teams: [],
      competitions: [],
      countries: []
    };
  }

  try {
    const [teamRows, countryRows, competitionRows, seasonRows, seasonTeamRows] = await Promise.all([
      readAllAdminRows<AdminTeamPublicNameRow>(
        "teams?select=id,name,public_name,short_name,slug,code,country,country_id,logo_url,primary_color&order=name.asc,id.asc"
      ),
      readAllAdminRows<AdminTeamPublicNameCountryRow>(
        "countries?select=id,name&order=name.asc,id.asc"
      ),
      readAllAdminRows<AdminTeamPublicNameCompetitionRow>(
        "competitions?select=id,name,slug&order=name.asc,id.asc"
      ),
      readAllAdminRows<AdminTeamPublicNameSeasonRow>(
        "seasons?select=id,competition_id,is_current&order=is_current.desc,id.asc"
      ),
      readAllAdminRows<AdminTeamPublicNameSeasonTeamRow>(
        "season_teams?select=season_id,team_id&order=team_id.asc,season_id.asc"
      )
    ]);

    const countriesById = new Map(countryRows.map((country) => [country.id, country]));
    const competitionsById = new Map(competitionRows.map((competition) => [competition.id, competition]));
    const seasonsById = new Map(seasonRows.map((season) => [season.id, season]));
    const currentCompetitionIds = new Set(
      seasonRows.filter((season) => season.is_current).map((season) => season.competition_id)
    );
    const teamCompetitions = new Map<string, Map<string, AdminTeamPublicNameCompetition>>();

    for (const seasonTeam of seasonTeamRows) {
      const season = seasonsById.get(seasonTeam.season_id);
      const competition = season ? competitionsById.get(season.competition_id) : undefined;
      if (!season || !competition) {
        continue;
      }

      const competitionsForTeam = teamCompetitions.get(seasonTeam.team_id) ?? new Map();
      const existing = competitionsForTeam.get(competition.id);
      competitionsForTeam.set(competition.id, {
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
        isCurrent: Boolean(existing?.isCurrent || season.is_current)
      });
      teamCompetitions.set(seasonTeam.team_id, competitionsForTeam);
    }

    const countryOptions = new Map<string, AdminTeamPublicNameCountry>();
    const teams = teamRows.map<AdminTeamPublicNameTeam>((team) => {
      const normalizedCountry = team.country_id ? countriesById.get(team.country_id) : undefined;
      const legacyCountry = adminDisplayText(team.country);
      const resolvedCountry: AdminTeamPublicNameCountry = normalizedCountry
        ? {
            key: `country:${normalizedCountry.id}`,
            id: normalizedCountry.id,
            name: normalizedCountry.name,
            source: "normalized"
          }
        : legacyCountry
          ? {
              key: `legacy:${legacyCountry}`,
              id: null,
              name: legacyCountry,
              source: "legacy"
            }
          : {
              key: "missing",
              id: null,
              name: "Sem país",
              source: "missing"
            };
      countryOptions.set(resolvedCountry.key, resolvedCountry);

      const competitions = Array.from(teamCompetitions.get(team.id)?.values() ?? []).sort(
        (left, right) => Number(right.isCurrent) - Number(left.isCurrent) || compareAdminLabels(left.name, right.name)
      );

      return {
        id: team.id,
        name: team.name,
        publicName: team.public_name,
        shortName: team.short_name,
        slug: team.slug,
        code: team.code,
        country: team.country,
        countryId: team.country_id,
        resolvedCountry,
        logoUrl: team.logo_url,
        primaryColor: team.primary_color,
        competitions
      };
    });

    const competitions = competitionRows
      .map<AdminTeamPublicNameCompetition>((competition) => ({
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
        isCurrent: currentCompetitionIds.has(competition.id)
      }))
      .sort(
        (left, right) => Number(right.isCurrent) - Number(left.isCurrent) || compareAdminLabels(left.name, right.name)
      );
    const countries = Array.from(countryOptions.values()).sort(
      (left, right) =>
        Number(left.source === "missing") - Number(right.source === "missing") ||
        Number(left.source === "legacy") - Number(right.source === "legacy") ||
        compareAdminLabels(left.name, right.name)
    );

    return {
      configured: true,
      writeConfigured,
      teams,
      competitions,
      countries
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler clubes.",
      teams: [],
      competitions: [],
      countries: []
    };
  }
}

export async function getAdminBroadcastChannels(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  broadcastChannels: SupabaseBroadcastChannel[];
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      broadcastChannels: []
    };
  }

  try {
    const broadcastChannels = writeConfigured
      ? await fetchSupabaseAdminTable<SupabaseBroadcastChannel>(
          "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc"
        )
      : await fetchSupabaseTable<SupabaseBroadcastChannel>(
          "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc"
        );

    return {
      configured: true,
      writeConfigured,
      broadcastChannels
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler canais TV.",
      broadcastChannels: []
    };
  }
}

export async function getAdminCompetitions(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  countries: SupabaseCountry[];
  competitions: SupabaseCompetition[];
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      countries: [],
      competitions: []
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const [countries, competitions] = await Promise.all([
      readCountriesWithFallback(readTable),
      readCompetitionsWithFallback(readTable, true)
    ]);

    return {
      configured: true,
      writeConfigured,
      countries,
      competitions
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler competicoes.",
      countries: [],
      competitions: []
    };
  }
}

export async function getAdminSeasons(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  countries: SupabaseCountry[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      countries: [],
      competitions: [],
      seasons: []
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const [countries, competitions, seasons] = await Promise.all([
      readCountriesWithFallback(readTable),
      readCompetitionsWithFallback(readTable),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current,data_source,external_provider,external_id,last_synced_at,sync_status,manual_override&order=label.desc"
      )
    ]);

    return {
      configured: true,
      writeConfigured,
      countries,
      competitions,
      seasons
    };
  } catch (error) {
    try {
      const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
      const [countries, competitions, seasons] = await Promise.all([
        readCountriesWithFallback(readTable),
        readCompetitionsWithFallback(readTable),
        readTable<SupabaseSeason>(
          "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
        )
      ]);

      return {
        configured: true,
        writeConfigured,
        countries,
        competitions,
        seasons
      };
    } catch (fallbackError) {
      return {
        configured: true,
        writeConfigured,
        error: fallbackError instanceof Error ? fallbackError.message : "Erro desconhecido ao ler epocas.",
        countries: [],
        competitions: [],
        seasons: []
      };
    }
  }
}

function mapById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function participantMatchKey(seasonId: string, teamId: string) {
  return `${seasonId}:${teamId}`;
}

export async function getAdminSeasonParticipants(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  participants: SupabaseAdminSeasonTeam[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  teams: SupabaseTeam[];
  syncMetadataAvailable: boolean;
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      participants: [],
      competitions: [],
      seasons: [],
      teams: [],
      syncMetadataAvailable: false
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const participantSelectBase = "id,season_id,team_id,display_order,status";
    const syncSelect = "data_source,external_provider,external_id,last_synced_at,sync_status,manual_override";
    let syncMetadataAvailable = true;
    let participants: SupabaseSeasonTeam[] = [];

    try {
      participants = await readTable<SupabaseSeasonTeam>(
        `season_teams?select=${participantSelectBase},${syncSelect}&order=display_order.asc&limit=1000`
      );
    } catch {
      syncMetadataAvailable = false;
      participants = await readTable<SupabaseSeasonTeam>(
        `season_teams?select=${participantSelectBase}&order=display_order.asc&limit=1000`
      );
    }

    const [competitions, seasons, teams, matches] = await Promise.all([
      readTable<SupabaseCompetition>(
        "competitions?select=id,name,slug,country,logo_url,is_active&order=name.asc"
      ),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      readTable<SupabaseTeam>(
        "teams?select=id,name,short_name,slug,code,country,logo_url,primary_color&order=name.asc"
      ),
      readTable<SupabaseMatch>(
        "matches?select=id,season_id,home_team_id,away_team_id,scheduled_date,kickoff_at,status,home_score,away_score&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=1000"
      ).catch(() => [])
    ]);

    const competitionsById = mapById(competitions);
    const seasonsById = mapById(seasons);
    const teamsById = mapById(teams);
    const matchesByParticipant = matches.reduce<Map<string, SupabaseParticipantSourceMatch[]>>((map, match) => {
      const sourceMatch: SupabaseParticipantSourceMatch = {
        id: match.id,
        season_id: match.season_id,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        scheduled_date: match.scheduled_date,
        kickoff_at: match.kickoff_at,
        status: match.status,
        home_score: match.home_score,
        away_score: match.away_score,
        homeTeam: teamsById.get(match.home_team_id) ?? null,
        awayTeam: teamsById.get(match.away_team_id) ?? null
      };

      for (const teamId of [match.home_team_id, match.away_team_id]) {
        const key = participantMatchKey(match.season_id, teamId);
        const list = map.get(key) ?? [];
        list.push(sourceMatch);
        map.set(key, list);
      }

      return map;
    }, new Map());

    return {
      configured: true,
      writeConfigured,
      participants: participants.map((participant) => {
        const season = seasonsById.get(participant.season_id) ?? null;
        const competition = season ? competitionsById.get(season.competition_id) ?? null : null;

        return {
          ...participant,
          competition,
          season,
          team: teamsById.get(participant.team_id) ?? null,
          sourceMatches: matchesByParticipant.get(participantMatchKey(participant.season_id, participant.team_id)) ?? []
        };
      }),
      competitions,
      seasons,
      teams,
      syncMetadataAvailable
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler participantes.",
      participants: [],
      competitions: [],
      seasons: [],
      teams: [],
      syncMetadataAvailable: false
    };
  }
}

export async function getAdminMatchesTv(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  matches: SupabaseAdminMatch[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  matchdays: SupabaseMatchday[];
  broadcastChannels: SupabaseBroadcastChannel[];
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      matches: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      broadcastChannels: []
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const [matches, competitions, seasons, matchdays, teams, broadcastChannels] = await Promise.all([
      readTable<SupabaseMatch>(
        "matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,status,minute,scheduled_date,kickoff_at,home_score,away_score,venue,broadcast_channel_id&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=1000"
      ),
      readTable<SupabaseCompetition>(
        "competitions?select=id,name,slug,country,logo_url,is_active&order=name.asc"
      ),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      readTable<SupabaseMatchday>(
        "matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&order=number.asc"
      ),
      readTable<SupabaseTeam>(
        "teams?select=id,name,short_name,slug,country,logo_url,primary_color&order=name.asc"
      ),
      readTable<SupabaseBroadcastChannel>(
        "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc"
      )
    ]);

    const competitionsById = mapById(competitions);
    const seasonsById = mapById(seasons);
    const matchdaysById = mapById(matchdays);
    const teamsById = mapById(teams);
    const channelsById = mapById(broadcastChannels);

    return {
      configured: true,
      writeConfigured,
      matches: matches.map((match) => ({
        ...match,
        competition: competitionsById.get(match.competition_id) ?? null,
        season: seasonsById.get(match.season_id) ?? null,
        matchday: match.matchday_id ? matchdaysById.get(match.matchday_id) ?? null : null,
        homeTeam: teamsById.get(match.home_team_id) ?? null,
        awayTeam: teamsById.get(match.away_team_id) ?? null,
        broadcastChannel: match.broadcast_channel_id ? channelsById.get(match.broadcast_channel_id) ?? null : null
      })),
      competitions,
      seasons,
      matchdays,
      broadcastChannels
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler jogos.",
      matches: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      broadcastChannels: []
    };
  }
}

export async function getAdminMatchesEditor(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  matches: SupabaseAdminMatch[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  matchdays: SupabaseMatchday[];
  seasonTeams: SupabaseSeasonTeam[];
  teams: SupabaseTeam[];
  broadcastChannels: SupabaseBroadcastChannel[];
  syncMetadataAvailable: boolean;
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      matches: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      seasonTeams: [],
      teams: [],
      broadcastChannels: [],
      syncMetadataAvailable: false
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    let syncMetadataAvailable = true;
    let matches: SupabaseMatch[] = [];
    const matchSelectBase =
      "id,source_key,competition_id,season_id,matchday_id,home_team_id,away_team_id,status,minute,scheduled_date,kickoff_at,home_score,away_score,venue,broadcast_channel_id";
    const matchSelectWithSync =
      `${matchSelectBase},data_source,external_provider,external_id,external_match_id,last_synced_at,sync_status,manual_override`;

    try {
      matches = await readTable<SupabaseMatch>(
        `matches?select=${matchSelectWithSync}&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=160`
      );
    } catch {
      syncMetadataAvailable = false;
      matches = await readTable<SupabaseMatch>(
        `matches?select=${matchSelectBase}&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=160`
      );
    }

    const [competitions, seasons, matchdays, seasonTeams, teams, broadcastChannels] = await Promise.all([
      readTable<SupabaseCompetition>(
        "competitions?select=id,name,slug,country,logo_url,is_active&order=name.asc"
      ),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      readTable<SupabaseMatchday>(
        "matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&order=number.asc"
      ),
      readTable<SupabaseSeasonTeam>(
        "season_teams?select=id,season_id,team_id,display_order,status&order=display_order.asc&limit=1000"
      ).catch(() => []),
      readTable<SupabaseTeam>(
        "teams?select=id,name,short_name,slug,country,logo_url,primary_color&order=name.asc"
      ),
      readTable<SupabaseBroadcastChannel>(
        "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc"
      )
    ]);

    const competitionsById = mapById(competitions);
    const seasonsById = mapById(seasons);
    const matchdaysById = mapById(matchdays);
    const teamsById = mapById(teams);
    const channelsById = mapById(broadcastChannels);

    return {
      configured: true,
      writeConfigured,
      matches: matches.map((match) => ({
        ...match,
        competition: competitionsById.get(match.competition_id) ?? null,
        season: seasonsById.get(match.season_id) ?? null,
        matchday: match.matchday_id ? matchdaysById.get(match.matchday_id) ?? null : null,
        homeTeam: teamsById.get(match.home_team_id) ?? null,
        awayTeam: teamsById.get(match.away_team_id) ?? null,
        broadcastChannel: match.broadcast_channel_id ? channelsById.get(match.broadcast_channel_id) ?? null : null
      })),
      competitions,
      seasons,
      matchdays,
      seasonTeams,
      teams,
      broadcastChannels,
      syncMetadataAvailable
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler jogos.",
      matches: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      seasonTeams: [],
      teams: [],
      broadcastChannels: [],
      syncMetadataAvailable: false
    };
  }
}

type MatchdayLinkedRecord = {
  id: string;
  matchday_id: string | null;
};

function countByMatchday(items: MatchdayLinkedRecord[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (!item.matchday_id) {
      continue;
    }

    counts.set(item.matchday_id, (counts.get(item.matchday_id) ?? 0) + 1);
  }

  return counts;
}

export async function getAdminMatchdaysEditor(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  matchdays: SupabaseAdminMatchday[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  editorialFieldsAvailable: boolean;
  syncMetadataAvailable: boolean;
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      matchdays: [],
      competitions: [],
      seasons: [],
      editorialFieldsAvailable: false,
      syncMetadataAvailable: false
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const matchdaySelectBase = "id,season_id,number,label,starts_on,ends_on,status,context_summary";
    const editorialSelect =
      "editorial_title,editorial_summary,hero_image_url,video_url,display_order,is_featured,memory_note,seo_title,seo_description";
    const syncSelect = "data_source,external_provider,external_id,last_synced_at,sync_status,manual_override";
    let matchdays: SupabaseMatchday[] = [];
    let editorialFieldsAvailable = true;
    let syncMetadataAvailable = true;

    try {
      matchdays = await readTable<SupabaseMatchday>(
        `matchdays?select=${matchdaySelectBase},${editorialSelect},${syncSelect}&order=number.asc`
      );
    } catch {
      try {
        editorialFieldsAvailable = false;
        matchdays = await readTable<SupabaseMatchday>(
          `matchdays?select=${matchdaySelectBase},${syncSelect}&order=number.asc`
        );
      } catch {
        syncMetadataAvailable = false;
        matchdays = await readTable<SupabaseMatchday>(
          `matchdays?select=${matchdaySelectBase}&order=number.asc`
        );
      }
    }

    const [competitions, seasons, matches] = await Promise.all([
      readTable<SupabaseCompetition>(
        "competitions?select=id,name,slug,country,logo_url,is_active&order=name.asc"
      ),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      readTable<MatchdayLinkedRecord>("matches?select=id,matchday_id&matchday_id=not.is.null&limit=500")
    ]);

    const articleRows = await readTable<MatchdayLinkedRecord>(
      "articles?select=id,matchday_id&matchday_id=not.is.null&limit=500"
    ).catch(() => []);
    const headlineRows = await readTable<MatchdayLinkedRecord>(
      "headlines?select=id,matchday_id&matchday_id=not.is.null&limit=500"
    ).catch(() => []);

    const competitionsById = mapById(competitions);
    const seasonsById = mapById(seasons);
    const matchCounts = countByMatchday(matches);
    const articleCounts = countByMatchday(articleRows);
    const headlineCounts = countByMatchday(headlineRows);

    return {
      configured: true,
      writeConfigured,
      matchdays: matchdays.map((matchday) => {
        const season = seasonsById.get(matchday.season_id) ?? null;
        const competition = season ? competitionsById.get(season.competition_id) ?? null : null;

        return {
          ...matchday,
          season,
          competition,
          matchCount: matchCounts.get(matchday.id) ?? 0,
          articleCount: articleCounts.get(matchday.id) ?? 0,
          headlineCount: headlineCounts.get(matchday.id) ?? 0
        };
      }),
      competitions,
      seasons,
      editorialFieldsAvailable,
      syncMetadataAvailable
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler jornadas.",
      matchdays: [],
      competitions: [],
      seasons: [],
      editorialFieldsAvailable: false,
      syncMetadataAvailable: false
    };
  }
}

export async function getAdminStandingsEditor(): Promise<{
  configured: boolean;
  writeConfigured: boolean;
  error?: string;
  standings: SupabaseAdminStanding[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  matchdays: SupabaseMatchday[];
  teams: SupabaseTeam[];
  syncMetadataAvailable: boolean;
}> {
  const readConfigured = Boolean(getSupabaseConfig());
  const writeConfigured = Boolean(getSupabaseServiceConfig());

  if (!readConfigured) {
    return {
      configured: false,
      writeConfigured,
      standings: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      teams: [],
      syncMetadataAvailable: false
    };
  }

  try {
    const readTable = writeConfigured ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const standingSelectBase = "id,competition_id,season_id,matchday_id,moment_label,generated_at";
    const rowSelectBase =
      "id,standing_id,team_id,position,played,wins,draws,losses,goals_for,goals_against,goal_difference,points,home_played,home_wins,home_draws,home_losses,away_played,away_wins,away_draws,away_losses";
    const syncSelect = "data_source,external_provider,external_id,last_synced_at,sync_status,manual_override";
    let syncMetadataAvailable = true;
    let standings: SupabaseStanding[] = [];
    let standingRows: SupabaseStandingRow[] = [];

    try {
      [standings, standingRows] = await Promise.all([
        readTable<SupabaseStanding>(`standings?select=${standingSelectBase},${syncSelect}&order=generated_at.desc&limit=80`),
        readTable<SupabaseStandingRow>(`standing_rows?select=${rowSelectBase},${syncSelect}&order=position.asc&limit=1200`)
      ]);
    } catch {
      syncMetadataAvailable = false;
      [standings, standingRows] = await Promise.all([
        readTable<SupabaseStanding>(`standings?select=${standingSelectBase}&order=generated_at.desc&limit=80`),
        readTable<SupabaseStandingRow>(`standing_rows?select=${rowSelectBase}&order=position.asc&limit=1200`)
      ]);
    }

    const [competitions, seasons, matchdays, teams] = await Promise.all([
      readTable<SupabaseCompetition>(
        "competitions?select=id,name,slug,country,logo_url,is_active&order=name.asc"
      ),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      readTable<SupabaseMatchday>(
        "matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&order=number.asc"
      ),
      readTable<SupabaseTeam>(
        "teams?select=id,name,short_name,slug,country,logo_url,primary_color&order=name.asc"
      )
    ]);

    const competitionsById = mapById(competitions);
    const seasonsById = mapById(seasons);
    const matchdaysById = mapById(matchdays);
    const teamsById = mapById(teams);
    const rowsByStanding = standingRows.reduce<Map<string, SupabaseAdminStandingRow[]>>((map, row) => {
      const list = map.get(row.standing_id) ?? [];
      list.push({
        ...row,
        team: teamsById.get(row.team_id) ?? null
      });
      map.set(row.standing_id, list);
      return map;
    }, new Map());

    return {
      configured: true,
      writeConfigured,
      standings: standings.map((standing) => ({
        ...standing,
        competition: competitionsById.get(standing.competition_id) ?? null,
        season: seasonsById.get(standing.season_id) ?? null,
        matchday: standing.matchday_id ? matchdaysById.get(standing.matchday_id) ?? null : null,
        rows: rowsByStanding.get(standing.id) ?? []
      })),
      competitions,
      seasons,
      matchdays,
      teams,
      syncMetadataAvailable
    };
  } catch (error) {
    return {
      configured: true,
      writeConfigured,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler classificacoes.",
      standings: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      teams: [],
      syncMetadataAvailable: false
    };
  }
}

type SupabasePublicBroadcastMatch = {
  source_key: string | null;
  broadcast_channel_id: string | null;
};

export async function getPublicBroadcastOverrides(): Promise<BroadcastOverride[]> {
  if (!getSupabaseConfig()) {
    return [];
  }

  try {
    const [matches, broadcastChannels] = await Promise.all([
      fetchSupabaseTable<SupabasePublicBroadcastMatch>(
        "matches?select=source_key,broadcast_channel_id&source_key=not.is.null&broadcast_channel_id=not.is.null&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,source_key.asc&limit=200"
      ),
      fetchSupabaseTable<SupabaseBroadcastChannel>(
        "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc"
      )
    ]);
    const channelsById = mapById(broadcastChannels);

    return matches.flatMap((match) => {
      if (!match.source_key || !match.broadcast_channel_id) {
        return [];
      }

      const channel = channelsById.get(match.broadcast_channel_id);

      if (!channel) {
        return [];
      }

      return [
        {
          matchId: match.source_key,
          channel: channel.name,
          platform: channel.platform,
          region: channel.country,
          coverage: "Direto",
          logoUrl: channel.logo_url
        }
      ];
    });
  } catch {
    return [];
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!getSupabaseConfig()) {
    return {
      configured: false,
      countries: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      teams: [],
      broadcastChannels: []
    };
  }

  try {
    const readTable = getSupabaseServiceConfig() ? fetchSupabaseAdminTable : fetchSupabaseTable;
    const [countries, competitions, seasons, teams, broadcastChannels, matchdayOverview] = await Promise.all([
      readCountriesWithFallback(readTable),
      readCompetitionsWithFallback(readTable),
      readTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      readTable<SupabaseTeam>(
        "teams?select=id,name,short_name,slug,country,logo_url,primary_color&order=name.asc"
      ),
      readTable<SupabaseBroadcastChannel>(
        "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc"
      ),
      getAdminMatchdaysEditor()
    ]);

    return {
      configured: true,
      countries,
      competitions,
      seasons,
      matchdays: matchdayOverview.matchdays,
      teams,
      broadcastChannels
    };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : "Erro desconhecido ao ler o Supabase.",
      countries: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      teams: [],
      broadcastChannels: []
    };
  }
}
