import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("a leitura única das zonas inclui os snapshots necessários à Mesa, preview e publicação", () => {
  assert.match(
    page,
    /bank_item_id,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot/,
  );

  assert.match(
    client,
    /label: string \| null;[\s\S]*subtitle: string \| null;[\s\S]*imageUrl: string \| null;[\s\S]*linkUrl: string \| null;/,
  );
});

test("a preview dinâmica reutiliza o renderer público e mantém fallback legacy", () => {
  assert.match(
    page,
    /hasHistoricalDynamicZones \? \(/,
  );

  assert.match(
    page,
    /<PublicHierarchicalComposition[\s\S]*blockOrder=\{\["opening"\]\}/,
  );

  assert.match(
    page,
    /<PublicFlexibleZoneLayout/,
  );

  assert.match(
    page,
    /<PublicHierarchicalPosteriorMoments/,
  );

  assert.match(
    page,
    /<HierarchicalCompositionInterpretivePreview/,
  );
});

test("o painel de publicação separa contrato dinâmico do contrato legacy", () => {
  assert.match(
    page,
    /historicalDynamicPublicationWarnings/,
  );

  assert.match(
    page,
    /hasHistoricalDynamicZones[\s\S]*historicalDynamicPublicationWarnings\.length === 0/,
  );

  assert.match(
    page,
    /15 lugares — em falta/,
  );

  assert.match(
    page,
    /Para Lá da Jornada — em falta/,
  );
});

test("a ordem do vídeo usada pela preview vem do mesmo campo persistido", () => {
  assert.match(
    page,
    /draftComposition\?\.hierarchical_video_position/,
  );

  assert.match(
    page,
    /historicalDynamicPreviewBodyBlocks\.splice/,
  );
});