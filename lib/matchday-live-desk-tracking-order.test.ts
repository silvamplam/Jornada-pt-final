import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  selectMatchdayEditorialTrackingItems,
  type MatchdayEditorialTrackingItem,
  type MatchdayEditorialTrackingState,
} from "@/lib/editorial-matchday-profile-desk";

const migration = readFileSync(
  "supabase/migrations/20260903190000_matchday_live_desk_tracking_event_order.sql",
  "utf8",
);

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

function trackingItem(
  id: string,
  state: MatchdayEditorialTrackingState,
  options: Readonly<{
    publishedAt?: string | null;
    updatedAt?: string | null;
    classifiedAt?: string;
    circuitOrder?: number | null;
    placementCreatedAt?: string | null;
    stateRecordedAt?: string | null;
  }> = {},
): MatchdayEditorialTrackingItem {
  return {
    bankItemId: `10000000-0000-4000-8000-${id.padStart(12, "0")}`,
    sourceType: "editorial_article",
    sourceId: `20000000-0000-4000-8000-${id.padStart(12, "0")}`,
    sortOrder: options.circuitOrder ?? null,
    label: null,
    title: `Notícia ${id}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: options.publishedAt ?? null,
    updatedAt: options.updatedAt ?? null,
    circuitOrder: options.circuitOrder ?? null,
    classifiedZoneKey: "benfica",
    classificationSource: "automatic",
    classifiedAt: options.classifiedAt ?? "2026-09-03T10:00:00.000Z",
    editorialState: state,
    memoryKind: state === "DESALOJADA" ? "displaced" : null,
    placementCreatedAt: options.placementCreatedAt ?? null,
    stateRecordedAt: options.stateRecordedAt ?? null,
  };
}

test("NOVAS usam publicação decrescente apesar da entrada e de outros eventos fora de ordem", () => {
  const publications = [
    "2026-09-05T15:21:00.000Z",
    "2026-09-03T23:59:00.000Z",
    "2026-09-05T17:23:00.000Z",
    "2026-09-05T14:25:00.000Z",
    "2026-09-05T19:43:00.000Z",
  ];
  const items = publications.map((publishedAt, index) => trackingItem(
    String(index + 1),
    "NOVA",
    {
      publishedAt,
      circuitOrder: index + 1,
      updatedAt: `2026-09-06T0${index}:00:00.000Z`,
      classifiedAt: `2026-09-06T0${4 - index}:00:00.000Z`,
      placementCreatedAt: `2026-09-06T0${index}:30:00.000Z`,
      stateRecordedAt: `2026-09-06T0${4 - index}:30:00.000Z`,
    },
  ));

  assert.deepEqual(
    selectMatchdayEditorialTrackingItems(items, "all").map((item) => item.publishedAt),
    [
      "2026-09-05T19:43:00.000Z",
      "2026-09-05T17:23:00.000Z",
      "2026-09-05T15:21:00.000Z",
      "2026-09-05T14:25:00.000Z",
      "2026-09-03T23:59:00.000Z",
    ],
  );
  assert.deepEqual(items.map((item) => item.publishedAt), publications);
});

test("empates exatos de publicação usam identidade técnica estável e ignoram outros eventos", () => {
  const first = trackingItem("1", "NOVA", {
    publishedAt: "2026-09-05T19:43:00.000Z",
    circuitOrder: 99,
    updatedAt: "2026-09-05T20:00:00.000Z",
    classifiedAt: "2026-09-05T20:00:00.000Z",
    placementCreatedAt: "2026-09-05T20:00:00.000Z",
    stateRecordedAt: "2026-09-05T20:00:00.000Z",
  });
  const second = trackingItem("2", "NOVA", {
    publishedAt: first.publishedAt,
    circuitOrder: 1,
    updatedAt: "2026-09-06T20:00:00.000Z",
    classifiedAt: "2026-09-06T20:00:00.000Z",
    placementCreatedAt: "2026-09-06T20:00:00.000Z",
    stateRecordedAt: "2026-09-06T20:00:00.000Z",
  });
  const items = [
    { ...first, bankItemId: second.bankItemId },
    { ...second, bankItemId: first.bankItemId },
  ];

  for (const input of [items, [...items].reverse()]) {
    for (const classFilter of ["all", "benfica"] as const) {
      assert.deepEqual(
        selectMatchdayEditorialTrackingItems(input, classFilter).map((item) => item.sourceId),
        [first.sourceId, second.sourceId],
      );
    }
  }
});

test("FAIXA usa chegada à Faixa decrescente e ignora publicação e slot legado", () => {
  const olderArrival = trackingItem("3", "FAIXA", {
    publishedAt: "2026-09-03T14:00:00.000Z",
    circuitOrder: 1,
    placementCreatedAt: "2026-09-03T15:00:00.000Z",
  });

  const newerArrival = trackingItem("4", "FAIXA", {
    publishedAt: "2026-09-01T08:00:00.000Z",
    circuitOrder: 99,
    placementCreatedAt: "2026-09-03T16:00:00.000Z",
  });

  assert.deepEqual(
    selectMatchdayEditorialTrackingItems(
      [olderArrival, newerArrival],
      "all",
    ).map((item) => item.bankItemId),
    [newerArrival.bankItemId, olderArrival.bankItemId],
  );
});

test("DESALOJADAS usam saída da página decrescente e ignoram publicação", () => {
  const olderExit = trackingItem("5", "DESALOJADA", {
    publishedAt: "2026-09-03T14:00:00.000Z",
    circuitOrder: 1,
    stateRecordedAt: "2026-09-03T15:00:00.000Z",
  });

  const newerExit = trackingItem("6", "DESALOJADA", {
    publishedAt: "2026-09-01T08:00:00.000Z",
    circuitOrder: 99,
    stateRecordedAt: "2026-09-03T16:00:00.000Z",
  });

  assert.deepEqual(
    selectMatchdayEditorialTrackingItems(
      [olderExit, newerExit],
      "all",
    ).map((item) => item.bankItemId),
    [newerExit.bankItemId, olderExit.bankItemId],
  );
});

test("reader agregado expõe os dois eventos sem criar outra leitura", () => {
  assert.match(
    migration,
    /placement_row\.created_at as placement_created_at/u,
  );

  assert.match(
    migration,
    /memory_row\.recorded_at as state_recorded_at/u,
  );

  assert.match(
    migration,
    /left join public\.matchday_live_layout_bank_item_state_memory/u,
  );

  assert.match(
    migration,
    /grant execute on function[\s\S]*to service_role/u,
  );
});

test("Mesa deixa de apresentar posição manual como semântica editorial", () => {
  for (const legacyCopy of [
    "manual · posição",
    "manual · zona",
    "manual · Faixa",
    "manual · Banco",
    "manual · Abertura",
    "manual · independente",
    "Fixar nesta posição",
    "Proteger na zona",
    "Libertar posição",
  ]) {
    assert.equal(client.includes(legacyCopy), false, legacyCopy);
  }

  assert.match(client, /Mover para Faixa/u);
  assert.match(client, /Mover para Banco/u);
});
