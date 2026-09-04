import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientPath =
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx";
const routePath =
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts";
const initialHead = "b8a42719341a5652c5ad817c76fcd3b801e0c884";
const source = readFileSync(clientPath, "utf8");
const routeSource = readFileSync(routePath, "utf8");
const deskStateSource = readFileSync(
  "lib/editorial-matchday-live-layout-desk-state.ts",
  "utf8",
);

function agendaTvBlock(value: string) {
  const start = value.indexOf("function MatchdayAgendaTvSyncPanel");
  const end = value.indexOf(
    "export default function MatchdayEditorialThematicDeskClient",
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return value.slice(start, end);
}

function agendaTvToolBlock(value: string) {
  const start = value.indexOf(
    '<details className="thematic-global-tool thematic-agenda-tv-tool">',
  );
  const end = value.indexOf(
    '<div className="thematic-global-actions">',
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return value.slice(start, end);
}

test("a Mesa mantém uma única autoridade local física", () => {
  assert.match(source, /useState<PhysicalDeskState>/);
  assert.match(
    source,
    /createPhysicalDeskState\(\s*desk\.physicalWorkspace,\s*physicalPresentation,?\s*\)/,
  );
  assert.match(source, /const current = physicalDesk\.current/);
  assert.doesNotMatch(source, /type WorkspaceEditorState/);
  assert.doesNotMatch(source, /type WorkspaceDraft/);
  assert.doesNotMatch(source, /draftVacantZoneSlots/);
  assert.doesNotMatch(source, /reconcile\.zonesAfter/);
  assert.doesNotMatch(source, /desk\.appliedZoneItems/);
});

test("zonas e movimentos usam LiveLayoutZoneId e vagas são derivadas", () => {
  assert.match(source, /\| LiveLayoutZoneId;/);
  assert.match(source, /useState<LiveLayoutZoneId \| null>/);
  assert.match(source, /physicalDeskZoneSlots\(physicalDesk, zoneId\)/);
  assert.match(source, /current\.blocks\.map\(\(block/);
  assert.match(source, /current\.zones\.map\(\(zone/);
  assert.doesNotMatch(source, /vacantZoneSlots\s*:/);
});

test("incompatibilidade legacy não bloqueia mutações nem Apply físico v14", () => {
  assert.match(
    source,
    /const mutationBlocked = applyState === "saving" \|\| applyState === "refreshing"/,
  );
  assert.match(source, /if \(mutationBlocked\)/);
  assert.doesNotMatch(source, /legacyApplyBlockReason|Apply v12 bloqueado/);
  assert.match(source, /disabled=\{!pending \|\| mutationBlocked\}/);
  assert.match(
    source,
    /additionalPhysicalZoneIds\.includes\(zoneId\)/,
  );
});

test("Apply nasce diretamente do PhysicalDeskState sem projection legacy", () => {
  const applyFunction = source.indexOf("async function applyChanges()");
  const serializerCall = source.indexOf(
    "buildPhysicalDeskApplyPayload(",
    applyFunction,
  );

  assert.ok(applyFunction >= 0);
  assert.ok(serializerCall > applyFunction);
  assert.match(source, /body: JSON\.stringify\(payload\)/);
  assert.doesNotMatch(source, /buildPhysicalDeskLegacyApplyProjection/);
  assert.doesNotMatch(source, /useState[^\n]*projection/i);
  assert.doesNotMatch(deskStateSource, /history[^\n]*projection/i);
});

test("a route temática chama exclusivamente a facade física v14", () => {
  assert.match(routeSource, /apply_matchday_live_layout_physical_workspace_v14/);
  assert.doesNotMatch(routeSource, /apply_matchday_editorial_profile_workspace_v12/);
});

test("o bloco Agenda\/TV permanece byte-equivalente ao HEAD inicial", () => {
  const baseline = execFileSync(
    "git",
    ["show", `${initialHead}:${clientPath}`],
    { encoding: "utf8" },
  );

  assert.equal(agendaTvBlock(source), agendaTvBlock(baseline));
  assert.equal(agendaTvToolBlock(source), agendaTvToolBlock(baseline));
});
