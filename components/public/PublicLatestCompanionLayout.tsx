import { excludeSelectedEditorialItemsFromLatest } from "@/lib/public-four-news-latest-dedup";

import PublicLatestNewsBlock from "./PublicLatestNewsBlock";
import type { PublicEditorialLatestNews } from "./PublicEditorialLayout";
import PublicMatchdayEditorialSectionFrame from "./PublicMatchdayEditorialSectionFrame";
import PublicSideAdvertisement from "./PublicSideAdvertisement";
import {
  PublicFlexibleZoneContent,
  type PublicFlexibleZone,
} from "./PublicFlexibleZoneRenderers";

type PublicLatestCompanionLayoutProps = Readonly<{
  zone: PublicFlexibleZone;
  matchdayNumber: number;
  latestNews: PublicEditorialLatestNews[];
  latestNewsTitle?: string;
  latestNewsTitleColor?: string | null;
}>;

const styles = `
  .public-latest-companion-layout {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .public-latest-companion-grid {
    display: grid;
    grid-template-columns:
      minmax(0, 2.44fr)
      minmax(250px, 1fr)
      minmax(220px, 0.88fr);
    gap: 18px;
    align-items: start;
    min-width: 0;
  }

  .public-latest-companion-grid[data-has-latest="false"] {
    grid-template-columns:
      minmax(0, 1fr)
      minmax(220px, 0.28fr);
  }

  .public-latest-companion-zone {
    min-width: 0;
  }

  .public-latest-companion-news {
    min-width: 0;
    padding-left: 16px;
    border-left: 1px solid #dfe5eb;
  }

  .public-latest-companion-news > .public-matchday-news {
    padding: 0;
    border: 0;
  }

  .public-latest-companion-news .public-news-thumb {
    display: none;
  }

  .public-latest-companion-ad {
    display: flex;
    align-self: start;
    min-width: 0;
    padding-left: 16px;
    border-left: 1px solid #dfe5eb;
  }

  .public-latest-companion-ad:empty {
    display: none;
  }

  .public-latest-companion-ad-slot {
    display: block;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-decoration: none;
  }

  .public-latest-companion-ad-slot img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
    object-position: top center;
  }

  @media (max-width: 1100px) {
    .public-latest-companion-grid,
    .public-latest-companion-grid[data-has-latest="false"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .public-latest-companion-zone {
      grid-column: 1 / -1;
    }

    .public-latest-companion-news,
    .public-latest-companion-ad {
      padding-left: 0;
      padding-top: 18px;
      border-left: 0;
      border-top: 1px solid #dfe5eb;
    }
  }

  @media (max-width: 680px) {
    .public-latest-companion-grid,
    .public-latest-companion-grid[data-has-latest="false"] {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-latest-companion-zone {
      grid-column: auto;
    }
  }
`;

export default function PublicLatestCompanionLayout({
  zone,
  matchdayNumber,
  latestNews,
  latestNewsTitle,
  latestNewsTitleColor,
}: PublicLatestCompanionLayoutProps) {
  const companionItems = zone.slots.flatMap((slot) =>
    slot.item ? [slot.item] : []
  );

  const visibleLatestNews =
    excludeSelectedEditorialItemsFromLatest(
      latestNews,
      companionItems,
    );

  return (
    <PublicMatchdayEditorialSectionFrame kind="latest">
      <section
        className="public-latest-companion-layout"
        aria-label="Zona editorial associada às Últimas"
      >
        <style>{styles}</style>

        <div
          className="public-latest-companion-grid"
          data-has-latest={visibleLatestNews.length > 0}
        >
          <div className="public-latest-companion-zone">
            <PublicFlexibleZoneContent
              zone={zone}
              matchdayNumber={matchdayNumber}
            />
          </div>

          {visibleLatestNews.length > 0 ? (
            <div className="public-latest-companion-news">
              <PublicLatestNewsBlock
                items={visibleLatestNews}
                title={latestNewsTitle}
                titleColor={latestNewsTitleColor}
                constrainToCompanionZone
              />
            </div>
          ) : null}

          <aside
            className="public-latest-companion-ad"
            aria-label="Publicidade"
            data-public-ad-slot="latest-companion"
          >
            <PublicSideAdvertisement
              className="public-latest-companion-ad-slot"
            />
          </aside>
        </div>
      </section>
    </PublicMatchdayEditorialSectionFrame>
  );
}
