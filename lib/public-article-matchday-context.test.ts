import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readPublicArticleMatchdayContext, type PublicArticleMatchdayContext } from "./public-article-matchday-context";
import type { PublicMatchdayContext } from "./public-matchday";
import { buildPublicMatchdayLegNavigation } from "./public-matchday-leg-navigation";
import { readArticleMatchdayContext } from "./__fixtures__/public-article-matchday-context/legacy-reader";
import { articleContextFixture, fixtureArticle, withArticleContextTransport } from "./__fixtures__/public-article-matchday-context/transport";

const source = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const allowedTables = ["matchdays", "seasons", "competitions", "season_teams", "matches", "teams", "broadcast_channels"];
const forbiddenTables = [
  "matchday_editorials", "matchday_highlights", "matchday_roundup_items", "matchday_latest_news",
  "matchday_horizontal_news", "matchday_live_layout_items", "matchday_editorial_desk_control",
  "matchday_reference_compositions", "matchday_reference_composition_items", "matchday_hierarchical_composition_slots",
  "matchday_editorial_continuity_transitions", "editorial_contents",
];

function pick(value: object | null, keys: string[]) {
  if (!value) return null;
  return Object.fromEntries(keys.map((key) => [key, (value as Record<string, unknown>)[key]]));
}

// All context fields consumed by the unchanged article header/navigation/match strip.
function presentation(context: PublicArticleMatchdayContext | PublicMatchdayContext) {
  const teamFields = ["id", "name", "public_name", "short_name", "code", "slug", "logo_url"];
  return {
    competition: pick(context.competition, ["id", "name", "slug", "logo_url", "is_active"]),
    season: pick(context.season, ["id", "competition_id", "label"]),
    seasons: context.seasons.map((item) => pick(item, ["id", "label"])),
    matchday: pick(context.matchday, ["id", "season_id", "number", "label", "starts_on", "ends_on"]),
    matchdays: context.matchdays.map((item) => pick(item, ["id", "number"])),
    activeParticipantCount: context.activeParticipantCount,
    matchesForMatchday: context.matchesForMatchday.map((match) => ({
      ...pick(match, ["id", "home_team_id", "away_team_id", "broadcast_channel_id", "scheduled_date", "kickoff_at",
        "status", "minute", "live_started_at", "live_base_minute", "is_clock_running", "home_score", "away_score"]),
      matchday: pick(match.matchday, ["id", "number"]),
      homeTeam: pick(match.homeTeam, teamFields), awayTeam: pick(match.awayTeam, teamFields),
      broadcastChannel: pick(match.broadcastChannel, ["id", "name", "logo_url"]),
    })),
  };
}

for (const [rich, previousCount] of [[false, 20], [true, 25]] as const) {
  test(`transport comparison: ${rich ? "published composition/media" : "plain"} context ${previousCount} -> 9, with equal presentation`, async () => {
    await withArticleContextTransport(articleContextFixture(rich), async (calls) => {
      const old = await readArticleMatchdayContext(fixtureArticle);
      assert.ok(old);
      const oldCalls = calls.splice(0);
      const current = await readPublicArticleMatchdayContext(fixtureArticle);
      assert.ok(current);
      assert.equal(oldCalls.length, previousCount);
      assert.equal(calls.length, 9);
      assert.deepEqual(presentation(current), presentation(old));
      assert.deepEqual(Object.keys(current).sort(), ["competition", "season", "seasons", "matchday", "matchdays", "activeParticipantCount", "matchesForMatchday"].sort());
      assert.deepEqual(buildPublicMatchdayLegNavigation(current.matchdays, current.activeParticipantCount, current.matchday.id),
        buildPublicMatchdayLegNavigation(old.matchdays.map(({ id, number }) => ({ id, number })), old.activeParticipantCount, old.matchday.id));
      assert.ok(oldCalls.some((call) => forbiddenTables.includes(call.table)));
      assert.ok(calls.every((call) => allowedTables.includes(call.table) && call.cache === "no-store"));
      assert.ok(calls.every((call) => !forbiddenTables.includes(call.table)));
      console.log(JSON.stringify({ scenario: rich ? "composition/media" : "plain", before: oldCalls.length, initialReads: 3,
        broadReader: oldCalls.length - 3, after: calls.length, contextReductionPercent: (1 - calls.length / oldCalls.length) * 100,
        removedTables: [...new Set(oldCalls.filter((call) => !allowedTables.includes(call.table)).map((call) => call.table))] }));
    });
  });
}

test("minimal selects, scoped IDs, ordering, participant semantics and all live fields are preserved", async () => {
  await withArticleContextTransport(articleContextFixture(), async (calls) => {
    const context = await readPublicArticleMatchdayContext(fixtureArticle);
    assert.ok(context);
    assert.equal(context.competition.name, "Liga Fixture");
    assert.equal(context.competition.logo_url, "/fixture-league.svg");
    assert.equal(context.season.id, "season-26");
    assert.deepEqual(context.seasons.map((item) => item.id), ["season-26", "season-25"]);
    assert.equal(context.matchday.id, "day-4");
    assert.equal(context.matchday.starts_on, "2026-09-25");
    assert.deepEqual(context.matchdays.map((item) => item.number), [1, 2, 3, 4, 5, 6]);
    assert.equal(context.activeParticipantCount, 4); // null and suspended are active, inactive is not.
    assert.deepEqual(context.matchesForMatchday.map((item) => item.id), ["match-a", "match-b", "match-z"]);
    const first = context.matchesForMatchday[0];
    assert.deepEqual([first.status, first.minute, first.live_started_at, first.live_base_minute, first.is_clock_running, first.home_score, first.away_score],
      ["live", 32, "2026-09-25T19:00:00Z", 30, true, 2, 1]);
    assert.equal(first.homeTeam?.public_name, "Public a");
    assert.equal(first.awayTeam?.logo_url, "/fixture-b.svg");
    assert.equal(first.broadcastChannel?.name, "TV a");
    assert.equal(calls.filter((call) => call.table === "matches").length, 1);
    const matchesQuery = calls.find((call) => call.table === "matches")!.query;
    assert.equal(matchesQuery.get("season_id"), "eq.season-26");
    assert.equal(matchesQuery.get("matchday_id"), "eq.day-4");
    assert.equal(matchesQuery.get("order"), "scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc");
    assert.equal(calls.find((call) => call.table === "season_teams")!.query.get("select"), "status");
    assert.equal(calls.find((call) => call.table === "teams")!.query.get("id"), "in.(team-a,team-b,team-c)");
    assert.equal(calls.find((call) => call.table === "broadcast_channels")!.query.get("id"), "in.(tv-a,tv-b)");
    assert.ok(calls.every((call) => !call.query.get("select")?.includes("*")));
  });
});

test("an article without matchday has no context and performs zero requests", async () => {
  await withArticleContextTransport(articleContextFixture(), async (calls) => {
    assert.equal(await readPublicArticleMatchdayContext({ season_id: "season-26" }), null);
    assert.equal(calls.length, 0);
  });
});

for (const [table, expectedCalls] of [["matchdays", 1], ["seasons", 2], ["competitions", 3]] as const) {
  test(`missing ${table} degrades to null after ${expectedCalls} reads`, async () => {
    const data = articleContextFixture(); data[table] = [];
    await withArticleContextTransport(data, async (calls) => {
      assert.equal(await readPublicArticleMatchdayContext(fixtureArticle), null);
      assert.equal(calls.length, expectedCalls);
    });
  });
}

test("inactive competition and invalid matchday number preserve null context", async () => {
  const data = articleContextFixture();
  data.competitions[0].is_active = false;
  await withArticleContextTransport(data, async () => assert.equal(await readPublicArticleMatchdayContext(fixtureArticle), null));
  data.competitions[0].is_active = true;
  for (const number of [0, -1, 1.5, null]) {
    data.matchdays[3].number = number;
    await withArticleContextTransport(data, async () => assert.equal(await readPublicArticleMatchdayContext(fixtureArticle), null));
  }
});

test("authoritative parent IDs win over inconsistent article season/competition IDs", async () => {
  await withArticleContextTransport(articleContextFixture(), async (calls) => {
    const context = await readPublicArticleMatchdayContext({ ...fixtureArticle, season_id: "wrong-season", competition_id: "wrong-competition" });
    assert.equal(context?.season.id, "season-26");
    assert.equal(context?.competition.id, "competition-1");
    assert.ok(calls.every((call) => !call.query.toString().includes("wrong-")));
  });
});

for (const [table, field, fallback, expectedTable] of [
  ["matchdays", "season_id", "season-26", "seasons"],
  ["seasons", "competition_id", "competition-1", "competitions"],
] as const) {
  test(`missing ${field} uses article fallback but does not invent list membership`, async () => {
    const data = articleContextFixture();
    data[table].find((row) => row.id === (table === "matchdays" ? "day-4" : "season-26"))![field] = null;
    await withArticleContextTransport(data, async (calls) => {
      assert.equal(await readPublicArticleMatchdayContext(fixtureArticle), null);
      assert.ok(calls.some((call) => call.table === expectedTable && call.query.get("id") === "eq." + fallback));
      assert.ok(!calls.some((call) => ["teams", "broadcast_channels"].includes(call.table)));
    });
  });
}

test("duplicate matchday numbers never redirect the article to a different matchday ID", async () => {
  const data = articleContextFixture();
  data.matchdays.unshift({ ...data.matchdays[3], id: "duplicate-day" });
  await withArticleContextTransport(data, async () => {
    assert.equal((await readPublicArticleMatchdayContext(fixtureArticle))?.matchday.id, "day-4");
    // The old URL round-trip selected the first matching number instead.
    assert.equal((await readArticleMatchdayContext(fixtureArticle))?.matchday.id, "duplicate-day");
  });
});

for (const table of ["teams", "broadcast_channels"] as const) {
  test(`missing ${table} objects leave nullable associations without breaking the context`, async () => {
    const data = articleContextFixture(); data[table] = [];
    await withArticleContextTransport(data, async () => {
      const context = await readPublicArticleMatchdayContext(fixtureArticle);
      assert.ok(context);
      for (const match of context.matchesForMatchday) {
        if (table === "teams") assert.deepEqual([match.homeTeam, match.awayTeam], [null, null]);
        else assert.equal(match.broadcastChannel, null);
      }
    });
  });
}

for (const missing of ["matches", "team-ids", "channel-ids"] as const) {
  test(`no ${missing} skips unnecessary association reads while retaining header/navigation`, async () => {
    const data = articleContextFixture();
    if (missing === "matches") data.matches = [];
    if (missing === "team-ids") data.matches.forEach((match) => { match.home_team_id = null; match.away_team_id = null; });
    if (missing === "channel-ids") data.matches.forEach((match) => { match.broadcast_channel_id = null; });
    await withArticleContextTransport(data, async (calls) => {
      const context = await readPublicArticleMatchdayContext(fixtureArticle);
      assert.ok(context);
      assert.equal(context.matchdays.length, 6);
      assert.equal(context.seasons.length, 2);
      assert.equal(calls.length, missing === "matches" ? 7 : 8);
      if (missing !== "channel-ids") assert.ok(!calls.some((call) => call.table === "teams"));
      if (missing !== "team-ids") assert.ok(!calls.some((call) => call.table === "broadcast_channels"));
    });
  });
}

test("any required read failure degrades to null, without leaking an error to the article", async () => {
  for (const table of allowedTables) {
    await withArticleContextTransport(articleContextFixture(), async () => {
      assert.equal(await readPublicArticleMatchdayContext(fixtureArticle), null, table);
    }, async (call) => call.table === table ? new Response("fixture failure", { status: 503 }) : undefined);
  }
});

test("successive reads remain no-store and expose fresh scores/minutes", async () => {
  const data = articleContextFixture();
  await withArticleContextTransport(data, async (calls) => {
    const first = await readPublicArticleMatchdayContext(fixtureArticle);
    data.matches.find((match) => match.id === "match-a")!.minute = 75;
    data.matches.find((match) => match.id === "match-a")!.home_score = 3;
    const second = await readPublicArticleMatchdayContext(fixtureArticle);
    assert.equal(first?.matchesForMatchday[0].minute, 32);
    assert.equal(second?.matchesForMatchday[0].minute, 75);
    assert.equal(second?.matchesForMatchday[0].home_score, 3);
    assert.equal(calls.length, 18);
    assert.ok(calls.every((call) => call.cache === "no-store"));
  });
});

test("independent context reads and team/channel reads start in parallel", async () => {
  let releaseContext!: () => void, releaseAssociations!: () => void;
  const contextGate = new Promise<void>((resolve) => { releaseContext = resolve; });
  const associationGate = new Promise<void>((resolve) => { releaseAssociations = resolve; });
  await withArticleContextTransport(articleContextFixture(), async (calls) => {
    const pending = readPublicArticleMatchdayContext(fixtureArticle);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(calls.length, 7); // all four independent requests are waiting at the gate
      releaseContext();
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(calls.slice(7).map((call) => call.table), ["teams", "broadcast_channels"]);
    } finally { releaseContext(); releaseAssociations(); await pending; }
  }, async (call) => {
    if (["teams", "broadcast_channels"].includes(call.table)) await associationGate;
    else if (!call.query.has("id")) await contextGate;
  });
});

test("article integration retains the UI and delegates only to the minimal reader", () => {
  const page = source("app/noticias/[slug]/page.tsx");
  assert.doesNotMatch(page, /getPublicMatchdayDiagnostic|async function readArticleMatchdayContext/);
  assert.match(page, /readPublicArticleMatchdayContext\(article\)/);
  for (const name of ["classificationHref", "currentCompetitionMenuItem", "seasonOptions", "matchdayLegNavigation", "selectedMatchdayDateContext", "PublicMatchStrip"])
    assert.ok(page.includes(name), name);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  const reader = source("lib/public-article-matchday-context.ts");
  assert.doesNotMatch(reader, /getPublicMatchdayDiagnostic|unstable_cache|revalidate|fetch\(/);
  for (const table of forbiddenTables) assert.ok(!reader.includes(table), table);
});

const base = process.env.JORNADA_EGRESS_B1_BASE;
test("B1 release diff preserves article markup/CSS, global helpers and every other public/editorial area", { skip: !base }, () => {
  assert.match(base!, /^[a-f0-9]{40}$/);
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).replace(/\r\n/g, "\n");
  const pagePath = "app/noticias/[slug]/page.tsx";
  const old = git("show", base! + ":" + pagePath), current = source(pagePath);
  assert.equal(current.slice(current.indexOf("export default async function NewsArticlePage")),
    old.slice(old.indexOf("export default async function NewsArticlePage")).replace("readArticleMatchdayContext(article)", "readPublicArticleMatchdayContext(article)"));
  assert.equal(current.slice(current.indexOf("export const dynamic"), current.indexOf("async function readArticle(slug")),
    old.slice(old.indexOf("export const dynamic"), old.indexOf("async function readArticle(slug")).replaceAll("PublicSeasonMatch[]", "PublicArticleMatch[]"));
  assert.equal(current.slice(current.indexOf("async function readArticle(slug"), current.indexOf("export default async function")),
    old.slice(old.indexOf("async function readArticle(slug"), old.indexOf("async function readArticleMatchdayContext")));
  const changed = [...git("diff", "--name-only", base!, "--").trim().split("\n"), ...git("ls-files", "--others", "--exclude-standard").trim().split("\n")].filter(Boolean);
  for (const file of changed) assert.ok(file === pagePath || file.startsWith("lib/public-article-matchday-context")
    || file.startsWith("lib/__fixtures__/public-article-matchday-context/") || file.startsWith("docs/egress-postgrest-noticia-b1-")
    || file === "lib/public-broadcast-channel-logo.test.ts", file);
  const legacy = source("lib/__fixtures__/public-article-matchday-context/legacy-reader.ts");
  assert.equal(legacy.slice(legacy.indexOf("async function readArticleMatchdayContext")).trim(),
    old.slice(old.indexOf("async function readArticleMatchdayContext"), old.indexOf("export default async function")).trim());
});
