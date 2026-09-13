import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

const route = readFileSync(
  join(
    root,
    "app/api/admin/editorial/jornada/[matchdayId]/agenda-tv/route.ts",
  ),
  "utf8",
);

const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260904003000_apply_matchday_agenda_tv_sync_v2.sql",
  ),
  "utf8",
);

const preserveMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260913182822_agenda_tv_sync_v2_preserve.sql",
  ),
  "utf8",
);

const sources = readFileSync(
  join(
    root,
    "lib/matchday-agenda-tv-sources.ts",
  ),
  "utf8",
);

const sync = readFileSync(
  join(
    root,
    "lib/matchday-agenda-tv-sync.ts",
  ),
  "utf8",
);

test("endpoint Agenda e TV continua autónomo da Mesa editorial", () => {
  assert.match(
    route,
    /apply_matchday_agenda_tv_sync_v2/,
  );

  assert.doesNotMatch(
    route,
    /applyChanges|currentDraft|commitDraft|draftPageControls|thematic/,
  );
});

test("fontes são independentes e ZeroZero deixa de ser dependência única", () => {
  assert.match(route, /readLigaPortugalMatchday/u);
  assert.match(route, /readOndeBolaMatchday/u);
  assert.match(route, /readZerozeroMatchday/u);
  assert.match(route, /unresolvedWithoutLegacy/u);
  assert.match(sources, /parseLigaPortugalMatchHtml/u);
  assert.match(sources, /parseOndeBolaAgendaHtml/u);
  assert.match(
    route,
    /Promise\.all\(\[\s*safeReadSource\("liga_portugal"[\s\S]*safeReadSource\("ondebola"/u,
  );
  assert.match(
    route,
    /catch \(error\)[\s\S]*return null;/u,
  );
});

test("Liga Portugal tem precedência para agenda e canal exato pode vir de fonte complementar", () => {
  assert.match(
    route,
    /resolveScheduleEvidence\(\[\s*ligaEvidence,\s*ondebolaEvidence,\s*zerozeroEvidence,/u,
  );
  assert.match(route, /isGenericAgendaTvChannel/u);
  assert.match(route, /channelsByKey/u);
});

test("apply v2 é atómico, protege concorrência e permite canal não confirmado", () => {
  assert.match(migration, /security definer/u);
  assert.match(migration, /agenda-tv-v2-incomplete-matchday/u);
  assert.match(migration, /agenda-tv-v2-stale-state/u);
  assert.match(migration, /scheduled_date/u);
  assert.match(migration, /kickoff_at/u);
  assert.match(
    migration,
    /requested\.broadcast_channel_id is null[\s\S]*then m\.broadcast_channel_id/u,
  );
  assert.match(
    migration,
    /nullif\(item ->> 'broadcast_channel_id', ''\) is not null/u,
  );
});

test("extensão preserve mantém o RPC v2 retrocompatível e a migration original intacta", () => {
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "585155247b0ba4b427aaea6fb30ce5807be9fd95d6a367d85defdedf4ee0b6dd",
  );
  assert.match(
    preserveMigration,
    /create or replace function public\.apply_matchday_agenda_tv_sync_v2/u,
  );
  assert.doesNotMatch(preserveMigration, /agenda_tv_sync_v3/u);
  assert.match(
    preserveMigration,
    /not coalesce\(\(item ->> 'preserve'\)::boolean, false\)/u,
  );
  assert.match(
    preserveMigration,
    /and not requested\.preserve/u,
  );
  assert.match(sync, /preserve: true/u);
  assert.match(sync, /preserve: row\.preserve/u);
});

test("só ausência ou conflito de jogo bloqueiam a confirmação", () => {
  assert.match(route, /row\.status === "source_not_found"/u);
  assert.match(route, /row\.status === "source_conflict"/u);
  assert.doesNotMatch(
    route,
    /row\.status === "channel_not_found"\s*\|\|/u,
  );
  assert.match(
    sync,
    /a TV atual será preservada/u,
  );
});

test("indisponibilidade total externa permanece fail-safe", () => {
  assert.match(route, /source-all-unavailable/u);
  assert.match(route, /agendaTvUnavailableSourcesBlock/u);
  assert.match(route, /console\.warn\("\[agenda-tv\] external source unavailable"/u);
  assert.match(route, /Agenda externa indisponível neste momento\. Nenhuma alteração foi efetuada\./u);
  assert.match(route, /"source-unavailable"/u);
  assert.ok(
    route.indexOf('throw new Error("source-all-unavailable")')
      < route.lastIndexOf("await writeSupabaseAdmin("),
  );
});

test("TV incompleta consulta fallback e nao pode ser declarada unchanged", () => {
  assert.match(
    sync,
    /scheduleStatus\(match\) !== "ok"[\s\S]*match\.broadcast_channel_id === null/u,
  );
  assert.match(
    route,
    /zerozero && !isGenericAgendaTvChannel\(zerozero\.channel\)/u,
  );
  assert.match(
    sync,
    /input\.match\.broadcast_channel_id === null[\s\S]*"channel_not_found"/u,
  );
  assert.match(
    route,
    /row\.status === "channel_not_found"/u,
  );
});

test("ciclo de vida exclui finished/live do matching mas mantém o payload RPC completo", () => {
  assert.match(
    route,
    /status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score/u,
  );
  assert.match(route, /matches\.filter\([\s\S]*agendaTvMatchNeedsEvidence/u);
  assert.match(route, /if \(!agendaTvMatchNeedsEvidence\(match\)\)/u);
  assert.match(sync, /status === "scheduled"/u);
  assert.match(sync, /status === "postponed"/u);
  assert.match(sync, /return "preserve"/u);
  assert.match(route, /buildAgendaTvRpcRows\(preview\.rows\)/u);
  assert.match(sync, /nextDate: input\.match\.scheduled_date/u);
  assert.match(sync, /nextChannelId: input\.match\.broadcast_channel_id/u);
});

test("Liga Portugal exige instante explícito; fontes locais não são convertidas como UTC", () => {
  assert.match(sources, /#__NUXT_DATA__/u);
  assert.match(sources, /matchDate/u);
  assert.match(sources, /fixtureDate/u);
  assert.match(sources, /portugalLocalFromUtcInstant/u);
  assert.doesNotMatch(
    sources,
    /parseOndeBolaAgendaHtml[\s\S]*portugalLocalFromUtcInstant/u,
  );
});
