import assert from "node:assert/strict";
import test from "node:test";

import {
  agendaSourceMatchesTeams,
  buildPortugalKickoffAt,
  canonicalAgendaChannelKey,
  canonicalAgendaTeamKey,
  parseZerozeroAgendaHtml,
  resolveZerozeroMatchdayUrl,
  zerozeroPageHasContext,
} from "./matchday-agenda-tv-sync";

test("normaliza aliases determinísticos da Liga Portugal", () => {
  assert.equal(
    canonicalAgendaTeamKey("Académico de Viseu"),
    "academico",
  );
  assert.equal(
    canonicalAgendaTeamKey("Académico"),
    "academico",
  );
  assert.equal(
    canonicalAgendaTeamKey("Est. Amadora"),
    "estrela amadora",
  );
  assert.equal(
    canonicalAgendaTeamKey("Estrela da Amadora"),
    "estrela amadora",
  );
  assert.equal(
    canonicalAgendaTeamKey("SC Braga"),
    "braga",
  );
});

test("normaliza canal exato sem transformar operador genérico em canal", () => {
  assert.equal(
    canonicalAgendaChannelKey("SportTV 1"),
    "sporttv1",
  );
  assert.equal(
    canonicalAgendaChannelKey("Sport TV 1"),
    "sporttv1",
  );
  assert.equal(
    canonicalAgendaChannelKey("Sport TV+"),
    "sporttvplus",
  );
  assert.equal(
    canonicalAgendaChannelKey("Sport TV"),
    "sporttv",
  );
  assert.notEqual(
    canonicalAgendaChannelKey("Sport TV"),
    canonicalAgendaChannelKey("Sport TV 1"),
  );
});

test("parser mantém data de rowspan e lê canal pelo alt", () => {
  const html = `
    <html>
      <body>
        <h1>Liga Portugal Betclic 2026/27</h1>
        <h3>JORNADA 4</h3>
        <table>
          <tr>
            <td rowspan="2">29/08</td>
            <td><a href="/equipa/fc-alverca">FC Alverca</a></td>
            <td>15:30</td>
            <td><a href="/equipa/santa-clara">Santa Clara</a></td>
            <td><img alt="SportTV 2"></td>
          </tr>
          <tr>
            <td><a href="/equipa/fc-arouca">FC Arouca</a></td>
            <td>15:30</td>
            <td><a href="/equipa/maritimo">Marítimo</a></td>
            <td><img alt="SportTV 3"></td>
          </tr>
          <tr>
            <td>30/08</td>
            <td><a href="/equipa/nacional">Nacional</a></td>
            <td>15:30</td>
            <td><a href="/equipa/est-amadora">Est. Amadora</a></td>
            <td><img alt="SportTV 1"></td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const rows = parseZerozeroAgendaHtml(html, {
    sourceUrl: "https://www.zerozero.pt/teste",
    seasonStartsOn: "2026-08-06",
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    home: "FC Alverca",
    away: "Santa Clara",
    date: "2026-08-29",
    time: "15:30",
    channel: "SportTV 2",
    sourceUrl: "https://www.zerozero.pt/teste",
  });
  assert.equal(rows[1]?.date, "2026-08-29");
  assert.equal(rows[1]?.channel, "SportTV 3");
  assert.equal(rows[2]?.date, "2026-08-30");
});

test("matching respeita casa e fora e aceita aliases", () => {
  const source = {
    home: "Académico",
    away: "FC Porto",
    date: "2026-08-29",
    time: "18:00",
    channel: "SportTV 1",
    sourceUrl: "https://www.zerozero.pt/teste",
  };

  assert.equal(
    agendaSourceMatchesTeams(
      source,
      ["Académico de Viseu"],
      ["FC Porto"],
    ),
    true,
  );

  assert.equal(
    agendaSourceMatchesTeams(
      source,
      ["FC Porto"],
      ["Académico de Viseu"],
    ),
    false,
  );
});

test("hora portuguesa usa DST real de Europe/Lisbon", () => {
  assert.equal(
    buildPortugalKickoffAt(
      "2026-08-28",
      "20:15",
    ),
    "2026-08-28T20:15:00+01:00",
  );

  assert.equal(
    buildPortugalKickoffAt(
      "2027-01-10",
      "16:00",
    ),
    "2027-01-10T16:00:00+00:00",
  );
});

test("URL inclui jornada e contexto valida época e jornada", () => {
  const html = `
    <html>
      <body>
        <select name="fase">
          <option selected value="217930">Campeonato</option>
        </select>
        <h1>Liga Portugal Betclic 2026/27</h1>
        <h3>JORNADA 4</h3>
      </body>
    </html>
  `;

  const url = resolveZerozeroMatchdayUrl(
    html,
    4,
    "https://www.zerozero.pt/competicao/liga-portuguesa?redird=1&v=tt1",
  );

  assert.equal(
    new URL(url).searchParams.get("jornada_in"),
    "4",
  );
  assert.equal(
    new URL(url).searchParams.get("fase"),
    "217930",
  );

  assert.equal(
    zerozeroPageHasContext(html, {
      matchdayNumber: 4,
      seasonLabel: "2026/27",
    }),
    true,
  );

  assert.equal(
    zerozeroPageHasContext(html, {
      matchdayNumber: 5,
      seasonLabel: "2026/27",
    }),
    false,
  );
});

test("contexto aceita a jornada selecionada sem depender do texto concatenado do seletor", () => {
  const html = `
    <html>
      <body>
        <h1>Liga Portugal Betclic 2026/27</h1>
        <select name="jornada_in">
          <option value="4">Jornada 4</option><option selected value="5">Jornada 5</option><option value="6">Jornada 6</option>
        </select>
      </body>
    </html>
  `;

  assert.equal(
    zerozeroPageHasContext(html, {
      matchdayNumber: 5,
      seasonLabel: "2026/27",
    }),
    true,
  );
  assert.equal(
    zerozeroPageHasContext(html, {
      matchdayNumber: 4,
      seasonLabel: "2026/27",
    }),
    false,
  );
  assert.equal(
    zerozeroPageHasContext(html, {
      matchdayNumber: 5,
      seasonLabel: "2025/26",
    }),
    false,
  );
});
