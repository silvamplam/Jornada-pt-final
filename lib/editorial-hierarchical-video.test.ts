import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIERARCHICAL_COMPOSITION_SLOT_KEYS,
  hierarchicalCompositionMediaSnapshot,
  incompleteHierarchicalCompositionSlots,
  type HierarchicalCompositionSlot,
} from "./editorial-hierarchical-composition";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const route = source("app/api/admin/editorial/composicao/route.ts");
const adminPage = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
const publicPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
const publicLoader = source("lib/public-matchday.ts");
const renderer = source("components/public/PublicHierarchicalComposition.tsx");
const editorialLayout = source("components/public/PublicEditorialLayout.tsx");
const preview = source("components/admin/HierarchicalCompositionInterpretivePreview.tsx");
const preflightSql = source("supabase/steps/112-composicao-hierarquica-destaque-video-preflight.sql");
const applySql = source("supabase/steps/113-composicao-hierarquica-destaque-video-apply.sql");
const postflightSql = source("supabase/steps/114-composicao-hierarquica-destaque-video-postflight.sql");
const smokeSql = source("supabase/steps/115-composicao-hierarquica-destaque-video-smoke-rollback.sql");

function slot(slotKey: HierarchicalCompositionSlot["slot_key"], overrides: Partial<HierarchicalCompositionSlot> = {}): HierarchicalCompositionSlot {
  return {
    id: `id-${slotKey}`,
    composition_id: "composition",
    slot_key: slotKey,
    bank_item_id: `bank-${slotKey}`,
    source_identity: `source:${slotKey}`,
    label_snapshot: "Antetítulo",
    title_snapshot: "Título",
    subtitle_snapshot: "Pós-título",
    image_url_snapshot: "https://example.test/image.jpg",
    link_url_snapshot: "https://example.test/noticia",
    ...overrides,
  };
}

test("o snapshot audiovisual distingue embed e vídeo direto sem consultar a origem canónica", () => {
  assert.deepEqual(
    hierarchicalCompositionMediaSnapshot({
      media_kind_snapshot: "embed",
      media_embed_url_snapshot: "https://www.youtube.com/embed/example",
      media_video_url_snapshot: "https://www.youtube.com/watch?v=example",
      image_url_snapshot: "https://example.test/poster.jpg",
      title_snapshot: "Vídeo",
    }),
    {
      kind: "embed",
      embedUrl: "https://www.youtube.com/embed/example",
      videoUrl: "https://www.youtube.com/watch?v=example",
      posterUrl: "https://example.test/poster.jpg",
      title: "Vídeo",
    },
  );

  assert.equal(
    hierarchicalCompositionMediaSnapshot({
      media_kind_snapshot: "direct_video",
      media_video_url_snapshot: "https://example.test/video.mp4",
    })?.kind,
    "direct_video",
  );
  assert.equal(hierarchicalCompositionMediaSnapshot({ media_kind_snapshot: "embed" }), null);
});

test("só dominant_main pode substituir a imagem obrigatória por um snapshot audiovisual válido", () => {
  const complete = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((slotKey) => slot(slotKey));
  const dominantIndex = complete.findIndex((item) => item.slot_key === "dominant_main");
  complete[dominantIndex] = slot("dominant_main", {
    image_url_snapshot: null,
    media_kind_snapshot: "embed",
    media_embed_url_snapshot: "https://www.youtube.com/embed/example",
    media_video_url_snapshot: null,
  });

  assert.deepEqual(incompleteHierarchicalCompositionSlots(complete), []);
  assert.deepEqual(
    incompleteHierarchicalCompositionSlots(
      complete.map((item) =>
        item.slot_key === "dominant_side_top" ? { ...item, image_url_snapshot: null } : item,
      ),
    ),
    ["dominant_side_top"],
  );
});

test("a atribuição resolve editorial_contents canónico e grava snapshot apenas na Manchete ou Destaque", () => {
  assert.match(route, /editorial_contents\?select=id,status,video_url,embed_url,is_embeddable/);
  assert.match(route, /slotKey !== "dominant_main"/);
  assert.match(route, /target\.slotType !== "complement"/);
  assert.match(route, /media_kind_snapshot: mediaSnapshot\?\.kind \?\? null/);
  assert.match(route, /media_embed_url_snapshot: mediaSnapshot\?\.embedUrl \?\? null/);
  assert.match(route, /media_video_url_snapshot: mediaSnapshot\?\.videoUrl \?\? null/);
  assert.doesNotMatch(route, /writeSupabaseAdmin\("editorial_contents"/);
});

test("o editor oferece vídeo apenas na Manchete nuclear e no Destaque da Jornada", () => {
  assert.match(adminPage, /isEditorialContentBankItem/);
  assert.match(adminPage, /slot\.key === "dominant_main"/);
  assert.match(adminPage, /!isEditorialContent \? HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS\.map/);
  assert.match(adminPage, /value="video_highlight"/);
});

test("o menu manual dos momentos posteriores lista notícias e vídeos publicados", () => {
  assert.match(adminPage, /readPublishedEditorialContents/);
  assert.match(adminPage, /editorial_contents\?select=id,slug,content_type,label,title,subtitle,summary,image_url,thumbnail_url,video_url,embed_url,is_embeddable/);
  assert.match(adminPage, /<optgroup label="Notícias">/);
  assert.match(adminPage, /<optgroup label="Vídeos">/);
  assert.match(adminPage, /value=\{`editorial_content:\$\{content\.id\}`\}/);
  assert.match(adminPage, /assign_published_source_to_hierarchical_auxiliary/);
  assert.match(route, /assignPublishedSourceToHierarchicalAuxiliary/);
  assert.match(route, /source\.sourceType === "editorial_article"/);
  assert.match(route, /source_type: sourceType/);
  assert.match(route, /editorialContentId: source\.sourceId/);
  assert.match(route, /O vídeo só pode ser usado no Destaque da Jornada neste menu/);
});

test("preview e página pública reutilizam o player existente e não criam um renderer audiovisual paralelo", () => {
  assert.match(renderer, /PublicInlineMediaPlayer/);
  assert.match(renderer, /slotKey === "dominant_main" \? hierarchicalCompositionMediaSnapshot\(slot\) : null/);
  assert.match(preview, /PublicInlineMediaPlayer/);
  assert.match(preview, /slotKey === "dominant_main" \? hierarchicalCompositionMediaSnapshot\(slot\) : null/);
  assert.match(publicPage, /hierarchicalVideoHighlightMedia = hierarchicalCompositionMediaSnapshot\(referenceComplement\)/);
  assert.match(publicPage, /inlineMedia: hierarchicalVideoHighlightMedia/);
  assert.match(adminPage, /inlineMedia: hierarchicalPreviewHighlightMedia/);
  assert.match(publicLoader, /media_kind_snapshot,media_embed_url_snapshot,media_video_url_snapshot/);
  assert.match(editorialLayout, /export function PublicInlineMediaPlayer/);
  assert.equal((editorialLayout.match(/<YouTubeEmbedWithFallback/g) ?? []).length, 1);
});

test("112–115 são um delta SQL aditivo com preflight, apply, postflight e smoke rollback", () => {
  assert.doesNotMatch(preflightSql, /^\s*(alter|create|drop|insert|update|delete|commit)\b/im);
  assert.match(applySql, /^begin;/i);
  assert.match(applySql, /add column if not exists media_kind_snapshot text/);
  assert.match(applySql, /slot_key = 'dominant_main'/);
  assert.match(applySql, /slot_type in \('headline', 'complement'\)/);
  assert.match(applySql, /hierarchical_beyond_matchday_incomplete/);
  assert.match(applySql, /commit;\s*$/i);
  assert.doesNotMatch(postflightSql, /^\s*(alter|create|drop|insert|update|delete|commit)\b/im);
  assert.match(smokeSql, /^begin;/i);
  assert.match(smokeSql, /Manchete-vídeo válida não foi publicada\/current/);
  assert.match(smokeSql, /rollback;\s*$/i);
});
