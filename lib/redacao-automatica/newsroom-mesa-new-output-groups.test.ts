import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildMesaNewOutputGroupingRequestV2,
  mergeMesaNewOutputGroups,
  mesaNewOutputGroupingReady,
  parseMesaNewOutputGrouping,
  setMesaNewOutputTarget,
  setMesaNewOutputThemeCount,
  splitMesaNewOutputGroup,
  type MesaNewOutputGrouping,
} from "./newsroom-mesa-new-output-groups";

const id = (value: number) => `a0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function fixture(count = 10): MesaNewOutputGrouping {
  const newsroomArticleIds = Array.from({ length: count }, (_, index) => id(200 + index));
  return {
    version: 2,
    dossierId: id(900),
    productionContextId: id(901),
    targetCount: count,
    revision: 1,
    state: "planned",
    sources: newsroomArticleIds.map((newsroomArticleId, index) => ({
      dossierSourceId: id(100 + index),
      newsroomArticleId,
      title: `Fonte ${index + 1}`,
      sourceLabel: "VSPORTS",
      imageId: id(300 + index),
      imageUrl: `https://images.example/${index + 1}.jpg`,
    })),
    looseSourceIds: newsroomArticleIds,
    themes: [],
    groups: newsroomArticleIds.map((newsroomArticleId, index) => ({
      groupId: id(400 + index),
      productionContextId: id(901),
      seedKind: "selection",
      seedThemeId: null,
      seedSourceIds: [newsroomArticleId],
      position: index + 1,
      outputId: null,
      articlePlanId: null,
      state: "planned",
    })),
    existingOutputs: [],
  };
}

function fixtureWithThemes(): MesaNewOutputGrouping {
  const value = fixture(15);
  return {
    ...value,
    targetCount: 0,
    looseSourceIds: [],
    themes: [
      { themeId: id(50), title: "Tema A", position: 1, targetCount: null, seedSourceIds: value.sources.map((source) => source.newsroomArticleId) },
      { themeId: id(51), title: "Tema B", position: 2, targetCount: null, seedSourceIds: value.sources.slice(0, 8).map((source) => source.newsroomArticleId) },
    ],
    groups: [],
  };
}

test("Mesa v2 freezes all material without choosing newArticleCount", () => {
  const sources = Array.from({ length: 10 }, (_, index) => ({ newsroomArticleId: id(200 + index), title: `Fonte ${index + 1}` }));
  const result = buildMesaNewOutputGroupingRequestV2(
    { themes: [], sources },
    { sourceIds: sources.map((source) => source.newsroomArticleId), themeIds: [], articles: [] },
    [],
    "Jornada 7",
    id(1),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(Object.hasOwn(result.request.selection, "newArticleCount"), false);
  assert.deepEqual(result.request.selection.sourceIds, sources.map((source) => source.newsroomArticleId));
});

test("new preparations from both the Mesa selection and a single Theme use planning v2", () => {
  const selectionClient = readFileSync("app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx", "utf8");
  const themeClient = readFileSync("app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/_theme-continuity-client.tsx", "utf8");
  assert.match(selectionClient, /<MesaIntentPreparationClient[\s\S]*combineSelectedMaterial/);
  assert.match(themeClient, /<MesaIntentPreparationClient[\s\S]*combineSelectedMaterial/);
  assert.match(themeClient, /os novos artigos são definidos na Produção/);
});

test("10 loose sources become 7 groups through 2-to-1 and 3-to-1 without losing material", () => {
  const initial = fixture();
  const afterPair = mergeMesaNewOutputGroups(initial, [id(405), id(406)]);
  assert.ok(afterPair);
  const afterTriple = mergeMesaNewOutputGroups(afterPair, [id(407), id(408), id(409)]);
  assert.ok(afterTriple);
  assert.equal(afterTriple.groups.length, 7);
  assert.deepEqual(afterTriple.groups[5].seedSourceIds, [id(205), id(206)]);
  assert.deepEqual(afterTriple.groups[6].seedSourceIds, [id(207), id(208), id(209)]);
  assert.deepEqual(new Set(afterTriple.groups.flatMap((group) => group.seedSourceIds)), new Set(initial.looseSourceIds));
  assert.equal(afterTriple.sources.length, 10);
  const ready = { ...afterTriple, targetCount: 7 };
  assert.equal(mesaNewOutputGroupingReady(ready), true);
  const backToEight = splitMesaNewOutputGroup(afterTriple, afterTriple.groups[5].groupId, () => id(700));
  assert.ok(backToEight);
  assert.equal(backToEight.groups.length, 8);
  assert.equal(backToEight.sources.length, 10);
});

test("separating a loose group preserves unchanged group identities", () => {
  const merged = mergeMesaNewOutputGroups(fixture(4), [id(401), id(402)])!;
  const untouched = merged.groups.filter((group) => group.groupId !== id(401)).map((group) => group.groupId);
  let nextId = 700;
  const separated = splitMesaNewOutputGroup(merged, id(401), () => id(nextId++));
  assert.ok(separated);
  assert.equal(separated.groups.length, 4);
  assert.deepEqual(separated.groups.filter((group) => ![id(401), id(700)].includes(group.groupId)).map((group) => group.groupId), untouched);
});

test("Tema with 15 sources creates 5 stable planning groups without consuming sources", () => {
  let nextId = 600;
  const planned = setMesaNewOutputThemeCount(fixtureWithThemes(), id(50), 5, () => id(nextId++));
  assert.ok(planned);
  assert.equal(planned.themes[0].targetCount, 5);
  assert.equal(planned.groups.length, 5);
  assert.ok(planned.groups.every((group) => group.seedKind === "theme" && group.seedThemeId === id(50)));
  assert.ok(planned.groups.every((group) => group.seedSourceIds.length === 15));
  assert.equal(planned.sources.length, 15);
});

test("Tema A 5 plus Tema B 3 remain in one Production with the global material intact", () => {
  let nextId = 600;
  const themeA = setMesaNewOutputThemeCount(fixtureWithThemes(), id(50), 5, () => id(nextId++));
  assert.ok(themeA);
  const themeB = setMesaNewOutputThemeCount(themeA, id(51), 3, () => id(nextId++));
  assert.ok(themeB);
  assert.equal(themeB.groups.length, 8);
  assert.equal(themeB.dossierId, fixtureWithThemes().dossierId);
  assert.equal(themeB.sources.length, 15);
  assert.equal(mesaNewOutputGroupingReady(themeB), true);
});

test("combined Themes, loose groups and EXISTING keep NEW and total counts separate", () => {
  const loose = fixture(4);
  const combined: MesaNewOutputGrouping = {
    ...loose,
    targetCount: 2,
    themes: [
      { themeId: id(50), title: "Tema A", position: 1, targetCount: null, seedSourceIds: loose.sources.map((source) => source.newsroomArticleId) },
      { themeId: id(51), title: "Tema B", position: 2, targetCount: null, seedSourceIds: loose.sources.map((source) => source.newsroomArticleId) },
    ],
    existingOutputs: [1, 2].map((index) => ({
      slot: `EXISTING_0${index}`,
      kind: "existing" as const,
      outputId: id(800 + index),
      productionContextId: loose.productionContextId,
      targetEditorialArticleId: id(820 + index),
      targetSlug: `existente-${index}`,
      targetTitle: `Existente ${index}`,
      targetMatchdayId: null,
    })),
  };
  const grouped = mergeMesaNewOutputGroups(combined, [id(400), id(401)]);
  assert.ok(grouped);
  const groupedAgain = mergeMesaNewOutputGroups(grouped, [id(402), id(403)]);
  assert.ok(groupedAgain);
  let nextId = 600;
  const themeA = setMesaNewOutputThemeCount(groupedAgain, id(50), 5, () => id(nextId++));
  assert.ok(themeA);
  const themeB = setMesaNewOutputThemeCount(themeA, id(51), 3, () => id(nextId++));
  assert.ok(themeB);
  assert.equal(themeB.groups.length, 10);
  assert.equal(themeB.existingOutputs.length, 2);
  assert.equal(themeB.groups.length + themeB.existingOutputs.length, 12);
  assert.equal(mesaNewOutputGroupingReady(themeB), true);
  assert.equal(themeB.sources.length, 4);
});

test("group contract keeps EXISTING outside the new-article count", () => {
  const value = fixture(5);
  const parsed = parseMesaNewOutputGrouping({
    ...value,
    existingOutputs: [{
      slot: "EXISTING_01",
      kind: "existing",
      outputId: id(800),
      productionContextId: value.productionContextId,
      targetEditorialArticleId: id(801),
      targetSlug: "artigo-existente",
      targetTitle: "Artigo existente",
      targetMatchdayId: null,
    }],
  });
  assert.ok(parsed);
  assert.equal(parsed.targetCount, 5);
  assert.equal(parsed.existingOutputs.length, 1);
  assert.equal(parsed.groups.length, 5);
});

test("an unresolved quantity is distinct from an explicit decision of zero new articles", () => {
  const unresolved = parseMesaNewOutputGrouping({ ...fixture(2), targetCount: null });
  assert.ok(unresolved);
  assert.equal(unresolved.targetCount, null);
  assert.equal(mesaNewOutputGroupingReady(unresolved), false);

  const zero = parseMesaNewOutputGrouping({ ...fixture(2), targetCount: 0, groups: [] });
  assert.ok(zero);
  assert.equal(zero.targetCount, 0);
  assert.equal(mesaNewOutputGroupingReady(zero), false, "zero NEW still needs an EXISTING output to form a valid Production");

  const zeroWithExisting = parseMesaNewOutputGrouping({
    ...fixture(2),
    targetCount: 0,
    groups: [],
    existingOutputs: [{
      slot: "EXISTING_01",
      kind: "existing",
      outputId: id(800),
      productionContextId: id(901),
      targetEditorialArticleId: id(801),
      targetSlug: "artigo-existente",
      targetTitle: "Artigo existente",
      targetMatchdayId: null,
    }],
  });
  assert.ok(zeroWithExisting);
  assert.equal(mesaNewOutputGroupingReady(zeroWithExisting), true);

  const migration = readFileSync("supabase/migrations/20260920213530_newsroom_mesa_new_output_grouping_v2.sql", "utf8");
  assert.match(migration, /case when cardinality\(v_loose_ids\)=0 then 0 else null end/);
  const client = readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_new-output-grouping.tsx", "utf8");
  assert.match(client, /targetValue\.trim\(\) === ""/);
  assert.match(client, /themeValue\.trim\(\) !== ""/);
});

test("explicit zero removes only loose planning groups and can return to planning without losing sources", () => {
  const initial = { ...fixture(2), targetCount: null };
  let nextId = 750;
  const zero = setMesaNewOutputTarget(initial, 0, () => id(nextId++));
  assert.ok(zero);
  assert.equal(zero.targetCount, 0);
  assert.equal(zero.groups.length, 0);
  assert.equal(zero.sources.length, 2);
  assert.deepEqual(zero.looseSourceIds, initial.looseSourceIds);

  const configured = setMesaNewOutputTarget(zero, 1, () => id(nextId++));
  assert.ok(configured);
  assert.equal(configured.targetCount, 1);
  assert.equal(configured.groups.length, 2);
  assert.deepEqual(configured.groups.flatMap((group) => group.seedSourceIds), initial.looseSourceIds);
});

test("SQL treats Theme and source seeds as planning metadata and never as source usage", () => {
  const sql = readFileSync("supabase/migrations/20260920213530_newsroom_mesa_new_output_grouping_v2.sql", "utf8");
  assert.match(sql, /newsroom_mesa_new_output_theme_targets/);
  assert.match(sql, /seedThemeId only/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.newsroom_mesa_output_source_usage/i);
  assert.doesNotMatch(sql, /update\s+public\.newsroom_articles/i);
  assert.doesNotMatch(sql, /update\s+public\.newsroom_editorial_article_classifications/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.newsroom_editorial_theme_sources/i);
  assert.doesNotMatch(sql, /newsroom_set_editorial_theme_source_membership_v1/i);
  assert.match(sql, /newsroom_prepare_mesa_contexts_v3\([\s\S]+?null,'\{\}'\)/i);
  assert.match(sql, /seed_kind='theme'/);
  assert.match(sql, /focusSourceIds/);
  assert.match(sql, /state='materialized'[\s\S]*productionIntents/);
});

test("RPCs use revisions, command receipts, locks and an atomic materialization boundary", () => {
  const sql = readFileSync("supabase/migrations/20260920213530_newsroom_mesa_new_output_grouping_v2.sql", "utf8");
  assert.match(sql, /newsroom_mesa_new_output_grouping_commands/);
  assert.match(sql, /p_command_id uuid/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /mesa-grouping-revision-stale/);
  assert.match(sql, /newsroom_materialize_mesa_new_output_groups_v2/);
  assert.match(sql, /insert into public\.newsroom_mesa_intent_preparations/);
  assert.match(sql, /perform public\.newsroom_set_mesa_shared_outputs_v2/);
});

test("UI uses editorial language and an explicit confirmation boundary", () => {
  const client = readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_new-output-grouping.tsx", "utf8");
  const mesa = readFileSync("app/admin/editorial/redacao-automatica/mesa/_mesa-intent-preparation-client.tsx", "utf8");
  assert.match(client, /Agrupar num artigo/);
  assert.match(client, /Separar/);
  assert.match(client, /Confirmar \{newCount\}/);
  assert.match(client, /As fontes efetivamente usadas serão registadas quando os artigos forem produzidos/);
  assert.match(mesa, /O número de novos artigos será definido na Produção/);
  assert.doesNotMatch(client, /fontes seed|Article Plans NEW|\d+\s+outputs|TOTAL outputs|>productionContextId<|>seedSourceIds</i);
});

test("local fixture represents two Themes, loose material and two existing articles", () => {
  const client = readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_new-output-grouping.tsx", "utf8");
  const page = readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx", "utf8");
  assert.match(page, /title: "Tema A", position: 1, targetCount: 5/);
  assert.match(page, /title: "Tema B", position: 2, targetCount: 3/);
  assert.match(page, /fixtureAllSources\.slice\(0, 15\)/);
  assert.match(page, /fixtureAllSources\.slice\(0, 8\)/);
  assert.match(page, /targetCount: 2/);
  assert.match(page, /existingOutputs: \[1, 2\]/);
  assert.match(client, /NOVOS · \{theme\.title\}/);
  assert.match(client, /NOVOS · MATERIAL SOLTO/);
  assert.match(client, /Temas desta Produção/);
  assert.match(client, /Material solto/);
});

test("fixture actions return before every persistence call", () => {
  const client = readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_new-output-grouping.tsx", "utf8");
  const fixtureBranch = client.slice(client.indexOf("if (fixtureMode)"), client.indexOf("const signature"));
  assert.match(fixtureBranch, /set_new_output_target/);
  assert.match(fixtureBranch, /set_theme_new_count/);
  assert.match(fixtureBranch, /setMesaNewOutputThemeCount/);
  assert.match(fixtureBranch, /merge_new_output_groups/);
  assert.match(fixtureBranch, /split_new_output_group/);
  assert.doesNotMatch(fixtureBranch, /fetch\s*\(/);
  assert.doesNotMatch(fixtureBranch, /WORKSPACE_ROUTE/);
});

test("checkbox captures checked before the functional state updater", () => {
  const client = readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_new-output-grouping.tsx", "utf8");
  assert.match(client, /const checked = event\.currentTarget\.checked;[\s\S]*setSelectedGroupIds\(\(current\) => checked/);
  assert.doesNotMatch(client, /setSelectedGroupIds\(\(current\) => event\.currentTarget/);
});
