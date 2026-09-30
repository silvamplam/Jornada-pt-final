import React from "react";
import PublicHierarchicalComposition, { PublicHierarchicalLiveLayouts, PublicHierarchicalPosteriorMoments } from "../../components/public/PublicHierarchicalComposition";
import PublicFlexibleZoneLayout, { createPublicFlexibleZone } from "../../components/public/PublicFlexibleZoneLayout";
import PublicEditorialColumnRunLayout from "../../components/public/PublicEditorialColumnRunLayout";
import Frame from "../../components/public/PublicMatchdayEditorialSectionFrame";
import { HIERARCHICAL_COMPOSITION_SLOT_KEYS } from "../../lib/editorial-hierarchical-composition";
import type { EditorialVisualFamily } from "../../lib/editorial-visual-families";

const items = Array.from({ length: 6 }, (_, i) => ({ id: `item-${i}`, sourceId: `source-${i}`, sortOrder: i + 1,
  label: "JORNADA", title: `Notícia ${i + 1}: os protagonistas e as decisões da jornada`,
  subtitle: "Uma leitura dos momentos decisivos e das escolhas para a próxima ronda.",
  imageUrl: "/fixture.jpg", linkUrl: `#noticia-${i}`, publishedAt: null }));
const slots = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((slot_key, i) => ({ id: slot_key, composition_id: "fixture", slot_key,
  bank_item_id: null, source_identity: slot_key, label_snapshot: "JORNADA", title_snapshot: items[i % 6].title,
  subtitle_snapshot: items[0].subtitle, image_url_snapshot: "/fixture.jpg", link_url_snapshot: `#${slot_key}` }));
const roundupItems = items.slice(0, 4).map((item) => ({ id: item.id, title: item.title, label: "Resumo",
  image_url: item.imageUrl, video_url: "", duration: "03:24", is_embeddable: false }));
const videoHighlight = { isPublished: true, title: "O destaque da jornada", imageUrl: "/fixture.jpg", text: items[0].subtitle };
const wrapLegacySection = (children: React.ReactNode, key: string) => <Frame kind="zone" key={key}>{children}</Frame>;
const wrapVideoSection = (children: React.ReactNode, key: string) => <Frame kind="video" key={key}>{children}</Frame>;

function zone(key: string, visualFamily: EditorialVisualFamily, publicTitle: string) {
  return createPublicFlexibleZone({ key, visualFamily, publicTitle, publicTitleColor: "#008A44",
    items: items.slice(0, visualFamily.startsWith("five_") ? 5 : 6) });
}

export default function HistoricalContractFixture({ caseName }: { caseName: string }) {
  let content: React.ReactNode;
  if (caseName === "legacy") {
    content = <PublicHierarchicalComposition slots={slots} beyondMatchdayItems={items.slice(0, 5)} matchdayNumber={7}
      roundupItems={roundupItems} videoHighlight={videoHighlight} wrapLegacySection={wrapLegacySection} wrapVideoSection={wrapVideoSection} />;
  } else if (caseName === "live-control") {
    content = <PublicHierarchicalLiveLayouts slots={slots} beyondMatchdayItems={items.slice(0, 5)} matchdayNumber={7} />;
  } else if (caseName === "columns") {
    content = <PublicEditorialColumnRunLayout matchdayNumber={7} publicTitle="Histórias"
      zones={Array.from({ length: 5 }, (_, i) => zone(`column-${i}`, "five_news_column", ["Portugal", "Futebol internacional", "Mercado", "Histórias dos protagonistas", "Competições"][i]))} />;
  } else if (caseName === "video") {
    content = <Frame kind="video"><PublicHierarchicalPosteriorMoments ownsSectionBoundary={false} matchdayNumber={7}
      roundupItems={roundupItems} videoHighlight={videoHighlight} /></Frame>;
  } else if (caseName === "generic-panel") {
    content = <section className="public-matchday-panel"><header><h2>Painel público</h2><p>Cabeçalho genérico de controlo</p></header></section>;
  } else {
    const family = ({ tiered: "six_news_1_2_3", balanced: "five_news_balanced", secondary: "five_news_secondary" } as const)[caseName as "tiered"] ?? "six_news";
    content = <PublicFlexibleZoneLayout matchdayNumber={7} zone={zone("dynamic", family, caseName === "dynamic-empty" ? "" : "Atualidade da jornada")} />;
  }
  return <main className="public-matchday-shell"><div className="public-matchday-hierarchical-region" data-fixture-case={caseName}>{content}</div></main>;
}
