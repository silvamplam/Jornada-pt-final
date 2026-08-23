import assert from "node:assert/strict";
import test from "node:test";

import {
  editorialProfile,
  editorialProfileWithZoneLayouts,
} from "@/lib/editorial-profiles";
import {
  readPublicMatchdayThematicSnapshot,
  type PublicMatchdayThematicTableFetcher,
} from "@/lib/public-matchday-thematic";

const MATCHDAY_ID =
  "00000000-0000-4000-8000-000000000001";

const PROFILE_KEY =
  "liga_portugal_v1";

const zoneLayouts = {
  benfica: "five_news_balanced",
  sporting: "six_news",
  fc_porto: "five_news_balanced",
  other_liga_clubs: "six_news",
  outside_liga_other: "five_news_secondary",
} as const;

const zoneOrder = [
  "benfica",
  "sporting",
  "fc_porto",
  "other_liga_clubs",
  "outside_liga_other",
] as const;

const blockOrder = [
  "benfica",
  "sporting",
  "fc_porto",
  "latest",
  "other_liga_clubs",
  "outside_liga_other",
] as const;

function articleId(index: number) {
  return `00000000-0000-4000-8000-${String(
    index,
  ).padStart(12, "0")}`;
}

function validFixture() {
  const profile =
    editorialProfile(PROFILE_KEY);

  assert.ok(profile);

  const effective =
    editorialProfileWithZoneLayouts(
      profile,
      zoneLayouts,
    );

  let index = 1;

  const zoneRows =
    effective.zones.flatMap((zone) =>
      Array.from(
        { length: zone.capacity },
        (_, offset) => {
          const id = articleId(index++);

          return {
            source_type: "editorial_article",
            source_id: id,
            zone_key: zone.key,
            sort_order: offset + 1,
          };
        },
      ),
    );

  const articles =
    zoneRows.map((row) => ({
      id: row.source_id,
      slug: `artigo-${row.source_id.slice(-4)}`,
      status: "published",
      label: row.zone_key,
      title: `Título ${row.source_id.slice(-4)}`,
      subtitle: `Subtítulo ${row.source_id.slice(-4)}`,
      image_url: `/images/${row.source_id.slice(-4)}.jpg`,
      published_at: "2026-08-23T12:00:00Z",
    }));

  return {
    assignments: [
      { profile_key: PROFILE_KEY },
    ],
    controls: [
      {
        revision: 15,
        thematic_zone_order: zoneOrder,
        thematic_zone_layouts: zoneLayouts,
        thematic_block_order: blockOrder,
      },
    ],
    editorials: [
      {
        title_color: "#123456",
        latest_zone_placement: "four_news",
      },
    ],
    zoneRows,
    articles,
  };
}

function fetcher(
  fixture: ReturnType<typeof validFixture>,
): PublicMatchdayThematicTableFetcher {
  return async <T>(path: string) => {
    if (
      path.startsWith(
        "matchday_editorial_profile_assignments?",
      )
    ) {
      return structuredClone(
        fixture.assignments,
      ) as T[];
    }

    if (
      path.startsWith(
        "matchday_editorial_profile_reconcile_control?",
      )
    ) {
      return structuredClone(
        fixture.controls,
      ) as T[];
    }

    if (
      path.startsWith(
        "matchday_editorials?",
      )
    ) {
      return structuredClone(
        fixture.editorials,
      ) as T[];
    }

    if (
      path.startsWith(
        "matchday_editorial_profile_zone_items?",
      )
    ) {
      return structuredClone(
        fixture.zoneRows,
      ) as T[];
    }

    if (
      path.startsWith(
        "editorial_articles?",
      )
    ) {
      return structuredClone(
        fixture.articles,
      ) as T[];
    }

    throw new Error(
      `unexpected-read:${path}`,
    );
  };
}

test("sem assignment devolve null e preserva a autoridade Legacy", async () => {
  const result =
    await readPublicMatchdayThematicSnapshot(
      MATCHDAY_ID,
      {
        fetchTable: async <T>(path: string) => {
          assert.match(
            path,
            /^matchday_editorial_profile_assignments\?/,
          );

          return [] as T[];
        },
      },
    );

  assert.equal(result, null);
});

test("perfil desconhecido fecha sem executar o reader temático", async () => {
  let reads = 0;

  const result =
    await readPublicMatchdayThematicSnapshot(
      MATCHDAY_ID,
      {
        fetchTable: async <T>() => {
          reads += 1;

          return [
            {
              profile_key:
                "perfil_desconhecido",
            },
          ] as T[];
        },
      },
    );

  assert.deepEqual(
    result,
    {
      kind: "unsupported_profile",
      profileKey:
        "perfil_desconhecido",
    },
  );

  assert.equal(reads, 1);
});

test("snapshot aplicado conserva layouts, ordem de blocos e revisão", async () => {
  const fixture =
    validFixture();

  const result =
    await readPublicMatchdayThematicSnapshot(
      MATCHDAY_ID,
      {
        fetchTable:
          fetcher(fixture),
      },
    );

  assert.ok(result);
  assert.equal(
    result.kind,
    "thematic",
  );

  if (result.kind !== "thematic") {
    return;
  }

  assert.equal(
    result.revision,
    15,
  );

  assert.deepEqual(
    result.pageControls
      .thematicZoneLayouts,
    zoneLayouts,
  );

  assert.deepEqual(
    result.pageControls
      .thematicBlockOrder,
    blockOrder,
  );

  assert.equal(
    result.pageControls
      .latestZonePlacement,
    "four_news",
  );

  assert.equal(
    result.pageControls
      .headlineTitleColor,
    "#123456",
  );

  assert.deepEqual(
    result.zones.map(
      (zone) => [
        zone.key,
        zone.visualFamily,
        zone.items.length,
      ],
    ),
    [
      [
        "benfica",
        "five_news_balanced",
        5,
      ],
      [
        "sporting",
        "six_news",
        6,
      ],
      [
        "fc_porto",
        "five_news_balanced",
        5,
      ],
      [
        "other_liga_clubs",
        "six_news",
        6,
      ],
      [
        "outside_liga_other",
        "five_news_secondary",
        5,
      ],
    ],
  );
});

test("posição duplicada no snapshot aplicado falha fechada", async () => {
  const fixture =
    validFixture();

  fixture.zoneRows[1] = {
    ...fixture.zoneRows[1],
    sort_order:
      fixture.zoneRows[0].sort_order,
  };

  const result =
    await readPublicMatchdayThematicSnapshot(
      MATCHDAY_ID,
      {
        fetchTable:
          fetcher(fixture),
      },
    );

  assert.deepEqual(
    result,
    {
      kind: "invalid_snapshot",
      profileKey: PROFILE_KEY,
      reason: "duplicate-zone-item",
    },
  );
});

test("zona incompleta não cai silenciosamente no Legacy", async () => {
  const fixture =
    validFixture();

  fixture.zoneRows.pop();

  const result =
    await readPublicMatchdayThematicSnapshot(
      MATCHDAY_ID,
      {
        fetchTable:
          fetcher(fixture),
      },
    );

  assert.deepEqual(
    result,
    {
      kind: "invalid_snapshot",
      profileKey: PROFILE_KEY,
      reason:
        "incomplete-applied-zone",
    },
  );
});