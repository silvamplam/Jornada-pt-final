import PublicLatestNewsBlock, {
  type PublicLatestNewsItem,
} from "./PublicLatestNewsBlock";
import PublicSideAdvertisement from "./PublicSideAdvertisement";
import PublicMatchdayEditorialSectionFrame from "./PublicMatchdayEditorialSectionFrame";

type PublicThematicLatestOnlyLayoutProps = {
  items: PublicLatestNewsItem[];
  title?: string;
  titleColor?: string | null;
};

const styles = `
  .public-thematic-latest-only-layout {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
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
    <PublicMatchdayEditorialSectionFrame kind="latest">
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
    </PublicMatchdayEditorialSectionFrame>
  );
}
