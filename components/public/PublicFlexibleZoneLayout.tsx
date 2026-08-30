import type {
  HierarchicalCompositionSlot,
  HierarchicalCompositionSlotKey,
} from "@/lib/editorial-hierarchical-composition";
import type { EditorialVisualFamily } from "@/lib/editorial-profiles";
import type { ReactNode } from "react";

import PublicBeyondMatchdayNews from "./PublicBeyondMatchdayNews";
import {
  HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP,
  PublicHierarchicalLiveLayouts,
} from "./PublicHierarchicalComposition";
import PublicMatchdayEditorialSectionFrame from "./PublicMatchdayEditorialSectionFrame";

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
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
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

  @media (max-width: 680px) {
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

  let zoneContent: ReactNode;

  if (zone.visualFamily === "five_news_secondary") {
    zoneContent = (
      <div
        className="public-flexible-zone"
        data-public-flexible-zone={zone.key}
        data-public-visual-family={zone.visualFamily}
      >
        <style>{styles}</style>

        <PublicBeyondMatchdayNews
          ariaLabel={publicAriaLabel}
          contextLabel=""
          heading={publicTitle || null}
          ownsSectionBoundary={false}
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
  } else {
    const slotKeys =
      zone.visualFamily === "six_news"
        ? SIX_NEWS_SLOT_KEYS
        : FIVE_NEWS_BALANCED_SLOT_KEYS;

    if (slotKeys.length !== zone.capacity) {
      return null;
    }

    zoneContent = (
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

  return (
    <PublicMatchdayEditorialSectionFrame kind="zone">
      {zoneContent}
    </PublicMatchdayEditorialSectionFrame>
  );
}
