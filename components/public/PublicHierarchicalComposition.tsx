import {
  HIERARCHICAL_COMPOSITION_MOMENTS,
  hierarchicalCompositionMediaSnapshot,
  type HierarchicalCompositionSlot,
  type HierarchicalCompositionSlotKey,
} from "@/lib/editorial-hierarchical-composition";

import PublicBeyondMatchdayNews, { type PublicBeyondMatchdayNewsItem } from "./PublicBeyondMatchdayNews";
import { PublicEditorialLayout, PublicInlineMediaPlayer, type PublicComplementaryData } from "./PublicEditorialLayout";
import type { RoundupVideoItem } from "./RoundupVideoSwitcher";

type PublicHierarchicalCompositionProps = {
  slots: HierarchicalCompositionSlot[];
  roundupItems?: RoundupVideoItem[];
  roundupHeading?: string | null;
  roundupHeadingColor?: string | null;
  matchdayNumber?: number | null;
  videoHighlight?: PublicComplementaryData | null;
  beyondMatchdayItems?: PublicBeyondMatchdayNewsItem[];
  showEmptySlots?: boolean;
  ariaLabel?: string;
  backofficePreviewMomentKeys?: Array<(typeof HIERARCHICAL_COMPOSITION_MOMENTS)[number]["key"]>;
};

export type PublicHierarchicalPosteriorMomentsProps = Pick<
  PublicHierarchicalCompositionProps,
  "roundupItems" | "roundupHeading" | "roundupHeadingColor" | "matchdayNumber" | "videoHighlight" | "beyondMatchdayItems"
> & {
  includeV13PreviewStructure?: boolean;
};

const hierarchicalV13PreviewStructureStyles = `
  .public-hierarchical-v13-preview .public-roundup-scroll-frame,
  .public-hierarchical-v13-preview .public-roundup-video-panel,
  .public-hierarchical-v13-preview .public-roundup-video-block {
    min-width: 0;
  }

  .public-hierarchical-v13-preview .public-roundup-scroll-frame,
  .public-hierarchical-v13-preview .public-complement-media {
    position: relative;
    overflow: hidden;
  }

  .public-hierarchical-v13-preview .public-roundup-scroll-window {
    overflow-y: auto;
  }

  .public-hierarchical-v13-preview .public-roundup-switch-item {
    display: grid;
    align-items: center;
    min-width: 0;
  }

  .public-hierarchical-v13-preview .public-roundup-meta,
  .public-hierarchical-v13-preview .public-roundup-active-meta {
    display: flex;
    align-items: baseline;
    min-width: 0;
  }

  .public-hierarchical-v13-preview .public-roundup-video-block,
  .public-hierarchical-v13-preview .public-complement-body {
    display: grid;
    min-width: 0;
  }

  .public-hierarchical-v13-preview .public-roundup-switch-item strong,
  .public-hierarchical-v13-preview .public-roundup-switch-item small {
    min-width: 0;
  }

  .public-hierarchical-v13-preview .public-complement-media > img,
  .public-hierarchical-v13-preview .public-complement-media > video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-hierarchical-v13-preview .public-complement-title-link {
    color: inherit;
    text-decoration: none;
  }
`;

const hierarchicalPosteriorMomentsStyles = `
  .public-hierarchical-posterior-moments {
    display: grid;
    gap: 34px;
    width: 100%;
    min-width: 0;
  }

  .public-hierarchical-videos {
    padding-top: 24px;
    border-top: 2px solid #10151b;
  }
`;

const hierarchicalCompositionStyles = `
  .public-hierarchical-composition {
    display: grid;
    gap: 34px;
    width: 100%;
    min-width: 0;
  }

  .public-hierarchical-moment {
    display: grid;
    gap: 18px;
    min-width: 0;
  }

  .public-hierarchical-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 20px;
    min-width: 0;
  }

  .public-hierarchical-card {
    display: grid;
    align-content: start;
    gap: 9px;
    min-width: 0;
    color: #10151b;
  }

  .public-hierarchical-card-media {
    display: block;
    overflow: hidden;
    width: 100%;
    background: #e7ebef;
  }

  .public-hierarchical-card-media img,
  .public-hierarchical-card-media > video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-hierarchical-card-media > .public-video-embed-root {
    width: 100%;
    height: 100%;
  }

  .public-hierarchical-card-media-missing {
    display: grid;
    place-items: center;
    height: 100%;
    color: #607086;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-hierarchical-card-label,
  .public-hierarchical-card-title,
  .public-hierarchical-card-subtitle {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
  }

  .public-hierarchical-card-label {
    color: #d71920;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .public-hierarchical-card-title {
    color: #10151b;
    font-weight: 900;
    line-height: 1.04;
  }

  .public-hierarchical-card-title a {
    color: inherit;
    text-decoration: none;
  }

  .public-hierarchical-card-title a:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-hierarchical-card-subtitle {
    color: #526174;
    font-size: 14px;
    line-height: 1.35;
  }

  .public-hierarchical-slot-empty {
    display: grid;
    place-items: center;
    min-height: 150px;
    border: 1px dashed #aeb9c6;
    background: #f7f9fb;
    color: #607086;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    font-weight: 900;
    text-align: center;
    text-transform: uppercase;
  }

  .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card[data-slot="dominant_main"] {
    grid-column: span 8;
    grid-row: span 2;
  }

  .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card[data-slot="dominant_side_top"],
  .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card[data-slot="dominant_side_bottom"] {
    grid-column: span 4;
  }

  .public-hierarchical-card[data-slot="dominant_main"] .public-hierarchical-card-media {
    height: 470px;
  }

  .public-hierarchical-card[data-slot="dominant_main"] .public-hierarchical-card-title {
    font-size: clamp(31px, 2.6vw, 40px);
  }

  .public-hierarchical-card[data-slot^="dominant_side_"] .public-hierarchical-card-media {
    height: 155px;
  }

  .public-hierarchical-card[data-slot^="dominant_side_"] .public-hierarchical-card-title {
    font-size: 22px;
  }

  .public-hierarchical-moment[data-moment="other-chronicles"] .public-hierarchical-card,
  .public-hierarchical-moment[data-moment="closing"] .public-hierarchical-card {
    grid-column: span 4;
  }

  .public-hierarchical-moment[data-moment="other-chronicles"] .public-hierarchical-card-media,
  .public-hierarchical-moment[data-moment="strong"] .public-hierarchical-card-media,
  .public-hierarchical-moment[data-moment="secondary"] .public-hierarchical-card-media,
  .public-hierarchical-moment[data-moment="closing"] .public-hierarchical-card-media {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .public-hierarchical-moment[data-moment="other-chronicles"] .public-hierarchical-card-title {
    font-size: 25px;
  }

  .public-hierarchical-moment[data-moment="strong"] .public-hierarchical-card {
    grid-column: span 6;
    align-self: start;
    gap: 10px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-hierarchical-moment[data-moment="strong"] {
    margin-block: 12px 8px;
    padding-top: 18px;
    border-top: 1px solid #dfe5eb;
    background: transparent;
  }

  .public-hierarchical-moment[data-moment="strong"] .public-hierarchical-grid {
    column-gap: 24px;
    row-gap: 28px;
  }

  .public-hierarchical-moment[data-moment="strong"] .public-hierarchical-card .public-hierarchical-card-label {
    color: #d71920;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.2;
  }

  .public-hierarchical-moment[data-moment="strong"] .public-hierarchical-card .public-hierarchical-card-title {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.12;
  }

  .public-hierarchical-moment[data-moment="strong"] .public-hierarchical-card .public-hierarchical-card-subtitle {
    color: #5f6d7e;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
  }

  .public-hierarchical-moment[data-moment="secondary"] {
    margin-block: 10px 24px;
    padding-top: 18px;
    border-top: 1px solid #dfe5eb;
    background: transparent;
  }

  .public-hierarchical-moment[data-moment="secondary"] .public-hierarchical-grid {
    column-gap: 24px;
    row-gap: 28px;
  }

  .public-hierarchical-moment[data-moment="secondary"] .public-hierarchical-card {
    grid-column: span 3;
    gap: 7px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-hierarchical-moment[data-moment="secondary"] .public-hierarchical-card .public-hierarchical-card-label {
    color: #6d7b8c;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: 0.02em;
  }

  .public-hierarchical-moment[data-moment="secondary"] .public-hierarchical-card .public-hierarchical-card-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.15;
  }

  .public-hierarchical-moment[data-moment="secondary"] .public-hierarchical-card .public-hierarchical-card-subtitle {
    color: #647184;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.55;
  }

  .public-hierarchical-moment[data-moment="closing"] {
    gap: 14px;
  }

  .public-hierarchical-moment[data-moment="closing"] .public-hierarchical-grid {
    gap: 18px;
  }

  .public-hierarchical-moment[data-moment="closing"] .public-hierarchical-card {
    gap: 6px;
  }

  .public-hierarchical-moment[data-moment="closing"] .public-hierarchical-card-title {
    font-size: 18px;
  }

  @media (max-width: 1180px) {
    .public-hierarchical-composition {
      gap: 28px;
    }

    .public-hierarchical-grid {
      gap: 16px;
    }

    .public-hierarchical-card[data-slot="dominant_main"] .public-hierarchical-card-media {
      height: 380px;
    }
  }

  @media (max-width: 840px) {
    .public-hierarchical-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .public-hierarchical-moment .public-hierarchical-card,
    .public-hierarchical-moment[data-moment] .public-hierarchical-card {
      grid-column: span 1;
      grid-row: auto;
    }

    .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card[data-slot="dominant_main"] {
      grid-column: 1 / -1;
    }

    .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card-media {
      height: 190px;
    }

    .public-hierarchical-card .public-hierarchical-card-title,
    .public-hierarchical-moment[data-moment] .public-hierarchical-card-title {
      font-size: 22px;
    }

    .public-hierarchical-card[data-slot="dominant_main"] .public-hierarchical-card-media {
      height: 360px;
    }

    .public-hierarchical-card[data-slot="dominant_main"] .public-hierarchical-card-title {
      font-size: 32px;
    }
  }

  @media (max-width: 680px) {
    .public-hierarchical-composition {
      gap: 24px;
    }

    .public-hierarchical-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-hierarchical-moment .public-hierarchical-card,
    .public-hierarchical-moment[data-moment] .public-hierarchical-card,
    .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card[data-slot="dominant_main"] {
      grid-column: 1;
    }

    .public-hierarchical-moment[data-moment="dominant"] .public-hierarchical-card-media {
      height: 220px;
    }

    .public-hierarchical-card .public-hierarchical-card-title,
    .public-hierarchical-moment[data-moment] .public-hierarchical-card-title,
    .public-hierarchical-card[data-slot="dominant_main"] .public-hierarchical-card-title {
      font-size: 25px;
    }
  }
`;

function HierarchicalCard({
  slot,
  slotKey,
  showEmptySlots,
}: {
  slot: HierarchicalCompositionSlot | null;
  slotKey: HierarchicalCompositionSlotKey;
  showEmptySlots: boolean;
}) {
  if (!slot) {
    return showEmptySlots ? (
      <article className="public-hierarchical-card" data-slot={slotKey}>
        <div className="public-hierarchical-slot-empty">Lugar ainda vazio</div>
      </article>
    ) : null;
  }

  const inlineMedia = slotKey === "dominant_main" ? hierarchicalCompositionMediaSnapshot(slot) : null;
  const media = (
    <div className="public-hierarchical-card-media">
      {inlineMedia ? (
        <PublicInlineMediaPlayer
          fallbackPosterUrl={slot.image_url_snapshot}
          fallbackTitle={slot.title_snapshot}
          media={inlineMedia}
        />
      ) : slot.image_url_snapshot ? (
        <img alt="" src={slot.image_url_snapshot} />
      ) : (
        <span className="public-hierarchical-card-media-missing">Imagem em falta</span>
      )}
    </div>
  );

  return (
    <article className="public-hierarchical-card" data-slot={slotKey}>
      {slot.link_url_snapshot && !inlineMedia ? <a href={slot.link_url_snapshot}>{media}</a> : media}
      <span className="public-hierarchical-card-label">{slot.label_snapshot}</span>
      <h3 className="public-hierarchical-card-title">
        {slot.link_url_snapshot ? <a href={slot.link_url_snapshot}>{slot.title_snapshot}</a> : slot.title_snapshot}
      </h3>
      <p className="public-hierarchical-card-subtitle">{slot.subtitle_snapshot}</p>
    </article>
  );
}

export function PublicHierarchicalPosteriorMoments({
  roundupItems = [],
  roundupHeading,
  roundupHeadingColor,
  matchdayNumber,
  videoHighlight = null,
  beyondMatchdayItems = [],
  includeV13PreviewStructure = false,
}: PublicHierarchicalPosteriorMomentsProps) {
  if (roundupItems.length === 0 && beyondMatchdayItems.length === 0) return null;

  return (
    <div
      className={`public-hierarchical-posterior-moments${includeV13PreviewStructure ? " public-hierarchical-v13-preview" : ""}`}
      data-hierarchical-posterior-moments="true"
    >
      <style>{hierarchicalPosteriorMomentsStyles}</style>
      {includeV13PreviewStructure ? <style>{hierarchicalV13PreviewStructureStyles}</style> : null}
      {roundupItems.length > 0 ? (
        <div className="public-hierarchical-videos">
          <PublicEditorialLayout
            ariaLabel="A Jornada em Vídeo"
            scope="matchday"
            showHeadline={false}
            showLatestNews={false}
            showSideBlock={false}
            sideBlock={{ isPublished: false }}
            headline={{ fallbackTitle: "", fallbackSubtitle: "" }}
            belowHeadline={{
              highlightHeading: "",
              highlights: [],
              roundupItems,
              showRoundupVideo: roundupItems.length > 0,
              roundupHeading: roundupHeading || "A JORNADA EM VÍDEO",
              roundupHeadingColor,
              matchdayNumber,
              complementary: videoHighlight ?? { isPublished: false },
            }}
            latestNews={[]}
          />
        </div>
      ) : null}
      {beyondMatchdayItems.length > 0 ? (
        <PublicBeyondMatchdayNews
          contextLabel={`ATUALIDADE NO MOMENTO DA JORNADA ${String(matchdayNumber ?? "").padStart(2, "0")}`}
          items={beyondMatchdayItems}
        />
      ) : null}
    </div>
  );
}

export default function PublicHierarchicalComposition({
  slots,
  roundupItems = [],
  roundupHeading,
  roundupHeadingColor,
  matchdayNumber,
  videoHighlight = null,
  beyondMatchdayItems = [],
  showEmptySlots = false,
  ariaLabel = "Composição hierárquica da jornada",
  backofficePreviewMomentKeys,
}: PublicHierarchicalCompositionProps) {
  const slotsByKey = new Map(slots.map((slot) => [slot.slot_key, slot] as const));
  const visibleMoments = backofficePreviewMomentKeys
    ? HIERARCHICAL_COMPOSITION_MOMENTS.filter((moment) => backofficePreviewMomentKeys.includes(moment.key))
    : HIERARCHICAL_COMPOSITION_MOMENTS;

  return (
    <section className="public-matchday-panel public-hierarchical-composition" aria-label={ariaLabel}>
      <style>{hierarchicalCompositionStyles}</style>
      {visibleMoments.map((moment) => (
        <section className="public-hierarchical-moment" data-moment={moment.key} key={moment.key} aria-label={moment.title}>
          <div className="public-hierarchical-grid">
            {moment.slots.map((slotDefinition) => (
              <HierarchicalCard
                key={slotDefinition.key}
                showEmptySlots={showEmptySlots}
                slot={slotsByKey.get(slotDefinition.key) ?? null}
                slotKey={slotDefinition.key}
              />
            ))}
          </div>
        </section>
      ))}
      <PublicHierarchicalPosteriorMoments
        beyondMatchdayItems={beyondMatchdayItems}
        matchdayNumber={matchdayNumber}
        roundupHeading={roundupHeading}
        roundupHeadingColor={roundupHeadingColor}
        roundupItems={roundupItems}
        videoHighlight={videoHighlight}
      />
    </section>
  );
}
