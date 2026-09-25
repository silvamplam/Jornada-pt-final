// Synthetic data only. Both readers use the real no-store helper against this transport.
export type FixtureRow = Record<string, unknown>;
export type FixtureData = Record<string, FixtureRow[]>;
export const fixtureArticle = { matchday_id: "day-4", season_id: "season-26", competition_id: "competition-1" };
export const fixtureOrigin = "https://article-context.invalid";

export function articleContextFixture(richEditorial = true): FixtureData {
  const days = Array.from({ length: 6 }, (_, index) => ({
    id: `day-${index + 1}`, season_id: "season-26", number: index + 1, label: `Jornada ${index + 1}`,
    starts_on: "2026-09-25", ends_on: "2026-09-27", status: "active", context_summary: "Unused context",
  }));
  const match = (id: string, overrides: FixtureRow = {}) => ({
    id, competition_id: "competition-1", season_id: "season-26", matchday_id: "day-4",
    home_team_id: "team-a", away_team_id: "team-b", broadcast_channel_id: "tv-a",
    scheduled_date: "2026-09-25", kickoff_at: "2026-09-25T19:00:00Z", status: "live", minute: 32,
    live_started_at: "2026-09-25T19:00:00Z", live_base_minute: 30, is_clock_running: true,
    home_score: 2, away_score: 1, venue: "Unused venue", ...overrides,
  });
  return {
    competitions: [{ id: "competition-1", name: "Liga Fixture", slug: "liga-fixture", logo_url: "/fixture-league.svg",
      is_active: true, country_id: null, country: "PT", accent_color: "#224466" }],
    seasons: [
      { id: "season-25", competition_id: "competition-1", label: "2025/26", starts_on: null, ends_on: null, is_current: false },
      { id: "season-26", competition_id: "competition-1", label: "2026/27", starts_on: null, ends_on: null, is_current: true },
    ],
    matchdays: days,
    season_teams: ["active", "active", null, "suspended", "inactive"].map((status, index) => ({
      id: `participant-${index}`, season_id: "season-26", team_id: index === 4 ? "team-unused" : `team-${"abcd"[index]}`,
      display_order: index, status, data_source: "manual", sync_status: "manual", manual_override: true,
    })),
    matches: [
      match("match-z", { scheduled_date: null, kickoff_at: null, status: "scheduled", minute: null,
        live_started_at: null, live_base_minute: null, is_clock_running: false, home_score: null, away_score: null,
        home_team_id: "team-c", away_team_id: "team-a", broadcast_channel_id: "tv-b" }),
      match("match-b"), match("match-a"),
      match("previous-match", { matchday_id: "day-1", scheduled_date: "2026-09-01", status: "finished" }),
    ],
    teams: ["a", "b", "c", "d", "unused"].map((key) => ({
      id: `team-${key}`, name: `Fixture ${key}`, public_name: `Public ${key}`, short_name: key.toUpperCase(),
      code: key.toUpperCase(), slug: `fixture-${key}`, logo_url: `/fixture-${key}.svg`, country: "PT", primary_color: "#556677",
    })),
    broadcast_channels: ["a", "b"].map((key) => ({
      id: `tv-${key}`, name: `TV ${key}`, logo_url: `/fixture-tv-${key}.svg`, platform: "TV", country: "PT",
    })),
    matchday_editorials: [{ id: "editorial-1", matchday_id: "day-4", status: "published",
      headline_link_url: null, complementary_status: "draft" }],
    matchday_highlights: [], matchday_roundup_items: [], matchday_latest_news: [],
    matchday_horizontal_news: [], matchday_live_layout_items: [],
    matchday_editorial_desk_control: [{ matchday_id: "day-4", is_managed: false, faixa_visible: true, revision: 1 }],
    matchday_reference_compositions: richEditorial ? [{
      id: "composition-1", matchday_id: "day-4", status: "published", is_current: true,
      presentation_mode: "standard", published_at: "2026-09-25T12:00:00Z",
    }] : [],
    matchday_reference_composition_items: richEditorial ? [
      { id: "item-1", composition_id: "composition-1", slot_type: "headline", sort_order: 0, link_url_snapshot: "/conteudos/fixture-headline" },
      { id: "item-2", composition_id: "composition-1", slot_type: "complement", sort_order: 0, link_url_snapshot: "/conteudos/fixture-complement" },
      { id: "item-3", composition_id: "composition-1", slot_type: "roundup", sort_order: 0, source_type: "matchday_roundup_item", source_id: "roundup-1" },
    ] : [],
    matchday_hierarchical_composition_slots: [], matchday_editorial_continuity_transitions: [],
    editorial_contents: [],
  };
}

export type FixtureCall = { table: string; query: URLSearchParams; cache: RequestCache | undefined };

// Implements only the operators used by these readers; unknown queries fail loudly.
export function fixtureResponse(data: FixtureData, url: URL) {
  const table = url.pathname.slice("/rest/v1/".length);
  if (!(table in data)) throw new Error("Unexpected table: " + table);
  let rows = [...data[table]];
  for (const [key, filter] of url.searchParams) {
    if (["select", "order", "limit"].includes(key)) continue;
    if (filter.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === filter.slice(3));
    else if (filter === "is.true") rows = rows.filter((row) => row[key] === true);
    else if (filter.startsWith("in.(") && filter.endsWith(")")) {
      const values = filter.slice(4, -1).split(",");
      rows = rows.filter((row) => values.includes(String(row[key])));
    } else throw new Error("Unexpected filter: " + key + "=" + filter);
  }
  const order = url.searchParams.get("order")?.split(",") ?? [];
  rows.sort((left, right) => {
    for (const term of order) {
      const [key, direction, nulls] = term.split(".");
      const a = left[key], b = right[key];
      if (a === b) continue;
      if (a == null || b == null) return (a == null ? 1 : -1) * (nulls === "nullslast" || direction !== "desc" ? 1 : -1);
      const compare = a < b ? -1 : 1;
      return direction === "desc" ? -compare : compare;
    }
    return 0;
  });
  rows = rows.slice(0, Number(url.searchParams.get("limit") ?? rows.length));
  const fields = url.searchParams.get("select")?.split(",") ?? [];
  return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null])));
}

export async function withArticleContextTransport<T>(
  data: FixtureData,
  run: (calls: FixtureCall[]) => Promise<T>,
  intercept?: (call: FixtureCall) => Promise<Response | void>,
) {
  const savedFetch = globalThis.fetch;
  const names = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const savedEnv = names.map((name) => process.env[name]);
  const calls: FixtureCall[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fixtureOrigin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-key";
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== fixtureOrigin || !url.pathname.startsWith("/rest/v1/")) throw new Error("Remote access forbidden in fixture");
    if (init?.method && init.method !== "GET") throw new Error("Only reads allowed");
    const call = { table: url.pathname.slice("/rest/v1/".length), query: url.searchParams, cache: init?.cache };
    calls.push(call);
    const override = await intercept?.(call);
    return override ?? Response.json(fixtureResponse(data, url));
  }) as typeof fetch;
  try { return await run(calls); }
  finally {
    globalThis.fetch = savedFetch;
    names.forEach((name, index) => {
      if (savedEnv[index] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[index];
    });
  }
}
