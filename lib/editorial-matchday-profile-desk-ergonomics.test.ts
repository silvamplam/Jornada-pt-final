import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const state = readFileSync(
  "lib/editorial-matchday-live-layout-desk-state.ts",
  "utf8",
);

test("posição manual legacy deixou de ser semântica visível", () => {
  assert.doesNotMatch(client, /Fixar nesta posição|Proteger na zona|Devolver ao automático/);
  assert.match(client, /Posição livre/);
});

test("redução de layout desaloja apenas o overflow sem compactar", () => {
  assert.match(state, /placement\.slotPosition > capacity/);
  assert.match(state, /displacedBankItemIds: uniqueSorted/);
  assert.doesNotMatch(state, /zone-layout-shrink-occupied/);
  assert.doesNotMatch(state, /compactMatchdayEditorialProfileManualOverrides/);
});

test("erro físico é explícito e não existe estado paralelo de erro legacy", () => {
  assert.match(client, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(client, /zoneLayoutError|setZoneLayoutError/);
  assert.doesNotMatch(client, /draftVacantZoneSlots/);
});

test("feedback global fica antes dos controlos sem bloqueio legacy", () => {
  const message = client.indexOf("{message ?");
  const controls = client.indexOf('className="thematic-global-tools"');
  assert.ok(message >= 0 && controls > message);
  assert.doesNotMatch(client, /data-legacy-apply-blocked="true"/);
  assert.match(client, /aria-live=\{applyState === "error" \? "assertive" : "polite"\}/);
});

test("menu de candidata aberto fica visível dentro do painel com scroll", () => {
  assert.match(
    client,
    /onToggle=\{\(event\) => \{\s*if \(event\.currentTarget\.open\) \{\s*event\.currentTarget\.querySelector<HTMLElement>\("\.thematic-card-actions"\)\?\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\);/,
  );
});
