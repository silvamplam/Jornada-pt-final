import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  mesaProductionIntentSlots,
  parseMesaProductionIntents,
} from "../../lib/redacao-automatica/newsroom-mesa-production-intents-contract";

const path = process.argv[2];
assert.ok(path, "grouping v2 frozen plan path missing");
const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
const plan = parseMesaProductionIntents(raw);
assert.ok(plan, "materialized v2 plan must be accepted by the canonical v1 parser");
assert.equal(plan.contractVersion, 1);
assert.equal(plan.contexts.length, 1);
assert.equal(plan.contexts[0].kind, "selection");
assert.equal(plan.totals.newArticles, 10);
assert.equal(plan.totals.reviews, 2);
assert.equal(plan.outputs.length, 12);
assert.equal(mesaProductionIntentSlots(plan).length, 12);
for (const output of plan.outputs) {
  if (output.kind === "new") {
    assert.ok(output.focusSourceIds?.length, `${output.slot} lost its editorial starting point`);
  }
}
console.log("PASS: v2 materialization is a canonical v1 frozen plan");
