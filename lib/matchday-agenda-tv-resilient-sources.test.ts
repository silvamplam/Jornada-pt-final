import assert from "node:assert/strict";
import test from "node:test";

import {
  isGenericAgendaTvChannel,
  ligaPortugalMatchUrl,
  ligaPortugalSeasonCode,
  parseLigaPortugalMatchHtml,
  parseOndeBolaAgendaHtml,
  portugalLocalFromUtcInstant,
} from "./matchday-agenda-tv-sources";

function ligaPortugalHtml(input: Readonly<{
  home: string;
  away: string;
  instant: string;
  visibleTime?: string;
}>) {
  const nuxtData = JSON.stringify([
    null,
    {
      matchDate: 2,
      fixtureDate: 2,
      homeTeam: 3,
      awayTeam: 5,
    },
    input.instant,
    { name: 4 },
    input.home,
    { name: 6 },
    input.away,
  ]);

  return `
    <html>
      <head><title>Liga Portugal - ${input.home} - ${input.away}</title></head>
      <body>
        <main>
          <div class="container-date">dom. 13 set</div>
          <div class="match-item-row-score">${input.visibleTime ?? "16h00"}</div>
          <img alt="SportTV" />
        </main>
        <script id="__NUXT_DATA__" type="application/json">${nuxtData}</script>
      </body>
    </html>
  `;
}

test("Liga Portugal usa URL estável por época, jornada e índice", () => {
  assert.equal(
    ligaPortugalSeasonCode("2026/27"),
    "20262027",
  );
  assert.equal(
    ligaPortugalMatchUrl({
      seasonLabel: "2026/27",
      matchdayNumber: 5,
      matchIndex: 6,
    }),
    "https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/5/6",
  );
});

test("Liga Portugal usa o instante UTC explícito e converte para Portugal", () => {
  const row = parseLigaPortugalMatchHtml(
    ligaPortugalHtml({
      home: "FC Porto",
      away: "Moreirense FC",
      instant: "2026-09-04T19:15:00Z",
      visibleTime: "19h15",
    }),
    {
      sourceUrl: "https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/5/6",
      seasonStartsOn: "2026-07-01",
    },
  );

  assert.deepEqual(row, {
    home: "FC Porto",
    away: "Moreirense FC",
    date: "2026-09-04",
    time: "20:15",
    channel: "SportTV",
    sourceUrl: "https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/5/6",
  });
});

test("Liga Portugal falha em segurança sem instante explícito inequívoco", () => {
  const row = parseLigaPortugalMatchHtml(
    `
      <html>
        <head><title>Liga Portugal - FC Porto - Moreirense FC</title></head>
        <body>
          <div class="container-date">sex. 04 set</div>
          <div class="match-item-row-score">20h15</div>
        </body>
      </html>
    `,
    {
      sourceUrl: "https://www.ligaportugal.pt/teste",
      seasonStartsOn: "2026-07-01",
    },
  );

  assert.equal(row, null);
});

test("UTC para Europe/Lisbon respeita verão, inverno e mudança de data", () => {
  assert.deepEqual(
    portugalLocalFromUtcInstant("2026-09-13T17:00:00Z"),
    { date: "2026-09-13", time: "18:00" },
  );
  assert.deepEqual(
    portugalLocalFromUtcInstant("2027-01-10T17:00:00Z"),
    { date: "2027-01-10", time: "17:00" },
  );
  assert.deepEqual(
    portugalLocalFromUtcInstant("2026-09-13T23:30:00Z"),
    { date: "2026-09-14", time: "00:30" },
  );
});

test("Jornada 06 converte Arouca e Benfica das 17:00 UTC para 18:00 Portugal", () => {
  const sourceUrl = "https://www.ligaportugal.pt/teste";
  const input = {
    sourceUrl,
    seasonStartsOn: "2026-07-01",
  };
  const arouca = parseLigaPortugalMatchHtml(
    ligaPortugalHtml({
      home: "FC Arouca",
      away: "Santa Clara",
      instant: "2026-09-13T17:00:00Z",
    }),
    input,
  );
  const benfica = parseLigaPortugalMatchHtml(
    ligaPortugalHtml({
      home: "SL Benfica",
      away: "Gil Vicente FC",
      instant: "2026-09-13T17:00:00Z",
    }),
    input,
  );

  assert.equal(arouca?.date, "2026-09-13");
  assert.equal(arouca?.time, "18:00");
  assert.equal(benfica?.date, "2026-09-13");
  assert.equal(benfica?.time, "18:00");
});

test("OndeBola lê apenas a jornada pedida e conserva o canal exato", () => {
  const rows = parseOndeBolaAgendaHtml(
    `
      <table>
        <tr>
          <th>Data</th><th>Hora</th><th>Equipas Jogo</th><th>Canal</th>
        </tr>
        <tr>
          <td>Sex 4 Set</td>
          <td>20:15 hoje</td>
          <td>FC Porto - Moreirense FC<br>Liga Portugal, J5</td>
          <td><a>Sport.Tv1</a></td>
        </tr>
        <tr>
          <td>Qua 9 Set</td>
          <td>20:15</td>
          <td>Moreirense FC - Benfica<br>Liga Portugal, Jorn.3</td>
          <td><a>TVI</a></td>
        </tr>
      </table>
    `,
    {
      sourceUrl: "https://ondebola.com/",
      seasonStartsOn: "2026-07-01",
      matchdayNumber: 5,
    },
  );

  assert.deepEqual(rows, [{
    home: "FC Porto",
    away: "Moreirense FC",
    date: "2026-09-04",
    time: "20:15",
    channel: "Sport.Tv1",
    sourceUrl: "https://ondebola.com/",
  }]);
  assert.equal(rows[0]?.time, "20:15");
});

test("operador genérico não substitui um canal numerado mais preciso", () => {
  assert.equal(isGenericAgendaTvChannel("SportTV"), true);
  assert.equal(isGenericAgendaTvChannel("Sport TV 1"), false);
  assert.equal(isGenericAgendaTvChannel("BTV"), false);
});
