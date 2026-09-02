import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const selector = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialContextSelector.tsx",
  "utf8",
);
const organizerPage = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx",
  "utf8",
);
const thematicClient = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const entryPage = readFileSync(
  "app/admin/editorial/jornada/page.tsx",
  "utf8",
);

test("Mesa inclui seletor compacto de Competicao, Epoca e Jornada", () => {
  assert.match(selector, /<h2>Alterar Jornada<\/h2>/u);
  assert.match(selector, /aria-label="Competição"/u);
  assert.match(selector, /aria-label="Época"/u);
  assert.match(selector, /aria-label="Jornada"/u);
  assert.match(selector, /Abrir Mesa editorial/u);
  assert.match(
    selector,
    /grid-template-columns: auto minmax\(180px,.8fr\) minmax\(150px,.65fr\) minmax\(210px,1fr\) auto/u,
  );
  assert.match(thematicClient, /<MatchdayEditorialContextSelector/u);
});

test("seletor navega apenas para a Mesa Viva tematica explicitamente compativel", () => {
  assert.match(
    organizerPage,
    /matchday_editorial_profile_assignments\?select=matchday_id,profile_key/u,
  );
  assert.match(
    organizerPage,
    /matchday_editorial_desk_control\?select=matchday_id&is_managed=eq\.true&limit=2/u,
  );
  assert.match(organizerPage, /managedMatchdays\.has\(assignment\.matchday_id\)/u);
  assert.match(organizerPage, /isEditorialProfileKey\(assignment\.profile_key\)/u);
  assert.match(selector, /if \(!selectedMatchday\.thematicCompatible\)/u);
  assert.match(selector, /não é a Mesa Viva atual com perfil temático compatível/u);
  assert.match(
    selector,
    /function changeCompetition[\s\S]*setSeasonId\(""\);[\s\S]*setMatchdayId\(""\);/u,
  );
  assert.match(
    selector,
    /function changeSeason[\s\S]*setMatchdayId\(""\);/u,
  );
  assert.match(
    selector,
    /router\.push\([\s\S]*\/admin\/editorial\/jornada\/\$\{encodeURIComponent\(selectedMatchday\.id\)\}\/organizar/u,
  );
  assert.doesNotMatch(selector, /data-target-base|Circuito editorial/u);
});

test("entrada raiz permanece exclusiva da Mesa managed", () => {
  assert.match(
    entryPage,
    /matchday_editorial_desk_control\?select=matchday_id&is_managed=eq\.true&limit=2/u,
  );
  assert.doesNotMatch(
    entryPage,
    /countries\?|competitions\?|seasons\?|matchdays\?|competition_id|season_id/u,
  );
  assert.doesNotMatch(thematicClient, /Circuito editorial/u);
});
