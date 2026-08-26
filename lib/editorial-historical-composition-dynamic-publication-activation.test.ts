import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260826120541_historical_composition_dynamic_publication_activation.sql",
  "utf8",
);

test("ativação histórica distingue composição dinâmica de legacy", () => {
  assert.match(
    migration,
    /from public\.matchday_historical_composition_zones[\s\S]*if v_dynamic_zone_count > 0 then/,
  );

  assert.match(
    migration,
    /else[\s\S]*if v_slot_count <> 15 or v_complete_slot_count <> 15 then/,
  );

  assert.match(
    migration,
    /if v_beyond_count <> 5[\s\S]*v_complete_beyond_count <> 5/,
  );
});

test("contrato dinâmico exige Abertura, zonas completas, ordem do vídeo e Editorial", () => {
  assert.match(
    migration,
    /v_opening_count <> 4 or v_complete_opening_count <> 4/,
  );

  assert.match(
    migration,
    /when 'six_news' then 6[\s\S]*when 'five_news_balanced' then 5[\s\S]*when 'five_news_secondary' then 5/,
  );

  assert.match(
    migration,
    /item_count <> capacity[\s\S]*complete_item_count <> capacity[\s\S]*position_count <> capacity/,
  );

  assert.match(
    migration,
    /hierarchical_video_position is null[\s\S]*hierarchical_video_position > v_dynamic_zone_count/,
  );

  assert.match(
    migration,
    /hierarchical_editorial_title[\s\S]*hierarchical_editorial_excerpt[\s\S]*hierarchical_editorial_text[\s\S]*hierarchical_editorial_author/,
  );
});

test("ativação continua a publicar e marcar a composição como current", () => {
  assert.match(
    migration,
    /set status = case when status = 'draft' then 'published' else status end/,
  );

  assert.match(
    migration,
    /is_current = true/,
  );

  assert.match(
    migration,
    /published_at = case when status = 'draft' then v_now else published_at end/,
  );
});
