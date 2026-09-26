import {
  isDisplayableSideAdvertisement,
  readPrimarySideAdvertisement,
} from "@/lib/site-advertising";

export const sideAdvertisingStyles = `
  @media (max-width: 760px) {
    a[data-public-side-advertisement] {
      display: block;
      width: fit-content;
      max-width: 100%;
      min-height: 0;
      margin: 8px auto;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }

    a[data-public-side-advertisement] img {
      display: block;
      width: auto;
      height: auto;
      max-width: min(100%, 90px);
      max-height: 198px;
      margin: 0 auto;
      object-fit: contain;
      object-position: center;
    }

    .public-latest-companion-ad:has(> a[data-public-side-advertisement]),
    .public-four-news-ad-column:has(> a[data-public-side-advertisement]) {
      padding-top: 6px;
      padding-bottom: 0;
    }

    .public-thematic-latest-only-ad-column:has(> a[data-public-side-advertisement]) {
      width: 100%;
      margin-inline: 0;
    }
  }
`;

type PublicSideAdvertisementProps = {
  className?: string;
};

export default async function PublicSideAdvertisement({
  className,
}: PublicSideAdvertisementProps) {
  const { advertisement } = await readPrimarySideAdvertisement();

  if (!isDisplayableSideAdvertisement(advertisement)) {
    return null;
  }

  return (
    <a
      className={className}
      data-public-side-advertisement
      href={advertisement.targetUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={advertisement.altText}
    >
      <style>{sideAdvertisingStyles}</style>
      <img
        src={advertisement.imageUrl}
        alt={advertisement.altText}
        loading="lazy"
      />
    </a>
  );
}