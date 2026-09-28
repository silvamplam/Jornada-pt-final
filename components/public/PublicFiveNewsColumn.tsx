import type { PublicFlexibleZoneRendererProps } from "./PublicFlexibleZoneRenderers";
import PublicBeyondMatchdayImage from "./PublicBeyondMatchdayImage";

export default function PublicFiveNewsColumn({
  ariaLabel, publicTitle, publicTitleColor, slots, zoneKey,
}: PublicFlexibleZoneRendererProps) {
  if (!slots.some((slot) => slot.item)) return null;
  return (
    <section className="public-five-news-column" aria-label={ariaLabel}
      data-public-flexible-zone={zoneKey} data-public-visual-family="five_news_column">
      {publicTitle ? <h2 className="public-five-news-column-heading"
        style={publicTitleColor ? { color: publicTitleColor } : undefined}>{publicTitle}</h2> : null}
      <div className="public-five-news-column-stories">
        {slots.map(({ item, position }) => item ? (
          <article key={position} data-column-position={position}>
            {position === 1 ? (
              <a className="public-five-news-column-image" href={item.linkUrl} aria-label={item.title}>
                <PublicBeyondMatchdayImage src={item.imageUrl} imageSize="card" alt=""
                  loading="lazy" decoding="async" />
              </a>
            ) : null}
            <h3><a href={item.linkUrl}>{item.title}</a></h3>
          </article>
        ) : null)}
      </div>
    </section>
  );
}
