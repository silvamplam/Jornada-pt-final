import type { CSSProperties } from "react";

import {
  buildEditorialHorizontalNewsRows,
  type EditorialHorizontalNewsItem
} from "@/lib/editorial-horizontal-news";

const horizontalNewsStyles = `
  .public-important-news {
    display: grid;
    gap: 16px;
    padding: 18px;
  }

  .public-important-news-grid {
    display: grid;
    gap: 14px;
  }

  .public-important-news-row {
    display: grid;
    grid-template-columns: repeat(var(--horizontal-news-columns), minmax(0, 1fr));
    gap: var(--horizontal-news-gap);
  }

  .public-important-news-card {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }

  .public-important-news-image,
  .public-important-news-image-link {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-important-news-image img,
  .public-important-news-image-link img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-important-news-label {
    color: #c40012;
    font-size: var(--horizontal-news-label-size);
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-important-news-title {
    display: block;
    color: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--horizontal-news-title-size);
    font-weight: 700;
    line-height: 1.15;
    text-decoration: none;
  }

  .public-important-news-title:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-important-news-card p {
    margin: 0;
    color: #607086;
    font-size: var(--horizontal-news-subtitle-size);
    line-height: 1.35;
  }

  @media (max-width: 1100px) {
    .public-important-news-row {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
    }
  }

  @media (max-width: 720px) {
    .public-important-news-row {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
  }

  @media (max-width: 460px) {
    .public-important-news-row {
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
  if (columnCount >= 6) {
    return {
      "--horizontal-news-columns": columnCount,
      "--horizontal-news-gap": "10px",
      "--horizontal-news-label-size": "10px",
      "--horizontal-news-title-size": "15px",
      "--horizontal-news-subtitle-size": "12px"
    };
  }

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
  ariaLabel = "Mais noticias"
}: {
  items: EditorialHorizontalNewsItem[];
  ariaLabel?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  const rows = buildEditorialHorizontalNewsRows(items, 6);

  return (
    <section className="public-matchday-panel public-important-news" aria-label={ariaLabel}>
      <style>{horizontalNewsStyles}</style>
      <div className="public-important-news-grid">
        {rows.map((row, rowIndex) => (
          <div
            className="public-important-news-row"
            key={`horizontal-news-row-${row[0]?.id ?? rowIndex}`}
            style={horizontalNewsRowStyle(row.length)}
          >
            {row.map((item) => (
              <article className="public-important-news-card" key={item.id}>
                {item.imageUrl && item.linkUrl ? (
                  <a className="public-important-news-image-link" href={item.linkUrl}>
                    <img src={item.imageUrl} alt="" />
                  </a>
                ) : item.imageUrl ? (
                  <span className="public-important-news-image">
                    <img src={item.imageUrl} alt="" />
                  </span>
                ) : null}
                {item.label ? (
                  <span className="public-important-news-label" style={item.labelColor ? { color: item.labelColor } : undefined}>
                    {item.label}
                  </span>
                ) : null}
                {item.linkUrl ? (
                  <a className="public-important-news-title" href={item.linkUrl}>
                    {item.title}
                  </a>
                ) : (
                  <strong className="public-important-news-title">{item.title}</strong>
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
