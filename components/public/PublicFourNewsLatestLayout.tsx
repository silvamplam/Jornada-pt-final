import PublicLatestNewsBlock from "./PublicLatestNewsBlock";
import type { PublicEditorialLatestNews } from "./PublicEditorialLayout";
import PublicSideAdvertisement from "./PublicSideAdvertisement";

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
    position: relative;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin-top: clamp(46px, 5vw, 68px);
    padding-top: clamp(24px, 2.6vw, 34px);
    border-top: 0;
  }

  .public-four-news-latest-layout::before {
    position: absolute;
    top: -6px;
    right: 3%;
    left: 8%;
    height: 28px;
    background:
      linear-gradient(
        90deg,
        rgba(159, 177, 196, 0) 0%,
        rgba(145, 165, 186, 0.10) 16%,
        rgba(121, 145, 171, 0.18) 46%,
        rgba(103, 128, 156, 0.10) 72%,
        rgba(159, 177, 196, 0) 100%
      ),
      radial-gradient(
        58% 140% at 66% 50%,
        rgba(119, 144, 171, 0.22) 0%,
        rgba(134, 157, 181, 0.12) 36%,
        rgba(171, 187, 203, 0.00) 100%
      );
    filter: blur(7px);
    opacity: 0.92;
    content: "";
    pointer-events: none;
  }

  .public-four-news-latest-layout::after {
    position: absolute;
    top: 7px;
    right: 16%;
    left: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      rgba(143, 162, 182, 0) 0%,
      rgba(132, 153, 176, 0.14) 22%,
      rgba(104, 128, 154, 0.28) 50%,
      rgba(141, 160, 179, 0.14) 78%,
      rgba(143, 162, 182, 0) 100%
    );
    content: "";
    pointer-events: none;
  }

  .public-four-news-latest-grid {
    display: grid;
    grid-template-columns:
      minmax(0, 1.22fr)
      minmax(0, 1.22fr)
      minmax(250px, 1fr)
      minmax(220px, 0.88fr);
    gap: 18px;
    align-items: stretch;
    min-width: 0;
  }

  .public-four-news-latest-grid:not(:has(.public-four-news-ad-slot)) {
    grid-template-columns:
      minmax(0, 1.22fr)
      minmax(0, 1.22fr)
      minmax(250px, 1fr);
  }

  .public-four-news-ad-column:empty {
    display: none;
  }

  .public-four-news-grid {
    grid-column: span 2;
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
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .public-four-news-latest-column {
    position: relative;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    border-left: 1px solid #dfe5eb;
  }

  .public-four-news-latest-positioner {
    position: absolute;
    inset: 0 0 0 16px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .public-four-news-latest-positioner > .public-matchday-news {
    padding: 0;
    border: 0;
    overflow: hidden;
  }

  .public-four-news-latest-positioner .public-news-thumb {
    display: none;
  }

  .public-four-news-ad-column {
    display: flex;
    align-self: start;
    min-width: 0;
    padding-left: 16px;
    border-left: 1px solid #dfe5eb;
  }

  .public-four-news-ad-slot {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: visible;
    box-sizing: border-box;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-decoration: none;
  }

  .public-four-news-ad-slot img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
    object-position: top center;
  }

  @media (max-width: 1100px) {
    .public-four-news-latest-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .public-four-news-grid {
      grid-column: 1 / -1;
    }

    .public-four-news-latest-column {
      position: static;
      padding-left: 0;
      padding-top: 18px;
      border-left: 0;
      border-top: 1px solid #dfe5eb;
    }

    .public-four-news-latest-positioner {
      position: static;
      inset: auto;
      overflow: visible;
    }

    .public-four-news-ad-column {
      padding-left: 0;
      padding-top: 18px;
      border-left: 0;
      border-top: 1px solid #dfe5eb;
    }
  }

  @media (max-width: 680px) {
    .public-four-news-latest-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-four-news-grid {
      grid-column: auto;
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

export default function PublicFourNewsLatestLayout({
  items,
  latestNews,
  latestNewsTitle,
  latestNewsTitleColor,
}: PublicFourNewsLatestLayoutProps) {
  const visibleItems = items
    .filter((item) => item.title.trim() && item.linkUrl.trim())
    .slice(0, 4);

  if (visibleItems.length !== 4 || latestNews.length === 0) return null;

  return (
    <section
      className="public-four-news-latest-layout"
      aria-label="Zona editorial de quatro notícias, Últimas e publicidade"
    >
      <style>{styles}</style>

      <div className="public-four-news-latest-grid">
        <div className="public-four-news-grid">
          {visibleItems.map((item) => (
            <article className="public-four-news-card" key={item.id}>
              {item.imageUrl ? (
                <a
                  className="public-four-news-media"
                  href={item.linkUrl}
                  aria-label={item.title}
                >
                  <img alt="" src={item.imageUrl} loading="lazy" />
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

        <div className="public-four-news-latest-column">
          <div className="public-four-news-latest-positioner">
            <PublicLatestNewsBlock
              items={latestNews}
              title={latestNewsTitle}
              titleColor={latestNewsTitleColor}
              constrainToFourNewsGrid
            />
          </div>
        </div>

        <aside
          className="public-four-news-ad-column"
          aria-label="Publicidade"
          data-public-ad-slot="four-news-latest"
        >
          <PublicSideAdvertisement className="public-four-news-ad-slot" />
        </aside>
      </div>
    </section>
  );
}
