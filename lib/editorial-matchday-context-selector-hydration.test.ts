import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/page.tsx",
  "utf8",
);

test("o seletor da jornada entrega ao React o mesmo estado inicial aplicado pelo script", () => {
  assert.match(
    source,
    /const optionHidden = Boolean\(competition\.id\)\s*&& item\.competition_id !== competition\.id;/,
  );
  assert.match(source, /hidden=\{optionHidden\}/);
  assert.match(source, /disabled=\{optionHidden\}/);

  assert.match(
    source,
    /const optionHidden =\s*\(Boolean\(competition\.id\)\s*&& optionSeason\?\.competition_id !== competition\.id\)\s*\|\| \(Boolean\(season\.id\)\s*&& item\.season_id !== season\.id\);/,
  );

  const hiddenMatches = source.match(/hidden=\{optionHidden\}/g) ?? [];
  const disabledMatches = source.match(/disabled=\{optionHidden\}/g) ?? [];

  assert.equal(hiddenMatches.length, 2);
  assert.equal(disabledMatches.length, 2);
});

test("o seletor continua a filtrar épocas e jornadas quando o utilizador muda o contexto", () => {
  assert.match(source, /option\.hidden = !visible;/);
  assert.match(source, /option\.disabled = !visible;/);
  assert.match(source, /competition\.addEventListener\("change", syncOptions\);/);
  assert.match(source, /season\.addEventListener\("change", syncOptions\);/);
  assert.match(source, /window\.location\.href = form\.getAttribute\("data-target-base"\)/);
});
