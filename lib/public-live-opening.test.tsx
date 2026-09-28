import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { PublicEditorialLayout, PublicHighlightsBlock } from "../components/public/PublicEditorialLayout";

Object.assign(globalThis, { React });

const highlights = Array.from({ length: 3 }, (_, index) => ({
  id: `highlight-${index}`,
  title: `Título completo ${index}`,
  label: `Antetítulo ${index}`,
  subtitle: `Pós-título ${index}`,
  imageUrl: `/image-${index}.jpg`,
  linkUrl: `/noticias/${index}`,
}));

function render(scope: "home" | "matchday", count = 3) {
  return load(renderToStaticMarkup(<PublicEditorialLayout
    scope={scope}
    headline={{ title: "Manchete", author: "Autor principal", subtitle: "Pós-título principal", imageUrl: "/headline.jpg", fallbackTitle: "", fallbackSubtitle: "" }}
    sideBlock={{ isPublished: true, label: "Antetítulo lateral", title: "Título lateral", author: "Autor lateral", text: "Pós-título lateral", imageUrl: "/side.jpg" }}
    belowHeadline={{ highlightHeading: "", highlights: highlights.slice(0, count), roundupItems: [], showRoundupVideo: false, complementary: { isPublished: false } }}
    latestNews={[]}
  />));
}

test("a abertura Viva renderiza somente imagem e título nos três inferiores, preservando artigos e ligações", () => {
  const $ = render("matchday");
  const cards = $(".public-below-headline-highlights .public-cover-story");
  assert.equal(cards.length, 3);
  cards.each((index, element) => {
    const card = $(element);
    assert.deepEqual(card.children().map((_, child) => child.tagName).get(), ["div", "strong"]);
    assert.equal(card.find("img").attr("src"), highlights[index].imageUrl);
    assert.equal(card.find("strong").text(), highlights[index].title);
    assert.equal(card.attr("href"), highlights[index].linkUrl);
    assert.equal(card.text(), highlights[index].title);
  });
  assert.equal($(".public-cover-headline-copy").text(), "MancheteAutor principalPós-título principal");
  assert.equal($(".public-side-editorial-copy").text(), "Antetítulo lateralTítulo lateralAutor lateralPós-título lateral");
  assert.equal($(".public-side-editorial-image img").attr("src"), "/side.jpg");
});

test("Home e consumidores partilhados mantêm antetítulos e pós-títulos", () => {
  for (const $ of [render("home"), load(renderToStaticMarkup(<PublicHighlightsBlock highlights={highlights} />))]) {
    assert.equal($("[data-live-opening]").length, 0);
    $(".public-cover-story").each((index, element) => {
      assert.equal($(element).children("span").text(), highlights[index].label);
      assert.equal($(element).children("small").text(), highlights[index].subtitle);
    });
  }
});

test("a apresentação compacta mantém a ocupação editorial sem criar peças ou campos extra", () => {
  for (const count of [0, 1, 2, 3]) {
    const $ = render("matchday", count);
    assert.equal($(".public-cover-story").length, count);
    assert.equal($(".public-below-headline-highlights").length, count ? 1 : 0);
    assert.equal($(".public-cover-story span, .public-cover-story small, .public-cover-story p").length, 0);
  }
});
