type PublicSideAdvertisementProps = {
  className?: string;
};

const advertisement = {
  name: "Startup Madeira NOW",
  imageUrl: "/ads/startup-madeira-now-sidebar.png",
  targetUrl: "https://now.startupmadeira.eu/",
  altText: "Startup Madeira NOW",
};

export default function PublicSideAdvertisement({
  className,
}: PublicSideAdvertisementProps) {
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