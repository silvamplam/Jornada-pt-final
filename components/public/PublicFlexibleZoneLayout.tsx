import type {
  HierarchicalCompositionSlot,
  HierarchicalCompositionSlotKey,
} from "@/lib/editorial-hierarchical-composition";
import type { EditorialVisualFamily } from "@/lib/editorial-profiles";

import PublicBeyondMatchdayNews from "./PublicBeyondMatchdayNews";
import {
  HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP,
  PublicHierarchicalLiveLayouts,
} from "./PublicHierarchicalComposition";

export type PublicFlexibleZoneItem = Readonly<{
  id: string;
  sourceId: string;
  sortOrder: number;
  label: string | null;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  publishedAt: string | null;
}>;

export type PublicFlexibleZone = Readonly<{
  key: string;
  capacity: number;
  visualFamily: EditorialVisualFamily;
  publicTitle: string;
  items: readonly PublicFlexibleZoneItem[];
}>;

const SIX_NEWS_SLOT_KEYS:
  readonly HierarchicalCompositionSlotKey[] = [
    HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP
      .analysis.dominant,
    ...HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP
      .analysis.center,
    ...HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP
      .analysis.side,
  ];

const FIVE_NEWS_BALANCED_SLOT_KEYS:
  readonly HierarchicalCompositionSlotKey[] = [
    HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP
      .otherGames.primary,
    HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP
      .otherGames.second,
    ...HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP
      .otherGames.compact,
  ];

const styles = `
  .public-flexible-zone {
    width: min(100%, 1200px);
    max-width: 1200px;
    min-width: 0;
    box-sizing: border-box;
    margin: clamp(46px, 5vw, 68px) auto 0;
    padding-top: clamp(24px, 2.6vw, 34px);
    border-top: 1px solid #dbe4ee;
  }

  .public-flexible-zone-heading {
    margin: 0 0 16px;
    color: #526174;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 18px;
    font-weight: 850;
    line-height: 1;
    letter-spacing: -0.01em;
    text-transform: uppercase;
  }

  .public-flexible-zone >
  .public-hierarchical-live-layouts {
    margin-top: 0;
    padding-top: 0;
  }

  .public-flexible-zone >
  .public-hierarchical-live-layouts::before,
  .public-flexible-zone >
  .public-hierarchical-live-layouts::after {
    display: none;
    content: none;
  }

  .public-flexible-zone-secondary {
    padding-top: 0;
    border-top: 0;
  }

  .public-flexible-zone-secondary
  .public-beyond-matchday {
    padding-top: clamp(24px, 2.6vw, 34px);
  }

  @media (max-width: 680px) {
    .public-flexible-zone {
      margin-top: 36px;
      padding-top: 20px;
    }

    .public-flexible-zone-heading {
      font-size: 16px;
    }
  }
`;

function flexibleSlots(
  items: readonly PublicFlexibleZoneItem[],
  slotKeys: readonly HierarchicalCompositionSlotKey[],
): HierarchicalCompositionSlot[] {
  return items.map(
    (item, index) => ({
      id: item.id,
      composition_id: "",
      slot_key: slotKeys[index],
      bank_item_id: null,
      source_identity:
        `editorial_article:${item.sourceId}`,
      label_snapshot: item.label,
      title_snapshot: item.title,
      subtitle_snapshot: item.subtitle,
      image_url_snapshot: item.imageUrl,
      link_url_snapshot: item.linkUrl,
      created_at: null,
      updated_at: null,
    }),
  );
}

export default function PublicFlexibleZoneLayout({
  zone,
  matchdayNumber,
}: {
  zone: PublicFlexibleZone;
  matchdayNumber: number;
}) {
  const items =
    [...zone.items].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder,
    );

  const publicTitle =
    zone.publicTitle.trim();

  const publicAriaLabel =
    publicTitle || "Bloco editorial";

  if (items.length !== zone.capacity) {
    return null;
  }

  if (
    zone.visualFamily
      === "five_news_secondary"
  ) {
    return (
      <div
        className="public-flexible-zone public-flexible-zone-secondary"
        data-public-flexible-zone={zone.key}
        data-public-visual-family={zone.visualFamily}
      >
        <style>{styles}</style>

        <PublicBeyondMatchdayNews
          ariaLabel={publicAriaLabel}
          contextLabel=""
          heading={publicTitle || null}
          items={items.map((item) => ({
            id: item.id,
            label: item.label,
            title: item.title,
            subtitle: item.subtitle,
            imageUrl: item.imageUrl,
            linkUrl: item.linkUrl,
            publishedAt: item.publishedAt,
          }))}
        />
      </div>
    );
  }

  const slotKeys =
    zone.visualFamily === "six_news"
      ? SIX_NEWS_SLOT_KEYS
      : FIVE_NEWS_BALANCED_SLOT_KEYS;

  if (slotKeys.length !== zone.capacity) {
    return null;
  }

  return (
    <section
      className="public-flexible-zone"
      aria-label={publicAriaLabel}
      data-public-flexible-zone={zone.key}
      data-public-visual-family={zone.visualFamily}
    >
      <style>{styles}</style>

      {publicTitle ? (
        <h2 className="public-flexible-zone-heading">
          {publicTitle}
        </h2>
      ) : null}

      <PublicHierarchicalLiveLayouts
        ariaLabel={publicAriaLabel}
        beyondMatchdayItems={[]}
        matchdayNumber={matchdayNumber}
        slots={flexibleSlots(
          items,
          slotKeys,
        )}
      />
    </section>
  );
}