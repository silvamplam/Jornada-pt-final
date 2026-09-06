import { editorialImageFramingProps } from "@/lib/editorial-image-framing";

export type PublicFourNewsItem = {
  id: string;
  label?: string | null;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl: string;
};

export type PublicFourNewsGridSlot = Readonly<{
  position: number;
  item: PublicFourNewsItem | null;
}>;

type PublicFourNewsGridProps =
  | Readonly<{
      items: readonly PublicFourNewsItem[];
      slots?: never;
    }>
  | Readonly<{
      items?: never;
      slots: readonly PublicFourNewsGridSlot[];
    }>;

const styles = `
  .public-four-news-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
    align-content: start;
    align-self: start;
    min-width: 0;
  }

  .public-four-news-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
    align-content: start;
    min-width: 0;
  }

  .public-four-news-grid[data-preserve-slots="false"][data-selection-count="1"]
    .public-four-news-card,
  .public-four-news-grid[data-preserve-slots="false"][data-selection-count="3"]
    .public-four-news-card:last-child {
    grid-column: 1 / -1;
  }

  .public-four-news-vacancy {
    min-width: 0;
    min-height: 1px;
  }

  .public-four-news-media {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #eef2f5;
    text-decoration: none;
  }

  .public-four-news-media img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-four-news-copy {
    display: grid;
    gap: 4px;
    align-content: start;
    min-width: 0;
  }

  .public-four-news-label {
    color: #526174;
    font-size: 10px;
    font-weight: 900;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .public-four-news-title {
    display: block;
    overflow: visible;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.22;
    padding-block: 0.11em;
    box-sizing: border-box;
    text-decoration: none;
    text-overflow: clip;
    -webkit-box-orient: initial;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  .public-four-news-subtitle {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: #607086;
    font-size: 12px;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  @media (max-width: 680px) {
    .public-four-news-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

export default function PublicFourNewsGrid({
  items,
  slots,
}: PublicFourNewsGridProps) {
  if ((items === undefined) === (slots === undefined)) {
    throw new Error(
      "PublicFourNewsGrid requires exactly one source",
    );
  }

  const preserveSlots = slots !== undefined;
  const gridSlots: readonly PublicFourNewsGridSlot[] =
    slots
    ?? items!.map((item, index) => ({
      position: index + 1,
      item,
    }));

  if (
    preserveSlots
    && (
      gridSlots.length !== 4
      || gridSlots.some(
        (slot, index) => slot.position !== index + 1,
      )
    )
  ) {
    throw new Error(
      "Invalid sparse four-news slot schema",
    );
  }

  if (!preserveSlots && gridSlots.length > 4) {
    throw new Error(
      "Four-news grid exceeds capacity",
    );
  }

  const visibleCount = gridSlots.filter(
    (slot) => slot.item !== null,
  ).length;

  if (visibleCount === 0) return null;

  return (
    <>
      <style>{styles}</style>

      <div
        className="public-four-news-grid"
        data-preserve-slots={preserveSlots}
        data-selection-count={visibleCount}
      >
        {gridSlots.map((slot) => {
          const item = slot.item;

          if (!item) {
            return preserveSlots ? (
              <div
                aria-hidden="true"
                className="public-four-news-vacancy"
                data-public-four-news-slot-position={
                  slot.position
                }
                key={slot.position}
              />
            ) : null;
          }

          return (
            <article
              className="public-four-news-card"
              data-public-four-news-slot-position={
                slot.position
              }
              key={item.id}
            >
              {item.imageUrl ? (
                <a
                  className="public-four-news-media"
                  href={item.linkUrl}
                  aria-label={item.title}
                >
                  <img
                    {...editorialImageFramingProps("wide")}
                    alt=""
                    src={item.imageUrl}
                    loading="lazy"
                  />
                </a>
              ) : null}

              <div className="public-four-news-copy">
                {item.label ? (
                  <span className="public-four-news-label">
                    {item.label}
                  </span>
                ) : null}

                <a
                  className="public-four-news-title"
                  href={item.linkUrl}
                >
                  {item.title}
                </a>

                {item.subtitle ? (
                  <p className="public-four-news-subtitle">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
