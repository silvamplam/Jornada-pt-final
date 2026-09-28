import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { assertEditorialColumnGroups, collapseColumnGroupUnits, columnGroupDiagnostic, columnGroupMember, columnGroupStoryCount, editorialColumnGroupsFromMembers, parseEditorialColumnGroups } from "./editorial-column-groups";
import { changePhysicalDeskColumnGroup, changePhysicalDeskZone, createPhysicalDeskColumnGroup, createPhysicalDeskState, deletePhysicalDeskZone, movePhysicalDeskItemToSlot, movePhysicalDeskItemToDisplaced, movePhysicalDeskRailBlock, physicalDeskHasChanges, physicalDeskZoneSlots, undoPhysicalDeskState, ungroupPhysicalDeskColumns } from "./editorial-matchday-live-layout-desk-state";
import { buildPhysicalDeskApplyPayload, parsePhysicalDeskApplyPayload, physicalDeskApplyRpcArguments } from "./editorial-matchday-live-layout-physical-apply";
import { parseLiveLayoutBlockId, parseLiveLayoutZoneId } from "./editorial-matchday-live-layout-physical";
import { composePublicEditorialColumnRuns } from "./public-editorial-column-runs";
import { createPublicFlexibleZone } from "@/components/public/PublicFlexibleZoneRenderers";
import { renderPublicAdvertisingBoundary } from "@/components/public/renderPublicAdvertisingBoundary";
import { initialDynamicZonePlan, dynamicZonesFingerprint } from "@/app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient";
import EditorialColumnGroupControls from "@/components/admin/EditorialColumnGroupControls";
import { historicalDynamicZonePositions } from "./editorial-historical-composition-workspace";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(`${process.cwd()}/column-groups-test.cjs`);
require.extensions[".css"] = (module) => { module.exports = { frame: "section-frame" }; };
const Run = require("./components/public/PublicEditorialColumnRunLayout").default;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const zoneId = (n: number) => parseLiveLayoutZoneId(id(n));
const memberIds = [1, 2, 3, 4, 5].map(zoneId);
const group = { id: id(90), publicTitle: "Mercado internacional", enabled: false, zoneIds: memberIds };
const colors = [null, "#0033A0", "#00FF00", "#FF00CC", "#ABCDEF"];
function state(bankItemCount = 10) {
  return createPhysicalDeskState({ matchdayId: id(100), stateToken: "a".repeat(32), physicalCutover: null, workspaceSettings: null,
    zones: [...memberIds, zoneId(6)].map((value, i) => ({ id: value, publicTitle: `Coluna ${i + 1}`, publicTitleColor: colors[i] ?? null,
      visualFamily: i === 5 ? "six_news" : "five_news_column", capacity: i === 5 ? 6 : 5, sortOrder: i + 1, items: [] })),
    blocks: [...[...memberIds, zoneId(6)].map((value, i) => ({ id: parseLiveLayoutBlockId(id(20 + i)), kind: "zone" as const, zoneId: value, sortOrder: i + 1 })),
      { id: parseLiveLayoutBlockId(id(26)), kind: "latest", sortOrder: 7 }, { id: parseLiveLayoutBlockId(id(27)), kind: "video", sortOrder: 8 }],
    placements: [], memory: [], explicitBankItemIds: [], displacedBankItemIds: [], workedBankItemIds: [],
    bankItems: Array.from({ length: bankItemCount }, (_, i) => ({ id: id(40 + i), sourceType: "editorial_article", sourceId: id(60 + i), status: "active",
      label: "JORNADA", title: `Notícia ${i}`, subtitle: null, imageUrl: "/image.jpg", linkUrl: `/noticias/${i}`,
      automaticEligible: true, editoriallyWorkedAt: null, classification: { key: "benfica", source: "test", classifiedAt: "2026-09-28T12:00:00Z" },
      continuitySourceMatchdayId: null, continuitySourceCompositionId: null, isExplicitBank: false })),
  }, { faixaPublicTitle: "", headlineTitleColor: null, latestZonePlacement: "top", latestZoneTitle: "Últimas", videoModuleActive: false,
    roundupVideoHeading: "Vídeo", videoHighlightSectionTitle: "Destaque" });
}
function populated() {
  let result = createPhysicalDeskColumnGroup(state(), group.publicTitle, memberIds);
  for (let i = 0; i < 5; i++) result = movePhysicalDeskItemToSlot(result, id(40 + i), { placementType: "zone", zoneId: memberIds[i], slotPosition: i === 0 ? 3 : 1 });
  return result;
}
const payload = (value: ReturnType<typeof state>) => buildPhysicalDeskApplyPayload("liga_portugal_v1", value);

test("explicit group keeps zone identity, titles, HEX, slots and member order; one rail unit", () => {
  const before = state(), next = createPhysicalDeskColumnGroup(before, "  Mercado internacional  ", [...memberIds].reverse());
  assert.deepEqual(next.current.zones, before.current.zones);
  assert.deepEqual(next.current.placements, before.current.placements);
  assert.deepEqual(next.current.columnGroups?.[0].zoneIds, [...memberIds].reverse());
  assert.equal(next.current.columnGroups?.[0].publicTitle, group.publicTitle);
  assert.equal(next.current.columnGroups?.[0].enabled, false);
  assert.equal(collapseColumnGroupUnits(next.current.blocks, next.current.columnGroups!, b => b.kind === "zone" ? b.zoneId : null).length, 4);
  assert.ok(physicalDeskHasChanges(next));
  assert.deepEqual(undoPhysicalDeskState(next).current, before.current);
});

for (const ids of [memberIds.slice(0, 4), [...memberIds, zoneId(6)], [...memberIds.slice(0, 4), memberIds[0]], [...memberIds.slice(0, 4), zoneId(6)]]) {
  test(`reject malformed membership ${ids.join(",")}`, () => assert.throws(() => createPhysicalDeskColumnGroup(state(), group.publicTitle, ids), /members-invalid/));
}

test("strict metadata rejects empty title, duplicates, missing positions and extra fields", () => {
  for (const value of [[{ ...group, publicTitle: " " }], [group, group], [{ ...group, zoneIds: memberIds.slice(1) }], [{ ...group, color: "#FFFFFF" }]]) {
    assert.throws(() => parseEditorialColumnGroups(value), /editorial-column-group/);
  }
  assert.throws(() => editorialColumnGroupsFromMembers(memberIds.slice(1).map(value => ({ id: value, columnGroup: columnGroupMember([group], value) }))), /shape-invalid/);
  const zones = memberIds.map(value => ({ id: value, visualFamily: "five_news_column" }));
  assert.throws(() => assertEditorialColumnGroups([group], zones, [memberIds[0], null, ...memberIds.slice(1)]), /order-invalid/);
});

test("disabled incomplete group saves; five stories in two columns cannot enable or Apply", () => {
  let next = createPhysicalDeskColumnGroup(state(), group.publicTitle, memberIds);
  const g = next.current.columnGroups![0];
  assert.deepEqual(payload(next).columnGroups, [g]);
  for (let i = 0; i < 5; i++) next = movePhysicalDeskItemToSlot(next, id(40 + i), { placementType: "zone", zoneId: memberIds[i < 3 ? 0 : 1], slotPosition: i % 3 + 1 });
  assert.match(columnGroupDiagnostic(g, value => next.current.placements.filter(p => p.zoneId === value).length)!, /3, 4, 5/);
  assert.throws(() => changePhysicalDeskColumnGroup(next, g.id, { enabled: true }), /incomplete/);
  assert.throws(() => parsePhysicalDeskApplyPayload({ ...payload(next), columnGroups: [{ ...g, enabled: true }] }), /incomplete/);
});

test("one story per column enables; title/enabled/colour changes reach Apply with OCC", () => {
  let next = populated(); const gid = next.current.columnGroups![0].id;
  next = changePhysicalDeskColumnGroup(next, gid, { enabled: true, publicTitle: "Clubes" });
  next = changePhysicalDeskZone(next, zoneId(3), { publicTitleColor: "#aabbcc" });
  const result = payload(next), args = physicalDeskApplyRpcArguments(id(100), result);
  assert.equal(args.p_expected_physical_state_token, "a".repeat(32));
  assert.equal(args.p_column_groups?.[0].publicTitle, "Clubes");
  assert.equal(args.p_column_groups?.[0].enabled, true);
  assert.equal(result.zones[2].publicTitleColor, "#AABBCC");
  assert.equal(result.placements.find(p => p.zoneId === memberIds[0])?.slotPosition, 3);
  assert.equal(payload(changePhysicalDeskColumnGroup(next, gid, { enabled: false })).columnGroups?.[0].enabled, false);
});

test("moving any member moves all five; member delete/family replacement blocked", () => {
  const next = populated(), block = next.current.blocks.find(b => b.kind === "zone" && b.zoneId === memberIds[3])!;
  const moved = movePhysicalDeskRailBlock(next, block.id, "down");
  assert.deepEqual(moved.current.blocks.filter(b => b.kind === "zone").map(b => b.zoneId), [zoneId(6), ...memberIds]);
  assert.deepEqual(moved.current.placements, next.current.placements);
  assert.deepEqual(moved.current.zones, next.current.zones);
  assert.throws(() => deletePhysicalDeskZone(next, memberIds[1]), /member-locked/);
  assert.throws(() => changePhysicalDeskZone(next, memberIds[1], { visualFamily: "six_news" }), /member-locked/);
});

test("ungroup preserves all content and sends explicit empty membership after reload", () => {
  const next = populated(), reloaded = { ...next, baseline: next.current };
  const removed = ungroupPhysicalDeskColumns(reloaded, next.current.columnGroups![0].id);
  assert.deepEqual(removed.current.zones, next.current.zones);
  assert.deepEqual(removed.current.placements, next.current.placements);
  assert.deepEqual(payload(removed).columnGroups, []);
  assert.equal(payload(state()).columnGroups, undefined);
});

for (let selected = 0; selected < 5; selected++) test(`column ${selected + 1} is the only active selector and drop target`, () => {
  const next = populated(); const g = next.current.columnGroups![0];
  const output = renderToStaticMarkup(<EditorialColumnGroupControls group={g} selectedZoneId={memberIds[selected]} count={() => 1} onSelect={() => {}} onChange={() => {}} onUngroup={() => {}} />);
  assert.equal((output.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(output, new RegExp(`aria-pressed="true" aria-label="Coluna ${selected + 1} · 1/5">${selected + 1} · 1/5`));
  const dropped = movePhysicalDeskItemToSlot(next, id(49), { placementType: "zone", zoneId: memberIds[selected], slotPosition: 5 });
  assert.deepEqual(dropped.current.placements.find(p => p.bankItemId === id(49)), { bankItemId: id(49), placementType: "zone", zoneId: memberIds[selected], slotPosition: 5 });
  assert.deepEqual(dropped.current.placements.filter(p => p.bankItemId !== id(49)), next.current.placements);
});

function publicZones(g = { ...group, enabled: true }) {
  return g.zoneIds.map((value, i) => createPublicFlexibleZone({ key: value, publicTitle: `Coluna ${i + 1}`, publicTitleColor: colors[i],
    visualFamily: "five_news_column", columnGroup: columnGroupMember([g], value),
    items: [{ id: id(40 + i), sourceId: id(40 + i), sortOrder: i === 0 ? 3 : 1, title: `História ${i + 1}`, subtitle: "Resumo", imageUrl: "/image.jpg", linkUrl: `/noticias/${i}`, label: "JORNADA", publishedAt: null }] }));
}

function elevenStories() {
  let next = createPhysicalDeskColumnGroup(state(20), group.publicTitle, memberIds);
  let item = 40;
  for (const [index, count] of [3, 2, 2, 2, 2].entries()) {
    for (let slot = 1; slot <= count; slot++) next = movePhysicalDeskItemToSlot(next, id(item++), {
      placementType: "zone", zoneId: memberIds[index], slotPosition: slot === count ? 5 : slot,
    });
  }
  // Four occupied stories outside the five members must never turn 11 into 15.
  for (let slot = 1; slot <= 4; slot++) next = movePhysicalDeskItemToSlot(next, id(item++), {
    placementType: "zone", zoneId: zoneId(6), slotPosition: slot,
  });
  return next;
}
const occupiedCount = (value: ReturnType<typeof state>) => (zone: string) =>
  physicalDeskZoneSlots(value, parseLiveLayoutZoneId(zone)).filter(slot => slot.placement !== null).length;
const groupTotal = (value: ReturnType<typeof state>) => columnGroupStoryCount(value.current.columnGroups![0], occupiedCount(value));

test("3 + 2 + 2 + 2 + 2 = 11, excluding empty slots and all four stories outside the group", () => {
  const next = elevenStories();
  assert.equal(next.current.placements.length, 15);
  assert.deepEqual(memberIds.map(occupiedCount(next)), [3, 2, 2, 2, 2]);
  assert.equal(groupTotal(next), 11);
  const output = renderToStaticMarkup(<EditorialColumnGroupControls group={next.current.columnGroups![0]}
    selectedZoneId={memberIds[3]} count={occupiedCount(next)} onSelect={() => {}} onChange={() => {}} onUngroup={() => {}} />);
  assert.match(output, /aria-label="Total de histórias no grupo">11\/25/);
  for (let i = 0; i < 5; i++) assert.match(output, new RegExp(`aria-label="Coluna ${i + 1} · ${i ? 2 : 3}/5"`));
});

test("group total updates immediately after drop, removal, each undo and enable/disable", () => {
  const original = elevenStories(), gid = original.current.columnGroups![0].id;
  const dropped = movePhysicalDeskItemToSlot(original, id(55), { placementType: "zone", zoneId: memberIds[3], slotPosition: 3 });
  assert.equal(groupTotal(dropped), 12);
  const removed = movePhysicalDeskItemToDisplaced(dropped, id(55));
  assert.equal(groupTotal(removed), 11);
  assert.equal(groupTotal(undoPhysicalDeskState(removed)), 12);
  assert.equal(groupTotal(undoPhysicalDeskState(undoPhysicalDeskState(removed))), 11);
  const enabled = changePhysicalDeskColumnGroup(original, gid, { enabled: true });
  assert.equal(groupTotal(enabled), 11);
  assert.equal(groupTotal(changePhysicalDeskColumnGroup(enabled, gid, { enabled: false })), 11);
});

test("Apply serialization and reload rebuild 11 occupied stories with the enabled state and column colours", () => {
  let original = elevenStories();
  original = changePhysicalDeskColumnGroup(original, original.current.columnGroups![0].id, { enabled: true });
  const saved = parsePhysicalDeskApplyPayload(JSON.parse(JSON.stringify(payload(original))));
  const now = "2026-09-28T12:00:00Z";
  const reloaded = createPhysicalDeskState({ matchdayId: original.matchdayId, stateToken: "b".repeat(32),
    physicalCutover: null, workspaceSettings: null, latestCompanion: null, columnGroups: saved.columnGroups,
    zones: saved.zones.map((zone, i) => ({ ...zone, id: parseLiveLayoutZoneId(zone.id), capacity: i === 5 ? 6 : 5, sortOrder: i + 1, items: [] })),
    blocks: original.current.blocks, placements: saved.placements.map((p, i) => {
      assert.equal(p.placementType, "zone");
      return { ...p, placementType: "zone" as const, zoneId: parseLiveLayoutZoneId(p.zoneId!), id: id(200 + i), createdAt: now, updatedAt: now };
    }),
    bankItems: original.current.bankItems, memory: [], explicitBankItemIds: [], displacedBankItemIds: [], workedBankItemIds: [],
  }, original.current.presentation);
  assert.equal(groupTotal(reloaded), 11);
  assert.deepEqual(memberIds.map(occupiedCount(reloaded)), [3, 2, 2, 2, 2]);
  assert.deepEqual(reloaded.current.columnGroups, original.current.columnGroups);
  assert.deepEqual(reloaded.current.zones.map(z => z.publicTitleColor), original.current.zones.map(z => z.publicTitleColor));
  assert.equal(physicalDeskHasChanges(reloaded), false);
});

for (const enabled of [false, true]) test(`enabled=${enabled} exposes the next action and the actual state`, () => {
  const output = renderToStaticMarkup(<EditorialColumnGroupControls group={{ ...group, enabled }}
    selectedZoneId={memberIds[3]} count={() => 2} onSelect={() => {}} onChange={() => {}} onUngroup={() => {}} />);
  assert.match(output, enabled ? /aria-label="Desligar grupo"/ : /aria-label="Ligar grupo"/);
  assert.match(output, enabled ? /<span>Ligado<\/span>Desligar/ : /<span>Desligado<\/span>Ligar/);
  assert.match(output, /aria-pressed="true" aria-label="Coluna 4 · 2\/5"/);
});

test("historical reload counts the same 11 occupied member positions and ignores non-member zones", () => {
  const plan = initialDynamicZonePlan([...memberIds, zoneId(6)].map((value, i) => ({ id: value, sortOrder: i + 1,
    publicTitle: `Coluna ${i + 1}`, publicTitleColor: colors[i] ?? null, visualFamily: "five_news_column",
    columnGroup: columnGroupMember([group], value), items: Array.from({ length: [3, 2, 2, 2, 2, 4][i] }, (_, j) => ({
      id: id(200 + i * 5 + j), bankItemId: id(200 + i * 5 + j), position: j + 1,
      title: "História", label: "JORNADA", subtitle: null, imageUrl: "/image.jpg", linkUrl: "/noticias/1",
    })) })));
  const restored = editorialColumnGroupsFromMembers(plan.map(zone => ({ id: zone.clientId, columnGroup: zone.columnGroup })))[0];
  const count = (zoneId: string) => {
    const zone = plan.find(z => z.clientId === zoneId)!;
    return historicalDynamicZonePositions(zone.visualFamily).filter(({ position }) => Boolean(zone.items[position])).length;
  };
  assert.equal(columnGroupStoryCount(restored, count), 11);
  assert.deepEqual(restored.zoneIds.map(count), [3, 2, 2, 2, 2]);
});
type PublicBlock = { kind: "zone"; zone: ReturnType<typeof publicZones>[number] } | { kind: "video" };
const compose = (zones: ReturnType<typeof publicZones>) => composePublicEditorialColumnRuns<PublicBlock, ReturnType<typeof publicZones>[number]>(zones.map(zone => ({ kind: "zone", zone })), block => block.kind === "zone" ? block.zone : undefined);

test("two adjacent groups remain two ad units, with independent headings, colours and sparse slots", () => {
  const zones = publicZones(); const second = publicZones({ ...group, id: id(91), publicTitle: "Outro grupo", enabled: true, zoneIds: [11, 12, 13, 14, 15].map(zoneId) });
  const blocks = compose([...zones, ...second]);
  assert.equal(blocks.length, 2);
  const output = renderToStaticMarkup(<>{renderPublicAdvertisingBoundary(blocks, b => b.kind === "column_run" ? <Run zones={b.zones} publicTitle={b.publicTitle} matchdayNumber={8} /> : null, <aside>PUBLICIDADE</aside>)}</>);
  assert.equal((output.match(/class="public-column-group-heading"/g) ?? []).length, 2);
  assert.equal((output.match(/data-public-flexible-zone=/g) ?? []).length, 10);
  assert.equal((output.match(/<img /g) ?? []).length, 8);
  const start = output.indexOf('data-public-column-run='), end = output.indexOf("Outro grupo", start);
  assert.ok(output.slice(start, end).indexOf("PUBLICIDADE") > output.slice(start, end).lastIndexOf('data-public-flexible-zone='));
  assert.ok(output.includes("color:#0033A0"));
  assert.doesNotMatch(output, /<h3[^>]*style=/);
});

test("disabled, empty, split, reordered or inconsistent groups never publish partially", () => {
  assert.deepEqual(compose(publicZones(group)), []);
  assert.deepEqual(compose(publicZones().slice(0, 4)), []);
  assert.deepEqual(compose([...publicZones()].reverse()), []);
  assert.deepEqual(compose(publicZones().map((zone, i) => i ? zone : { ...zone, slots: [] })), []);
  const blocks: PublicBlock[] = publicZones().map(zone => ({ kind: "zone", zone })); blocks.splice(2, 0, { kind: "video" });
  assert.deepEqual(composePublicEditorialColumnRuns(blocks, block => block.kind === "zone" ? block.zone : undefined), [{ kind: "video" }]);
});

test("historical reload carries group identity/title/state/order alongside colour and sparse slots", () => {
  const plan = initialDynamicZonePlan(memberIds.map((value, i) => ({ id: value, sortOrder: i + 1, publicTitle: `Coluna ${i}`, publicTitleColor: colors[i],
    columnGroup: columnGroupMember([group], value), visualFamily: "five_news_column", items: [{ id: id(40 + i), bankItemId: id(40 + i), position: 3,
      title: "História", label: "JORNADA", subtitle: null, imageUrl: "/image.jpg", linkUrl: "/noticias/1" }] })));
  assert.deepEqual(editorialColumnGroupsFromMembers(plan.map(zone => ({ id: zone.clientId, columnGroup: zone.columnGroup }))), [group]);
  assert.deepEqual(plan.map(zone => zone.publicTitleColor), colors);
  assert.notEqual(dynamicZonesFingerprint(plan), dynamicZonesFingerprint(plan.map(zone => ({ ...zone, columnGroup: { ...zone.columnGroup!, publicTitle: "Novo título" } }))));
});
