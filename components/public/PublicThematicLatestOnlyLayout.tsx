import PublicLatestNewsBlock, {
  type PublicLatestNewsItem,
} from "./PublicLatestNewsBlock";
import PublicSideAdvertisement from "./PublicSideAdvertisement";

type PublicThematicLatestOnlyLayoutProps = {
  items: PublicLatestNewsItem[];
  title?: string;
  titleColor?: string | null;
};

const styles = `
  .public-thematic-latest-only-layout {
    position: relative;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin-top: clamp(46px, 5vw, 68px);
    padding-top: clamp(24px, 2.6vw, 34px);
  }

  .public-thematic-latest-only-layout::before {
    position: absolute;
    top: 5px;
    right: 0;
    left: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      rgba(76, 101, 128, 0.34) 0%,
      rgba(94, 118, 143, 0.25) 28%,
      rgba(117, 138, 159, 0.15) 56%,
      rgba(145, 162, 179, 0.07) 78%,
      rgba(171, 184, 198, 0) 100%
    );
    content: "";
    pointer-events: none;
  }

  .public-thematic-latest-only-layout
    > .public-matchday-news {
    min-height: 0;
    padding: 0;
    border: 0;
  }

  .public-thematic-latest-only-layout
    .public-news-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 28px;
  }

  .public-thematic-latest-only-layout
    .public-news-thumb {
    display: none;
  }

  .public-thematic-latest-only-ad-column {
    display: flex;
    width: min(100%, 320px);
    min-width: 0;
    margin: 24px 0 0 auto;
    padding-top: 18px;
    border-top: 1px solid #dfe5eb;
  }

  .public-thematic-latest-only-ad-column:empty {
    display: none;
  }

  .public-thematic-latest-only-ad-slot {
    display: block;
    width: 100%;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .public-thematic-latest-only-ad-slot img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
    object-position: top center;
  }

  @media (max-width: 680px) {
    .public-thematic-latest-only-layout
      .public-news-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

export default function PublicThematicLatestOnlyLayout({
  items,
  title,
  titleColor,
}: PublicThematicLatestOnlyLayoutProps) {
  const visibleItems = items
    .filter((item) => item.title?.trim())
    .slice(0, 6);

  if (visibleItems.length === 0) return null;

  return (
    <section
      className="public-thematic-latest-only-layout"
      aria-label={title?.trim() || "Notícias em atualização"}
    >
      <style>{styles}</style>

      <PublicLatestNewsBlock
        items={visibleItems}
        title={title}
        titleColor={titleColor}
      />

      <aside
        className="public-thematic-latest-only-ad-column"
        aria-label="Publicidade"
        data-public-ad-slot="thematic-latest-only"
      >
        <PublicSideAdvertisement className="public-thematic-latest-only-ad-slot" />
      </aside>
    </section>
  );
}
