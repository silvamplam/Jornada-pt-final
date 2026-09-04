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

test("incompatibilidade física bloqueia globalmente mutações e Apply v12", () => {
  assert.match(
    source,
    /const mutationBlocked = legacyApplyBlockReason !== null/,
  );
  assert.match(source, /if \(mutationBlocked\)/);
  assert.match(source, /Apply v12 bloqueado globalmente/);
  assert.match(
    source,
    /disabled=\{!pending \|\| applyState === "saving" \|\| legacyApplyBlockReason !== null\}/,
  );
  assert.match(
    source,
    /additionalPhysicalZoneIds\.includes\(zoneId\)/,
  );
});

test("projection legacy nasce apenas na fronteira efémera de Apply", () => {
  const applyFunction = source.indexOf("async function applyChanges()");
  const adapterCall = source.indexOf(
    "buildPhysicalDeskLegacyApplyProjection(",
    applyFunction,
  );

  assert.ok(applyFunction >= 0);
  assert.ok(adapterCall > applyFunction);
  assert.equal(
    source.indexOf("buildPhysicalDeskLegacyApplyProjection({", adapterCall + 1),
    -1,
  );
  assert.match(source, /body: JSON\.stringify\(projection\)/);
  assert.doesNotMatch(source, /useState[^\n]*projection/i);
  assert.doesNotMatch(deskStateSource, /history[^\n]*projection/i);
});

test("a route temática continua no contrato v12 e não conhece v13", () => {
  assert.match(routeSource, /apply_matchday_editorial_profile_workspace_v12/);
  assert.doesNotMatch(routeSource, /workspace_v13|writer_v13|apply_.*v13/i);
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
