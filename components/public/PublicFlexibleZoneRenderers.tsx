import {
  editorialVisualFamilyDefinition,
  materializeEditorialVisualFamilySlots,
  type EditorialVisualFamily,
  type EditorialVisualFamilyRendererKey,
  type EditorialVisualFamilySlot,
} from "@/lib/editorial-visual-families";
import {
  isHierarchicalCompositionSlotKey,
  type HierarchicalCompositionSlot,
} from "@/lib/editorial-hierarchical-composition";
import type { ComponentType } from "react";

import PublicBeyondMatchdayNews from "./PublicBeyondMatchdayNews";
import PublicFourNewsGrid from "./PublicFourNewsGrid";
import {
  PublicHierarchicalLiveLayouts,
} from "./PublicHierarchicalComposition";
import {
  resolvePublicFlexibleZoneRenderer,
} from "./public-flexible-zone-renderer-registry";

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

export type PublicFlexibleZoneSlot =
  EditorialVisualFamilySlot<PublicFlexibleZoneItem>;

export type PublicFlexibleZone = Readonly<{
  key: string;
  visualFamily: EditorialVisualFamily;
  publicTitle: string;
  slots: readonly PublicFlexibleZoneSlot[];
}>;

export type PublicFlexibleZoneInput = Readonly<{
  key: string;
  visualFamily: EditorialVisualFamily;
  publicTitle: string;
  items: readonly PublicFlexibleZoneItem[];
}>;

type PublicFlexibleZoneRendererProps = Readonly<{
  ariaLabel: string;
  matchdayNumber: number;
  publicTitle: string;
  slots: readonly PublicFlexibleZoneSlot[];
  visualFamily: EditorialVisualFamily;
  zoneKey: string;
}>;

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

export function createPublicFlexibleZone(
  input: PublicFlexibleZoneInput,
): PublicFlexibleZone {
  const slotResult =
    materializeEditorialVisualFamilySlots(
      input.visualFamily,
      input.items.map((item) => ({
        position: item.sortOrder,
        item,
      })),
    );

  if (!slotResult.ok) {
    throw new Error(
      `Invalid public flexible zone (${input.key}): ${slotResult.reason}`,
    );
  }

  return {
    key: input.key,
    visualFamily: input.visualFamily,
    publicTitle: input.publicTitle,
    slots: slotResult.slots,
  };
}

function toHierarchicalSlots(
  slots: readonly PublicFlexibleZoneSlot[],
): HierarchicalCompositionSlot[] {
  return slots.flatMap((slot) => {
    if (!slot.item) return [];

    if (!isHierarchicalCompositionSlotKey(slot.key)) {
      throw new Error(
        `Invalid hierarchical slot key: ${slot.key}`,
      );
    }

    return [{
      id: slot.item.id,
      composition_id: "",
      slot_key: slot.key,
      bank_item_id: null,
      source_identity:
        `editorial_article:${slot.item.sourceId}`,
      label_snapshot: slot.item.label,
      title_snapshot: slot.item.title,
      subtitle_snapshot: slot.item.subtitle,
      image_url_snapshot: slot.item.imageUrl,
      link_url_snapshot: slot.item.linkUrl,
      created_at: null,
      updated_at: null,
    }];
  });
}

function HierarchicalZoneRenderer({
  ariaLabel,
  matchdayNumber,
  publicTitle,
  slots,
  visualFamily,
  zoneKey,
}: PublicFlexibleZoneRendererProps) {
  return (
    <section
      className="public-flexible-zone"
      aria-label={ariaLabel}
      data-public-flexible-zone={zoneKey}
      data-public-visual-family={visualFamily}
    >
      <style>{styles}</style>

      {publicTitle ? (
        <h2 className="public-flexible-zone-heading">
          {publicTitle}
        </h2>
      ) : null}

      <PublicHierarchicalLiveLayouts
        allowPartialSlots
        ariaLabel={ariaLabel}
        beyondMatchdayItems={[]}
        matchdayNumber={matchdayNumber}
        slots={toHierarchicalSlots(slots)}
      />
    </section>
  );
}

function SecondaryNewsZoneRenderer({
  ariaLabel,
  publicTitle,
  slots,
  visualFamily,
  zoneKey,
}: PublicFlexibleZoneRendererProps) {
  const hasItems = slots.some((slot) =>
    slot.item !== null
  );

  return (
    <div
      className="public-flexible-zone"
      data-public-flexible-zone={zoneKey}
      data-public-visual-family={visualFamily}
    >
      <style>{styles}</style>

      {hasItems ? (
        <PublicBeyondMatchdayNews
          ariaLabel={ariaLabel}
          contextLabel=""
          heading={publicTitle || null}
          ownsSectionBoundary={false}
          items={slots.map((slot) => {
            if (!slot.item) return null;

            return {
              id: slot.item.id,
              label: slot.item.label,
              title: slot.item.title,
              subtitle: slot.item.subtitle,
              imageUrl: slot.item.imageUrl,
              linkUrl: slot.item.linkUrl,
              publishedAt: slot.item.publishedAt,
            };
          })}
        />
      ) : publicTitle ? (
        <h2 className="public-flexible-zone-heading">
          {publicTitle}
        </h2>
      ) : null}
    </div>
  );
}

function FourNewsZoneRenderer({
  ariaLabel,
  publicTitle,
  slots,
  visualFamily,
  zoneKey,
}: PublicFlexibleZoneRendererProps) {
  return (
    <section
      className="public-flexible-zone"
      aria-label={ariaLabel}
      data-public-flexible-zone={zoneKey}
      data-public-visual-family={visualFamily}
    >
      <style>{styles}</style>

      {publicTitle ? (
        <h2 className="public-flexible-zone-heading">
          {publicTitle}
        </h2>
      ) : null}

      <PublicFourNewsGrid slots={slots} />
    </section>
  );
}

const PUBLIC_FLEXIBLE_ZONE_RENDERERS = Object.freeze({
  hierarchical_analysis: HierarchicalZoneRenderer,
  hierarchical_other_games: HierarchicalZoneRenderer,
  secondary_news: SecondaryNewsZoneRenderer,
  four_news_grid: FourNewsZoneRenderer,
}) satisfies Readonly<
  Record<
    EditorialVisualFamilyRendererKey,
    ComponentType<PublicFlexibleZoneRendererProps>
  >
>;

function assertPublicFlexibleZoneSlots(
  zone: PublicFlexibleZone,
) {
  const definition =
    editorialVisualFamilyDefinition(
      zone.visualFamily,
    );

  if (!definition) {
    throw new Error(
      `Unknown public flexible zone layout: ${zone.visualFamily}`,
    );
  }

  const valid =
    zone.slots.length === definition.slots.length
    && zone.slots.every((slot, index) => {
      const expected = definition.slots[index];

      return (
        slot.position === expected?.position
        && slot.key === expected.key
        && slot.role === expected.role
      );
    });

  if (!valid) {
    throw new Error(
      `Invalid public flexible zone slot schema: ${zone.key}`,
    );
  }

  return definition;
}

export function PublicFlexibleZoneContent({
  zone,
  matchdayNumber,
}: Readonly<{
  zone: PublicFlexibleZone;
  matchdayNumber: number;
}>) {
  const definition =
    assertPublicFlexibleZoneSlots(zone);

  const Renderer =
    resolvePublicFlexibleZoneRenderer(
      PUBLIC_FLEXIBLE_ZONE_RENDERERS,
      definition.rendererKey,
    );

  const publicTitle =
    zone.publicTitle.trim();

  return (
    <Renderer
      ariaLabel={publicTitle || "Bloco editorial"}
      matchdayNumber={matchdayNumber}
      publicTitle={publicTitle}
      slots={zone.slots}
      visualFamily={zone.visualFamily}
      zoneKey={zone.key}
    />
  );
}
