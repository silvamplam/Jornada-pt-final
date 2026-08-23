import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("carryover evita JSON dentro da gramática lógica or do PostgREST", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./editorial-article-live-snapshot-sync.ts", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(source, /carryover_snapshot\.cs\./);
  assert.doesNotMatch(source, /&or=\(/);
  assert.match(source, /&carryover_snapshot=cs\./);
  assert.match(source, /Promise\.all\(filters\.map/);
  assert.match(source, /const seen = new Set<string>\(\)/);
});