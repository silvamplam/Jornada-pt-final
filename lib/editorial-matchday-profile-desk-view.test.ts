import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchdayEditorialProfileDeskViewStorageKey,
  parseMatchdayEditorialProfileDeskViewPreference,
} from "@/lib/editorial-matchday-profile-desk-view";

const zones = [
  "benfica",
  "sporting",
  "fc_porto",
  "other_liga_clubs",
  "outside_liga_other",
] as const;

test("primeira visita mantém o default focus da primeira zona", () => {
  assert.equal(
    parseMatchdayEditorialProfileDeskViewPreference(null, zones),
    null,
  );

  const client = readFileSync(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    "utf8",
  );

  assert.match(client, /useState<MatchdayEditorialProfileDeskView>\("focus"\)/u);
  assert.match(client, /useState<EditorialProfileZoneKey>\(profile\.zones\[0\]\.key\)/u);
});

test("focus, full e a zona em foco sobrevivem a refresh", () => {
  assert.deepEqual(
    parseMatchdayEditorialProfileDeskViewPreference(
      JSON.stringify({ view: "focus", focusZone: "sporting" }),
      zones,
    ),
    { view: "focus", focusZone: "sporting" },
  );

  assert.deepEqual(
    parseMatchdayEditorialProfileDeskViewPreference(
      JSON.stringify({ view: "full", focusZone: "fc_porto" }),
      zones,
    ),
    { view: "full", focusZone: "fc_porto" },
  );
});

test("preferência inválida não substitui o default", () => {
  assert.equal(
    parseMatchdayEditorialProfileDeskViewPreference(
      JSON.stringify({ view: "focus", focusZone: "unknown" }),
      zones,
    ),
    null,
  );
});

test("cada Jornada e perfil têm uma chave de sessão própria", () => {
  assert.notEqual(
    matchdayEditorialProfileDeskViewStorageKey("matchday-a", "profile"),
    matchdayEditorialProfileDeskViewStorageKey("matchday-b", "profile"),
  );

  assert.notEqual(
    matchdayEditorialProfileDeskViewStorageKey("matchday-a", "profile-a"),
    matchdayEditorialProfileDeskViewStorageKey("matchday-a", "profile-b"),
  );
});

test("alinhamento de focus espera pela restauração da preferência", () => {
  const client = readFileSync(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    "utf8",
  );

  assert.match(
    client,
    /if \(!deskViewPreferenceReady \|\| deskView !== "focus"\)/u,
  );
  assert.match(client, /window\.sessionStorage/u);
  assert.doesNotMatch(client, /localStorage/u);
});
