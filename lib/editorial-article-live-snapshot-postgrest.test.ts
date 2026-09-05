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
  const runtime = source.slice(
    source.indexOf("export async function syncEditorialArticleLiveSnapshots"),
  );
  assert.match(runtime, /rpc\/sync_editorial_article_live_snapshots_v15/);
  assert.doesNotMatch(runtime, /carryover_snapshot|Promise\.all|method:\s*"PATCH"/);
});
