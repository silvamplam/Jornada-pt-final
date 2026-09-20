import assert from "node:assert/strict";
import test from "node:test";

import {
  inferTrustedSourceChannelIds,
  mergeTrustedSourceChannelIds,
} from "./match-video-summary-sources";

test("TVI built-in e VSPORTS histórica coexistem sem duplicação", () => {
  assert.deepEqual(
    mergeTrustedSourceChannelIds(
      ["UC5lg8zKcnJ1rnxR6lPgD1ug"],
      ["UC-vsports", "UC5lg8zKcnJ1rnxR6lPgD1ug"],
    ),
    ["UC5lg8zKcnJ1rnxR6lPgD1ug", "UC-vsports"],
  );
});

test("só infere canais históricos com frequência e dominância seguras", () => {
  assert.deepEqual(inferTrustedSourceChannelIds(["UC-isolado"]), []);
  assert.deepEqual(
    inferTrustedSourceChannelIds(["UC-vsports", "UC-vsports", "UC-vsports", "UC-outro"]),
    ["UC-vsports"],
  );
  assert.deepEqual(
    mergeTrustedSourceChannelIds(
      ["UC-tvi"],
      inferTrustedSourceChannelIds(["UC-vsports", "UC-vsports", "UC-vsports", "UC-isolado"]),
    ),
    ["UC-tvi", "UC-vsports"],
  );
});
