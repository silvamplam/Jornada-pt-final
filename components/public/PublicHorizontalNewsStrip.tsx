import type { CSSProperties } from "react";

import {
  buildEditorialHorizontalNewsRows,
  type EditorialHorizontalNewsItem
} from "@/lib/editorial-horizontal-news";

const horizontalNewsStyles = `
  .public-horizontal-news {
    display: grid;
    gap: 16px;
    padding: 22px 0 18px;
    border: 0;
    border-top: 1px solid #dbe4ee;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-horizontal-news-heading {
    margin: 0 0 2px;
    color: #10151b;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.1;
    text-transform: none;
  }

  .public-horizontal-news-stack {
    display: grid;
    gap: 14px;
  }

  .public-horizontal-news-row {
    display: grid;
    grid-template-columns: repeat(var(--horizontal-news-columns), minmax(0, 1fr));
    gap: var(--horizontal-news-gap);
  }

  .public-horizontal-news-card {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }

  .public-horizontal-news-image,
  .public-horizontal-news-image-link {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-horizontal-news-image img,
  .public-horizontal-news-image-link img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-horizontal-news-label {
    color: #c40012;
    font-size: var(--horizontal-news-label-size);
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-horizontal-news-title {
    display: block;
    color: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--horizontal-news-title-size);
    font-weight: 700;
    line-height: 1.15;
    text-decoration: none;
  }

  .public-horizontal-news-title:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-horizontal-news-card p {
    margin: 0;
    color: #607086;
    font-size: var(--horizontal-news-subtitle-size);
    line-height: 1.35;
  }

  .public-horizontal-news[data-editorial-scope="matchday"] .public-horizontal-news-label,
  .public-horizontal-news[data-editorial-scope="matchday"] .public-horizontal-news-title,
  .public-horizontal-news[data-editorial-scope="matchday"] .public-horizontal-news-card p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .public-horizontal-news[data-editorial-scope="matchday"] .public-horizontal-news-label {
    -webkit-line-clamp: 1;
  }

  .public-horizontal-news[data-editorial-scope="matchday"] .public-horizontal-news-title,
  .public-horizontal-news[data-editorial-scope="matchday"] .public-horizontal-news-card p {
    -webkit-line-clamp: 3;
  }

  @media (max-width: 1100px) {
    .public-horizontal-news-row {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
    }
  }

  @media (max-width: 720px) {
    .public-horizontal-news-row {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
  }

  @media (max-width: 460px) {
    .public-horizontal-news-row {
      grid-template-columns: 1fr;
    }
  }
`;

type HorizontalNewsRowStyle = CSSProperties & {
  "--horizontal-news-columns": number;
  "--horizontal-news-gap": string;
  "--horizontal-news-label-size": string;
  "--horizontal-news-title-size": string;
  "--horizontal-news-subtitle-size": string;
};

function horizontalNewsRowStyle(columnCount: number): HorizontalNewsRowStyle {
  if (columnCount === 5) {
    return {
      "--horizontal-news-columns": columnCount,
      "--horizontal-news-gap": "12px",
      "--horizontal-news-label-size": "10.5px",
      "--horizontal-news-title-size": "16px",
      "--horizontal-news-subtitle-size": "12.5px"
    };
  }

  return {
    "--horizontal-news-columns": columnCount,
    "--horizontal-news-gap": "14px",
    "--horizontal-news-label-size": "11px",
    "--horizontal-news-title-size": "17px",
    "--horizontal-news-subtitle-size": "13px"
  };
}

export default function PublicHorizontalNewsStrip({
  items,
  ariaLabel = "Mais noticias",
  scope = "home",
  title
}: {
  items: EditorialHorizontalNewsItem[];
  ariaLabel?: string;
  scope?: "home" | "matchday";
  title?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  const rows = buildEditorialHorizontalNewsRows(items, 5);

  return (
    <section className="public-matchday-panel public-horizontal-news" data-editorial-scope={scope} aria-label={ariaLabel}>
      <style>{horizontalNewsStyles}</style>
      {title ? <h2 className="public-horizontal-news-heading">{title}</h2> : null}
      <div className="public-horizontal-news-stack">
        {rows.map((row, rowIndex) => (
          <div
            className="public-horizontal-news-row"
            key={`horizontal-news-row-${row[0]?.id ?? rowIndex}`}
            style={horizontalNewsRowStyle(row.length)}
          >
            {row.map((item) => (
              <article className="public-horizontal-news-card" key={item.id}>
                {item.imageUrl && item.linkUrl ? (
                  <a className="public-horizontal-news-image-link" href={item.linkUrl}>
                    <img src={item.imageUrl} alt="" />
                  </a>
                ) : item.imageUrl ? (
                  <span className="public-horizontal-news-image">
                    <img src={item.imageUrl} alt="" />
                  </span>
                ) : null}
                {item.label ? (
                  <span className="public-horizontal-news-label" style={item.labelColor ? { color: item.labelColor } : undefined}>
                    {item.label}
                  </span>
                ) : null}
                {item.linkUrl ? (
                  <a className="public-horizontal-news-title" href={item.linkUrl}>
                    {item.title}
                  </a>
                ) : (
                  <strong className="public-horizontal-news-title">{item.title}</strong>
                )}
                {item.subtitle ? <p>{item.subtitle}</p> : null}
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
