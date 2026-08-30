import assert from "node:assert/strict";
import test from "node:test";
import type {
  MatchdayEditorialProfileThematicBlockKey,
} from "./editorial-matchday-profile-workspace";
import type {
  MatchdayLivePublicZoneKey,
} from "./editorial-matchday-live-zone-order";
import type {
  EditorialProfileZoneKey,
  EditorialVisualFamily,
} from "./editorial-profiles";
import {
  composeHistoricalPublicEditorialBody,
  composeLivePublicEditorialBody,
  composeThematicPublicEditorialBody,
  type PublicEditorialBodyBlock,
  type PublicEditorialBodyZone,
} from "./public-matchday-editorial-body";

type ThematicTestZone = Readonly<{
  key: EditorialProfileZoneKey;
  visualFamily: EditorialVisualFamily;
}>;

const thematicZones: readonly ThematicTestZone[] = [
  { key: "benfica", visualFamily: "six_news" },
  { key: "sporting", visualFamily: "five_news_balanced" },
  { key: "fc_porto", visualFamily: "five_news_secondary" },
  { key: "other_liga_clubs", visualFamily: "six_news" },
  { key: "outside_liga_other", visualFamily: "five_news_secondary" },
];

function blockIdentities<Zone extends PublicEditorialBodyZone>(
  blocks: readonly PublicEditorialBodyBlock<Zone>[],
): string[] {
  return blocks.map((block) =>
    block.kind === "zone"
      ? `zone:${block.zone.key}`
      : block.kind,
  );
}

function zoneIdentities<Zone extends PublicEditorialBodyZone>(
  blocks: readonly PublicEditorialBodyBlock<Zone>[],
): string[] {
  return blocks.flatMap((block) =>
    block.kind === "zone"
      ? [block.zone.key]
      : [],
  );
}

test("temático preserva exatamente a ordem editorial sem perdas ou duplicações", () => {
  const firstOrder: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "benfica",
    "sporting",
    "fc_porto",
    "latest",
    "video",
    "other_liga_clubs",
    "outside_liga_other",
  ];
  const reordered: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "fc_porto",
    "benfica",
    "other_liga_clubs",
    "video",
    "sporting",
    "outside_liga_other",
    "latest",
  ];

  assert.deepEqual(
    blockIdentities(
      composeThematicPublicEditorialBody(
        firstOrder,
        thematicZones,
      ),
    ),
    [
      "zone:benfica",
      "zone:sporting",
      "zone:fc_porto",
      "latest",
      "video",
      "zone:other_liga_clubs",
      "zone:outside_liga_other",
    ],
  );

  const reorderedBody =
    composeThematicPublicEditorialBody(
      reordered,
      thematicZones,
    );

  assert.deepEqual(
    blockIdentities(reorderedBody),
    [
      "zone:fc_porto",
      "zone:benfica",
      "zone:other_liga_clubs",
      "video",
      "zone:sporting",
      "zone:outside_liga_other",
      "latest",
    ],
  );
  assert.deepEqual(
    zoneIdentities(reorderedBody),
    [
      "fc_porto",
      "benfica",
      "other_liga_clubs",
      "sporting",
      "outside_liga_other",
    ],
  );
  assert.equal(
    new Set(zoneIdentities(reorderedBody)).size,
    thematicZones.length,
  );
});

test("família visual muda a apresentação da zona sem mudar identidade ou posição", () => {
  const order: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "latest",
    "benfica",
    "sporting",
    "video",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ];
  const families: readonly EditorialVisualFamily[] = [
    "six_news",
    "five_news_balanced",
    "five_news_secondary",
  ];

  for (const visualFamily of families) {
    const zones = thematicZones.map((zone) =>
      zone.key === "sporting"
        ? { ...zone, visualFamily }
        : zone,
    );
    const body = composeThematicPublicEditorialBody(
      order,
      zones,
    );
    const sportingIndex = blockIdentities(body)
      .indexOf("zone:sporting");
    const sportingBlock = body[sportingIndex];

    assert.equal(sportingIndex, 2);
    assert.equal(sportingBlock?.kind, "zone");
    if (sportingBlock?.kind === "zone") {
      assert.equal(sportingBlock.zone.key, "sporting");
      assert.equal(
        sportingBlock.zone.visualFamily,
        visualFamily,
      );
    }
  }
});

test("histórico insere vídeo no início, meio e fim e clampa posições inválidas", () => {
  const zones = [
    { key: "z1", visualFamily: "six_news" },
    { key: "z2", visualFamily: "five_news_balanced" },
    { key: "z3", visualFamily: "five_news_secondary" },
  ] as const;

  assert.deepEqual(
    blockIdentities(
      composeHistoricalPublicEditorialBody(zones, 0),
    ),
    ["video", "zone:z1", "zone:z2", "zone:z3"],
  );
  assert.deepEqual(
    blockIdentities(
      composeHistoricalPublicEditorialBody(zones, 1),
    ),
    ["zone:z1", "video", "zone:z2", "zone:z3"],
  );
  assert.deepEqual(
    blockIdentities(
      composeHistoricalPublicEditorialBody(zones, 3),
    ),
    ["zone:z1", "zone:z2", "zone:z3", "video"],
  );
  assert.deepEqual(
    blockIdentities(
      composeHistoricalPublicEditorialBody(zones, -8),
    ),
    ["video", "zone:z1", "zone:z2", "zone:z3"],
  );
  assert.deepEqual(
    blockIdentities(
      composeHistoricalPublicEditorialBody(zones, 99),
    ),
    ["zone:z1", "zone:z2", "zone:z3", "video"],
  );
  assert.deepEqual(
    composeHistoricalPublicEditorialBody([], 0),
    [],
  );
});

test("Últimas ocupa qualquer posição válida do corpo temático", () => {
  const firstOrder: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "latest",
    "sporting",
    "video",
    "benfica",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ];
  const secondOrder: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "sporting",
    "benfica",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
    "latest",
    "video",
  ];

  assert.deepEqual(
    blockIdentities(
      composeThematicPublicEditorialBody(
        firstOrder,
        thematicZones,
      ),
    ),
    [
      "latest",
      "zone:sporting",
      "video",
      "zone:benfica",
      "zone:fc_porto",
      "zone:other_liga_clubs",
      "zone:outside_liga_other",
    ],
  );
  assert.deepEqual(
    blockIdentities(
      composeThematicPublicEditorialBody(
        secondOrder,
        thematicZones,
      ),
    ),
    [
      "zone:sporting",
      "zone:benfica",
      "zone:fc_porto",
      "zone:other_liga_clubs",
      "zone:outside_liga_other",
      "latest",
      "video",
    ],
  );
});

test("temático move apenas o vídeo e preserva zonas, ordem e famílias", () => {
  const videoFirst: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "video",
    "benfica",
    "latest",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ];
  const videoLast: readonly MatchdayEditorialProfileThematicBlockKey[] = [
    "benfica",
    "latest",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
    "video",
  ];
  const firstBody = composeThematicPublicEditorialBody(
    videoFirst,
    thematicZones,
  );
  const lastBody = composeThematicPublicEditorialBody(
    videoLast,
    thematicZones,
  );
  const zoneContracts = (
    body: typeof firstBody,
  ) => body.flatMap((block) =>
    block.kind === "zone"
      ? [[block.zone.key, block.zone.visualFamily]]
      : [],
  );

  assert.deepEqual(
    blockIdentities(firstBody),
    [
      "video",
      "zone:benfica",
      "latest",
      "zone:sporting",
      "zone:fc_porto",
      "zone:other_liga_clubs",
      "zone:outside_liga_other",
    ],
  );
  assert.deepEqual(
    blockIdentities(lastBody),
    [
      "zone:benfica",
      "latest",
      "zone:sporting",
      "zone:fc_porto",
      "zone:other_liga_clubs",
      "zone:outside_liga_other",
      "video",
    ],
  );
  assert.deepEqual(
    zoneContracts(firstBody),
    zoneContracts(lastBody),
  );
});

test("live move apenas o vídeo e preserva as zonas e famílias", () => {
  const firstOrder: readonly MatchdayLivePublicZoneKey[] = [
    "video",
    "four_news",
    "six_news",
    "five_news_balanced",
    "five_news_secondary",
  ];
  const movedVideo: readonly MatchdayLivePublicZoneKey[] = [
    "four_news",
    "six_news",
    "five_news_balanced",
    "video",
    "five_news_secondary",
  ];
  const firstBody = composeLivePublicEditorialBody(firstOrder);
  const movedBody = composeLivePublicEditorialBody(movedVideo);

  assert.deepEqual(
    blockIdentities(firstBody),
    [
      "video",
      "latest",
      "zone:six_news",
      "zone:five_news_balanced",
      "zone:five_news_secondary",
    ],
  );
  assert.deepEqual(
    blockIdentities(movedBody),
    [
      "latest",
      "zone:six_news",
      "zone:five_news_balanced",
      "video",
      "zone:five_news_secondary",
    ],
  );
  assert.deepEqual(
    firstBody.flatMap((block) =>
      block.kind === "zone"
        ? [[block.zone.key, block.zone.visualFamily]]
        : [],
    ),
    movedBody.flatMap((block) =>
      block.kind === "zone"
        ? [[block.zone.key, block.zone.visualFamily]]
        : [],
    ),
  );
});

test("adjacências são deriváveis da sequência sem uma API própria", () => {
  const zones = [
    { key: "z1", visualFamily: "six_news" },
    { key: "z2", visualFamily: "five_news_balanced" },
    { key: "z3", visualFamily: "five_news_secondary" },
  ] as const;
  const identities = blockIdentities(
    composeHistoricalPublicEditorialBody(zones, 2),
  );
  const adjacencies = identities.slice(0, -1).map(
    (identity, index) => [identity, identities[index + 1]],
  );

  assert.deepEqual(adjacencies, [
    ["zone:z1", "zone:z2"],
    ["zone:z2", "video"],
    ["video", "zone:z3"],
  ]);
});
