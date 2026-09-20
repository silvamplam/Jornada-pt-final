import assert from "node:assert/strict";
import test from "node:test";

import { mergeTrustedSourceChannelIds } from "./match-video-summary-sources";

test("TVI built-in e VSPORTS histórica coexistem sem duplicação", () => {
  assert.deepEqual(
    mergeTrustedSourceChannelIds(
      ["UC5lg8zKcnJ1rnxR6lPgD1ug"],
      ["UC-vsports", "UC5lg8zKcnJ1rnxR6lPgD1ug"],
    ),
    ["UC5lg8zKcnJ1rnxR6lPgD1ug", "UC-vsports"],
  );
});
