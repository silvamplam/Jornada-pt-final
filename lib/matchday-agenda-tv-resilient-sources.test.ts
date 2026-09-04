import assert from "node:assert/strict";
import test from "node:test";

import {
  isGenericAgendaTvChannel,
  ligaPortugalMatchUrl,
  ligaPortugalSeasonCode,
  parseLigaPortugalMatchHtml,
  parseOndeBolaAgendaHtml,
} from "./matchday-agenda-tv-sources";

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

test("Liga Portugal converte a hora UTC exposta no HTML para hora de Portugal", () => {
  const row = parseLigaPortugalMatchHtml(
    `
      <html>
        <head><title>Liga Portugal - FC Porto - Moreirense FC</title></head>
        <body>
          <main>
            <div>sex. 04 set</div>
            <div>19h15</div>
            <img alt="SportTV" />
          </main>
        </body>
      </html>
    `,
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
});

test("operador genérico não substitui um canal numerado mais preciso", () => {
  assert.equal(isGenericAgendaTvChannel("SportTV"), true);
  assert.equal(isGenericAgendaTvChannel("Sport TV 1"), false);
  assert.equal(isGenericAgendaTvChannel("BTV"), false);
});
