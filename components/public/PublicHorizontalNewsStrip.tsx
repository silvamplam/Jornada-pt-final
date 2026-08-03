import type { EditorialHorizontalNewsItem } from "@/lib/editorial-horizontal-news";

const horizontalNewsStyles = `
  .public-important-news {
    display: grid;
    gap: 16px;
    padding: 18px;
  }

  .public-important-news-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
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
    font-size: 11px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-important-news-title {
    display: block;
    color: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 17px;
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
    font-size: 13px;
    line-height: 1.35;
  }
`;

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

  return (
    <section className="public-matchday-panel public-important-news" aria-label={ariaLabel}>
      <style>{horizontalNewsStyles}</style>
      <div className="public-important-news-grid">
        {items.map((item) => (
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
            {item.label ? <span className="public-important-news-label">{item.label}</span> : null}
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
    </section>
  );
}
