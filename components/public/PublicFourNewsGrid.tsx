import { editorialImageFramingProps } from "@/lib/editorial-image-framing";

export type PublicFourNewsItem = {
  id: string;
  label?: string | null;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl: string;
};

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

  .public-four-news-grid[data-selection-count="1"] .public-four-news-card,
  .public-four-news-grid[data-selection-count="3"] .public-four-news-card:last-child {
    grid-column: 1 / -1;
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
}: {
  items: readonly PublicFourNewsItem[];
}) {
  if (items.length === 0) return null;

  return (
    <>
      <style>{styles}</style>

      <div
        className="public-four-news-grid"
        data-selection-count={items.length}
      >
        {items.map((item) => (
          <article className="public-four-news-card" key={item.id}>
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
        ))}
      </div>
    </>
  );
}
