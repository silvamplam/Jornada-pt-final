import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveManagedMatchdayEditorialDesk } from "@/lib/editorial-managed-desk-entry";

const entryPage = readFileSync(
  "app/admin/editorial/jornada/page.tsx",
  "utf8",
);

test("entrada resolve exclusivamente matchday_editorial_desk_control managed", () => {
  assert.match(entryPage, /matchday_editorial_desk_control\?select=matchday_id&is_managed=eq\.true&limit=2/);
  assert.doesNotMatch(entryPage, /countries\?|competitions\?|seasons\?|matchdays\?/);
  assert.doesNotMatch(entryPage, /competition_id|season_id|data-matchday-selector/);
});

test("uma única Mesa managed abre diretamente o workspace operacional", () => {
  assert.deepEqual(
    resolveManagedMatchdayEditorialDesk([{ matchday_id: "desk-1" }]),
    { kind: "single", matchdayId: "desk-1" },
  );
  assert.match(
    entryPage,
    /redirect\([\s\S]*\/admin\/editorial\/jornada\/\$\{encodeURIComponent\(resolution\.matchdayId\)\}\/organizar/,
  );
});

test("zero ou múltiplas Mesas managed não escolhem uma Jornada", () => {
  assert.deepEqual(resolveManagedMatchdayEditorialDesk([]), { kind: "none" });
  assert.deepEqual(
    resolveManagedMatchdayEditorialDesk([
      { matchday_id: "desk-1" },
      { matchday_id: "desk-2" },
    ]),
    { kind: "multiple", count: 2 },
  );
});
