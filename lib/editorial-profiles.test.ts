import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EDITORIAL_PROFILE_KEYS,
  EDITORIAL_PROFILES,
  editorialProfile,
  editorialProfileZone,
  isEditorialProfileKey,
} from "@/lib/editorial-profiles";

test("liga_portugal_v1 define o contrato editorial temático", () => {
  assert.deepEqual(EDITORIAL_PROFILE_KEYS, ["liga_portugal_v1"]);
  assert.deepEqual(Object.keys(EDITORIAL_PROFILES), ["liga_portugal_v1"]);

  const profile = editorialProfile("liga_portugal_v1");

  assert.equal(profile.displayName, "Temático · Liga Portugal");
  assert.equal(profile.competitionSlug, "liga-portugal");
  assert.equal(profile.zones.length, 5);
  assert.deepEqual(
    profile.zones.map((zone) => zone.key),
    [
      "benfica",
      "sporting",
      "fc_porto",
      "other_liga_clubs",
      "outside_liga_other",
    ],
  );
  assert.deepEqual(
    profile.zones.map((zone) => zone.label),
    ["Benfica", "Sporting", "FC Porto", "Outros clubes", "Fora da Liga / outros"],
  );
  assert.deepEqual(
    profile.zones.map((zone) => zone.capacity),
    [6, 5, 5, 6, 5],
  );
  assert.equal(
    profile.zones.reduce((total, zone) => total + zone.capacity, 0),
    27,
  );
  assert.deepEqual(
    profile.zones.map((zone) => zone.visualFamily),
    [
      "six_news",
      "five_news_balanced",
      "five_news_balanced",
      "six_news",
      "five_news_secondary",
    ],
  );
  assert.deepEqual(
    profile.zones.map((zone) => zone.placementMode),
    Array(profile.zones.length).fill("automatic_actuality"),
  );
  assert.equal(
    new Set(profile.zones.map((zone) => zone.key)).size,
    profile.zones.length,
  );
});

test("os lookups só aceitam o perfil e as zonas declarados", () => {
  assert.equal(isEditorialProfileKey("liga_portugal_v1"), true);
  assert.equal(isEditorialProfileKey("unknown_profile"), false);
  assert.equal(editorialProfile("unknown_profile"), null);

  const benfica = editorialProfileZone("liga_portugal_v1", "benfica");

  assert.ok(benfica);
  assert.equal(benfica.key, "benfica");
  assert.equal(editorialProfileZone("liga_portugal_v1", "unknown_zone"), null);
});
