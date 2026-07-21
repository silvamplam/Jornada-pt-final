import assert from "node:assert/strict";
import test from "node:test";
import {
  CALENDAR_IMPORT_HEADER,
  CALENDAR_IMPORT_LEGACY_HEADER,
  buildCalendarBroadcastChannelLookup,
  decideCalendarMatchAction,
  parseCalendarImport,
  resolveCalendarBroadcastChannel,
  type CalendarExistingMatchDetails,
  type CalendarImportRow
} from "./calendar-import";

const canonicalRow =
  "4;Jornada 04;Académico de Viseu;FC Porto;2026-08-28T20:15:00+01:00;Estádio Municipal do Fontelo;Sport TV 1";

function importRow(overrides: Partial<CalendarImportRow> = {}): CalendarImportRow {
  return {
    lineNumber: 2,
    matchdayNumber: 4,
    matchdayLabel: "Jornada 04",
    homeName: "Académico de Viseu",
    awayName: "FC Porto",
    scheduledDate: null,
    kickoffAt: null,
    venue: null,
    broadcastChannelName: null,
    inputState: "C",
    ...overrides
  };
}

function existingMatch(overrides: Partial<CalendarExistingMatchDetails> = {}): CalendarExistingMatchDetails {
  return {
    scheduledDate: "2026-08-28",
    kickoffAt: "2026-08-28T19:15:00.000Z",
    status: "scheduled",
    venue: "Estádio Municipal do Fontelo",
    broadcastChannelId: "channel-1",
    broadcastChannelName: "Sport TV 1",
    ...overrides
  };
}

test("formato canónico aceita BOM, Estádio, CanalTV e ISO com offset preservando o instante", () => {
  const parsed = parseCalendarImport(`\uFEFF${CALENDAR_IMPORT_HEADER}\n${canonicalRow}`);
  assert.equal(parsed.format, "canonical");
  assert.equal(parsed.headerPresent, true);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].scheduledDate, "2026-08-28");
  assert.equal(parsed.rows[0].kickoffAt, "2026-08-28T19:15:00.000Z");
  assert.equal(parsed.rows[0].venue, "Estádio Municipal do Fontelo");
  assert.equal(parsed.rows[0].broadcastChannelName, "Sport TV 1");
});

test("cabeçalho novo exige exatamente CanalTV na sétima coluna", () => {
  const parsed = parseCalendarImport(
    `Jornada;Nome da jornada;Casa;Fora;DataHora;Estádio;Televisão\n${canonicalRow}`
  );
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.issues[0]?.code, "header-invalid");
  assert.match(parsed.issues[0]?.message ?? "", /sétima coluna.*CanalTV/);
});

test("sete colunas sem cabeçalho não caem silenciosamente no parser legacy", () => {
  const parsed = parseCalendarImport(canonicalRow);
  assert.equal(parsed.format, "canonical");
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.issues[0]?.code, "header-invalid");
});

test("formato canónico rejeita colunas em falta e adicionais", () => {
  const missing = parseCalendarImport(
    `${CALENDAR_IMPORT_HEADER}\n4;Jornada 04;Casa;Fora;2026-08-28T20:15:00+01:00;Estádio`
  );
  const additional = parseCalendarImport(`${CALENDAR_IMPORT_HEADER}\n${canonicalRow};extra`);
  assert.equal(missing.issues[0]?.code, "column-count-invalid");
  assert.equal(additional.issues[0]?.code, "column-count-invalid");
});

test("compatibilidade legacy aceita o cabeçalho histórico e linhas de cinco ou seis colunas", () => {
  const withHeader = parseCalendarImport(
    `${CALENDAR_IMPORT_LEGACY_HEADER}\n4;Jornada 04;Casa;Fora;2026-08-28T20:15;Estádio Antigo`
  );
  const fiveColumns = parseCalendarImport("5;Jornada 05;Casa;Fora;2026-08-29");
  const sixColumns = parseCalendarImport("6;Jornada 06;Casa;Fora;; Estádio com espaços ");
  assert.equal(withHeader.format, "legacy");
  assert.equal(withHeader.rows[0]?.kickoffAt, "2026-08-28T19:15:00.000Z");
  assert.equal(withHeader.rows[0]?.broadcastChannelName, null);
  assert.equal(fiveColumns.rows[0]?.venue, null);
  assert.equal(sixColumns.rows[0]?.venue, "Estádio com espaços");
  assert.equal(sixColumns.rows[0]?.inputState, "C");
});

test("DataHora suporta data local, apenas data, vazio e rejeita valores inválidos", () => {
  const local = parseCalendarImport("4;Jornada 04;Casa;Fora;2026-12-15T20:15;Estádio");
  const dateOnly = parseCalendarImport("4;Jornada 04;Casa;Fora;2026-12-15;Estádio");
  const empty = parseCalendarImport("4;Jornada 04;Casa;Fora;;Estádio");
  const invalid = parseCalendarImport("4;Jornada 04;Casa;Fora;2026-02-30T20:15;Estádio");
  assert.equal(local.rows[0]?.kickoffAt, "2026-12-15T20:15:00.000Z");
  assert.equal(dateOnly.rows[0]?.inputState, "B");
  assert.equal(dateOnly.rows[0]?.kickoffAt, null);
  assert.equal(empty.rows[0]?.inputState, "C");
  assert.equal(invalid.issues[0]?.code, "datetime-invalid");
});

test("ISO com offset distingue os dois instantes da mudança de DST", () => {
  const summerOffset = parseCalendarImport(
    `${CALENDAR_IMPORT_HEADER}\n4;Jornada 04;Casa;Fora;2026-10-25T01:30:00+01:00;;`
  );
  const winterOffset = parseCalendarImport(
    `${CALENDAR_IMPORT_HEADER}\n4;Jornada 04;Casa;Fora;2026-10-25T01:30:00+00:00;;`
  );
  const nonexistentLocal = parseCalendarImport("4;Jornada 04;Casa;Fora;2026-03-29T01:30;");
  assert.equal(summerOffset.rows[0]?.kickoffAt, "2026-10-25T00:30:00.000Z");
  assert.equal(winterOffset.rows[0]?.kickoffAt, "2026-10-25T01:30:00.000Z");
  assert.equal(nonexistentLocal.issues[0]?.code, "datetime-nonexistent");
});

test("catálogo de canais resolve um ID, rejeita desconhecidos e deteta nomes ambíguos", () => {
  const lookup = buildCalendarBroadcastChannelLookup([
    { id: "channel-1", name: "Sport TV 1" },
    { id: "channel-2", name: "RTP1" },
    { id: "channel-3", name: "sport-tv 1" }
  ]);
  assert.deepEqual(resolveCalendarBroadcastChannel(lookup, " rtp1 "), {
    status: "resolved",
    channelId: "channel-2"
  });
  assert.deepEqual(resolveCalendarBroadcastChannel(lookup, "Canal inexistente"), { status: "unresolved" });
  assert.deepEqual(resolveCalendarBroadcastChannel(lookup, "SPORT TV 1"), {
    status: "ambiguous",
    channelIds: ["channel-1", "channel-3"]
  });
});

test("células vazias preservam DataHora, Estádio e CanalTV mesmo num jogo finished", () => {
  const decision = decideCalendarMatchAction(existingMatch({ status: "finished" }), importRow(), null);
  assert.equal(decision.action, "keep");
  assert.deepEqual(decision.patch, {});
  assert.deepEqual(decision.changes, []);
});

test("DataHora diferente num estado protegido rejeita a linha integralmente", () => {
  const decision = decideCalendarMatchAction(
    existingMatch({ status: "finished" }),
    importRow({
      inputState: "A",
      scheduledDate: "2026-08-29",
      kickoffAt: "2026-08-29T19:15:00.000Z",
      venue: "Novo estádio"
    }),
    null
  );
  assert.equal(decision.action, "conflict");
  assert.deepEqual(decision.patch, {});
  assert.deepEqual(decision.changes, []);
});

test("DataHora igual por instante não gera update nem conflito num jogo não scheduled", () => {
  const decision = decideCalendarMatchAction(
    existingMatch({ status: "live", kickoffAt: "2026-08-28T19:15:00+00:00" }),
    importRow({
      inputState: "A",
      scheduledDate: "2026-08-28",
      kickoffAt: "2026-08-28T19:15:00.000Z"
    }),
    null
  );
  assert.equal(decision.action, "keep");
  assert.deepEqual(decision.patch, {});
});

test("atualização apenas de Estádio usa PATCH parcial e nunca envia vazio", () => {
  const update = decideCalendarMatchAction(existingMatch(), importRow({ venue: "Novo Estádio" }), null);
  const preserve = decideCalendarMatchAction(existingMatch(), importRow({ venue: null }), null);
  assert.equal(update.action, "update");
  assert.deepEqual(update.patch, { venue: "Novo Estádio" });
  assert.deepEqual(update.changes.map((change) => change.field), ["venue"]);
  assert.deepEqual(preserve.patch, {});
});

test("atualização apenas de CanalTV usa o ID existente do catálogo", () => {
  const update = decideCalendarMatchAction(
    existingMatch(),
    importRow({ broadcastChannelName: "RTP1" }),
    { id: "channel-2", name: "RTP1" }
  );
  const keep = decideCalendarMatchAction(
    existingMatch(),
    importRow({ broadcastChannelName: "SPORT TV 1" }),
    { id: "channel-1", name: "Sport TV 1" }
  );
  assert.deepEqual(update.patch, { broadcast_channel_id: "channel-2" });
  assert.deepEqual(update.changes, [
    { field: "broadcastChannel", currentLabel: "Sport TV 1", nextLabel: "RTP1" }
  ]);
  assert.equal(keep.action, "keep");
  assert.deepEqual(keep.patch, {});
});

test("atualização simultânea gera um único PATCH parcial com os três campos", () => {
  const incoming = importRow({
    inputState: "A",
    scheduledDate: "2026-08-29",
    kickoffAt: "2026-08-29T20:00:00.000Z",
    venue: "Novo Estádio",
    broadcastChannelName: "RTP1"
  });
  const decision = decideCalendarMatchAction(existingMatch(), incoming, { id: "channel-2", name: "RTP1" });
  assert.equal(decision.action, "update");
  assert.deepEqual(decision.patch, {
    scheduled_date: "2026-08-29",
    kickoff_at: "2026-08-29T20:00:00.000Z",
    venue: "Novo Estádio",
    broadcast_channel_id: "channel-2"
  });
  assert.deepEqual(decision.changes.map((change) => change.field), ["dateTime", "venue", "broadcastChannel"]);
  assert.ok(decision.changes.every((change) => change.currentLabel && change.nextLabel));
  assert.equal("status" in decision.patch, false);
});

test("repetir valores já aplicados resulta em manter", () => {
  const incoming = importRow({
    inputState: "A",
    scheduledDate: "2026-08-28",
    kickoffAt: "2026-08-28T19:15:00.000Z",
    venue: "Estádio Municipal do Fontelo",
    broadcastChannelName: "Sport TV 1"
  });
  const decision = decideCalendarMatchAction(existingMatch(), incoming, { id: "channel-1", name: "Sport TV 1" });
  assert.equal(decision.action, "keep");
  assert.deepEqual(decision.patch, {});
});

test("emparelhamentos repetidos no lote mantêm a categoria duplicado", () => {
  const parsed = parseCalendarImport(`${CALENDAR_IMPORT_HEADER}\n${canonicalRow}\n${canonicalRow}`);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.issues[0]?.status, "duplicate");
  assert.equal(parsed.issues[0]?.code, "duplicate-row");
});
