import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTICLE_CLASSIFICATIONS,
  ARTICLE_CLASSIFICATION_KEYS,
} from "@/lib/editorial-classifications";
import {
  EDITORIAL_PROFILES,
  editorialProfileDefaultZoneLayouts,
} from "@/lib/editorial-profiles";
import {
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
} from "@/lib/editorial-visual-families";

test("taxonomia mantém exatamente as cinco classificações atuais", () => {
  assert.deepEqual(
    ARTICLE_CLASSIFICATION_KEYS,
    [
      "benfica",
      "sporting",
      "fc_porto",
      "other_liga_clubs",
      "outside_liga_other",
    ],
  );

  assert.deepEqual(
    ARTICLE_CLASSIFICATIONS.map(
      ({ key, label }) => ({ key, label }),
    ),
    [
      { key: "benfica", label: "Benfica" },
      { key: "sporting", label: "Sporting" },
      { key: "fc_porto", label: "FC Porto" },
      { key: "other_liga_clubs", label: "Outros clubes" },
      {
        key: "outside_liga_other",
        label: "Fora da Liga / outros",
      },
    ],
  );
});

test("adapter legacy mantém exatamente o perfil atual", () => {
  assert.deepEqual(
    EDITORIAL_PROFILES.liga_portugal_v1,
    {
      displayName: "Temático · Liga Portugal",
      competitionSlug: "liga-portugal",
      zones: [
        {
          key: "benfica",
          label: "Benfica",
          capacity: 6,
          visualFamily: "six_news",
          placementMode: "automatic_actuality",
        },
        {
          key: "sporting",
          label: "Sporting",
          capacity: 5,
          visualFamily: "five_news_balanced",
          placementMode: "automatic_actuality",
        },
        {
          key: "fc_porto",
          label: "FC Porto",
          capacity: 5,
          visualFamily: "five_news_balanced",
          placementMode: "automatic_actuality",
        },
        {
          key: "other_liga_clubs",
          label: "Outros clubes",
          capacity: 6,
          visualFamily: "six_news",
          placementMode: "automatic_actuality",
        },
        {
          key: "outside_liga_other",
          label: "Fora da Liga / outros",
          capacity: 5,
          visualFamily: "five_news_secondary",
          placementMode: "automatic_actuality",
        },
      ],
    },
  );
});

test("famílias visuais mantêm capacidades atuais", () => {
  assert.equal(
    EDITORIAL_VISUAL_FAMILY_DEFINITIONS.six_news.capacity,
    6,
  );
  assert.equal(
    EDITORIAL_VISUAL_FAMILY_DEFINITIONS.five_news_balanced.capacity,
    5,
  );
  assert.equal(
    EDITORIAL_VISUAL_FAMILY_DEFINITIONS.five_news_secondary.capacity,
    5,
  );
});

test("layouts legacy continuam derivados das mesmas zonas", () => {
  assert.deepEqual(
    editorialProfileDefaultZoneLayouts(
      EDITORIAL_PROFILES.liga_portugal_v1,
    ),
    {
      benfica: "six_news",
      sporting: "five_news_balanced",
      fc_porto: "five_news_balanced",
      other_liga_clubs: "six_news",
      outside_liga_other: "five_news_secondary",
    },
  );
});
