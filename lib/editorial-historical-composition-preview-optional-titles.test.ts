import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

const publicFlexibleZone = readFileSync(
  "components/public/PublicFlexibleZoneLayout.tsx",
  "utf8",
);

const migrationName = readdirSync("supabase/migrations").find(
  (name) =>
    name.endsWith(
      "_historical_composition_optional_public_titles.sql",
    ),
);

assert.ok(
  migrationName,
  "A migration de títulos públicos opcionais tem de existir.",
);

const migration = readFileSync(
  `supabase/migrations/${migrationName}`,
  "utf8",
);

test("preview hierarchical publicado usa largura editorial completa", () => {
  assert.match(
    page,
    /composition-admin-layout-published-hierarchical/,
  );

  assert.match(
    page,
    /presentationMode === "hierarchical" && isPublishedComposition/,
  );

  assert.match(
    page,
    /\.composition-admin-layout-published-hierarchical\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
});

test("titulo publico escreve localmente e entra no plano uma unica vez ao terminar", () => {
  const componentStart = client.indexOf(
    "function DynamicZoneTitleInput",
  );

  const componentEnd = client.indexOf(
    "export default function HierarchicalCompositionDeskClient",
    componentStart,
  );

  const titleInput = client.slice(
    componentStart,
    componentEnd,
  );

  assert.notEqual(componentStart, -1);
  assert.match(
    titleInput,
    /const \[draft, setDraft\] = useState\(value\)/,
  );
  assert.match(
    titleInput,
    /onChange=\{\(event\) => setDraft\(event\.target\.value\)\}/,
  );
  assert.match(
    titleInput,
    /onBlur=\{\(\) => onCommit\(clientId, draft\)\}/,
  );
  assert.doesNotMatch(
    titleInput,
    /commitDynamicZones|setPlan|setHistory/,
  );

  assert.match(
    client,
    /function commitDynamicZonePublicTitle/,
  );

  assert.match(
    client,
    /onCommit=\{commitDynamicZonePublicTitle\}/,
  );
});

test("titulo publico vazio e valido no contrato HTTP e na publicacao", () => {
  const parserStart = route.indexOf(
    "function parseHistoricalDynamicZones",
  );

  const parserEnd = route.indexOf(
    "function parseHierarchicalDeskSettings",
    parserStart,
  );

  const parser = route.slice(parserStart, parserEnd);

  assert.doesNotMatch(
    parser,
    /publicTitle\.length === 0/,
  );

  assert.match(
    parser,
    /typeof rawPublicTitle === "string"/,
  );

  assert.match(
    parser,
    /!validPublicTitleType/,
  );

  assert.match(
    parser,
    /publicTitle\.length > 120/,
  );

  const validationStart = route.indexOf(
    "async function validateHistoricalDynamicPublication",
  );

  const validationEnd = route.indexOf(
    "async function publishReferenceComposition",
    validationStart,
  );

  const publicationValidation =
    route.slice(validationStart, validationEnd);

  assert.doesNotMatch(
    publicationValidation,
    /validTitle/,
  );

  assert.doesNotMatch(
    publicationValidation,
    /título e \$\{capacity\} notícias/,
  );
});

test("persistencia aceita titulo publico vazio e conserva a RPC v3", () => {
  assert.match(
    migration,
    /drop constraint if exists matchday_historical_composition_zones_public_title_check/i,
  );

  assert.match(
    migration,
    /char_length\(public_title\)\s*<=\s*120/i,
  );

  assert.match(
    migration,
    /create or replace function public\.replace_historical_composition_dynamic_zones/i,
  );

  assert.match(
    migration,
    /jsonb_typeof\(zone\.value -> 'publicTitle'\)/,
  );

  assert.doesNotMatch(
    migration,
    /nullif\(pg_catalog\.btrim\(zone\.value ->> 'publicTitle'\), ''\) is null/,
  );

  assert.match(
    route,
    /rpc\/apply_historical_composition_workspace_plan_v3/,
  );

  assert.match(
    publicFlexibleZone,
    /\{publicTitle \? \(/,
  );

  assert.match(
    publicFlexibleZone,
    /heading=\{publicTitle \|\| null\}/,
  );
});
