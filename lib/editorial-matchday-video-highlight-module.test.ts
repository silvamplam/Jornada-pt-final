import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS,
  normalizeMatchdayEditorialProfileThematicBlockOrder,
} from "@/lib/editorial-matchday-profile-workspace";
import {
  publicThematicVideoHighlightModuleIsVisible,
} from "@/lib/public-matchday-thematic";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

const migrationPath =
  "supabase/migrations/20260825102634_thematic_video_highlight_module.sql";
const hotfixPath =
  "supabase/migrations/20260825104225_hotfix_thematic_video_highlight_coalesce.sql";
const obsoleteMigrationPath =
  "supabase/migrations/20260825120000_thematic_video_highlight_module.sql";

const migration = source(
  migrationPath,
);
const hotfix = source(hotfixPath);
const route = source(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
);
const client = source(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
);
const serializer = source("lib/editorial-matchday-live-layout-physical-apply.ts");
const publicPage = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
);

test("histórico local usa as duas versões realmente aplicadas", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.equal(existsSync(hotfixPath), true);
  assert.equal(existsSync(obsoleteMigrationPath), false);
});

test("migration inicial preserva a definição histórica v6 e o coalesce qualificado", () => {
  assert.match(
    migration,
    /create or replace function\s+public\.apply_matchday_editorial_profile_workspace_v6\(/u,
  );
  assert.equal(
    countOccurrences(migration, "pg_catalog.coalesce"),
    1,
  );
  assert.match(
    migration,
    /pg_catalog\.jsonb_set\([\s\S]*pg_catalog\.coalesce\(/u,
  );
});

test("hotfix exige uma ocorrência e substitui apenas o coalesce qualificado", () => {
  assert.match(hotfix, /if v_count <> 1 then/u);
  assert.match(
    hotfix,
    /'hotfix-v6-qualified-coalesce-count-%'/u,
  );
  assert.match(
    hotfix,
    /pg_catalog\.replace\(\s*v_def,\s*'pg_catalog\.coalesce',\s*'coalesce'\s*\)/u,
  );
  assert.match(
    hotfix,
    /execute v_def;/u,
  );
});

test("replay contratual das migrations deixa a v6 com coalesce válido", () => {
  const functionStart = migration.search(
    /create or replace function\r?\npublic\.apply_matchday_editorial_profile_workspace_v6\(/u,
  );
  const functionEnd = migration.indexOf(
    "$function$;",
    functionStart,
  );
  const historicalDefinition = migration.slice(
    functionStart,
    functionEnd + "$function$;".length,
  );
  const correctedDefinition = historicalDefinition.replace(
    "pg_catalog.coalesce",
    "coalesce",
  );

  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  assert.equal(
    countOccurrences(historicalDefinition, "pg_catalog.coalesce"),
    1,
  );
  assert.equal(
    countOccurrences(correctedDefinition, "pg_catalog.coalesce"),
    0,
  );
  assert.equal(
    countOccurrences(correctedDefinition, "coalesce("),
    countOccurrences(historicalDefinition, "coalesce("),
  );
  assert.match(
    correctedDefinition,
    /pg_catalog\.jsonb_set\([\s\S]*?\n\s+coalesce\(/u,
  );
});

test("video integra a ordem sem remover as cinco zonas nem latest", () => {
  assert.deepEqual(
    MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS,
    [
      "benfica",
      "sporting",
      "fc_porto",
      "other_liga_clubs",
      "outside_liga_other",
      "latest",
      "video",
    ],
  );
});

test("estado histórico de seis blocos recebe video no fim sem reordenar", () => {
  const historical = [
    "latest",
    "sporting",
    "benfica",
    "outside_liga_other",
    "fc_porto",
    "other_liga_clubs",
  ] as const;

  assert.deepEqual(
    normalizeMatchdayEditorialProfileThematicBlockOrder(
      historical,
      historical.filter((block) => block !== "latest"),
    ),
    [...historical, "video"],
  );

  assert.match(
    migration,
    /thematic_block_order \|\| array\['video'\]::text\[\]/u,
  );
});

test("módulo público tem integridade Vídeo + Destaque", () => {
  assert.equal(
    publicThematicVideoHighlightModuleIsVisible({
      active: true,
      hasPublishedVideo: true,
      hasPublishedHighlight: true,
    }),
    true,
  );
  assert.equal(
    publicThematicVideoHighlightModuleIsVisible({
      active: false,
      hasPublishedVideo: true,
      hasPublishedHighlight: true,
    }),
    false,
  );
  assert.equal(
    publicThematicVideoHighlightModuleIsVisible({
      active: true,
      hasPublishedVideo: false,
      hasPublishedHighlight: true,
    }),
    false,
  );
  assert.equal(
    publicThematicVideoHighlightModuleIsVisible({
      active: true,
      hasPublishedVideo: true,
      hasPublishedHighlight: false,
    }),
    false,
  );
});

test("posição pública segue thematicBlockOrder e reutiliza o módulo Legacy", () => {
  assert.match(
    publicPage,
    /thematicEditorialBodyBlocks\.map\(\(block\)[\s\S]*block\.kind === "video"[\s\S]*renderLivePublicZone\("video"\)/u,
  );
  assert.match(
    publicPage,
    /renderLivePublicZone[\s\S]*<PublicEditorialLayout/u,
  );
  assert.match(
    publicPage,
    /publicThematicVideoHighlightModuleIsVisible/u,
  );
});

test("Mesa temática separa o Destaque editorial da ferramenta técnica Vídeos", () => {
  const videoToolStart = client.indexOf(
    '<details className="thematic-global-tool thematic-video-tool">',
  );
  const videoToolEnd = client.indexOf("</details>", videoToolStart);
  const videoTool = client.slice(videoToolStart, videoToolEnd);

  assert.ok(videoToolStart >= 0 && videoToolEnd > videoToolStart);
  assert.match(videoTool, /<summary>Vídeos<\/summary>/u);
  assert.match(videoTool, /<MatchdayVideoSummarySync/u);
  assert.match(videoTool, /reloadOnMutation=\{false\}/u);
  assert.doesNotMatch(client, /className="thematic-panel thematic-video-module"/u);
  assert.doesNotMatch(client, /Vídeo \+ Destaque/u);
  assert.match(client, /return "Destaque"/u);
  assert.match(client, /highlightPlacement \? 1 : 0/u);
  assert.match(client, /aria-label="Destaque editorial"/u);
  assert.match(client, /placementType: "video_highlight"/u);
  assert.match(client, /placeInDisplaced\(highlighted\.id\)/u);
  assert.doesNotMatch(client, /contentCandidates/u);
  assert.match(client, /changePhysicalDeskPresentation/u);
});

test("Legacy e API de sync continuam protegidos fora da Mesa temática", () => {
  const syncClient = source("components/admin/MatchdayVideoSummarySync.tsx");
  const syncRoute = source(
    "app/api/admin/editorial/jornada/[matchdayId]/video-summaries/route.ts",
  );
  const legacyPage = source(
    "app/admin/editorial/jornada/[matchdayId]/page.tsx",
  );

  assert.match(syncClient, /reloadOnMutation = true/u);
  assert.match(syncClient, /reloadOnMutation && action === "confirm"/u);
  assert.match(legacyPage, /<MatchdayVideoSummarySync/u);
  assert.doesNotMatch(client, /onStateChange=\{setVideoSummaryState\}/u);
  assert.match(syncRoute, /syncMatchVideoSummaries/u);
  assert.match(syncRoute, /confirmMatchVideoSummaryCandidate/u);
  assert.match(syncRoute, /rejectMatchVideoSummaryCandidate/u);
});

test("Apply físico v14 transporta o Destaque e preserva o contrato SQL histórico", () => {
  assert.match(route, /apply_matchday_live_layout_physical_workspace_v14/u);
  assert.doesNotMatch(route, /apply_matchday_editorial_profile_workspace_v11/u);
  assert.doesNotMatch(route, /apply_matchday_editorial_profile_workspace_v6/u);
  assert.match(serializer, /expectedPhysicalStateToken/u);
  assert.match(serializer, /video_highlight/u);
  assert.doesNotMatch(route, /complementary_title:/u);
  assert.match(migration, /from public\.matchday_editorial_bank_items as bank_row/u);
  assert.match(migration, /when v_highlight_action = 'replace'[\s\S]*v_bank\.title/u);
  assert.match(migration, /when v_highlight_action = 'remove'[\s\S]*then null/u);
  assert.match(migration, /when v_requested_active[\s\S]*then 'roundup_video'[\s\S]*else 'none'/u);
  assert.doesNotMatch(
    migration,
    /v_requested_active[\s\S]{0,120}complementary_title\s*=\s*null/u,
  );
});

test("ativação incoerente é recusada e sync YouTube não ativa o módulo", () => {
  const sync = source("lib/match-video-summary-sync.server.ts");

  assert.match(migration, /profile-workspace-v6-video-required/u);
  assert.match(migration, /profile-workspace-v6-highlight-required/u);
  assert.doesNotMatch(sync, /complementary_mode|matchday_editorials/u);
});
