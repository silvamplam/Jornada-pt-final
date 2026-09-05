import { editorialImageFramingProps } from "@/lib/editorial-image-framing";

export type PublicBeyondMatchdayNewsItem = {
  id: string;
  label?: string | null;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl: string;
  publishedAt?: string | null;
};

type PublicBeyondMatchdayNewsProps = {
  items: readonly (PublicBeyondMatchdayNewsItem | null)[];
  contextLabel: string;
  heading?: string | null;
  ariaLabel?: string;
  ownsSectionBoundary?: boolean;
};

const styles = `
  .public-beyond-matchday {
    width: 100%;
    box-sizing: border-box;
    padding: 28px 0 30px;
    border-top: 1px solid #dbe4ee;
  }

  .public-beyond-matchday[data-owns-section-boundary="false"] {
    padding-top: 0;
    padding-bottom: 0;
    border-top: 0;
  }

  .public-beyond-matchday-header {
    display: flex;
    gap: 18px;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .public-beyond-matchday-header h2,
  .public-beyond-matchday-header p {
    margin: 0;
  }

  .public-beyond-matchday-header h2 {
    color: #526174;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.01em;
    text-transform: uppercase;
  }

  .public-beyond-matchday-header p {
    color: #7a8592;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
  }

  .public-beyond-matchday-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }

  .public-beyond-matchday-grid[data-secondary-count="0"] {
    grid-template-columns: minmax(0, 760px);
  }

  .public-beyond-matchday-grid[data-lead-occupied="false"] {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-beyond-matchday-lead,
  .public-beyond-matchday-secondary-card {
    min-width: 0;
  }

  .public-beyond-matchday-media {
    display: block;
    width: 100%;
    overflow: hidden;
    background: #eef2f5;
    text-decoration: none;
  }

  .public-beyond-matchday-lead .public-beyond-matchday-media {
    aspect-ratio: 16 / 9;
  }

  .public-beyond-matchday-secondary-card .public-beyond-matchday-media {
    aspect-ratio: 16 / 9;
  }

  .public-beyond-matchday-media img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 180ms ease;
  }

  .public-beyond-matchday-media:hover img,
  .public-beyond-matchday-media:focus-visible img {
    transform: scale(1.015);
  }

  .public-beyond-matchday-copy {
    display: grid;
    gap: 5px;
    padding-top: 9px;
  }

  .public-beyond-matchday-label {
    color: #526174;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .public-beyond-matchday-title {
    display: block;
    overflow: visible;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 700;
    text-decoration: none;
    text-overflow: clip;
    -webkit-box-orient: initial;
  }

  .public-beyond-matchday-lead .public-beyond-matchday-title {
    font-size: 29px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  .public-beyond-matchday-subtitle {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: #526174;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.3;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .public-beyond-matchday-secondary-card[data-secondary-presentation="image"] .public-beyond-matchday-subtitle {
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .public-beyond-matchday-secondary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px 18px;
  }

  .public-beyond-matchday-slot-empty {
    min-width: 0;
  }

  .public-beyond-matchday-secondary-card .public-beyond-matchday-copy {
    gap: 4px;
    padding-top: 7px;
  }

  .public-beyond-matchday-secondary-card .public-beyond-matchday-title {
    font-size: 18px;
    line-height: 1.15;
    letter-spacing: -0.01em;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  .public-beyond-matchday-text-only {
    display: grid;
    align-content: start;
    min-height: 0;
    padding: 13px 0 0;
    border-top: 1px solid #dbe4ee;
  }

  .public-beyond-matchday-text-only .public-beyond-matchday-copy {
    padding-top: 0;
  }

  .public-beyond-matchday-text-only .public-beyond-matchday-subtitle {
    font-size: 12.5px;
    line-height: 1.4;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .public-beyond-matchday-title:hover,
  .public-beyond-matchday-title:focus-visible {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  @media (max-width: 900px) {
    .public-beyond-matchday-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 22px;
    }

    .public-beyond-matchday-grid[data-secondary-count="0"] {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 620px) {
    .public-beyond-matchday {
      padding-top: 22px;
    }

    .public-beyond-matchday-header {
      display: grid;
      gap: 5px;
      margin-bottom: 14px;
    }

    .public-beyond-matchday-lead .public-beyond-matchday-title {
      font-size: 25px;
    }

    .public-beyond-matchday-secondary-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
    }

    .public-beyond-matchday-secondary-card {
      display: grid;
      grid-template-columns: minmax(112px, 38%) minmax(0, 1fr);
      gap: 12px;
      align-items: start;
    }

    .public-beyond-matchday-secondary-card .public-beyond-matchday-media {
      aspect-ratio: 4 / 3;
    }

    .public-beyond-matchday-secondary-card .public-beyond-matchday-copy {
      padding-top: 0;
    }

    .public-beyond-matchday-secondary-card .public-beyond-matchday-title {
      font-size: 17px;
    }

    .public-beyond-matchday-secondary-card.public-beyond-matchday-text-only {
      display: block;
      min-height: 0;
      padding-top: 12px;
    }
  }
`;

function StoryMedia({ item }: { item: PublicBeyondMatchdayNewsItem }) {
  if (!item.imageUrl) return null;

  return (
    <a className="public-beyond-matchday-media" href={item.linkUrl} aria-label={item.title}>
      <img
        {...editorialImageFramingProps("wide")}
        src={item.imageUrl}
        alt=""
        loading="lazy"
      />
    </a>
  );
}

function StoryCopy({
  item,
  lead = false,
  showSubtitle = false,
}: {
  item: PublicBeyondMatchdayNewsItem;
  lead?: boolean;
  showSubtitle?: boolean;
}) {
  return (
    <div className="public-beyond-matchday-copy">
      {item.label ? <span className="public-beyond-matchday-label">{item.label}</span> : null}
      <a className="public-beyond-matchday-title" href={item.linkUrl}>
        {item.title}
      </a>
      {(lead || showSubtitle) && item.subtitle ? (
        <p className="public-beyond-matchday-subtitle">{item.subtitle}</p>
      ) : null}
    </div>
  );
}

export default function PublicBeyondMatchdayNews({
  items,
  contextLabel,
  heading = "PARA LÁ DA JORNADA",
  ariaLabel = "Para lá da jornada",
  ownsSectionBoundary = true,
}: PublicBeyondMatchdayNewsProps) {
  const visibleSlots = items
    .slice(0, 5)
    .map((item) =>
      item?.title.trim() && item.linkUrl.trim()
        ? item
        : null
    );

  if (!visibleSlots.some(Boolean)) return null;

  const lead = visibleSlots[0] ?? null;
  const secondary = visibleSlots.slice(1, 5);
  const secondaryCount = secondary.filter(Boolean).length;
  const visibleHeading = heading?.trim() ?? "";
  const visibleContextLabel = contextLabel.trim();
  const showHeader = Boolean(visibleHeading || visibleContextLabel);

  return (
    <section
      className="public-beyond-matchday"
      aria-label={ariaLabel}
      data-owns-section-boundary={ownsSectionBoundary}
    >
      <style>{styles}</style>
      {showHeader ? (
        <header className="public-beyond-matchday-header">
          {visibleHeading ? <h2>{visibleHeading}</h2> : null}
          {visibleContextLabel ? <p>{visibleContextLabel}</p> : null}
        </header>
      ) : null}

      <div
        className="public-beyond-matchday-grid"
        data-lead-occupied={Boolean(lead)}
        data-secondary-count={secondaryCount}
      >
        {lead ? (
          <article className="public-beyond-matchday-lead" data-public-slot-position="1">
            <StoryMedia item={lead} />
            <StoryCopy item={lead} lead />
          </article>
        ) : null}

        {secondaryCount > 0 ? (
          <div className="public-beyond-matchday-secondary-grid">
            {secondary.map((item, index) => {
              const isTextOnly = index >= 2;

              if (!item) {
                return (
                  <div
                    aria-hidden="true"
                    className="public-beyond-matchday-slot-empty"
                    data-public-slot-position={index + 2}
                    key={`empty:${index + 2}`}
                  />
                );
              }

              return (
                <article
                  className={`public-beyond-matchday-secondary-card${isTextOnly ? " public-beyond-matchday-text-only" : ""}`}
                  data-public-slot-position={index + 2}
                  data-secondary-presentation={isTextOnly ? "text" : "image"}
                  key={item.id}
                >
                  {isTextOnly ? null : <StoryMedia item={item} />}
                  <StoryCopy item={item} showSubtitle />
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
