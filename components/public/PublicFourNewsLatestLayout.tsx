import PublicLatestNewsBlock from "./PublicLatestNewsBlock";
import type { PublicEditorialLatestNews } from "./PublicEditorialLayout";

export type PublicFourNewsLatestItem = {
  id: string;
  label?: string | null;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl: string;
};

type PublicFourNewsLatestLayoutProps = {
  items: PublicFourNewsLatestItem[];
  latestNews: PublicEditorialLatestNews[];
  latestNewsTitle?: string;
  latestNewsTitleColor?: string | null;
};

const styles = `
  .public-four-news-latest-layout {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding-top: 20px;
    border-top: 1px solid #dfe5eb;
  }

  .public-four-news-latest-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
    gap: 24px;
    align-items: stretch;
    min-width: 0;
  }

  .public-four-news-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 18px;
    min-width: 0;
  }

  .public-four-news-card {
    display: grid;
    grid-template-columns: minmax(118px, 0.9fr) minmax(0, 1.25fr);
    gap: 12px;
    align-items: start;
    min-width: 0;
    padding-bottom: 14px;
    border-bottom: 1px solid #dfe5eb;
  }

  .public-four-news-card:nth-last-child(-n + 2) {
    padding-bottom: 0;
    border-bottom: 0;
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
    gap: 5px;
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
    display: -webkit-box;
    overflow: hidden;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.12;
    text-decoration: none;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .public-four-news-subtitle {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: #607086;
    font-size: 12px;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .public-four-news-latest-column {
    min-width: 0;
    min-height: 0;
    padding-left: 20px;
    border-left: 1px solid #dfe5eb;
  }

  .public-four-news-latest-column > .public-matchday-news {
    height: 100%;
    max-height: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    padding: 0;
    border: 0;
  }

  .public-four-news-latest-column .public-news-list {
    max-height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  @media (max-width: 980px) {
    .public-four-news-latest-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-four-news-latest-column {
      padding-left: 0;
      padding-top: 18px;
      border-left: 0;
      border-top: 1px solid #dfe5eb;
    }
  }

  @media (max-width: 680px) {
    .public-four-news-grid {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
    }

    .public-four-news-card,
    .public-four-news-card:nth-last-child(-n + 2) {
      padding-bottom: 14px;
      border-bottom: 1px solid #dfe5eb;
    }

    .public-four-news-card:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }
  }
`;

export default function PublicFourNewsLatestLayout({
  items,
  latestNews,
  latestNewsTitle,
  latestNewsTitleColor,
}: PublicFourNewsLatestLayoutProps) {
  const visibleItems = items.filter((item) => item.title.trim() && item.linkUrl.trim()).slice(0, 4);
  if (visibleItems.length !== 4 || latestNews.length === 0) return null;

  return (
    <section className="public-four-news-latest-layout" aria-label="Zona editorial de quatro notícias e Últimas">
      <style>{styles}</style>
      <div className="public-four-news-latest-grid">
        <div className="public-four-news-grid">
          {visibleItems.map((item) => (
            <article className="public-four-news-card" key={item.id}>
              {item.imageUrl ? (
                <a className="public-four-news-media" href={item.linkUrl} aria-label={item.title}>
                  <img alt="" src={item.imageUrl} loading="lazy" />
                </a>
              ) : null}
              <div className="public-four-news-copy">
                {item.label ? <span className="public-four-news-label">{item.label}</span> : null}
                <a className="public-four-news-title" href={item.linkUrl}>{item.title}</a>
                {item.subtitle ? <p className="public-four-news-subtitle">{item.subtitle}</p> : null}
              </div>
            </article>
          ))}
        </div>
        <div className="public-four-news-latest-column">
          <PublicLatestNewsBlock
            items={latestNews}
            title={latestNewsTitle}
            titleColor={latestNewsTitleColor}
          />
        </div>
      </div>
    </section>
  );
}
