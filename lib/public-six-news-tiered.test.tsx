import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import {
  createPublicFlexibleZone,
  PublicFlexibleZoneContent,
  type PublicFlexibleZoneItem,
} from "../components/public/PublicFlexibleZoneRenderers";
import { normalizeMatchdayEditorialProfileThematicZoneLayouts } from "./editorial-matchday-profile-workspace";

Object.assign(globalThis, { React });

function item(position: number): PublicFlexibleZoneItem {
  return {
    id: `item-${position}`, sourceId: `source-${position}`, sortOrder: position,
    title: `Título completo da notícia ${position}`, subtitle: `Subtítulo ${position}`,
    label: "JORNADA", imageUrl: `/editorial-${position}.jpg`,
    linkUrl: `/noticias/${position}`, publishedAt: null,
  };
}

function render(items = Array.from({ length: 6 }, (_, index) => item(index + 1)), family = "six_news_1_2_3" as "six_news_1_2_3" | "six_news") {
  return load(renderToStaticMarkup(<PublicFlexibleZoneContent matchdayNumber={7}
    zone={createPublicFlexibleZone({ key: "teste", publicTitle: "Atualidade", visualFamily: family, items })} />));
}

test("renderer partilhado distribui seis notícias por 1 + 2 + 3, cada uma com imagem e ligação", () => {
  const $ = render();
  assert.deepEqual($("[data-editorial-tier]").map((_, row) => $(row).find("article").length).get(), [1, 2, 3]);
  assert.equal($("article img").length, 6);
  for (let position = 1; position <= 6; position += 1) {
    const card = $(`article[data-public-slot-position="${position}"]`);
    assert.equal(card.find("img").attr("src"), `/editorial-${position}.jpg`);
    assert.equal(card.find("h3").text(), item(position).title);
    assert.equal(card.find("h3 a").attr("href"), `/noticias/${position}`);
    assert.equal(card.find("p").text(), position <= 3 ? item(position).subtitle : "");
  }
});

test("imagem editorial ausente usa o fallback Jornada sem perder nenhuma das seis imagens", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({ ...item(index + 1), imageUrl: index % 2 ? "   " : "" }));
  const $ = render(items);
  assert.equal($("article img[data-editorial-image-fallback=true]").length, 6);
  assert.equal($("article img[src='/assets/jornada-logo-original.png']").length, 6);
});

test("lugares vagos não promovem artigos nem mudam o seu nível editorial", () => {
  const $ = render([item(3), item(6)]);
  assert.equal($("[data-editorial-tier=lead]").length, 0);
  assert.equal($("[data-editorial-tier=middle] article").attr("data-public-slot-position"), "3");
  assert.equal($("[data-editorial-tier=final] article").attr("data-public-slot-position"), "6");
  assert.equal($(".public-six-news-tiered-vacancy").length, 3);
});

test("six_news continua a usar o renderer anterior", () => {
  const $ = render(undefined, "six_news");
  assert.equal($(".public-six-news-tiered").length, 0);
  assert.equal($("[data-public-visual-family=six_news]").length, 1);
});

test("normalização Viva aceita a nova família sem alterar a configuração das restantes zonas", () => {
  const defaults = normalizeMatchdayEditorialProfileThematicZoneLayouts(null);
  const edited = { ...defaults, benfica: "six_news_1_2_3" };
  assert.deepEqual(normalizeMatchdayEditorialProfileThematicZoneLayouts(edited), edited);
});
