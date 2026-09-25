import {
  isDisplayableSideAdvertisement,
  readHorizontalAdvertisement,
} from "@/lib/site-advertising";

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
  .public-horizontal-advertisement[data-format="tall"] img {
    max-height: 320px;
  }
  @media (max-width: 680px) {
    .public-horizontal-advertisement { margin-top: 24px; }
  }
`;

export default async function PublicHorizontalAdvertisement() {
  const { advertisement } = await readHorizontalAdvertisement();
  if (!isDisplayableSideAdvertisement(advertisement)) return null;

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
        />
      </a>
    </aside>
  );
}
