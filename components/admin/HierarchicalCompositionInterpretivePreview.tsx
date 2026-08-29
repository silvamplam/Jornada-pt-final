import {
  hierarchicalCompositionMediaSnapshot,
  type HierarchicalCompositionEditorial,
  type HierarchicalCompositionSlot,
  type HierarchicalCompositionSlotKey,
} from "@/lib/editorial-hierarchical-composition";
import {
  PublicHierarchicalPosteriorMoments,
  type PublicHierarchicalPosteriorMomentsProps,
} from "@/components/public/PublicHierarchicalComposition";
import { PublicInlineMediaPlayer } from "@/components/public/PublicEditorialLayout";
import type { HistoricalCompositionBlockKey } from "@/lib/editorial-historical-composition-workspace";
import {
  hierarchicalEditorialImageFramingProps,
} from "@/lib/editorial-image-framing";

type HierarchicalCompositionInterpretivePreviewProps = {
  blockOrder?: HistoricalCompositionBlockKey[];
  editorial?: HierarchicalCompositionEditorial | null;
  headlineTitleColor?: string;
  slots: HierarchicalCompositionSlot[];
  zone1Title?: string;
  zone2Title?: string;
} & Omit<PublicHierarchicalPosteriorMomentsProps, "includeV13PreviewStructure">;

export const HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP = {
  dominant: "dominant_main",
  chronicles: ["other_chronicle_1", "other_chronicle_2", "other_chronicle_3"],
  analysis: {
    dominant: "secondary_strong_1",
    center: ["secondary_strong_2", "secondary_1", "secondary_2"],
    side: ["dominant_side_top", "dominant_side_bottom"],
  },
  otherGames: {
    primary: "secondary_3",
    second: "secondary_4",
    compact: ["closing_1", "closing_2", "closing_3"],
  },
} as const;

const interpretivePreviewStyles = `
  .composition-interpretive-preview {
    display: grid;
    gap: 42px;
    width: 100%;
    max-width: 1200px;
    min-width: 0;
    box-sizing: border-box;
    margin-inline: auto;
    background: #ffffff;
    color: #10151b;
  }

  .composition-interpretive-opening {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 28px;
    min-width: 0;
  }

  .composition-interpretive-news {
    display: grid;
    grid-column: span 9;
    gap: 34px;
    min-width: 0;
  }

  .composition-interpretive-editorial {
    position: relative;
    grid-column: span 3;
    align-self: start;
    min-width: 0;
    padding-left: 24px;
    border-left: 1px solid #dfe5eb;
  }

  .composition-interpretive-editorial::before {
    display: block;
    width: 54px;
    height: 2px;
    margin-bottom: 14px;
    background: #d71920;
    content: "";
  }

  .composition-interpretive-editorial-kicker,
  .composition-interpretive-label,
  .composition-interpretive-title,
  .composition-interpretive-subtitle,
  .composition-interpretive-editorial h3,
  .composition-interpretive-editorial p {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
  }

  .composition-interpretive-editorial-kicker {
    display: block;
    color: #10151b;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .composition-interpretive-editorial-empty {
    margin-top: 18px !important;
    color: #8a96a5;
    font-size: 12px;
    line-height: 1.5;
  }

  .composition-interpretive-editorial h3 {
    margin-top: 20px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 25px;
    font-weight: 700;
    line-height: 1.08;
  }

  .composition-interpretive-editorial-body {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }

  .composition-interpretive-editorial-copy {
    margin: 0 !important;
    color: #3f4c5d;
    font-family: Georgia, "Times New Roman", serif !important;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.62;
  }

  .composition-interpretive-editorial-signature {
    margin-top: 22px !important;
    padding-top: 12px;
    border-top: 1px solid #dfe5eb;
    color: #10151b;
    font-size: 12px;
    font-weight: 800;
  }

  .composition-interpretive-dominant {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 4fr);
    gap: 24px;
    min-width: 0;
    align-items: start;
  }

  .composition-interpretive-dominant .composition-interpretive-media {
    aspect-ratio: 3 / 2;
  }

  .composition-interpretive-dominant .composition-interpretive-copy {
    display: grid;
    align-content: start;
    gap: 10px;
    padding-top: 4px;
  }

  .composition-interpretive-dominant .composition-interpretive-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(25px, 2.37vw, 34px);
    font-weight: 700;
    line-height: 1.06;
    letter-spacing: 0;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .composition-interpretive-dominant .composition-interpretive-subtitle {
    font-size: 15px;
    line-height: 1.48;
    -webkit-line-clamp: 6;
    line-clamp: 6;
  }

  .composition-interpretive-chronicles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
    min-width: 0;
  }

  .composition-interpretive-chronicle,
  .composition-interpretive-analysis-main,
  .composition-interpretive-analysis-medium,
  .composition-interpretive-analysis-side-item,
  .composition-interpretive-other-featured,
  .composition-interpretive-other-second-featured,
  .composition-interpretive-other-compact {
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .composition-interpretive-chronicle {
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .composition-interpretive-chronicle .composition-interpretive-media {
    aspect-ratio: 16 / 9;
  }

  .composition-interpretive-chronicle .composition-interpretive-title {
    font-size: 19px;
    font-weight: 800;
    line-height: 1.12;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .composition-interpretive-chronicle .composition-interpretive-subtitle {
    color: #6d7989;
    font-size: 12.5px;
    line-height: 1.52;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-section {
    position: relative;
    min-width: 0;
    padding-top: 18px;
    border-top: 1px solid #dfe5eb;
  }

  .composition-admin-panel h2.composition-interpretive-section-heading {
    display: block;
    margin: 0 0 16px;
    color: #526173;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .composition-interpretive-analysis-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: stretch;
    gap: 28px;
    min-width: 0;
  }

  .composition-interpretive-analysis-main {
    display: grid;
    grid-column: span 4;
    align-content: start;
    gap: 9px;
  }

  .composition-interpretive-analysis-main .composition-interpretive-media {
    aspect-ratio: 2 / 1;
  }

  .composition-interpretive-analysis-main .composition-interpretive-copy {
    display: grid;
    gap: 7px;
  }

  .composition-interpretive-analysis-main .composition-interpretive-title {
    font-size: 24px;
    font-weight: 800;
    line-height: 1.12;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-analysis-main .composition-interpretive-subtitle {
    font-size: 14px;
    line-height: 1.48;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .composition-interpretive-analysis-center {
    display: grid;
    grid-column: span 5;
    grid-template-rows: repeat(3, auto);
    align-content: space-between;
    gap: 12px;
    height: 100%;
  }

  .composition-interpretive-analysis-medium {
    display: grid;
    grid-template-columns: minmax(156px, 1.08fr) minmax(0, 1.72fr);
    gap: 14px;
    align-items: stretch;
    padding-bottom: 12px;
    border-bottom: 1px solid #dfe5eb;
  }

  .composition-interpretive-analysis-medium:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .composition-interpretive-analysis-medium .composition-interpretive-media-link {
    display: block;
    align-self: start;
    height: auto;
  }

  .composition-interpretive-analysis-medium .composition-interpretive-media {
    aspect-ratio: 16 / 9;
    height: auto;
    min-height: 0;
  }

  .composition-interpretive-analysis-medium .composition-interpretive-copy {
    display: grid;
    align-content: start;
    gap: 6px;
    min-height: 96px;
  }

  .composition-interpretive-analysis-medium .composition-interpretive-title {
    font-size: 16px;
    font-weight: 800;
    line-height: 1.12;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-analysis-medium .composition-interpretive-subtitle {
    font-size: 11px;
    line-height: 1.46;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .composition-interpretive-analysis-side {
    display: grid;
    grid-column: span 3;
    grid-template-rows: repeat(2, auto);
    align-content: space-between;
    gap: 12px;
    height: 100%;
  }

  .composition-interpretive-analysis-side-item {
    display: grid;
    align-content: start;
    gap: 6px;
    padding-bottom: 12px;
    border-bottom: 1px solid #dfe5eb;
  }

  .composition-interpretive-analysis-side-item:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .composition-interpretive-analysis-side-item .composition-interpretive-media {
    aspect-ratio: 2.45 / 1;
  }

  .composition-interpretive-analysis-side-item .composition-interpretive-title {
    font-size: 15px;
    font-weight: 800;
    line-height: 1.15;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-analysis-side-item .composition-interpretive-subtitle {
    font-size: 10.5px;
    line-height: 1.45;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .composition-interpretive-other-games-layout {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: stretch;
    gap: 28px;
    min-width: 0;
  }

  .composition-interpretive-other-left {
    display: grid;
    grid-column: span 7;
    grid-template-rows: repeat(2, auto);
    align-content: space-between;
    gap: 24px;
    height: 100%;
    min-width: 0;
  }

  .composition-interpretive-other-featured {
    display: grid;
    align-content: start;
    gap: 9px;
  }

  .composition-interpretive-other-featured .composition-interpretive-media {
    aspect-ratio: 3 / 1;
  }

  .composition-interpretive-other-featured .composition-interpretive-title {
    font-size: 22px;
    font-weight: 800;
    line-height: 1.14;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .composition-interpretive-other-featured .composition-interpretive-subtitle {
    font-size: 12.5px;
    line-height: 1.48;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-other-second-featured {
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.58fr);
    gap: 14px;
    align-items: start;
    padding-top: 20px;
    border-top: 1px solid #dfe5eb;
  }

  .composition-interpretive-other-second-featured .composition-interpretive-media {
    aspect-ratio: 16 / 9;
  }

  .composition-interpretive-other-second-featured .composition-interpretive-copy {
    display: grid;
    align-content: start;
    gap: 7px;
  }

  .composition-interpretive-other-second-featured .composition-interpretive-title {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.15;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-other-second-featured .composition-interpretive-subtitle {
    font-size: 12.5px;
    line-height: 1.48;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-other-compact-column {
    display: grid;
    grid-column: span 5;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    align-content: stretch;
    gap: 0;
    height: 100%;
    min-width: 0;
  }

  .composition-interpretive-other-compact {
    display: grid;
    grid-template-columns: minmax(128px, 0.94fr) minmax(0, 1.46fr);
    column-gap: 14px;
    row-gap: 6px;
    align-items: stretch;
    padding-block: 14px;
    border-top: 1px solid #dfe5eb;
  }

  .composition-interpretive-other-compact:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .composition-interpretive-other-compact:last-child {
    padding-bottom: 0;
  }

  .composition-interpretive-other-compact .composition-interpretive-media-link {
    display: block;
    align-self: start;
    height: auto;
  }

  .composition-interpretive-other-compact .composition-interpretive-media {
    aspect-ratio: 16 / 9;
    height: auto;
    min-height: 0;
  }

  .composition-interpretive-other-compact .composition-interpretive-copy {
    display: grid;
    align-content: start;
    gap: 6px;
    min-height: 92px;
  }

  .composition-interpretive-other-compact .composition-interpretive-title {
    min-height: calc(3 * 15px * 1.17);
    font-size: 15px;
    font-weight: 750;
    line-height: 1.17;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .composition-interpretive-other-compact > .composition-interpretive-subtitle {
    grid-column: 1 / -1;
    align-self: start;
    font-size: 12.5px;
    line-height: 1.48;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .composition-interpretive-media {
    display: block;
    overflow: hidden;
    width: 100%;
    min-width: 0;
    background: #e7ebef;
  }

  .composition-interpretive-media img,
  .composition-interpretive-media > video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .composition-interpretive-media > .public-video-embed-root {
    width: 100%;
    height: 100%;
  }

  .composition-interpretive-media-missing,
  .composition-interpretive-slot-empty {
    display: grid;
    place-items: center;
    min-height: 120px;
    color: #6d7b8c;
    font-size: 10px;
    font-weight: 800;
    text-align: center;
    text-transform: uppercase;
  }

  .composition-interpretive-label {
    color: #526173;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.22;
    text-transform: none;
  }

  .composition-interpretive-title {
    display: -webkit-box;
    overflow: hidden;
    color: #10151b;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
  }

  .composition-interpretive-title a {
    color: inherit;
    text-decoration: none;
  }

  .composition-interpretive-title a:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .composition-interpretive-subtitle {
    display: -webkit-box;
    overflow: hidden;
    color: #5f6d7e;
    font-weight: 400;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
  }


  @media (max-width: 980px) {
    .composition-interpretive-opening {
      grid-template-columns: minmax(0, 1fr);
    }

    .composition-interpretive-news,
    .composition-interpretive-editorial {
      grid-column: 1;
    }

    .composition-interpretive-editorial {
      padding-top: 24px;
      padding-left: 0;
      border-top: 1px solid #dfe5eb;
      border-left: 0;
    }

    .composition-interpretive-analysis-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .composition-interpretive-analysis-main,
    .composition-interpretive-analysis-center,
    .composition-interpretive-analysis-side {
      grid-column: 1;
    }

    .composition-interpretive-other-games-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .composition-interpretive-other-left,
    .composition-interpretive-other-compact-column {
      grid-column: 1;
    }
  }

  @media (max-width: 720px) {
    .composition-interpretive-dominant,
    .composition-interpretive-chronicles,
    .composition-interpretive-analysis-medium,
    .composition-interpretive-other-second-featured,
    .composition-interpretive-other-compact {
      grid-template-columns: minmax(0, 1fr);
    }

    .composition-interpretive-other-compact-column {
      grid-template-rows: repeat(3, auto);
    }

    .composition-interpretive-other-compact .composition-interpretive-title {
      min-height: 0;
    }

  }
`;

function PreviewMedia({ slot, slotKey }: { slot: HierarchicalCompositionSlot | null; slotKey: HierarchicalCompositionSlotKey }) {
  const inlineMedia = slotKey === "dominant_main" ? hierarchicalCompositionMediaSnapshot(slot) : null;
  const media = (
    <div className="composition-interpretive-media">
      {inlineMedia ? (
        <PublicInlineMediaPlayer
          fallbackPosterUrl={slot?.image_url_snapshot}
          fallbackTitle={slot?.title_snapshot}
          media={inlineMedia}
        />
      ) : slot?.image_url_snapshot ? (
        <img
          {...hierarchicalEditorialImageFramingProps(slotKey)}
          alt=""
          src={slot.image_url_snapshot}
        />
      ) : (
        <span className="composition-interpretive-media-missing">Imagem em falta · {slotKey}</span>
      )}
    </div>
  );

  return slot?.link_url_snapshot && !inlineMedia ? (
    <a className="composition-interpretive-media-link" href={slot.link_url_snapshot}>{media}</a>
  ) : media;
}

function PreviewNewsCopy({
  slot,
  slotKey,
  showSubtitle = true,
  titleColor = null,
}: {
  slot: HierarchicalCompositionSlot | null;
  slotKey: HierarchicalCompositionSlotKey;
  showSubtitle?: boolean;
  titleColor?: string | null;
}) {
  if (!slot) {
    return <div className="composition-interpretive-slot-empty">Lugar ainda vazio · {slotKey}</div>;
  }

  return (
    <div className="composition-interpretive-copy">
      <span className="composition-interpretive-label">{slot.label_snapshot}</span>
      <h3 className="composition-interpretive-title" style={titleColor ? { color: titleColor } : undefined}>
        {slot.link_url_snapshot ? <a href={slot.link_url_snapshot}>{slot.title_snapshot}</a> : slot.title_snapshot}
      </h3>
      {showSubtitle ? (
        <p className="composition-interpretive-subtitle">{slot.subtitle_snapshot}</p>
      ) : null}
    </div>
  );
}

export default function HierarchicalCompositionInterpretivePreview({
  blockOrder = ["opening", "zone_1", "zone_2", "video", "beyond"],
  beyondMatchdayItems,
  editorial = null,
  headlineTitleColor = "#10151B",
  matchdayNumber,
  roundupHeading,
  roundupHeadingColor,
  roundupItems,
  slots,
  videoHighlight,
  zone1Title = "Arbitragem e Reações",
  zone2Title = "Outros jogos da jornada",
}: HierarchicalCompositionInterpretivePreviewProps) {
  const slotsByKey = new Map(slots.map((slot) => [slot.slot_key, slot] as const));
  const editorialExcerpt = editorial?.excerpt?.trim() || "";
  const dominantSlot = slotsByKey.get(HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.dominant) ?? null;
  const analysisMainKey = HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.analysis.dominant;
  const analysisMainSlot = slotsByKey.get(analysisMainKey) ?? null;
  const otherFeaturedKey = HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.otherGames.primary;
  const otherFeaturedSlot = slotsByKey.get(otherFeaturedKey) ?? null;
  const otherSecondKey = HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.otherGames.second;
  const otherSecondSlot = slotsByKey.get(otherSecondKey) ?? null;
  const blockOrderIndex = (blockKey: HistoricalCompositionBlockKey) => blockOrder.indexOf(blockKey);

  return (
    <div className="composition-interpretive-preview" data-preview-only="hierarchical-interpretive-opening">
      <style>{interpretivePreviewStyles}</style>
      <section className="composition-interpretive-opening" aria-label="Abertura interpretativa da Jornada" style={{ order: blockOrderIndex("opening") }}>
        <div className="composition-interpretive-news">
          <article className="composition-interpretive-dominant" data-slot={HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.dominant}>
            <PreviewMedia slot={dominantSlot} slotKey={HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.dominant} />
            <PreviewNewsCopy slot={dominantSlot} slotKey={HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.dominant} titleColor={headlineTitleColor} />
          </article>

          <div className="composition-interpretive-chronicles" aria-label="Outras três crónicas">
            {HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.chronicles.map((slotKey) => {
              const slot = slotsByKey.get(slotKey) ?? null;
              return (
                <article className="composition-interpretive-chronicle" data-slot={slotKey} key={slotKey}>
                  <PreviewMedia slot={slot} slotKey={slotKey} />
                  <PreviewNewsCopy slot={slot} slotKey={slotKey} />
                </article>
              );
            })}
          </div>

        </div>

        <aside
          className="composition-interpretive-editorial"
          data-editorial-source="hierarchical-composition-draft"
          aria-label="Editorial da Jornada"
        >
          <span className="composition-interpretive-editorial-kicker">Editorial da Jornada</span>
          {editorial?.title?.trim() ? <h3>{editorial.title}</h3> : (
            <p className="composition-interpretive-editorial-empty">Título por preencher.</p>
          )}
          {editorialExcerpt ? (
            <div className="composition-interpretive-editorial-body">
              <p className="composition-interpretive-editorial-copy">
                {editorialExcerpt}
              </p>
            </div>
          ) : (
            <p className="composition-interpretive-editorial-empty">
              Excerto de capa por preencher.
            </p>
          )}
          {editorial?.author?.trim() ? (
            <p className="composition-interpretive-editorial-signature">{editorial.author}</p>
          ) : (
            <p className="composition-interpretive-editorial-empty">Autor por preencher.</p>
          )}
        </aside>
      </section>

      <section className="composition-interpretive-section composition-interpretive-analysis" aria-labelledby="interpretive-analysis-title" style={{ order: blockOrderIndex("zone_1") }}>
        <h2 className="composition-interpretive-section-heading" id="interpretive-analysis-title">{zone1Title}</h2>
        <div className="composition-interpretive-analysis-grid">
          <article className="composition-interpretive-analysis-main" data-editorial-weight="main" data-slot={analysisMainKey}>
            <PreviewMedia slot={analysisMainSlot} slotKey={analysisMainKey} />
            <PreviewNewsCopy slot={analysisMainSlot} slotKey={analysisMainKey} />
          </article>

          <div className="composition-interpretive-analysis-center" data-editorial-weight="development">
            {HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.analysis.center.map((slotKey) => {
              const slot = slotsByKey.get(slotKey) ?? null;
              return (
                <article
                  className="composition-interpretive-analysis-medium"
                  data-orientation="media-copy"
                  data-slot={slotKey}
                  key={slotKey}
                >
                  <PreviewMedia slot={slot} slotKey={slotKey} />
                  <PreviewNewsCopy
                    slot={slot}
                    slotKey={slotKey}
                  />
                </article>
              );
            })}
          </div>

          <div className="composition-interpretive-analysis-side" data-editorial-weight="complement">
            {HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.analysis.side.map((slotKey) => {
              const slot = slotsByKey.get(slotKey) ?? null;
              return (
                <article className="composition-interpretive-analysis-side-item" data-orientation="media-above" data-slot={slotKey} key={slotKey}>
                  <PreviewMedia slot={slot} slotKey={slotKey} />
                  <PreviewNewsCopy
                    slot={slot}
                    slotKey={slotKey}
                  />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="composition-interpretive-section composition-interpretive-other-games" aria-labelledby="interpretive-other-games-title" style={{ order: blockOrderIndex("zone_2") }}>
        <h2 className="composition-interpretive-section-heading" id="interpretive-other-games-title">{zone2Title}</h2>
        <div className="composition-interpretive-other-games-layout">
          <div className="composition-interpretive-other-left">
            <article className="composition-interpretive-other-featured" data-editorial-weight="featured-primary" data-slot={otherFeaturedKey}>
              <PreviewMedia slot={otherFeaturedSlot} slotKey={otherFeaturedKey} />
              <PreviewNewsCopy slot={otherFeaturedSlot} slotKey={otherFeaturedKey} />
            </article>

            <article className="composition-interpretive-other-second-featured" data-editorial-weight="featured-secondary" data-orientation="media-copy" data-slot={otherSecondKey}>
              <PreviewMedia slot={otherSecondSlot} slotKey={otherSecondKey} />
              <PreviewNewsCopy slot={otherSecondSlot} slotKey={otherSecondKey} />
            </article>
          </div>

          <div className="composition-interpretive-other-compact-column">
            {HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP.otherGames.compact.map((slotKey) => {
              const slot = slotsByKey.get(slotKey) ?? null;
              return (
                <article className="composition-interpretive-other-compact" data-editorial-weight="compact" data-orientation="media-copy" data-slot={slotKey} key={slotKey}>
                  <PreviewMedia slot={slot} slotKey={slotKey} />
                  <PreviewNewsCopy showSubtitle={false} slot={slot} slotKey={slotKey} />
                  {slot?.subtitle_snapshot ? (
                    <p className="composition-interpretive-subtitle">{slot.subtitle_snapshot}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <PublicHierarchicalPosteriorMoments
        beyondMatchdayItems={[]}
        includeV13PreviewStructure
        matchdayNumber={matchdayNumber}
        roundupHeading={roundupHeading}
        roundupHeadingColor={roundupHeadingColor}
        roundupItems={roundupItems}
        style={{ order: blockOrderIndex("video") }}
        videoHighlight={videoHighlight}
      />
      <PublicHierarchicalPosteriorMoments
        beyondMatchdayItems={beyondMatchdayItems}
        includeV13PreviewStructure
        matchdayNumber={matchdayNumber}
        roundupItems={[]}
        style={{ order: blockOrderIndex("beyond") }}
        videoHighlight={null}
      />
    </div>
  );
}
