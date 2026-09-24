import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  "app/admin/editorial/redacao-automatica/mesa/mesa.module.css",
  "utf8",
);

function rule(selector: RegExp): string {
  const flags = selector.flags.includes("g") ? selector.flags : `${selector.flags}g`;
  return [...css.matchAll(new RegExp(selector.source, flags))].at(-1)?.[1] ?? "";
}

test("badge de classificação da Redação usa a paleta da Mesa Viva", () => {
  const expected = [
    ["benfica", /background:\s*#ef4444/i, /color:\s*#000/i],
    ["sporting", /background:\s*#15803d/i, /color:\s*#fff/i],
    ["fc_porto", /background:\s*#1d4ed8/i, /color:\s*#fff/i],
    ["outside_liga_other", /background:\s*#e2e8f0/i, /color:\s*#000/i],
    ["unclassified", /background:\s*#fde047/i, /color:\s*#000/i],
  ] as const;
  for (const [tone, background, color] of expected) {
    const body = rule(new RegExp(`\\.classificationBadge\\[data-tone="${tone}"\\]\\s*\\{([^}]*)\\}`));
    assert.match(body, background);
    assert.match(body, color);
    if (tone !== "unclassified") {
      assert.match(body, /border:\s*1px solid transparent/i);
    }
  }

  const liga = rule(/\.classificationBadge\[data-tone="other_liga_clubs"\]\s*\{([^}]*)\}/);
  assert.match(liga, /background:\s*#fff/i);
  assert.match(liga, /border:\s*1px solid #000/i);
  assert.match(liga, /color:\s*#000/i);
});

test("badge é uma caixa compacta e não altera badges de lifecycle", () => {
  const badge = rule(/\.classificationBadge\s*\{([^}]*)\}/);
  assert.match(badge, /padding:\s*1px 4px/i);
  assert.match(badge, /border-radius:\s*2px/i);
  assert.doesNotMatch(badge, /#2d7148|#21653e|#15803d/);

  assert.match(rule(/\.lifecycleBadge\[data-lifecycle="new"\]\s*\{([^}]*)\}/), /background:\s*#d9efdf/i);
  assert.match(rule(/\.lifecycleBadge\[data-lifecycle="published"\]\s*\{([^}]*)\}/), /background:\s*#dce9df/i);
  assert.match(rule(/\.lifecycleBadge\[data-lifecycle="archive"\]\s*\{([^}]*)\}/), /background:\s*#e7ebe8/i);
});
