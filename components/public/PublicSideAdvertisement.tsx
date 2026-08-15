import {
  isDisplayableSideAdvertisement,
  readPrimarySideAdvertisement,
} from "@/lib/site-advertising";

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
      href={advertisement.targetUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={advertisement.altText}
    >
      <img
        src={advertisement.imageUrl}
        alt={advertisement.altText}
        loading="lazy"
      />
    </a>
  );
}