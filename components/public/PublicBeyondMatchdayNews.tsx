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
  items: PublicBeyondMatchdayNewsItem[];
  contextLabel: string;
};

const styles = `
  .public-beyond-matchday {
    width: 100%;
    box-sizing: border-box;
    padding: 28px 0 30px;
    border-top: 1px solid #dbe4ee;
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
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 700;
    text-decoration: none;
  }

  .public-beyond-matchday-lead .public-beyond-matchday-title {
    font-size: 29px;
    line-height: 1.04;
    letter-spacing: -0.015em;
  }

  .public-beyond-matchday-subtitle {
    margin: 0;
    color: #526174;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.3;
  }

  .public-beyond-matchday-secondary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px 18px;
  }

  .public-beyond-matchday-secondary-card .public-beyond-matchday-copy {
    gap: 4px;
    padding-top: 7px;
  }

  .public-beyond-matchday-secondary-card .public-beyond-matchday-title {
    display: block;
    font-size: 18px;
    line-height: 1.08;
    letter-spacing: -0.01em;
  }

  .public-beyond-matchday-text-only {
    display: grid;
    align-content: start;
    min-height: 154px;
    padding: 13px 0 0;
    border-top: 1px solid #dbe4ee;
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
      <img src={item.imageUrl} alt="" loading="lazy" />
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

export default function PublicBeyondMatchdayNews({ items, contextLabel }: PublicBeyondMatchdayNewsProps) {
  const visibleItems = items.filter((item) => item.title.trim() && item.linkUrl.trim()).slice(0, 5);
  if (visibleItems.length === 0) return null;

  const lead = visibleItems[0];
  const secondary = visibleItems.slice(1, 5);

  return (
    <section className="public-beyond-matchday" aria-label="Para lá da jornada">
      <style>{styles}</style>
      <header className="public-beyond-matchday-header">
        <h2>PARA LÁ DA JORNADA</h2>
        <p>{contextLabel}</p>
      </header>

      <div className="public-beyond-matchday-grid" data-secondary-count={secondary.length}>
        <article className="public-beyond-matchday-lead">
          <StoryMedia item={lead} />
          <StoryCopy item={lead} lead />
        </article>

        {secondary.length > 0 ? (
          <div className="public-beyond-matchday-secondary-grid">
            {secondary.map((item, index) => {
              const isTextOnly = index >= 2;

              return (
                <article
                  className={`public-beyond-matchday-secondary-card${isTextOnly ? " public-beyond-matchday-text-only" : ""}`}
                  data-secondary-presentation={isTextOnly ? "text" : "image"}
                  key={item.id}
                >
                  {isTextOnly ? null : <StoryMedia item={item} />}
                  <StoryCopy item={item} showSubtitle={!isTextOnly} />
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
