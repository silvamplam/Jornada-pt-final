type PublicEditorialLinkItem = Readonly<{
  title?: string | null;
  linkUrl?: string | null;
}>;

type PublicFourNewsLatestResolvableItem = Readonly<{
  title: string;
  linkUrl: string;
}>;

function normalizedEditorialTitle(
  title: string | null | undefined,
) {
  const normalized =
    title
      ?.trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
    ?? "";

  return normalized || null;
}

export function publicEditorialLinkKey(
  linkUrl: string | null | undefined,
) {
  const raw =
    linkUrl?.trim() ?? "";

  if (!raw) {
    return null;
  }

  try {
    const url =
      new URL(
        raw,
        "https://www.jornada.pt",
      );

    const pathname =
      url.pathname.replace(/\/+$/, "")
      || "/";

    if (
      pathname.startsWith(
        "/noticias/",
      )
    ) {
      return pathname;
    }

    const host =
      url.host.toLowerCase();

    return url.protocol.toLowerCase() + "//" + host + pathname;
  } catch {
    const withoutHash =
      raw.split("#", 1)[0] ?? raw;

    const withoutQuery =
      withoutHash.split("?", 1)[0]
      ?? withoutHash;

    return (
      withoutQuery
        .replace(/\/+$/, "")
      || "/"
    );
  }
}

export function excludeSelectedEditorialItemsFromLatest<
  TLatest extends PublicEditorialLinkItem,
>(
  latest: readonly TLatest[],
  selected: readonly PublicEditorialLinkItem[],
): TLatest[] {
  const selectedLinks =
    new Set(
      selected
        .map((item) =>
          publicEditorialLinkKey(
            item.linkUrl,
          ),
        )
        .filter(
          (key): key is string =>
            Boolean(key),
        ),
    );

  const selectedTitles =
    new Set(
      selected
        .map((item) =>
          normalizedEditorialTitle(
            item.title,
          ),
        )
        .filter(
          (title): title is string =>
            Boolean(title),
        ),
    );

  return latest.filter((item) => {
    const linkKey =
      publicEditorialLinkKey(
        item.linkUrl,
      );

    if (
      linkKey
      && selectedLinks.has(linkKey)
    ) {
      return false;
    }

    const titleKey =
      normalizedEditorialTitle(
        item.title,
      );

    return !(
      titleKey
      && selectedTitles.has(titleKey)
    );
  });
}

export function resolvePublicFourNewsLatestLayoutItems<
  TItem extends PublicFourNewsLatestResolvableItem,
  TLatest extends PublicEditorialLinkItem,
>({
  items,
  latestNews,
}: Readonly<{
  items: readonly TItem[];
  latestNews: readonly TLatest[];
}>) {
  const visibleItems = items
    .filter((item) =>
      item.title.trim()
      && item.linkUrl.trim(),
    )
    .slice(0, 4);

  return {
    visibleItems,
    visibleLatestNews:
      excludeSelectedEditorialItemsFromLatest(
        latestNews,
        visibleItems,
      ),
  };
}
