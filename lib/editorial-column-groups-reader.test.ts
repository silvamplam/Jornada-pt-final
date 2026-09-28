import assert from "node:assert/strict";
import test from "node:test";
import { readHistoricalColumnGroups } from "./editorial-column-groups-reader";

test("historical group reader: ordered members, deploy-before-migration fallback and visible failures", async (t) => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  t.after(() => {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  });
  const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let body: unknown = [{ id: id(10), public_title: "Mercado", is_enabled: false,
    members: [5, 2, 1, 4, 3].map(n => ({ zone_id: id(n), member_position: n })) }];
  let status = 200;
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(options.method ?? "GET", "GET");
    calls.push(url);
    return Response.json(body, { status });
  });
  assert.deepEqual(await readHistoricalColumnGroups(id(20)), [{ id: id(10), publicTitle: "Mercado", enabled: false, zoneIds: [1, 2, 3, 4, 5].map(id) }]);
  assert.ok(calls[0].includes(`composition_id=eq.${id(20)}`));
  body = { code: "PGRST205", message: "Could not find public.matchday_historical_column_groups" }; status = 404;
  assert.deepEqual(await readHistoricalColumnGroups(id(20)), []);
  for (const error of [{ code: "42501", message: "permission denied for matchday_historical_column_groups" },
    { code: "PGRST205", message: "Could not find a_different_table" }, { code: "XX000", message: "unexpected failure" }]) {
    body = error;
    await assert.rejects(readHistoricalColumnGroups(id(20)), new RegExp(error.code));
  }
  status = 200; body = [{ id: id(10), public_title: "Mercado", is_enabled: false, members: [] }];
  await assert.rejects(readHistoricalColumnGroups(id(20)), /shape-invalid/);
});
