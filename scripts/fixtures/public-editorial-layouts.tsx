import React from "react";
import { createRoot } from "react-dom/client";
import { PublicEditorialLayout } from "../../components/public/PublicEditorialLayout";
import PublicFourNewsGrid from "../../components/public/PublicFourNewsGrid";
import PublicHorizontalNewsStrip from "../../components/public/PublicHorizontalNewsStrip";
import PublicBeyondMatchdayNews from "../../components/public/PublicBeyondMatchdayNews";
import PublicHierarchicalComposition from "../../components/public/PublicHierarchicalComposition";
import { HIERARCHICAL_COMPOSITION_SLOT_KEYS } from "../../lib/editorial-hierarchical-composition";
import { publicEditorialStyles } from "../../components/public/publicEditorialStyles";

const imageUrl = "http://127.0.0.1:3103/storage/v1/object/public/editorial-images/editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-large.jpg";
const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: `Notícia sintética ${i + 1}`,
  subtitle: "Texto local para verificar geometria, proporções e enquadramento.", label: "JORNADA", labelColor: null,
  imageUrl, linkUrl: "#fixture", sortOrder: i + 1 }));
const slots = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((key, i) => ({ id: key, composition_id: "fixture", slot_key: key,
  bank_item_id: null, source_identity: key, label_snapshot: "SINTÉTICO", title_snapshot: `Notícia ${i + 1}`,
  subtitle_snapshot: items[0].subtitle, image_url_snapshot: imageUrl, link_url_snapshot: "#fixture" }));

function Fixture() {
  return <main style={{ maxWidth: 1200, margin: "auto" }}>
    <style>{publicEditorialStyles}</style>
    <h1>Equivalência local dos renderers públicos</h1>
    <PublicEditorialLayout scope="matchday"
      sideBlock={{ isPublished: true, title: "Contexto", text: items[0].subtitle, imageUrl }}
      headline={{ ...items[0], fallbackTitle: "Manchete", fallbackSubtitle: "Subtítulo" }}
      latestNews={items} latestNewsTitle="Últimas"
      belowHeadline={{ highlightHeading: "Destaques", highlights: items.slice(0, 3), roundupItems: [], showRoundupVideo: false,
        complementary: { isPublished: true, title: "Complemento", imageUrl } }} />
    <h2>Grelha</h2><PublicFourNewsGrid items={items.slice(0, 4)} />
    <h2>Horizontal</h2><PublicHorizontalNewsStrip items={items} />
    <h2>Faixa</h2><PublicBeyondMatchdayNews items={items} contextLabel="Jornada" />
    <h2>Hierárquica / referência / histórica</h2><PublicHierarchicalComposition slots={slots} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
