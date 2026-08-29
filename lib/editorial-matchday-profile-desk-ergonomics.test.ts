import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(
    process.cwd(),
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  ),
  "utf8",
);

test("posição fixa tem ação explícita no menu da notícia", () => {
  assert.match(
    source,
    /Fixar nesta posição/,
  );

  assert.match(
    source,
    /onFixPosition/,
  );

  assert.match(
    source,
    /fixCurrentZonePosition\(\s*itemIdentity,\s*placement\.zoneKey!,\s*itemSortOrder/,
  );

  assert.match(
    source,
    /Libertar posição/,
  );
});

test("erro de redução aparece dentro da própria zona", () => {
  assert.match(
    source,
    /zoneLayoutError/,
  );

  assert.match(
    source,
    /thematic-zone-alert/,
  );

  assert.match(
    source,
    /zoneLayoutError\?\.zoneKey === zone\.key/,
  );

  assert.match(
    source,
    /role="alert"/,
  );
});

test("erro de layout não é duplicado como mensagem global", () => {
  assert.match(
    source,
    /setMessage\(null\);\s*setZoneLayoutError/,
  );
});

test("mensagem global fica antes dos controlos e não no fim da Mesa", () => {
  const feedback =
    source.indexOf(
      'className={`thematic-message feedback',
    );

  const controls =
    source.indexOf(
      '<section className="thematic-page-structure"',
    );

  const diagnostics =
    source.indexOf(
      "<Diagnostics diagnostics={desk.diagnostics} />",
    );

  assert.ok(feedback >= 0);
  assert.ok(controls >= 0);
  assert.ok(diagnostics >= 0);

  assert.ok(
    feedback < controls,
    "feedback deve ficar imediatamente abaixo do cabeçalho",
  );

  assert.equal(
    source.slice(diagnostics).includes(
      'className={`thematic-message${',
    ),
    false,
  );
});
