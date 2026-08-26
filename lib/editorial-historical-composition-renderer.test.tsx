import assert from "node:assert/strict";
import test from "node:test";

import { load } from "cheerio";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PublicHierarchicalComposition from "../components/public/PublicHierarchicalComposition";
import {
  HIERARCHICAL_COMPOSITION_SLOT_KEYS,
  type HierarchicalCompositionSlot,
} from "./editorial-hierarchical-composition";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const slots: HierarchicalCompositionSlot[] = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((slotKey) => ({
  id: `slot-${slotKey}`,
  composition_id: "composition-flexible-renderer",
  slot_key: slotKey,
  bank_item_id: `bank-${slotKey}`,
  source_identity: `editorial_article:${slotKey}`,
  label_snapshot: "Jornada",
  title_snapshot: `Título ${slotKey}`,
  subtitle_snapshot: `Pós-título ${slotKey}`,
  image_url_snapshot: "https://example.test/image.jpg",
  link_url_snapshot: `/noticias/${slotKey}`,
}));

test("composição antiga sem metadados mantém a ordem e os títulos históricos", () => {
  const $ = load(renderToStaticMarkup(
    <PublicHierarchicalComposition slots={slots} />,
  ));
  const blocks = $(".composition-interpretive-preview").children().toArray();

  assert.equal($(blocks[0]).hasClass("composition-interpretive-opening"), true);
  assert.equal($(blocks[1]).hasClass("composition-interpretive-analysis"), true);
  assert.equal($(blocks[2]).hasClass("composition-interpretive-other-games"), true);
  assert.equal($(blocks[1]).find("h2").text(), "Arbitragem e reações");
  assert.equal($(blocks[2]).find("h2").text(), "Outros jogos da jornada");
});

test("composição nova segue a ordem, os títulos e a cor definidos na Mesa", () => {
  const $ = load(renderToStaticMarkup(
    <PublicHierarchicalComposition
      blockOrder={["zone_2", "opening", "zone_1", "video", "beyond"]}
      headlineTitleColor="#8B1538"
      slots={slots}
      zone1Title="Casos da jornada"
      zone2Title="Quem marcou a ronda"
    />,
  ));
  const blocks = $(".composition-interpretive-preview").children().toArray();

  assert.equal($(blocks[0]).hasClass("composition-interpretive-other-games"), true);
  assert.equal($(blocks[1]).hasClass("composition-interpretive-opening"), true);
  assert.equal($(blocks[2]).hasClass("composition-interpretive-analysis"), true);
  assert.equal($(blocks[0]).find("h2").text(), "Quem marcou a ronda");
  assert.equal($(blocks[2]).find("h2").text(), "Casos da jornada");
  assert.match(
    $(blocks[1]).find('[data-slot="dominant_main"] .composition-interpretive-title').attr("style") ?? "",
    /color:#8B1538/,
  );
});
