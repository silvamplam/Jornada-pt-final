import assert from "node:assert/strict";
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

const sources = readFileSync(
  join(
    root,
    "lib/matchday-agenda-tv-sources.ts",
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

test("só ausência ou conflito de jogo bloqueiam a confirmação", () => {
  assert.match(route, /row\.status === "source_not_found"/u);
  assert.match(route, /row\.status === "source_conflict"/u);
  assert.doesNotMatch(
    route,
    /row\.status === "channel_not_found"\s*\|\|/u,
  );
  assert.match(
    route,
    /a TV atual será preservada/u,
  );
});

test("indisponibilidade total externa permanece fail-safe", () => {
  assert.match(route, /source-all-unavailable/u);
  assert.match(route, /console\.warn\("\[agenda-tv\] external source unavailable"/u);
  assert.match(route, /Agenda externa indisponível neste momento\. Nenhuma alteração foi efetuada\./u);
  assert.match(route, /"source-unavailable"/u);
});
