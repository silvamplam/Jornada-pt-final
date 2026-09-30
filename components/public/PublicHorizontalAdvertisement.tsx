import {
  isDisplayableSideAdvertisement,
  readHorizontalAdvertisement,
} from "@/lib/site-advertising";
import type { CSSProperties } from "react";

type MeasuredAdStyle = CSSProperties & Record<`--ad-${string}`, string>;

export const horizontalAdvertisingStyles = `
  .public-horizontal-advertisement {
    width: min(100%, 1200px);
    max-width: 1200px;
    min-width: 0;
    box-sizing: border-box;
    margin: 32px auto 0;
    text-align: center;
  }
  .public-horizontal-advertisement-label {
    display: block;
    margin-bottom: 8px;
    color: #697482;
    font: 10px/1.4 Arial, Helvetica, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .public-horizontal-advertisement a {
    display: block;
    width: 100%;
    min-width: 0;
  }
  .public-horizontal-advertisement img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 120px;
    margin: 0 auto;
    object-fit: contain;
  }
  .public-horizontal-advertisement[data-format="slim"] img {
    max-width: 100%;
    max-height: clamp(120px, 30vw, 360px);
  }
  .public-horizontal-advertisement[data-format="tall"] img {
    max-height: 320px;
  }
  .public-horizontal-advertisement[data-format="slim"] img[data-ad-measured] {
    width: min(100%, var(--ad-natural-width), clamp(var(--ad-slim-min-width), var(--ad-slim-fluid-width), var(--ad-slim-max-width)));
  }
  .public-horizontal-advertisement[data-format="tall"] img[data-ad-measured] {
    width: min(100%, var(--ad-natural-width), var(--ad-tall-desktop-width));
  }
  @media (max-width: 760px) {
    .public-horizontal-advertisement { margin-top: 20px; }
    .public-horizontal-advertisement-label { margin-bottom: 6px; }
    .public-horizontal-advertisement img {
      max-width: min(100%, 320px);
      max-height: 100px;
    }
    .public-horizontal-advertisement[data-format="tall"] img {
      max-height: 180px;
    }
    .public-horizontal-advertisement[data-format="tall"] img[data-ad-measured] {
      width: min(100%, var(--ad-natural-width), var(--ad-tall-mobile-width));
    }
  }
`;

export default async function PublicHorizontalAdvertisement() {
  const { advertisement } = await readHorizontalAdvertisement();
  if (!isDisplayableSideAdvertisement(advertisement)) return null;
  const { imageWidth: width, imageHeight: height } = advertisement;
  const ratio = width && height ? width / height : null;
  const measuredStyle: MeasuredAdStyle | undefined = ratio
    ? {
        "--ad-natural-width": `${width}px`,
        "--ad-slim-min-width": `${120 * ratio}px`,
        "--ad-slim-fluid-width": `${30 * ratio}vw`,
        "--ad-slim-max-width": `${360 * ratio}px`,
        "--ad-tall-desktop-width": `${320 * ratio}px`,
        "--ad-tall-mobile-width": `${180 * ratio}px`,
        aspectRatio: `${width} / ${height}`,
      }
    : undefined;

  return (
    <aside
      className="public-horizontal-advertisement"
      aria-label="Publicidade"
      data-format={advertisement.format}
      data-public-ad-slot={advertisement.slotKey}
    >
      <style>{horizontalAdvertisingStyles}</style>
      <span className="public-horizontal-advertisement-label">Publicidade</span>
      <a
        href={advertisement.targetUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
      >
        <img
          src={advertisement.imageUrl}
          alt={advertisement.altText}
          loading="lazy"
          width={width ?? undefined}
          height={height ?? undefined}
          data-ad-measured={ratio ? "" : undefined}
          style={measuredStyle}
        />
      </a>
    </aside>
  );
}
