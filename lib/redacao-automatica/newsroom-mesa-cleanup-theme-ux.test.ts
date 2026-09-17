import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const organizationClient = readFileSync(
  "app/admin/editorial/redacao-automatica/mesa/_mesa-organization-client.tsx",
  "utf8",
);
const organizationRoute = readFileSync(
  "app/api/admin/editorial/redacao-automatica/mesa/organizacao/route.ts",
  "utf8",
);
const css = readFileSync(
  "app/admin/editorial/redacao-automatica/mesa/mesa.module.css",
  "utf8",
);

test("apagar Tema na Mesa arquiva sem destruir a memória editorial", () => {
  assert.match(organizationClient, /action: "archive_theme"/);
  assert.match(organizationClient, /aria-label="Apagar Tema da Mesa"/);
  assert.match(organizationRoute, /action === "archive_theme"/);
  assert.match(organizationRoute, /newsroom_set_editorial_theme_status_v1/);
  assert.match(organizationRoute, /p_status: "archived"/);
});

test("estado editorial do Tema distingue zero publicações de Tema publicado", () => {
  assert.match(organizationClient, /data-tone=\{theme\.articleCount > 0 \? "published" : "empty"\}/);
  assert.match(css, /themePublicationState\[data-tone="empty"\][\s\S]*#16713a/);
  assert.match(css, /themePublicationState\[data-tone="published"\][\s\S]*#a12d31/);
});

test("abrir o menu Tema retira o editor de classificação da posição absoluta", () => {
  assert.match(css, /sourceTools:has\(\.sourceThemeMenu\[open\]\) \.classificationEditor[\s\S]*position: static/);
  assert.match(css, /sourceBody:has\(\.sourceThemeMenu\[open\]\)[\s\S]*padding-bottom: 6px/);
});
