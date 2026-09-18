import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMesaProductionIntents } from "./newsroom-mesa-production-intents-contract";
import { mesaProductionIntentsService } from "./newsroom-mesa-production-intents-service-internal";

const fixture = JSON.parse(readFileSync(".ci/mesa-intents-sql/intent-plan.fixture.json", "utf8"));
const plan = parseMesaProductionIntents(fixture.plan)!;
assert.ok(plan);
const packageId: string = fixture.manifest.packageId;
const newId = plan.outputs.find((output) => output.kind === "new")!.outputId;
const nullDayId = plan.outputs.find((output) => output.kind === "existing")!.target!.editorialArticleId;

function service(result: readonly unknown[]) {
  const calls: unknown[] = [];
  const instance = mesaProductionIntentsService({
    get: async () => { throw new Error("unexpected-read"); },
    post: async (name, args) => { calls.push({ name, args }); return result; },
  });
  return { instance, calls };
}
test("Latest opt-in passes only canonical IDs and the verified package, never display content", async () => {
  const { instance, calls } = service([{ result: { action: "placed", articleCount: 1, matchdayCount: 1 } }]);
  const actual = await instance.placeLatest({ plan, packageId, articleIds: [newId] });
  assert.deepEqual(actual, { action: "placed", articleCount: 1, matchdayCount: 1 });
  assert.deepEqual(calls, [{ name: "newsroom_place_mesa_intent_latest_v1", args: {
    p_dossier_id: plan.dossierId, p_package_id: packageId, p_article_ids: [newId],
  } }]);
});
test("Latest completed replay is accepted without pretending to perform another write", async () => {
  const { instance } = service([{ result: { action: "reused", articleCount: 1, matchdayCount: 1 } }]);
  assert.equal((await instance.placeLatest({ plan, packageId, articleIds: [newId] })).action, "reused");
});
for (const [name, ids] of [
  ["empty", []], ["duplicate", [newId, newId]], ["malformed ID", ["wrong"]],
  ["outside plan", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]], ["null matchday", [nullDayId]],
] as const) {
  test(`Latest rejects ${name} before transport`, async () => {
    const { instance, calls } = service([]);
    await assert.rejects(instance.placeLatest({ plan, packageId, articleIds: ids }), /mesa-intent-latest-input-invalid/);
    assert.equal(calls.length, 0);
  });
}
test("Latest rejects an invalid package before transport", async () => {
  const { instance, calls } = service([]);
  await assert.rejects(instance.placeLatest({ plan, packageId: "wrong", articleIds: [newId] }), /mesa-intent-latest-input-invalid/);
  assert.equal(calls.length, 0);
});
for (const result of [null, {}, { action: "created", articleCount: 1, matchdayCount: 1 },
  { action: "placed", articleCount: 2, matchdayCount: 1 }, { action: "placed", articleCount: 1, matchdayCount: 0 },
  { action: "placed", articleCount: 1, matchdayCount: 2 }]) {
  test(`Latest rejects malformed RPC result ${JSON.stringify(result)}`, async () => {
    const { instance } = service([{ result }]);
    await assert.rejects(instance.placeLatest({ plan, packageId, articleIds: [newId] }), /mesa-intent-latest-result-invalid/);
  });
}
