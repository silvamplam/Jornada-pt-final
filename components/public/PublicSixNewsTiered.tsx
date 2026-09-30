import EditorialImage from "./PublicBeyondMatchdayImage";
import { editorialImageFramingProps } from "@/lib/editorial-image-framing";
import type { PublicFlexibleZoneSlot } from "./PublicFlexibleZoneRenderers";

const styles = `
  .public-six-news-tiered { width: 100%; min-width: 0; }
  .public-six-news-tiered-heading {
    margin: 0 0 12px;
    color: #526174;
    font: 850 18px/1 "Segoe UI", Arial, sans-serif;
    letter-spacing: -0.01em;
    text-transform: uppercase;
  }
  .public-six-news-tiered-row {
    display: grid;
    gap: 32px;
    align-items: stretch;
  }
  .public-six-news-tiered-row + .public-six-news-tiered-row {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #dbe4ee;
  }
  .public-six-news-tiered-row[data-editorial-tier="middle"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .public-six-news-tiered-row[data-editorial-tier="final"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .public-six-news-tiered-card, .public-six-news-tiered-vacancy { min-width: 0; }
  .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-card {
    display: grid;
    grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
    gap: 28px;
    align-items: center;
  }
  .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-card {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
    grid-template-areas: "copy media";
    gap: 22px;
    align-items: start;
  }
  .public-six-news-tiered-media {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #eef2f5;
  }
  .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-media {
    aspect-ratio: 2.2 / 1;
  }
  .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-media {
    grid-area: media;
    min-height: 112px;
  }
  .public-six-news-tiered-media img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .public-six-news-tiered-media img[data-editorial-image-fallback="true"] {
    object-fit: contain;
    object-position: center !important;
    background: #080a0c;
  }
  .public-six-news-tiered-copy { display: grid; gap: 8px; padding-top: 12px; }
  .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-copy { padding-top: 0; }
  .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-copy { grid-area: copy; padding-top: 0; }
  .public-six-news-tiered-label {
    color: #526174;
    font: 800 11px/1.2 "Segoe UI", Arial, sans-serif;
    text-transform: uppercase;
  }
  .public-six-news-tiered-title {
    margin: 0;
    color: #10151b;
    font: 700 17px/1.2 Georgia, "Times New Roman", serif;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .public-six-news-tiered-title a { color: inherit; text-decoration: none; }
  .public-six-news-tiered-title a:hover,
  .public-six-news-tiered-title a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
  .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-title { font-size: 28px; line-height: 1.15; }
  .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-title { font-size: 20px; }
  .public-six-news-tiered-subtitle {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: #526174;
    font: 400 12px/1.4 "Segoe UI", Arial, sans-serif;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-subtitle {
    font-size: 14px;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-subtitle {
    font-size: 13px;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  @media (min-width: 681px) {
    /* Widen the lead image leftward, preserving its height and the mobile layout. */
    .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-card {
      container-type: inline-size;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas: "copy media";
      gap: 32px;
    }
    .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-media {
      grid-area: media;
      /* Original height: 48% of (row width - 28px), divided by 2.64. */
      height: calc((100cqi - 28px) / 5.5);
      aspect-ratio: auto;
    }
    .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-copy {
      grid-area: copy;
    }
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-card {
      grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
      grid-template-areas: "media copy";
    }
  }
  @media (max-width: 900px) {
    .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-title { font-size: 26px; }
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-title { font-size: 19px; }
  }
  @media (max-width: 680px) {
    .public-six-news-tiered-heading { font-size: 16px; }
    .public-six-news-tiered-row[data-editorial-tier] { grid-template-columns: minmax(0, 1fr); gap: 28px; }
    .public-six-news-tiered-row + .public-six-news-tiered-row { margin-top: 24px; padding-top: 24px; }
    .public-six-news-tiered-card,
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-card {
      display: grid;
      grid-template-columns: minmax(100px, 38%) minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-card { grid-template-columns: minmax(0, 1fr) minmax(100px, 38%); }
    .public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-card { grid-template-columns: minmax(0, 1fr); gap: 18px; }
    .public-six-news-tiered-copy { padding-top: 0; }
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-media,
    .public-six-news-tiered-row[data-editorial-tier="final"] .public-six-news-tiered-media { aspect-ratio: 4 / 3; min-height: 0; }
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-title { font-size: 19px; }
    .public-six-news-tiered-row[data-editorial-tier="middle"] .public-six-news-tiered-subtitle,
    .public-six-news-tiered-subtitle { font-size: 13px; -webkit-line-clamp: 2; line-clamp: 2; }
    .public-six-news-tiered-row[data-editorial-tier="final"] .public-six-news-tiered-subtitle { -webkit-line-clamp: 1; line-clamp: 1; }
  }
`;

export default function PublicSixNewsTiered({
  slots, publicTitle, ariaLabel, zoneKey, visualFamily,
}: Readonly<{
  slots: readonly PublicFlexibleZoneSlot[];
  publicTitle: string;
  ariaLabel: string;
  zoneKey: string;
  visualFamily: string;
}>) {
  const tiers = [
    { key: "lead", slots: slots.slice(0, 1) },
    { key: "middle", slots: slots.slice(1, 3) },
    { key: "final", slots: slots.slice(3, 6) },
  ];

  return (
    <section className="public-six-news-tiered" aria-label={ariaLabel}
      data-public-editorial-flow={publicTitle ? "single" : undefined}
      data-public-flexible-zone={zoneKey} data-public-visual-family={visualFamily}>
      <style>{styles}</style>
      {publicTitle ? <h2 className="public-six-news-tiered-heading" data-public-editorial-heading>{publicTitle}</h2> : null}
      {tiers.filter((tier) => tier.slots.some((slot) => slot.item)).map((tier) => (
        <div className="public-six-news-tiered-row" data-editorial-tier={tier.key} key={tier.key}>
          {tier.slots.map((slot) => slot.item ? (
            <article className="public-six-news-tiered-card" data-public-slot-position={slot.position} key={slot.key}>
              <a className="public-six-news-tiered-media" href={slot.item.linkUrl} aria-label={slot.item.title}>
                <EditorialImage src={slot.item.imageUrl.trim()} imageSize={tier.key === "final" ? "card" : "half"}
                  {...editorialImageFramingProps("standard")} alt="" loading="lazy" />
              </a>
              <div className="public-six-news-tiered-copy">
                {slot.item.label ? <span className="public-six-news-tiered-label">{slot.item.label}</span> : null}
                <h3 className="public-six-news-tiered-title"><a href={slot.item.linkUrl}>{slot.item.title}</a></h3>
                {slot.item.subtitle ? <p className="public-six-news-tiered-subtitle">{slot.item.subtitle}</p> : null}
              </div>
            </article>
          ) : (
            <div className="public-six-news-tiered-vacancy" aria-hidden="true" data-public-slot-position={slot.position} key={slot.key} />
          ))}
        </div>
      ))}
    </section>
  );
}
