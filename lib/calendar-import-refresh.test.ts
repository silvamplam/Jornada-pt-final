import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyCalendarCheckpointTransition,
  buildCalendarApplicationClientState,
  getNextCalendarMatchday,
  prepareCalendarCheckpointsForResume,
  type CalendarMatchdayCheckpoint
} from "./calendar-import";

const matchdays = [{ number: 4 }, { number: 5 }, { number: 6 }];

function checkpoint(
  matchdayNumber: number,
  status: CalendarMatchdayCheckpoint["status"] = "completed"
): CalendarMatchdayCheckpoint {
  return {
    matchdayNumber,
    matchdayLabel: `Jornada ${matchdayNumber}`,
    createdMatchday: true,
    createdMatches: 9,
    updatedMatches: 0,
    keptMatches: 0,
    status,
    ...(status === "failed" ? { message: "Falha controlada" } : {})
  };
}

test("aplicação concluída exige refresh dos dados persistidos e não oferece nova ação", () => {
  const state = buildCalendarApplicationClientState(matchdays, [checkpoint(4), checkpoint(5), checkpoint(6)]);
  assert.deepEqual(state, {
    completedCount: 3,
    pendingCount: 0,
    hasPending: false,
    hasFailed: false,
    isComplete: true,
    canApply: false,
    action: null,
    nextMatchdayNumber: null,
    shouldRefreshPersistedData: true
  });
});

test("estado inicial apresenta aplicação e começa na primeira jornada", () => {
  const state = buildCalendarApplicationClientState(matchdays, []);
  assert.equal(state.action, "apply");
  assert.equal(state.nextMatchdayNumber, 4);
  assert.equal(state.pendingCount, 3);
});

test("retoma começa exatamente na primeira jornada ainda não concluída", () => {
  const completed = [checkpoint(4), checkpoint(5)];
  const state = buildCalendarApplicationClientState(matchdays, completed);
  assert.equal(state.action, "resume");
  assert.equal(state.nextMatchdayNumber, 6);
  assert.equal(getNextCalendarMatchday(matchdays, completed)?.number, 6);
});

test("jornadas concluídas não são reaplicadas nem duplicadas", () => {
  const completed = [checkpoint(4)];
  const transition = applyCalendarCheckpointTransition(matchdays, completed, checkpoint(4));
  assert.equal(transition.ok, true);
  if (!transition.ok) return;
  assert.deepEqual(transition.progress.completedMatchdays, [4]);
  assert.deepEqual(transition.progress.pendingMatchdays, [5, 6]);
  assert.equal(transition.progress.checkpoints.length, 1);
});

test("erro intermédio conserva concluídas e bloqueia aplicação até novo preview", () => {
  const stopped = [checkpoint(4), checkpoint(5, "failed")];
  const state = buildCalendarApplicationClientState(matchdays, stopped);
  assert.equal(state.completedCount, 1);
  assert.deepEqual(state.pendingCount, 2);
  assert.equal(state.hasFailed, true);
  assert.equal(state.canApply, false);
  assert.equal(state.shouldRefreshPersistedData, true);
});

test("preparação da retoma remove apenas o checkpoint falhado", () => {
  const resumed = prepareCalendarCheckpointsForResume([checkpoint(4), checkpoint(5, "failed")]);
  const state = buildCalendarApplicationClientState(matchdays, resumed);
  assert.deepEqual(resumed.map((item) => item.matchdayNumber), [4]);
  assert.equal(state.action, "resume");
  assert.equal(state.nextMatchdayNumber, 5);
});

test("o cliente atualiza o Server Component sem reload e mantém o relatório", async () => {
  const source = await readFile(
    new URL("../app/admin/gestor/CalendarImportTool.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /payload\.progress\.pendingMatchdays\.length === 0/);
  assert.match(source, /setMessage\("Todas as jornadas do plano foram aplicadas/);
  assert.match(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /window\.location\.reload|router\.push|router\.replace/);
  const completionBlock = source.match(
    /if \(payload\.progress\.pendingMatchdays\.length === 0\) \{([\s\S]*?)return;/
  )?.[1];
  assert.ok(completionBlock);
  assert.doesNotMatch(completionBlock, /setCheckpoints\(\{\}\)|setPreview\(null\)/);
});

test("a lista e a contagem do Gestor dependem dos dados novamente lidos da época", async () => {
  const pageSource = await readFile(new URL("../app/admin/gestor/page.tsx", import.meta.url), "utf8");
  const supabaseSource = await readFile(new URL("./supabase.ts", import.meta.url), "utf8");
  assert.match(pageSource, /const matchdaysForSeason = await readMatchdaysForSeason\(selectedSeason\?\.id\)/);
  assert.match(pageSource, /\{matchdaysForSeason\.length\} jornadas no calendario desta epoca/);
  assert.match(pageSource, /matchdaysForSeason\.map\(\(matchday\) =>/);
  assert.match(supabaseSource, /fetchSupabaseAdminTable[\s\S]*cache: "no-store"/);
});

test("o refresh preserva país, competição e época selecionados", async () => {
  const source = await readFile(
    new URL("../app/admin/gestor/CalendarImportTool.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /formData\.set\("country_id", countryId\)/);
  assert.match(source, /formData\.set\("competition_id", competitionId\)/);
  assert.match(source, /formData\.set\("season_id", seasonId\)/);
  assert.match(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /window\.location/);
});
