import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITORIAL_THEME_MEMBERSHIP_PAGE_SIZE,
  readAllEditorialThemeMembershipRows,
  type EditorialThemeMembershipPageFetcher,
} from "@/lib/redacao-automatica/editorial-theme-membership-pagination";

type MembershipRow = Readonly<{
  id: number;
}>;

test("lê memberships para além de uma página até receber uma página vazia", async () => {
  const expected = Array.from(
    { length: EDITORIAL_THEME_MEMBERSHIP_PAGE_SIZE * 2 + 3 },
    (_, id): MembershipRow => ({ id }),
  );
  const requestedOffsets: number[] = [];
  const requestedLimits: number[] = [];

  const fetchPage: EditorialThemeMembershipPageFetcher = async <T>(path: string) => {
    const query = new URLSearchParams(path.split("?", 2)[1] ?? "");
    const limit = Number(query.get("limit"));
    const offset = Number(query.get("offset"));
    requestedLimits.push(limit);
    requestedOffsets.push(offset);

    return expected.slice(offset, offset + limit) as unknown as T[];
  };

  const rows = await readAllEditorialThemeMembershipRows<MembershipRow>(
    fetchPage,
    "newsroom_editorial_theme_sources"
      + "?select=newsroom_article_id,added_at"
      + "&theme_id=eq.10000000-0000-4000-8000-000000000001"
      + "&order=added_at.asc,newsroom_article_id.asc",
  );

  assert.deepEqual(rows, expected);
  assert.deepEqual(requestedLimits, [200, 200, 200, 200]);
  assert.deepEqual(requestedOffsets, [0, 200, 400, 403]);
});
