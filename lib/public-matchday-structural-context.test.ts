import { nextDataCacheFixture } from "./__fixtures__/public-matchday-structure/next-cache";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createPublicMatchdayStructuralReaders, readPublicTeamMetadata, readPublicBroadcastChannelMetadata,
  readPublicCompetitionSeasons } from "./public-matchday-structural-context";
import { getPublicMatchdayDiagnostic, type PublicMatchdayContext } from "./public-matchday";
import { getPublicCompetitionMenu } from "./public-competition-menu";
import { buildAccumulatedClassification } from "./classification";
import { buildPublicMatchdayLegNavigation } from "./public-matchday-leg-navigation";
import { articleContextFixture, withArticleContextTransport, type FixtureCall } from "./__fixtures__/public-article-matchday-context/transport";
import { baseSource, loadPageAtBaseOrHead, presentationTree, pageFixture, interceptPhysicalRead, PAGE, B2_BASE } from "./__fixtures__/public-matchday-structure/page";

const params = { competitionSlug: "liga-fixture", seasonLabel: "2026-27", matchdayNumber: 4 };
const pagePath = "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx";
const source = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const structuralTables = ["competitions", "seasons", "matchdays", "season_teams", "teams", "broadcast_channels"];
const counts = (calls: FixtureCall[]) => ({ total: calls.length,
  structural: calls.filter((call) => structuralTables.includes(call.table)).length,
  live: calls.filter((call) => call.table === "matches").length,
  editorial: calls.filter((call) => !structuralTables.includes(call.table) && call.table !== "matches").length });

async function renderReaders(cached = true, options = params) {
  const structure = cached ? createPublicMatchdayStructuralReaders() : undefined;
  const result = await getPublicMatchdayDiagnostic(options, structure?.diagnostic);
  const menu = result.context ? await getPublicCompetitionMenu(structure?.menu) : [];
  const context = result.context;
  return { ...result, menu,
    classification: context ? classification(context) : [],
    navigation: context ? buildPublicMatchdayLegNavigation(context.matchdays, context.activeParticipantCount, context.matchday.id) : null };
}
function classification(context: PublicMatchdayContext) {
  return buildAccumulatedClassification({ participants: context.participants, matches: context.matchesForSeason,
    matchdays: context.matchdays, selectedMatchday: context.matchday });
}

for (const historical of [false, true]) {
  test(`actual base page vs B2 cold/warm element tree: ${historical ? "historical dynamic zones" : "published reference"}`, async (t) => {
    try { baseSource(PAGE); } catch { t.skip(`Requires Git history at ${B2_BASE}`); return; }
    const cache = nextDataCacheFixture(), data = pageFixture(historical);
    const basePage = loadPageAtBaseOrHead(true), currentPage = loadPageAtBaseOrHead(false);
    const props = { params: Promise.resolve({ ...params, matchdayNumber: "4" }) };
    await withArticleContextTransport(data, async (calls) => {
      const base = presentationTree(await basePage(props));
      const before = calls.splice(0);
      const cold = presentationTree(await cache.request(() => currentPage(props)));
      const coldCalls = calls.splice(0);
      const warm = presentationTree(await cache.request(() => currentPage(props)));
      assert.deepEqual(cold, base);
      assert.deepEqual(warm, base);
      assert.equal(coldCalls.length, before.length - 1);
      assert.equal(calls.length, before.length - 5);
      assert.equal(counts(before).editorial, counts(calls).editorial);
      if (historical) {
        assert.ok(calls.some((call) => call.table === "matchday_historical_composition_zones"));
        assert.match(JSON.stringify(warm), /Arquivo 0/);
        data.matchday_historical_composition_zone_items[0].title_snapshot = "Arquivo atualizado sem TTL";
        const changed = presentationTree(await cache.request(() => currentPage(props)));
        assert.match(JSON.stringify(changed), /Arquivo atualizado sem TTL/);
      }
      console.log(JSON.stringify({ scenario: historical ? "actual page historical" : "actual page reference", before: counts(before),
        cold: counts(coldCalls), warm: counts(calls.slice(0, before.length - 5)),
        requestReductionPercent: 5 / before.length * 100, excludes: "nested advertisement component reads" }));
    }, async (call) => interceptPhysicalRead(call.table));
  });
}

for (const rich of [false, true]) {
  test(`real Next cache across force-dynamic requests: ${rich ? "composition" : "simple"} context plus menu`, async () => {
    const cache = nextDataCacheFixture();
    await withArticleContextTransport(articleContextFixture(rich), async (calls) => {
      const base = await renderReaders(false);
      assert.ok(base.context);
      const before = calls.splice(0);
      const cold = await cache.request(() => renderReaders());
      const coldCalls = calls.splice(0);
      const warm = await cache.request(() => renderReaders());
      assert.deepEqual(cold, base);
      assert.deepEqual(warm, base);
      assert.equal(coldCalls.length, before.length - 1); // Fresh competition catalogue reused by menu.
      assert.equal(calls.length, before.length - 5); // + four persistent metadata entries.
      assert.equal(counts(calls).live, 2);
      assert.equal(counts(calls).editorial, counts(before).editorial);
      assert.equal(counts(calls).structural, 3); // competition, matchdays, participants
      assert.equal(cache.entries.size, 4);
      assert.ok([...before, ...coldCalls, ...calls].every((call) => call.cache === "no-store"));
      console.log(JSON.stringify({ scenario: rich ? "composition + menu" : "simple + menu", before: counts(before),
        cold: counts(coldCalls), warm: counts(calls), requestReductionPercent: (1 - calls.length / before.length) * 100 }));
    });
  });
}

test("warm metadata preserves immediate score, minute, status, clock, classification and editorial changes", async () => {
  const cache = nextDataCacheFixture(), data = articleContextFixture();
  await withArticleContextTransport(data, async (calls) => {
    const first = await cache.request(() => renderReaders());
    const firstEditorial = calls.filter((call) => !structuralTables.includes(call.table) && call.table !== "matches").map((call) => call.table).sort();
    calls.length = 0;
    Object.assign(data.matches.find((row) => row.id === "match-a")!, { home_score: 5, away_score: 4, minute: 90,
      status: "finished", live_base_minute: 90, live_started_at: null, is_clock_running: false });
    data.matchday_editorials[0].title = "Publicação imediatamente visível";
    data.matchday_reference_composition_items[0].title_snapshot = "Apply atualizado";
    data.matchday_editorial_desk_control[0].revision = 2;
    const second = await cache.request(() => renderReaders());
    assert.ok(second.context);
    const match = second.context.matchesForMatchday.find((row) => row.id === "match-a")!;
    assert.deepEqual([match.home_score, match.away_score, match.minute, match.status, match.live_base_minute,
      match.live_started_at, match.is_clock_running], [5, 4, 90, "finished", 90, null, false]);
    assert.notDeepEqual(second.classification, first.classification);
    assert.equal(second.context.editorial?.title, "Publicação imediatamente visível");
    assert.equal(second.context.referenceCompositionItems[0].title_snapshot, "Apply atualizado");
    assert.deepEqual(calls.filter((call) => !structuralTables.includes(call.table) && call.table !== "matches").map((call) => call.table).sort(), firstEditorial);
    assert.equal(counts(calls).structural, 3);
    const fresh = await renderReaders(false);
    assert.deepEqual(second, fresh);
  });
});

test("metadata TTL uses real Next stale-while-revalidate; fresh response follows revalidation", async () => {
  const cache = nextDataCacheFixture(), data = articleContextFixture();
  await withArticleContextTransport(data, async () => {
    const first = await cache.request(() => renderReaders());
    data.teams[0].logo_url = "/new-team.svg";
    data.broadcast_channels[0].name = "New TV";
    data.seasons.find((row) => row.id === "season-26")!.starts_on = "2026-08-01";
    cache.advance(299);
    assert.deepEqual(await cache.request(() => renderReaders()), first);
    cache.advance(2);
    assert.deepEqual(await cache.request(() => renderReaders()), first); // stale returned, refresh drained
    const seasonsRefreshed = await cache.request(() => renderReaders());
    assert.equal(seasonsRefreshed.context?.season.starts_on, "2026-08-01");
    assert.equal(seasonsRefreshed.context?.matchesForMatchday[0].homeTeam?.logo_url, "/fixture-a.svg");
    cache.advance(300);
    await cache.request(() => renderReaders());
    const metadataRefreshed = await cache.request(() => renderReaders());
    assert.equal(metadataRefreshed.context?.matchesForMatchday[0].homeTeam?.logo_url, "/new-team.svg");
    assert.equal(metadataRefreshed.context?.matchesForMatchday[0].broadcastChannel?.name, "New TV");
  });
});

test("activation, matchday metadata and participant membership remain fresh with warm cache", async () => {
  const cache = nextDataCacheFixture(), data = articleContextFixture();
  await withArticleContextTransport(data, async () => {
    await cache.request(() => renderReaders());
    data.season_teams[0].status = "inactive";
    data.season_teams[1].manual_override = false;
    data.matchdays[3].status = "finished";
    data.matchdays[3].label = "Nova data/contexto";
    const next = await cache.request(() => renderReaders());
    assert.equal(next.context?.activeParticipantCount, 3);
    assert.equal(next.context?.participants.length, 4);
    assert.equal(next.context?.matchday.status, "finished");
    assert.equal(next.context?.matchday.label, "Nova data/contexto");
    data.competitions[0].is_active = false;
    const inactive = await cache.request(() => renderReaders());
    assert.equal(inactive.context, null);
    assert.equal(inactive.diagnostic.step, "competition-inactive");
    data.competitions[0].is_active = true;
    assert.ok((await cache.request(() => renderReaders())).context);
  });
});

test("teams/channels use sorted unique scoped keys and empty ID sets need no query", async () => {
  const cache = nextDataCacheFixture();
  await withArticleContextTransport(articleContextFixture(), async (calls) => {
    await cache.request(async () => {
      await readPublicTeamMetadata(["team-b", "", "team-a", "team-b"]);
      await readPublicBroadcastChannelMetadata(["tv-b", "tv-a", "tv-a"]);
    });
    assert.equal(calls[0].query.get("id"), "in.(team-a,team-b)");
    assert.equal(calls[1].query.get("id"), "in.(tv-a,tv-b)");
    await cache.request(async () => {
      await readPublicTeamMetadata(["team-a", "team-b"]);
      await readPublicBroadcastChannelMetadata(["tv-a", "tv-b"]);
      assert.deepEqual(await readPublicTeamMetadata([]), []);
      assert.deepEqual(await readPublicBroadcastChannelMetadata([""]), []);
    });
    assert.equal(calls.length, 2);
  });
});

for (const table of ["seasons", "teams", "broadcast_channels"] as const) {
  for (const failure of ["500", "timeout", "malformed", "missing"] as const) {
    test(`${table}: ${failure} is not cached as []/null; next request recovers`, async () => {
      const cache = nextDataCacheFixture();
      let failing = true;
      await withArticleContextTransport(articleContextFixture(), async (calls) => {
        const read: () => Promise<{ id: string }[]> = () => table === "seasons" ? readPublicCompetitionSeasons("competition-1", "2026-27")
          : table === "teams" ? readPublicTeamMetadata(["team-a"]) : readPublicBroadcastChannelMetadata(["tv-a"]);
        if (failure === "missing") assert.deepEqual(await cache.request(read), []);
        else await assert.rejects(cache.request(read));
        assert.equal(cache.entries.size, 0);
        failing = false;
        assert.ok((await cache.request(read)).length);
        assert.equal(calls.length, 2);
        assert.equal(cache.entries.size, 1);
      }, async (call) => {
        if (!failing || call.table !== table) return;
        if (failure === "500") return new Response("temporary failure", { status: 500 });
        if (failure === "timeout") throw new Error("synthetic timeout");
        return Response.json(failure === "missing" ? [] : [{ id: "malformed" }]);
      });
    });
  }
}

test("partial missing team/channel sets remain degradable and do not cache absence", async () => {
  const cache = nextDataCacheFixture(), data = articleContextFixture();
  await withArticleContextTransport(data, async () => {
    const team = data.teams.shift()!, channel = data.broadcast_channels.shift()!;
    const first = await cache.request(() => renderReaders());
    assert.equal(first.context?.matchesForMatchday[0].homeTeam, null);
    assert.equal(first.context?.matchesForMatchday[0].broadcastChannel, null);
    assert.equal(cache.entries.size, 2); // only the two season lists
    data.teams.push(team); data.broadcast_channels.push(channel);
    const recovered = await cache.request(() => renderReaders());
    assert.ok(recovered.context?.matchesForMatchday[0].homeTeam);
    assert.ok(recovered.context?.matchesForMatchday[0].broadcastChannel);
  });
});

for (const [change, step] of [["competition", "competition-not-found"], ["season", "season-not-found"], ["matchday", "matchday-not-found"]]) {
  test(`missing ${change} preserves diagnostic and can recover immediately`, async () => {
    const cache = nextDataCacheFixture(), data = articleContextFixture();
    const table = change === "competition" ? "competitions" : change === "season" ? "seasons" : "matchdays";
    const rows = data[table]; data[table] = [];
    await withArticleContextTransport(data, async () => {
      assert.equal((await cache.request(() => renderReaders())).diagnostic.step, step);
      data[table] = rows;
      assert.ok((await cache.request(() => renderReaders())).context);
    });
  });
}

test("new season absent from a warm nonempty list is looked up fresh", async () => {
  const cache = nextDataCacheFixture(), data = articleContextFixture();
  await withArticleContextTransport(data, async () => {
    await cache.request(() => renderReaders());
    data.seasons.push({ ...data.seasons[1], id: "new-season", label: "2027/28" });
    const rows = await cache.request(() => readPublicCompetitionSeasons("competition-1", "2027-28"));
    assert.ok(rows.some((row) => row.id === "new-season"));
  });
});

test("a failed background revalidation retains only the last good metadata and retries", async () => {
  const cache = nextDataCacheFixture(), data = articleContextFixture();
  let fail = false;
  await withArticleContextTransport(data, async () => {
    const initial = await cache.request(() => readPublicTeamMetadata(["team-a"]));
    cache.advance(601);
    fail = true;
    const savedError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => { errors.push(args); };
    try { assert.deepEqual(await cache.request(() => readPublicTeamMetadata(["team-a"])), initial); }
    finally { console.error = savedError; }
    assert.equal(errors.length, 1);
    fail = false;
    data.teams[0].public_name = "Nome corrigido";
    await cache.request(() => readPublicTeamMetadata(["team-a"]));
    assert.equal((await cache.request(() => readPublicTeamMetadata(["team-a"])))[0].public_name, "Nome corrigido");
  }, async (call) => fail && call.table === "teams" ? new Response("temporary failure", { status: 500 }) : undefined);
});

test("other diagnostic/menu consumers keep the original fresh default even after cache warming", async () => {
  const cache = nextDataCacheFixture();
  await withArticleContextTransport(articleContextFixture(), async (calls) => {
    await cache.request(() => renderReaders());
    calls.length = 0;
    await renderReaders(false);
    assert.equal(counts(calls).structural, 8);
    assert.equal(calls.filter((call) => call.table === "competitions").length, 2);
    assert.equal(cache.entries.size, 4);
  });
});

test("base page differs only in reader wiring; helpers and all other production surfaces are unchanged", (t) => {
  let base: string;
  try { base = baseSource(PAGE).replace(/\r\n/g, "\n"); } catch { t.skip(`Requires Git history at ${B2_BASE}`); return; }
  const unwired = source(PAGE)
    .replace('import { createPublicMatchdayStructuralReaders } from "@/lib/public-matchday-structural-context";\n', "")
    .replace("  const structure = createPublicMatchdayStructuralReaders();\n", "")
    .replace("}, structure.diagnostic);", "});")
    .replace("getPublicCompetitionMenu(structure.menu)", "getPublicCompetitionMenu()");
  assert.equal(unwired, base);
  const changed = execFileSync("git", ["diff", "--name-only", B2_BASE], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const allowed = [PAGE, "lib/public-matchday.ts", "lib/public-competition-menu.ts", "lib/public-matchday-structural-context.ts",
    "lib/public-matchday-structural-context.test.ts", "docs/egress-postgrest-jornada-b2-20260925.md"];
  for (const path of changed) assert.ok(allowed.includes(path) || path.startsWith("lib/__fixtures__/public-matchday-structure/"), path);
});

test("only target page opts into structural cache; global helpers, live and editorial stay no-store", () => {
  const page = source(pagePath), cache = source("lib/public-matchday-structural-context.ts");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /getPublicCompetitionMenu\(structure.menu\)/);
  assert.match(page, /\}, structure.diagnostic\)/);
  assert.doesNotMatch(cache, /matches\?select|matchday_\w+\?select|editorial_contents\?select/);
  assert.doesNotMatch(cache.slice(cache.indexOf("const cachedSeasons"), cache.indexOf("function sortedIds")), /catch\s*\(/);
  assert.match(source("lib/supabase.ts"), /cache: "no-store"/);
  const consumers = execFileSync("rg", ["-l", "public-matchday-structural-context", "app"], { encoding: "utf8" }).trim().split(/\r?\n/).map((path) => path.replace(/\\/g, "/"));
  assert.deepEqual(consumers, [pagePath]);
});
