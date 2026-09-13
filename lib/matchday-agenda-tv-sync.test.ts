import assert from "node:assert/strict";
import test from "node:test";

import {
  agendaTvMatchNeedsEvidence,
  agendaTvMatchPolicy,
  agendaTvUnavailableSourcesBlock,
  agendaSourceMatchesTeams,
  buildAgendaTvPreviewRow,
  buildAgendaTvRpcRows,
  buildPortugalKickoffAt,
  canonicalAgendaChannelKey,
  canonicalAgendaTeamKey,
  parseZerozeroAgendaHtml,
  resolveZerozeroMatchdayUrl,
  shouldLoadAgendaTvFallback,
  type AgendaTvLifecycleMatch,
  zerozeroPageHasContext,
} from "./matchday-agenda-tv-sync";

const noChannel = {
  channelId: null,
  channelName: null,
  sourceLabel: null,
  reportedChannel: null,
} as const;

function lifecycleMatch(
  overrides: Partial<AgendaTvLifecycleMatch> = {},
): AgendaTvLifecycleMatch {
  return {
    id: "match-1",
    status: "scheduled",
    minute: null,
    live_started_at: null,
    live_base_minute: null,
    is_clock_running: false,
    home_score: null,
    away_score: null,
    scheduled_date: "2026-09-13",
    kickoff_at: "2026-09-13T16:00:00+01:00",
    broadcast_channel_id: "channel-1",
    ...overrides,
  };
}

function previewRow(
  match: AgendaTvLifecycleMatch,
  schedule:
    | Readonly<{
        status: "ok";
        date: string;
        time: string;
        sourceLabel: string;
      }>
    | Readonly<{
        status: "conflict";
        sourceLabel: string;
      }>
    | Readonly<{ status: "not_found" }>,
) {
  return buildAgendaTvPreviewRow({
    match,
    label: "Casa – Fora",
    currentChannel: "Sport TV 1",
    schedule,
    channel: noChannel,
  });
}

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

test("finished ausente ou em conflito é preservado e nunca bloqueia", () => {
  const finished = lifecycleMatch({ status: "finished", minute: 90 });
  const absent = previewRow(finished, { status: "not_found" });
  const conflict = previewRow(finished, {
    status: "conflict",
    sourceLabel: "Liga Portugal",
  });

  for (const row of [absent, conflict]) {
    assert.equal(row.preserve, true);
    assert.equal(row.status, "unchanged");
    assert.equal(row.nextDate, finished.scheduled_date);
    assert.equal(row.nextKickoffAt, finished.kickoff_at);
    assert.equal(row.nextChannelId, finished.broadcast_channel_id);
  }
});

test("finished não exige evidência nem força fallback ZeroZero", () => {
  const finished = lifecycleMatch({
    status: "finished",
    minute: 90,
    broadcast_channel_id: null,
  });

  assert.equal(agendaTvMatchNeedsEvidence(finished), false);
  assert.equal(
    shouldLoadAgendaTvFallback([finished], () => "not_found"),
    false,
  );
  assert.equal(agendaTvUnavailableSourcesBlock([finished]), false);
});

test("scheduled ausente ou em conflito continua blocker", () => {
  const scheduled = lifecycleMatch();

  assert.equal(
    previewRow(scheduled, { status: "not_found" }).status,
    "source_not_found",
  );
  assert.equal(
    previewRow(scheduled, {
      status: "conflict",
      sourceLabel: "Liga Portugal",
    }).status,
    "source_conflict",
  );
  assert.equal(agendaTvUnavailableSourcesBlock([scheduled]), true);
});

test("jornada mista pede evidência apenas aos jogos scheduled", () => {
  const finished = lifecycleMatch({
    id: "finished",
    status: "finished",
    minute: 90,
  });
  const scheduled = lifecycleMatch({ id: "scheduled" });
  const visited: string[] = [];

  assert.equal(
    shouldLoadAgendaTvFallback(
      [finished, scheduled],
      (match) => {
        visited.push(match.id);
        return "not_found";
      },
    ),
    true,
  );
  assert.deepEqual(visited, ["scheduled"]);
});

test("postponed sem marcação segura preserva; com marcação segura propõe sem mudar status", () => {
  const postponed = lifecycleMatch({ status: "postponed" });
  const preserved = previewRow(postponed, { status: "not_found" });
  const proposed = previewRow(postponed, {
    status: "ok",
    date: "2026-10-04",
    time: "18:00",
    sourceLabel: "Liga Portugal",
  });

  assert.equal(agendaTvMatchPolicy(postponed), "postponed");
  assert.equal(preserved.status, "unchanged");
  assert.equal(preserved.preserve, true);
  assert.equal(preserved.nextDate, postponed.scheduled_date);
  assert.equal(proposed.status, "update");
  assert.equal(proposed.preserve, false);
  assert.equal(proposed.nextDate, "2026-10-04");
  assert.equal(postponed.status, "postponed");
});

test("live fields e estados desconhecidos são sempre preservados", () => {
  const matches = [
    lifecycleMatch({ status: "live", minute: 12 }),
    lifecycleMatch({ status: "halftime", minute: 45 }),
    lifecycleMatch({ status: "review_pending" }),
    lifecycleMatch({
      status: "scheduled",
      live_started_at: "2026-09-13T15:00:00Z",
    }),
    lifecycleMatch({ status: "scheduled", live_base_minute: 0 }),
    lifecycleMatch({ status: "scheduled", is_clock_running: true }),
    lifecycleMatch({ status: "scheduled", home_score: 0, away_score: 0 }),
  ];

  for (const match of matches) {
    assert.equal(agendaTvMatchPolicy(match), "preserve");
    assert.equal(
      previewRow(match, {
        status: "ok",
        date: "2026-09-14",
        time: "20:00",
        sourceLabel: "Liga Portugal",
      }).status,
      "unchanged",
    );
  }
});

test("payload RPC mantém toda a jornada e envia next=current nos preservados", () => {
  const finished = lifecycleMatch({
    id: "finished",
    status: "finished",
    minute: 90,
  });
  const scheduled = lifecycleMatch({ id: "scheduled" });
  const rows = buildAgendaTvRpcRows([
    previewRow(finished, { status: "not_found" }),
    previewRow(scheduled, {
      status: "ok",
      date: "2026-09-13",
      time: "18:00",
      sourceLabel: "Liga Portugal",
    }),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    match_id: "finished",
    preserve: true,
    expected_scheduled_date: finished.scheduled_date,
    expected_kickoff_at: finished.kickoff_at,
    expected_broadcast_channel_id: finished.broadcast_channel_id,
    scheduled_date: finished.scheduled_date,
    kickoff_at: finished.kickoff_at,
    broadcast_channel_id: finished.broadcast_channel_id,
  });
  assert.equal(rows[1].preserve, false);
});

test("payload RPC aceita date/time NULL apenas em jogos preservados", () => {
  const postponed = lifecycleMatch({
    id: "postponed",
    status: "postponed",
    scheduled_date: null,
    kickoff_at: null,
    broadcast_channel_id: null,
  });
  const finished = lifecycleMatch({
    id: "finished",
    status: "finished",
    minute: 90,
    scheduled_date: null,
    kickoff_at: null,
  });

  const rows = buildAgendaTvRpcRows([
    previewRow(postponed, { status: "not_found" }),
    previewRow(finished, { status: "not_found" }),
  ]);

  assert.deepEqual(rows.map((row) => ({
    preserve: row.preserve,
    scheduled_date: row.scheduled_date,
    kickoff_at: row.kickoff_at,
  })), [
    { preserve: true, scheduled_date: null, kickoff_at: null },
    { preserve: true, scheduled_date: null, kickoff_at: null },
  ]);
});

test("jornada só terminada aceita preview sem qualquer fonte externa", () => {
  const matches = Array.from({ length: 3 }, (_value, index) =>
    lifecycleMatch({
      id: `finished-${index}`,
      status: "finished",
      minute: 90,
    }),
  );

  assert.equal(matches.some(agendaTvMatchNeedsEvidence), false);
  assert.equal(agendaTvUnavailableSourcesBlock(matches), false);
  assert.equal(
    shouldLoadAgendaTvFallback(matches, () => "not_found"),
    false,
  );
});

test("Jornada 06 preserva 3 finished e reconcilia apenas os 6 scheduled", () => {
  const matches = [
    ...Array.from({ length: 3 }, (_value, index) =>
      lifecycleMatch({
        id: `finished-${index}`,
        status: "finished",
        minute: 90,
      }),
    ),
    ...Array.from({ length: 6 }, (_value, index) =>
      lifecycleMatch({ id: `scheduled-${index}` }),
    ),
  ];
  const rows = matches.map((match) => previewRow(
    match,
    agendaTvMatchNeedsEvidence(match)
      ? {
          status: "ok",
          date: "2026-09-13",
          time: "18:00",
          sourceLabel: "Liga Portugal",
        }
      : { status: "not_found" },
  ));

  assert.equal(rows.length, 9);
  assert.equal(
    rows.filter((row) => row.status === "unchanged").length,
    3,
  );
  assert.equal(
    rows.filter((row) => row.status === "update").length,
    6,
  );
  assert.equal(
    rows.filter((row) => (
      row.status === "source_not_found"
      || row.status === "source_conflict"
    )).length,
    0,
  );
});
