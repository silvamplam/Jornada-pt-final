export const EDITORIAL_THEME_MEMBERSHIP_PAGE_SIZE = 200;

export type EditorialThemeMembershipPageFetcher =
  <T>(path: string) => Promise<T[]>;

export async function readAllEditorialThemeMembershipRows<T>(
  fetchPage: EditorialThemeMembershipPageFetcher,
  orderedQuery: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; ) {
    const page = await fetchPage<T>(
      `${orderedQuery}&limit=${EDITORIAL_THEME_MEMBERSHIP_PAGE_SIZE}&offset=${offset}`,
    );

    if (page.length === 0) {
      return rows;
    }

    rows.push(...page);
    offset += page.length;
  }
}
