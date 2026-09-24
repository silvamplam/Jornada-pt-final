import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARTICLE_CLASSIFICATION_BADGE_COLORS,
  HEADLINE_TITLE_COLOR_BY_CLASSIFICATION,
} from "../editorial-classifications";

const css = readFileSync(
  "app/admin/editorial/redacao-automatica/mesa/mesa.module.css",
  "utf8",
);
const selectionClient = readFileSync(
  "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
  "utf8",
);
const archiveItem = readFileSync(
  "app/admin/editorial/redacao-automatica/mesa/_mesa-archive-source-item.tsx",
  "utf8",
);

function rule(selector: RegExp): string {
  const flags = selector.flags.includes("g") ? selector.flags : `${selector.flags}g`;
  return [...css.matchAll(new RegExp(selector.source, flags))].at(-1)?.[1] ?? "";
}

test("a paleta central distingue todos os badges sem alterar a Manchete", () => {
  assert.deepEqual(ARTICLE_CLASSIFICATION_BADGE_COLORS, {
    benfica: { backgroundColor: "#EF4444", color: "#000000" },
    sporting: { backgroundColor: "#15803D", color: "#FFFFFF" },
    fc_porto: { backgroundColor: "#1D4ED8", color: "#FFFFFF" },
    other_liga_clubs: { backgroundColor: "#000000", color: "#FFFFFF" },
    outside_liga_other: { backgroundColor: "#FFD400", color: "#000000" },
    unclassified: { backgroundColor: "#E2E8F0", color: "#000000" },
  });
  assert.equal(HEADLINE_TITLE_COLOR_BY_CLASSIFICATION.other_liga_clubs, "#10151B");
  assert.equal(HEADLINE_TITLE_COLOR_BY_CLASSIFICATION.outside_liga_other, "#10151B");
});

test("Mesa da Redação e Arquivo usam a paleta central", () => {
  assert.match(selectionClient, /style=\{articleClassificationBadgeColors\("unclassified"\)\}/);
  assert.match(selectionClient, /style=\{articleClassificationBadgeColors\(classificationKey\)\}/);
  assert.match(archiveItem, /className=\{styles\.classificationBadge\}/);
  assert.match(
    archiveItem,
    /style=\{articleClassificationBadgeColors\(item\.classificationKey \?\? "unclassified"\)\}/,
  );
  assert.doesNotMatch(
    css,
    /\.classificationBadge\[data-tone="(?:benfica|sporting|fc_porto|other_liga_clubs|outside_liga_other)"\]\s*\{/,
  );
  assert.match(rule(/\.classificationBadge small\s*\{([^}]*)\}/), /color:\s*inherit/i);
});

test("badge é uma caixa compacta e não altera badges de lifecycle", () => {
  const badge = rule(/\.classificationBadge\s*\{([^}]*)\}/);
  assert.match(badge, /padding:\s*1px 4px/i);
  assert.match(badge, /border-radius:\s*2px/i);

  assert.match(rule(/\.lifecycleBadge\[data-lifecycle="new"\]\s*\{([^}]*)\}/), /background:\s*#d9efdf/i);
  assert.match(rule(/\.lifecycleBadge\[data-lifecycle="published"\]\s*\{([^}]*)\}/), /background:\s*#dce9df/i);
  assert.match(rule(/\.lifecycleBadge\[data-lifecycle="archive"\]\s*\{([^}]*)\}/), /background:\s*#e7ebe8/i);
});

test("Produção e Publicação em lote usam os tokens das badges só na seleção", () => {
  const production = readFileSync(
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_article-plan-classification.tsx",
    "utf8",
  );
  const productionCss = readFileSync(
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/workspace.module.css",
    "utf8",
  );
  const batch = readFileSync(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
    "utf8",
  );
  const batchCss = readFileSync(
    "app/admin/editorial/redacao-automatica/publicacao-lote/publicacao-lote.module.css",
    "utf8",
  );

  for (const client of [production, batch]) {
    assert.match(client, /articleClassificationBadgeColors\(classification\.key\)/);
    assert.match(client, /--classification-accent/);
    assert.match(client, /--classification-foreground/);
  }
  assert.match(productionCss, /label:has\(input:checked\)[\s\S]*?background: var\(--classification-accent\)/);
  assert.match(productionCss, /input\[type="radio"\]:checked[\s\S]*?var\(--classification-accent\)/);
  assert.match(productionCss, /label:has\(input:focus-visible\)/);
  assert.match(batchCss, /input:checked \+ span[\s\S]*?background: var\(--classification-accent\)/);
  assert.match(batchCss, /input:focus-visible \+ span/);
  assert.match(batchCss, /:disabled input:not\(:checked\) \+ span/);
});
