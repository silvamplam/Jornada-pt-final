type DenoRuntime = {
  env: {
    get(name: string): string | undefined;
  };
  serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;
};

declare const Deno: DenoRuntime | undefined;

export const FOOTBALL_DATA_PROVIDER =
  "football-data.org";

export const FOOTBALL_DATA_COMPETITIONS = [
  {
    slug: "liga-portugal",
    code: "PPL",
  },
  {
    slug: "premier-league",
    code: "PL",
  },
  {
    slug: "la-liga",
    code: "PD",
  },
] as const;

export const FAST_PROVIDER_LOOKBACK_DAYS = 2;
export const MAX_PROVIDER_REQUESTS_PER_RUN = 3;

export type FinalResultsSyncMode =
  "fast" | "recovery";

export const LOCAL_PENDING_STATUSES = [
  "scheduled",
  "live",
  "halftime",
  "postponed",
] as const;

const API_BASE =
  "https://api.football-data.org/v4";

type ServiceConfig = {
  url: string;
  serviceRoleKey: string;
};

type LocalCompetition = {
  id: string;
  slug: string;
};

export type LocalSeason = {
  id: string;
  competition_id: string;
  label: string;
  starts_on: string | null;
};

export type LocalTeam = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  code: string | null;
};

export type LocalAlias = {
  team_id: string;
  normalized_alias: string;
};

export type LocalMatch = {
  id: string;
  competition_id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  external_provider: string | null;
  external_match_id: string | null;
  last_synced_at: string | null;
};

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: {
    id: number;
    name: string;
  };
  awayTeam: {
    id: number;
    name: string;
  };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
};

type FootballDataResponse = {
  matches?: FootballDataMatch[];
};

export type SyncSummary = {
  ok: true;
  provider: string;
  candidates: number;
  providerRequests: number;
  matched: number;
  finished: number;
  unresolved: number;
  skippedReason: string | null;
};

function env(name: string) {
  if (
    typeof Deno === "undefined"
    || !Deno
  ) {
    return undefined;
  }

  return Deno.env.get(name);
}

function serviceConfig(): ServiceConfig | null {
  const url = env("SUPABASE_URL");
  const serviceRoleKey =
    env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
  };
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function inFilter(values: string[]) {
  return `in.(${values.join(",")})`;
}

export function normalizeTeamKey(
  value: string | null | undefined
) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function simplifiedTeamKey(
  value: string | null | undefined
) {
  const removable = new Set([
    "football",
    "futebol",
    "club",
    "clube",
    "fc",
    "cf",
    "sc",
    "sl",
    "afc",
    "cd",
    "ud",
    "rc",
    "sad",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "del",
    "la",
    "the",
  ]);

  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (part) => !removable.has(part)
    )
    .join("");
}

function addLookupValue(
  lookup: Map<string, Set<string>>,
  value: string | null | undefined,
  teamId: string,
  simplified = false
) {
  const key = simplified
    ? simplifiedTeamKey(value)
    : normalizeTeamKey(value);

  if (!key) {
    return;
  }

  const ids =
    lookup.get(key)
    ?? new Set<string>();

  ids.add(teamId);
  lookup.set(key, ids);
}

export function buildTeamLookup(
  teams: LocalTeam[],
  aliases: LocalAlias[]
) {
  const exact =
    new Map<string, Set<string>>();

  const simplified =
    new Map<string, Set<string>>();

  for (const team of teams) {
    for (
      const value
      of [
        team.name,
        team.short_name,
        team.slug,
        team.code,
      ]
    ) {
      addLookupValue(
        exact,
        value,
        team.id
      );

      addLookupValue(
        simplified,
        value,
        team.id,
        true
      );
    }
  }

  for (const alias of aliases) {
    addLookupValue(
      exact,
      alias.normalized_alias,
      alias.team_id
    );

    addLookupValue(
      simplified,
      alias.normalized_alias,
      alias.team_id,
      true
    );
  }

  return {
    exact,
    simplified,
  };
}

function resolveUnique(
  lookup: Map<string, Set<string>>,
  key: string
) {
  const ids = lookup.get(key);

  return ids?.size === 1
    ? Array.from(ids)[0]
    : null;
}

function resolveContained(
  lookup: Map<string, Set<string>>,
  key: string
) {
  if (key.length < 5) {
    return null;
  }

  const ids = new Set<string>();

  for (
    const [candidate, teamIds]
    of lookup.entries()
  ) {
    if (
      candidate.length < 5
      || (
        !candidate.includes(key)
        && !key.includes(candidate)
      )
    ) {
      continue;
    }

    for (const id of teamIds) {
      ids.add(id);
    }
  }

  return ids.size === 1
    ? Array.from(ids)[0]
    : null;
}

export function resolveProviderTeam(
  name: string,
  lookup:
    ReturnType<typeof buildTeamLookup>
) {
  const exact =
    resolveUnique(
      lookup.exact,
      normalizeTeamKey(name)
    );

  if (exact) {
    return exact;
  }

  const simplifiedKey =
    simplifiedTeamKey(name);

  const simplified =
    resolveUnique(
      lookup.simplified,
      simplifiedKey
    );

  if (simplified) {
    return simplified;
  }

  return resolveContained(
    lookup.simplified,
    simplifiedKey
  );
}

export function seasonStartYear(
  season: LocalSeason
) {
  const fromDate =
    season.starts_on?.slice(0, 4);

  if (
    fromDate
    && /^\d{4}$/.test(fromDate)
  ) {
    return Number.parseInt(
      fromDate,
      10
    );
  }

  const fromLabel =
    /^(\d{4})/.exec(
      season.label.trim()
    );

  return fromLabel
    ? Number.parseInt(
        fromLabel[1],
        10
      )
    : null;
}

export function shouldCheckResult(
  match: LocalMatch,
  _now = new Date()
) {
  return (
    LOCAL_PENDING_STATUSES as readonly string[]
  ).includes(match.status);
}

function validScore(
  value: unknown
): value is number {
  return (
    typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
  );
}

export function isFinishedProviderMatch(
  match: FootballDataMatch
) {
  return (
    match.status
      .trim()
      .toUpperCase()
      === "FINISHED"
    && validScore(
      match.score.fullTime.home
    )
    && validScore(
      match.score.fullTime.away
    )
  );
}

export function buildFinalPatch(
  match: FootballDataMatch,
  now = new Date()
) {
  if (
    !isFinishedProviderMatch(match)
  ) {
    return null;
  }

  return {
    status: "finished",
    home_score:
      match.score.fullTime.home as number,
    away_score:
      match.score.fullTime.away as number,
    minute: null,
    live_started_at: null,
    live_base_minute: null,
    is_clock_running: false,
    external_provider:
      FOOTBALL_DATA_PROVIDER,
    external_match_id:
      String(match.id),
    last_synced_at:
      now.toISOString(),
  };
}

export function findLocalMatch(
  providerMatch: FootballDataMatch,
  candidates: LocalMatch[],
  competitionId: string,
  lookup:
    ReturnType<typeof buildTeamLookup>
) {
  const externalId =
    String(providerMatch.id);

  const direct =
    candidates.filter(
      (match) =>
        match.competition_id
          === competitionId
        && match.external_provider
          === FOOTBALL_DATA_PROVIDER
        && match.external_match_id
          === externalId
    );

  if (direct.length === 1) {
    return direct[0];
  }

  const homeTeamId =
    resolveProviderTeam(
      providerMatch.homeTeam.name,
      lookup
    );

  const awayTeamId =
    resolveProviderTeam(
      providerMatch.awayTeam.name,
      lookup
    );

  if (!homeTeamId || !awayTeamId) {
    return null;
  }

  const byTeams =
    candidates.filter(
      (match) =>
        match.competition_id
          === competitionId
        && match.home_team_id
          === homeTeamId
        && match.away_team_id
          === awayTeamId
    );

  return byTeams.length === 1
    ? byTeams[0]
    : null;
}

async function readJson<T>(
  response: Response
): Promise<T> {
  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      text
      || `HTTP ${response.status}`
    );
  }

  return JSON.parse(text) as T;
}

async function dbGet<T>(
  table: string,
  query: Record<string, string>,
  config: ServiceConfig
): Promise<T[]> {
  const url =
    new URL(
      `${
        config.url.replace(/\/$/, "")
      }/rest/v1/${table}`
    );

  for (
    const [key, value]
    of Object.entries(query)
  ) {
    url.searchParams.set(
      key,
      value
    );
  }

  const response =
    await fetch(
      url,
      {
        headers: {
          apikey:
            config.serviceRoleKey,
          Authorization:
            `Bearer ${config.serviceRoleKey}`,
        },
      }
    );

  return readJson<T[]>(response);
}

async function writeFinalResult(
  matchId: string,
  patch: Record<string, unknown>,
  config: ServiceConfig
) {
  const url =
    new URL(
      `${
        config.url.replace(/\/$/, "")
      }/rest/v1/matches`
    );

  url.searchParams.set(
    "id",
    `eq.${matchId}`
  );

  url.searchParams.set(
    "status",
    "neq.finished"
  );

  const response =
    await fetch(
      url,
      {
        method: "PATCH",
        headers: {
          apikey:
            config.serviceRoleKey,
          Authorization:
            `Bearer ${config.serviceRoleKey}`,
          "Content-Type":
            "application/json",
          Prefer:
            "return=minimal",
        },
        body:
          JSON.stringify(patch),
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
      || `PATCH ${response.status}`
    );
  }
}

async function fetchFinishedMatches({
  token,
  competitionCode,
  season,
  dateFrom,
  dateTo,
}: {
  token: string;
  competitionCode: string;
  season: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  const url =
    new URL(
      `${API_BASE}/competitions/${competitionCode}/matches`
    );

  url.searchParams.set(
    "season",
    String(season)
  );

  if (dateFrom) {
    url.searchParams.set(
      "dateFrom",
      dateFrom
    );
  }

  if (dateTo) {
    url.searchParams.set(
      "dateTo",
      dateTo
    );
  }

  url.searchParams.set(
    "status",
    "FINISHED"
  );

  const response =
    await fetch(
      url,
      {
        headers: {
          "X-Auth-Token": token,
        },
      }
    );

  const payload =
    await readJson<FootballDataResponse>(
      response
    );

  return payload.matches ?? [];
}

function utcDate(
  value: string
) {
  return new Date(value)
    .toISOString()
    .slice(0, 10);
}

export function shiftUtcDate(
  value: string,
  days: number
) {
  const date =
    new Date(
      `${value}T00:00:00.000Z`
    );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

export function syncModeFromBody(
  value: unknown
): FinalResultsSyncMode {
  if (
    value
    && typeof value === "object"
    && "mode" in value
    && (value as { mode?: unknown }).mode
      === "recovery"
  ) {
    return "recovery";
  }

  return "fast";
}

export function buildProviderDateRange(
  now = new Date(),
  mode: FinalResultsSyncMode = "fast"
): {
  dateFrom?: string;
  dateTo?: string;
} {
  if (mode === "recovery") {
    return {};
  }

  const today =
    utcDate(
      now.toISOString()
    );

  return {
    dateFrom:
      shiftUtcDate(
        today,
        -FAST_PROVIDER_LOOKBACK_DAYS
      ),
    dateTo: today,
  };
}

export async function runFinalResultsSync(
  now = new Date(),
  mode: FinalResultsSyncMode = "fast"
): Promise<SyncSummary> {
  const config =
    serviceConfig();

  const token =
    env("FOOTBALL_DATA_TOKEN");

  if (!config) {
    throw new Error(
      "Supabase service configuration missing."
    );
  }

  if (!token) {
    throw new Error(
      "FOOTBALL_DATA_TOKEN missing."
    );
  }

  const competitions =
    await dbGet<LocalCompetition>(
      "competitions",
      {
        select: "id,slug",
        slug:
          inFilter(
            FOOTBALL_DATA_COMPETITIONS.map(
              (item) => item.slug
            )
          ),
      },
      config
    );

  if (competitions.length === 0) {
    return {
      ok: true,
      provider:
        FOOTBALL_DATA_PROVIDER,
      candidates: 0,
      providerRequests: 0,
      matched: 0,
      finished: 0,
      unresolved: 0,
      skippedReason:
        "no-competitions",
    };
  }

  const seasons =
    await dbGet<LocalSeason>(
      "seasons",
      {
        select:
          "id,competition_id,label,starts_on",
        competition_id:
          inFilter(
            competitions.map(
              (item) => item.id
            )
          ),
        is_current:
          "eq.true",
      },
      config
    );

  if (seasons.length === 0) {
    return {
      ok: true,
      provider:
        FOOTBALL_DATA_PROVIDER,
      candidates: 0,
      providerRequests: 0,
      matched: 0,
      finished: 0,
      unresolved: 0,
      skippedReason:
        "no-current-seasons",
    };
  }

  const matchGroups =
    await Promise.all(
      seasons.map(
        (season) =>
          dbGet<LocalMatch>(
            "matches",
            {
              select: [
                "id",
                "competition_id",
                "season_id",
                "home_team_id",
                "away_team_id",
                "kickoff_at",
                "status",
                "home_score",
                "away_score",
                "external_provider",
                "external_match_id",
                "last_synced_at",
              ].join(","),
              season_id:
                `eq.${season.id}`,
              limit: "500",
            },
            config
          )
      )
    );

  const matches =
    matchGroups.flat();

  const candidates =
    matches.filter(
      (match) =>
        shouldCheckResult(match)
    );

  if (candidates.length === 0) {
    return {
      ok: true,
      provider:
        FOOTBALL_DATA_PROVIDER,
      candidates: 0,
      providerRequests: 0,
      matched: 0,
      finished: 0,
      unresolved: 0,
      skippedReason:
        "no-pending-results",
    };
  }

  const teamIds =
    unique(
      candidates.flatMap(
        (match) => [
          match.home_team_id,
          match.away_team_id,
        ]
      )
    );

  const [
    teams,
    aliases,
  ] = await Promise.all([
    dbGet<LocalTeam>(
      "teams",
      {
        select:
          "id,name,short_name,slug,code",
        id:
          inFilter(teamIds),
        limit:
          "500",
      },
      config
    ),

    dbGet<LocalAlias>(
      "team_aliases",
      {
        select:
          "team_id,normalized_alias",
        team_id:
          inFilter(teamIds),
        status:
          "eq.active",
        limit:
          "1000",
      },
      config
    ),
  ]);

  const lookup =
    buildTeamLookup(
      teams,
      aliases
    );

  const competitionById =
    new Map(
      competitions.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  const definitionBySlug =
    new Map<
      string,
      (typeof FOOTBALL_DATA_COMPETITIONS)[number]
    >(
      FOOTBALL_DATA_COMPETITIONS.map(
        (item) => [
          item.slug,
          item,
        ]
      )
    );

  const seasonById =
    new Map(
      seasons.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  const providerDateRange =
    buildProviderDateRange(
      now,
      mode
    );

  const groups =
    new Map<
      string,
      LocalMatch[]
    >();

  for (const match of candidates) {
    const group =
      groups.get(
        match.competition_id
      ) ?? [];

    group.push(match);

    groups.set(
      match.competition_id,
      group
    );
  }

  let providerRequests = 0;
  let matched = 0;
  let finished = 0;
  let unresolved = 0;

  for (
    const [
      competitionId,
      localMatches,
    ]
    of groups.entries()
  ) {
    if (
      providerRequests
      >= MAX_PROVIDER_REQUESTS_PER_RUN
    ) {
      break;
    }

    const competition =
      competitionById.get(
        competitionId
      );

    if (!competition) {
      continue;
    }

    const definition =
      definitionBySlug.get(
        competition.slug
      );

    if (!definition) {
      continue;
    }

    const seasonIds =
      unique(
        localMatches.map(
          (match) =>
            match.season_id
        )
      );

    if (seasonIds.length !== 1) {
      continue;
    }

    const season =
      seasonById.get(
        seasonIds[0]
      );

    if (!season) {
      continue;
    }

    const year =
      seasonStartYear(
        season
      );

    if (year === null) {
      continue;
    }

    providerRequests += 1;

    const providerMatches =
      await fetchFinishedMatches({
        token,
        competitionCode:
          definition.code,
        season: year,
        ...providerDateRange,
      });

    for (
      const providerMatch
      of providerMatches
    ) {
      const local =
        findLocalMatch(
          providerMatch,
          localMatches,
          competitionId,
          lookup
        );

      if (!local) {
        const known =
          findLocalMatch(
            providerMatch,
            matches,
            competitionId,
            lookup
          );

        if (!known) {
          unresolved += 1;
        }

        continue;
      }

      matched += 1;

      const patch =
        buildFinalPatch(
          providerMatch,
          now
        );

      if (!patch) {
        continue;
      }

      await writeFinalResult(
        local.id,
        patch,
        config
      );

      local.status =
        "finished";

      local.home_score =
        patch.home_score;

      local.away_score =
        patch.away_score;

      local.external_provider =
        FOOTBALL_DATA_PROVIDER;

      local.external_match_id =
        patch.external_match_id;

      local.last_synced_at =
        patch.last_synced_at;

      finished += 1;
    }
  }

  return {
    ok: true,
    provider:
      FOOTBALL_DATA_PROVIDER,
    candidates:
      candidates.length,
    providerRequests,
    matched,
    finished,
    unresolved,
    skippedReason: null,
  };
}

export function isAuthorizedSyncRequest(
  expectedSecret: string | undefined,
  suppliedSecret: string | null
) {
  return Boolean(
    expectedSecret
    && suppliedSecret
    && suppliedSecret === expectedSecret
  );
}

function jsonResponse(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
      },
    }
  );
}

if (
  typeof Deno !== "undefined"
  && Deno
) {
  Deno.serve(
    async (request) => {
      if (
        request.method !== "POST"
      ) {
        return jsonResponse(
          {
            ok: false,
            error:
              "method-not-allowed",
          },
          405
        );
      }

      const expectedSecret =
        env("SYNC_FINAL_RESULTS_SECRET");

      const suppliedSecret =
        request.headers.get(
          "x-sync-secret"
        );

      if (
        !isAuthorizedSyncRequest(
          expectedSecret,
          suppliedSecret
        )
      ) {
        return jsonResponse(
          {
            ok: false,
            error: "unauthorized",
          },
          401
        );
      }

      let requestBody: unknown = null;

      try {
        requestBody =
          await request.json();
      } catch {
        requestBody = null;
      }

      const mode =
        syncModeFromBody(
          requestBody
        );

      try {
        return jsonResponse(
          await runFinalResultsSync(
            new Date(),
            mode
          )
        );
      } catch (error) {
        console.error(
          "[sync-final-results]",
          error
        );

        return jsonResponse(
          {
            ok: false,
            error:
              "final-results-sync-failed",
            message:
              error instanceof Error
                ? error.message
                : "Unknown error.",
          },
          500
        );
      }
    }
  );
}
