import { NextResponse } from "next/server";
import { adminRelativeRedirect, adminRelativeUrl } from "@/lib/admin-relative-redirect";
import { syncCurrentPublishedReferenceCompositionNewsFlow } from "@/lib/editorial-current-reference-composition-sync";
import {
  EditorialMatchdayNewsFlowError,
  moveMatchdayHorizontalNewsItem,
  normalizeLatestNewsOrder,
  normalizeMatchdayHorizontalNewsOrder,
  transferPublishedArticleBetweenMatchdayZones,
  isEditorialMatchdayTransferSlotType,
  type EditorialDisplacedTargetSlotType,
} from "@/lib/editorial-matchday-news-flow";
import { EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS } from "@/lib/editorial-context-post-title";
import {
  isMatchdayLivePublicZoneKey,
  moveMatchdayLivePublicZone,
  normalizeMatchdayLivePublicZoneOrder,
} from "@/lib/editorial-matchday-live-zone-order";
import {
  applyCalendarCheckpointTransition,
  buildCalendarBroadcastChannelLookup,
  buildCalendarTeamLookup,
  createCalendarFingerprint,
  createCalendarSourceKey,
  createCompetitiveIdentity,
  decideCalendarMatchAction,
  findCalendarCompetitiveDuplicate,
  formatCalendarPreviewDate,
  getNextCalendarMatchday,
  groupCalendarActionsByMatchday,
  parseCalendarImport,
  resolveCalendarBroadcastChannel,
  resolveCalendarTeam,
  validateCalendarCheckpointSequence,
  validateCalendarFingerprint,
  type CalendarApplicationProgress,
  type CalendarApplyCheckpoint,
  type CalendarApplyResponse,
  type CalendarErrorResponse,
  type CalendarImportRow,
  type CalendarMatchdayCheckpoint,
  type CalendarMatchdayPlan,
  type CalendarMatchUpdatePatch,
  type CalendarPreviewResponse,
  type CalendarPreviewRow,
  type CalendarPreviewSummary,
  type CalendarResolvedCompetitiveIdentity
} from "@/lib/calendar-import";
import { getPublicLiveMinute } from "@/lib/live-match-clock";
import {
  buildSeasonParticipantPlan,
  type SeasonParticipantPlan,
  type SeasonParticipantPlanSummary
} from "@/lib/season-participant-list";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdmin, writeSupabaseAdminReturning } from "@/lib/supabase";

const ROUNDUP_EDITOR_SORT_ORDERS = Array.from({ length: 10 }, (_, index) => index + 1);
const NEWS_FLOW_REFERENCE_SYNC_ACTIONS = new Set([
  "save_matchday_headline",
  "save_matchday_side_block",
  "save_matchday_complement",
  "save_matchday_editorial",
  "save_matchday_highlights",
  "save_matchday_highlight_item",
  "save_matchday_latest_news",
  "save_matchday_latest_news_item",
  "save_matchday_horizontal_news_item",
  "move_matchday_horizontal_news_item",
]);

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanContextPostTitle(value: FormDataEntryValue | null): string | null {
  const text = cleanText(value);
  if (text && text.length > EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS) {
    throw new Error("context-post-title-too-long");
  }
  return text;
}

function cleanHexColor(value: FormDataEntryValue | null): string | null {
  const text = cleanText(value);

  return text && /^#[0-9A-Fa-f]{6}$/.test(text) ? text : null;
}

function cleanInteger(value: FormDataEntryValue | null): number | null {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function latestNewsSortOrdersFromFormData(formData: FormData) {
  return Array.from(
    new Set(
      Array.from(formData.keys())
        .map((key) => /^latest_news_(\d+)_/.exec(key)?.[1] ?? null)
        .filter((value): value is string => Boolean(value))
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((first, second) => first - second);
}

function cleanScore(value: FormDataEntryValue | null): number | null {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  if (!/^\d+$/.test(text)) {
    throw new Error("match-score-invalid");
  }

  return Number.parseInt(text, 10);
}

function cleanMatchMinute(value: FormDataEntryValue | null): number | null {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  if (!/^\d+$/.test(text)) {
    throw new Error("match-minute-invalid");
  }

  const minute = Number.parseInt(text, 10);
  if (minute < 0 || minute > 130) {
    throw new Error("match-minute-invalid");
  }

  return minute;
}

function cleanMatchStatus(value: FormDataEntryValue | null, fallback = "scheduled"): string {
  const status = cleanText(value);
  const allowed = new Set(["scheduled", "live", "halftime", "finished", "postponed"]);

  if (!status) {
    return allowed.has(fallback) ? fallback : "scheduled";
  }

  if (!allowed.has(status)) {
    throw new Error("match-status-invalid");
  }

  return status;
}

function cleanClockAction(value: FormDataEntryValue | null): "start_clock" | "pause_clock" | null {
  const action = cleanText(value);
  return action === "start_clock" || action === "pause_clock" ? action : null;
}

function cleanClockRunning(value: FormDataEntryValue | null): boolean {
  const text = cleanText(value);
  return text === "true" || text === "1" || text === "on";
}

function cleanMatchdayStatus(value: FormDataEntryValue | null): string {
  const status = cleanText(value);
  const allowed = new Set(["scheduled", "live", "finished", "archived"]);

  return status && allowed.has(status) ? status : "scheduled";
}

function normalizeKickoff(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const month = Number.parseInt(value.slice(5, 7), 10);
  const portugalOffset = month >= 4 && month <= 10 ? "+01:00" : "+00:00";

  return `${withSeconds}${portugalOffset}`;
}

type AgendaMatchRow = {
  id: string;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  status: string;
  minute: number | null;
  live_started_at: string | null;
  live_base_minute: number | null;
  is_clock_running: boolean | null;
  home_score: number | null;
  away_score: number | null;
  broadcast_channel_id: string | null;
};

type MatchdayTeamUse = {
  id: string;
  home_team_id: string;
  away_team_id: string;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  code?: string | null;
  country_id: string | null;
};

type TeamAliasRow = {
  team_id: string;
  normalized_alias: string;
};

type ApplyClubListSummary = SeasonParticipantPlanSummary;

type SeasonParticipantAssociationRow = {
  team_id: string;
  status: string | null;
  display_order: number;
};

type ManualParticipantRow = {
  team_id: string;
  status: string | null;
};

type CalendarMatchdayRow = {
  id: string;
  number: number;
  label: string;
};

type ExistingCalendarMatchRow = {
  id: string;
  source_key: string | null;
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: string;
  scheduled_date: string | null;
  kickoff_at: string | null;
  venue: string | null;
  broadcast_channel_id: string | null;
};

type BroadcastChannelRow = {
  id: string;
  name: string;
};

type PlannedCalendarWrite = {
  matchdayNumber: number;
  lineNumber: number;
  row: CalendarImportRow;
  preview: CalendarPreviewRow;
  homeTeamId: string;
  awayTeamId: string;
  existingMatchId: string | null;
  updatePatch: CalendarMatchUpdatePatch;
};

type CalendarServerPlan = {
  response: CalendarPreviewResponse;
  writes: PlannedCalendarWrite[];
};

type MatchIdRow = {
  id: string;
};

type MatchdayIdRow = {
  id: string;
};

class ClearSeasonCalendarError extends Error {
  detail: string;

  constructor(detail: string) {
    super("clear-season-calendar-step-failed");
    this.detail = detail;
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function returnUrl(_request: Request, formData: FormData, key: "created" | "error", value: string, extraParams?: Record<string, string>) {
  const rawReturnTo = cleanText(formData.get("return_to"));
  const safeReturnTo =
    rawReturnTo?.startsWith("/admin/gestor") || rawReturnTo?.startsWith("/admin/editorial/jornada/")
      ? rawReturnTo
      : "/admin/gestor";
  const url = adminRelativeUrl(safeReturnTo);

  url.searchParams.delete("created");
  url.searchParams.delete("error");
  url.searchParams.delete("club_apply_summary");
  url.searchParams.delete("calendar_apply_summary");
  url.searchParams.delete("clear_calendar_error_detail");
  url.searchParams.delete("latest_news_error_detail");
  url.searchParams.delete("horizontal_news_error_detail");
  url.searchParams.delete("news_flow_error_detail");
  url.searchParams.set(key, value);
  Object.entries(extraParams ?? {}).forEach(([paramKey, paramValue]) => {
    url.searchParams.set(paramKey, paramValue);
  });

  return adminRelativeRedirect(url);
}

async function hasRows(path: string) {
  const rows = await fetchSupabaseAdminTable<{ id: string }>(`${path}&limit=1`);
  return rows.length > 0;
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function encodedInList(values: string[]) {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

async function deleteRows(path: string) {
  await writeSupabaseAdmin(path, {
    method: "DELETE"
  });
}

function isMissingOptionalRelationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes('"code":"42p01"') ||
    message.includes('"code":"42703"') ||
    message.includes('"code":"pgrst205"') ||
    message.includes("could not find the table") ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function isPermissionDeniedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes('"code":"42501"') || message.includes("permission denied");
}

function formatActionError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Erro desconhecido.";
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: string; details?: string; hint?: string; code?: string };
    return [parsed.message, parsed.details, parsed.hint, parsed.code ? `Codigo: ${parsed.code}` : null]
      .filter(Boolean)
      .join(" ");
  } catch {
    return error.message;
  }
}

function shortActionError(error: unknown) {
  const message = formatActionError(error).replace(/\s+/g, " ").trim();
  return message.length > 700 ? `${message.slice(0, 700)}...` : message;
}

async function deleteExistingOptionalRows(table: string, filter: string, label: string) {
  let linkedRows: { id: string }[] = [];

  try {
    linkedRows = await fetchSupabaseAdminTable<{ id: string }>(`${table}?select=id&${filter}&limit=1`);
  } catch (error) {
    if (isMissingOptionalRelationError(error)) {
      console.warn(`[admin/gestor] clear_season_calendar skipped optional dependency ${label}:`, error);
      return;
    }

    throw new Error(`${label}: ${shortActionError(error)}`);
  }

  if (linkedRows.length === 0) {
    return;
  }

  try {
    await deleteRows(`${table}?${filter}`);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw new Error(
        `Existem dados em ${table} ligados a estes jogos ou jornadas, mas a aplicacao nao tem permissao para os apagar. ${shortActionError(error)}`
      );
    }

    if (isMissingOptionalRelationError(error)) {
      console.warn(`[admin/gestor] clear_season_calendar skipped optional dependency ${label}:`, error);
      return;
    }

    throw new Error(`${label}: ${shortActionError(error)}`);
  }
}

async function runClearSeasonStep(stepLabel: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    throw new ClearSeasonCalendarError(`Erro ao ${stepLabel}: ${shortActionError(error)}`);
  }
}

async function createCountry(formData: FormData) {
  const name = cleanText(formData.get("name"));
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);

  if (!name || !slug) {
    throw new Error("missing-fields");
  }

  await writeSupabaseAdmin("countries", {
    method: "POST",
    body: JSON.stringify({
      name,
      slug,
      iso2: cleanText(formData.get("iso2")),
      flag_emoji: cleanText(formData.get("flag_emoji")),
      is_active: true
    })
  });
}

async function createCompetition(formData: FormData) {
  const name = cleanText(formData.get("name"));
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);
  const countryId = cleanText(formData.get("country_id"));

  if (!name || !slug || !countryId) {
    throw new Error("missing-fields");
  }

  const payload = {
    name,
    slug,
    country_id: countryId,
    logo_url: cleanText(formData.get("logo_url")),
    accent_color: cleanText(formData.get("accent_color")),
    is_active: true
  };

  await writeSupabaseAdmin("competitions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function createSeason(formData: FormData) {
  const competitionId = cleanText(formData.get("competition_id"));
  const label = cleanText(formData.get("label"));

  if (!competitionId || !label) {
    throw new Error("missing-fields");
  }

  await writeSupabaseAdmin("seasons", {
    method: "POST",
    body: JSON.stringify({
      competition_id: competitionId,
      label,
      starts_on: cleanText(formData.get("starts_on")),
      ends_on: cleanText(formData.get("ends_on")),
      is_current: cleanText(formData.get("is_current")) === "1"
    })
  });
}

async function createTeam(formData: FormData) {
  const name = cleanText(formData.get("name"));
  const shortName = cleanText(formData.get("short_name"))?.toUpperCase();
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);
  const countryId = cleanText(formData.get("country_id"));

  if (!name || !shortName || !slug || !countryId) {
    throw new Error("missing-fields");
  }

  const lookupTeams = await readTeamsForCountryLookup(countryId);
  const lookupAliases = await readTeamAliasesForTeamIds(lookupTeams.map((team) => team.id));
  const existingTeamByInput = resolveTeamByInputName({
    teamsByKey: buildTeamLookupIndex(lookupTeams, lookupAliases),
    slug,
    name,
    shortName
  });

  if (existingTeamByInput) {
    throw new Error("team-slug-exists");
  }

  if (await hasRows(`teams?select=id&slug=eq.${encodeURIComponent(slug)}`)) {
    throw new Error("team-slug-exists");
  }

  await writeSupabaseAdmin("teams", {
    method: "POST",
    body: JSON.stringify({
      name,
      short_name: shortName,
      slug,
      country_id: countryId,
      logo_url: cleanText(formData.get("logo_url")),
      primary_color: cleanText(formData.get("primary_color"))
    })
  });
}

async function attachTeamToCountry(formData: FormData) {
  const teamId = cleanText(formData.get("team_id"));
  const countryId = cleanText(formData.get("country_id"));

  if (!teamId || !countryId) {
    throw new Error("missing-fields");
  }

  const teams = await fetchSupabaseAdminTable<{ id: string; country_id: string | null }>(
    `teams?select=id,country_id&id=eq.${encodeURIComponent(teamId)}&limit=1`
  );
  const team = teams[0];

  if (!team) {
    throw new Error("team-not-found");
  }

  if (team.country_id) {
    throw new Error("team-already-linked");
  }

  await writeSupabaseAdmin(`teams?id=eq.${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      country_id: countryId
    })
  });
}

async function createParticipant(formData: FormData) {
  const seasonId = cleanText(formData.get("season_id"));
  const teamId = cleanText(formData.get("team_id"));
  const countryId = cleanText(formData.get("country_id"));

  if (!seasonId || !teamId || !countryId) {
    throw new Error("missing-fields");
  }

  const linkedTeams = await fetchSupabaseAdminTable<{ id: string }>(
    `teams?select=id&id=eq.${encodeURIComponent(teamId)}&country_id=eq.${encodeURIComponent(countryId)}&limit=1`
  );

  if (linkedTeams.length === 0) {
    throw new Error("invalid-team-country");
  }

  const participantPayload = {
    season_id: seasonId,
    team_id: teamId,
    display_order: cleanInteger(formData.get("display_order")) ?? 999,
    status: "active",
    data_source: "manual",
    sync_status: "manual",
    manual_override: true
  };

  await writeSupabaseAdmin("season_teams?on_conflict=season_id,team_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(participantPayload)
  });
}

async function buildSeasonParticipantServerPlan(
  countryId: string,
  seasonId: string,
  rawList: string
): Promise<{ plan: SeasonParticipantPlan; participants: SeasonParticipantAssociationRow[] }> {
  let teams: TeamRow[] | null = null;
  try {
    teams = await fetchSupabaseAdminTable<TeamRow>(
      `teams?select=id,name,short_name,slug,code,country_id&country_id=eq.${encodeURIComponent(countryId)}&limit=2000`
    );
  } catch {
    teams = null;
  }

  let aliases: TeamAliasRow[] | null = null;
  if (teams !== null) {
    const teamIds = Array.from(new Set(teams.map((team) => team.id))).filter(Boolean);
    if (teamIds.length === 0) {
      aliases = [];
    } else {
      try {
        aliases = await fetchSupabaseAdminTable<TeamAliasRow>(
          `team_aliases?select=team_id,normalized_alias&team_id=in.(${teamIds.map(encodeURIComponent).join(",")})&status=eq.active&limit=2000`
        );
      } catch {
        aliases = null;
      }
    }
  }

  const participants = await fetchSupabaseAdminTable<SeasonParticipantAssociationRow>(
    `season_teams?select=team_id,status,display_order&season_id=eq.${encodeURIComponent(seasonId)}&limit=2000`
  );
  const plan = buildSeasonParticipantPlan({
    rawList,
    teams:
      teams?.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        slug: team.slug,
        code: team.code ?? null
      })) ?? null,
    aliases:
      aliases?.map((alias) => ({
        teamId: alias.team_id,
        normalizedAlias: alias.normalized_alias
      })) ?? null,
    participants: participants.map((participant) => ({
      teamId: participant.team_id,
      status: participant.status
    }))
  });

  return { plan, participants };
}

async function applyClubList(formData: FormData): Promise<ApplyClubListSummary> {
  const countryId = cleanText(formData.get("country_id"));
  const competitionId = cleanText(formData.get("competition_id"));
  const seasonId = cleanText(formData.get("season_id"));
  const rawListValue = formData.get("club_preview");
  const rawList = typeof rawListValue === "string" ? rawListValue : null;

  if (!countryId || !competitionId || !seasonId || !rawList?.trim()) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`countries?select=id&id=eq.${encodeURIComponent(countryId)}`))) {
    throw new Error("country-not-found");
  }

  if (
    !(await hasRows(
      `competitions?select=id&id=eq.${encodeURIComponent(competitionId)}&country_id=eq.${encodeURIComponent(countryId)}`
    ))
  ) {
    throw new Error("competition-country-invalid");
  }

  if (
    !(await hasRows(
      `seasons?select=id&id=eq.${encodeURIComponent(seasonId)}&competition_id=eq.${encodeURIComponent(competitionId)}`
    ))
  ) {
    throw new Error("season-competition-invalid");
  }

  const { plan, participants } = await buildSeasonParticipantServerPlan(countryId, seasonId, rawList);
  if (!plan.applicable) {
    const reasonCodes = new Set(plan.rows.map((row) => row.reasonCode));
    if (reasonCodes.has("catalog-unavailable")) throw new Error("participant-catalog-unavailable");
    if (reasonCodes.has("aliases-unavailable")) throw new Error("participant-aliases-unavailable");
    if (reasonCodes.has("participants-unavailable")) throw new Error("participant-participants-unavailable");
    throw new Error("participant-list-invalid");
  }

  const associations = plan.rows.filter(
    (row): row is typeof row & { teamId: string } => row.action === "associate" && Boolean(row.teamId)
  );
  const reactivations = plan.rows.filter(
    (row): row is typeof row & { teamId: string } => row.action === "reactivate" && Boolean(row.teamId)
  );
  const nextDisplayOrder = participants.reduce(
    (maximum, participant) => Math.max(maximum, participant.display_order),
    0
  );

  if (associations.length > 0) {
    await writeSupabaseAdmin("season_teams", {
      method: "POST",
      body: JSON.stringify(
        associations.map((row, index) => ({
          season_id: seasonId,
          team_id: row.teamId,
          display_order: nextDisplayOrder + index + 1,
          status: "active",
          data_source: "manual",
          sync_status: "manual",
          manual_override: true
        }))
      )
    });
  }

  if (reactivations.length > 0) {
    const teamIds = reactivations.map((row) => row.teamId).sort();
    await writeSupabaseAdmin(
      `season_teams?season_id=eq.${encodeURIComponent(seasonId)}&team_id=in.(${teamIds
        .map(encodeURIComponent)
        .join(",")})&status=eq.inactive`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "active" })
      }
    );
  }

  return plan.summary;
}

async function removeParticipant(formData: FormData) {
  const participantId = cleanText(formData.get("participant_id"));
  const seasonId = cleanText(formData.get("season_id"));

  if (!participantId || !seasonId) {
    throw new Error("missing-fields");
  }

  await writeSupabaseAdmin(
    `season_teams?id=eq.${encodeURIComponent(participantId)}&season_id=eq.${encodeURIComponent(seasonId)}`,
    {
      method: "DELETE"
    }
  );
}

async function removeAllParticipants(formData: FormData) {
  const seasonId = cleanText(formData.get("season_id"));

  if (!seasonId) {
    throw new Error("missing-fields");
  }

  if (await hasRows(`matchdays?select=id&season_id=eq.${encodeURIComponent(seasonId)}`)) {
    throw new Error("season-participants-has-calendar");
  }

  if (await hasRows(`matches?select=id&season_id=eq.${encodeURIComponent(seasonId)}`)) {
    throw new Error("season-participants-has-calendar");
  }

  await writeSupabaseAdmin(`season_teams?season_id=eq.${encodeURIComponent(seasonId)}`, {
    method: "DELETE"
  });
}

async function removeOldParticipant(formData: FormData) {
  const participantId = cleanText(formData.get("participant_id"));

  if (!participantId) {
    throw new Error("missing-fields");
  }

  const oldParticipantPath =
    `season_teams?select=id&id=eq.${encodeURIComponent(participantId)}&or=(manual_override.is.false,manual_override.is.null)`;

  if (!(await hasRows(oldParticipantPath))) {
    if (await hasRows(`season_teams?select=id&id=eq.${encodeURIComponent(participantId)}&manual_override=is.true`)) {
      throw new Error("old-participant-manual");
    }

    throw new Error("old-participant-not-found");
  }

  await writeSupabaseAdmin(
    `season_teams?id=eq.${encodeURIComponent(participantId)}&or=(manual_override.is.false,manual_override.is.null)`,
    {
      method: "DELETE"
    }
  );
}

async function createMatchday(formData: FormData) {
  const seasonId = cleanText(formData.get("season_id"));
  const number = cleanInteger(formData.get("number"));
  const label = cleanText(formData.get("label"));

  if (!seasonId || number === null || !label) {
    throw new Error("missing-fields");
  }

  if (
    !(await hasRows(
      `season_teams?select=id&season_id=eq.${encodeURIComponent(
        seasonId
      )}&data_source=eq.manual&sync_status=eq.manual&manual_override=is.true`
    ))
  ) {
    throw new Error("matchday-needs-participants");
  }

  if (
    await hasRows(
      `matchdays?select=id&season_id=eq.${encodeURIComponent(seasonId)}&number=eq.${encodeURIComponent(String(number))}`
    )
  ) {
    throw new Error("matchday-duplicate");
  }

  await writeSupabaseAdmin("matchdays", {
    method: "POST",
    body: JSON.stringify({
      season_id: seasonId,
      number,
      label,
      starts_on: cleanText(formData.get("starts_on")),
      ends_on: cleanText(formData.get("ends_on")),
      status: cleanMatchdayStatus(formData.get("status")),
      data_source: "manual",
      sync_status: "manual",
      manual_override: true,
      external_provider: null,
      external_id: null,
      last_synced_at: null
    })
  });
}

async function removeMatchday(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const seasonId = cleanText(formData.get("season_id"));

  if (!matchdayId || !seasonId) {
    throw new Error("missing-fields");
  }

  if (await hasRows(`matches?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}`)) {
    throw new Error("matchday-has-matches");
  }

  await writeSupabaseAdmin(
    `matchdays?id=eq.${encodeURIComponent(matchdayId)}&season_id=eq.${encodeURIComponent(seasonId)}`,
    {
      method: "DELETE"
    }
  );
}

async function saveMatchdayEditorial(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const status = cleanText(formData.get("status")) ?? "draft";
  const title = cleanText(formData.get("title"));
  const summary = cleanText(formData.get("summary"));
  const titleColor = cleanText(formData.get("title_color"));
  const imageUrl = cleanText(formData.get("image_url"));
  const headlineLinkUrl = cleanText(formData.get("headline_link_url"));
  const belowHeadlineModeValue = cleanText(formData.get("below_headline_mode")) ?? "highlights";
  const belowHeadlineMode = belowHeadlineModeValue === "roundup" ? "roundup" : "highlights";
  const belowHeadlineHeading = cleanText(formData.get("below_headline_heading"));
  const belowHeadlineHeadingColor = cleanText(formData.get("below_headline_heading_color"));
  const complementaryModeValue = cleanText(formData.get("complementary_mode")) ?? "none";
  const complementaryMode =
    complementaryModeValue === "roundup_video" || complementaryModeValue === "complementary_story"
      ? complementaryModeValue
      : "none";
  const complementaryStatusValue = cleanText(formData.get("complementary_status")) ?? "draft";
  const complementaryStatus = complementaryStatusValue === "published" ? "published" : "draft";
  const complementaryRoundupItemId = cleanText(formData.get("complementary_roundup_item_id"));
  const complementaryLabel = cleanText(formData.get("complementary_label"));
  const complementaryLabelColor = cleanHexColor(formData.get("complementary_text_color"));
  const complementaryTitle = cleanText(formData.get("complementary_title"));
  const complementaryText = cleanText(formData.get("complementary_text"));
  const complementaryImageUrl = cleanText(formData.get("complementary_image_url"));
  const complementaryLinkUrl = cleanText(formData.get("complementary_link_url"));
  const roundupVideoHeading = cleanText(formData.get("roundup_video_heading"));
  const roundupVideoHeadingColor = cleanText(formData.get("roundup_video_heading_color"));
  const sideBlockStatusValue = cleanText(formData.get("side_block_status")) ?? "draft";
  const sideBlockStatus = sideBlockStatusValue === "published" ? "published" : "draft";
  const sideBlockType = cleanText(formData.get("side_block_type"));
  const sideBlockLabel = cleanText(formData.get("side_block_label"));
  const sideBlockLabelColor = cleanHexColor(formData.get("side_block_label_color"));
  const sideBlockTitle = cleanText(formData.get("side_block_title"));
  const sideBlockTitleColor = cleanText(formData.get("side_block_title_color"));
  const sideBlockAuthor = cleanText(formData.get("side_block_author"));
  const sideBlockText = cleanContextPostTitle(formData.get("side_block_text"));
  const sideBlockImageUrl = cleanText(formData.get("side_block_image_url"));
  const sideBlockLinkUrl = cleanText(formData.get("side_block_link_url"));

  if (!matchdayId || !["draft", "published"].includes(status)) {
    throw new Error("missing-fields");
  }

  if (status === "published" && !title) {
    throw new Error("editorial-title-required");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  if (
    complementaryMode === "roundup_video" &&
    complementaryRoundupItemId &&
    !(await hasRows(
      `matchday_roundup_items?select=id&id=eq.${encodeURIComponent(complementaryRoundupItemId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
    ))
  ) {
    throw new Error("roundup-item-invalid");
  }

  const editorialPayload: Record<string, string | null> = {
    matchday_id: matchdayId,
    title,
    summary,
    title_color: titleColor,
    image_url: imageUrl,
    below_headline_mode: belowHeadlineMode,
    complementary_mode: complementaryMode,
    complementary_roundup_item_id: complementaryRoundupItemId,
    complementary_label: complementaryLabel,
    complementary_title: complementaryTitle,
    complementary_text: complementaryText,
    complementary_image_url: complementaryImageUrl,
    complementary_link_url: complementaryLinkUrl,
    complementary_status: complementaryStatus,
    status,
    updated_at: new Date().toISOString()
  };

  if (formData.has("complementary_text_color")) {
    editorialPayload.complementary_text_color = complementaryLabelColor;
  }

  if (formData.has("roundup_video_heading")) {
    editorialPayload.roundup_video_heading = roundupVideoHeading;
  }

  if (formData.has("headline_link_url")) {
    editorialPayload.headline_link_url = headlineLinkUrl;
  }

  if (formData.has("roundup_video_heading_color")) {
    editorialPayload.roundup_video_heading_color = roundupVideoHeadingColor;
  }

  if (formData.has("below_headline_heading")) {
    editorialPayload.below_headline_heading = belowHeadlineHeading;
  }

  if (formData.has("below_headline_heading_color")) {
    editorialPayload.below_headline_heading_color = belowHeadlineHeadingColor;
  }

  if (formData.has("side_block_status")) {
    editorialPayload.side_block_status = sideBlockStatus;
    editorialPayload.side_block_type = sideBlockType;
    editorialPayload.side_block_label = sideBlockLabel;
    editorialPayload.side_block_label_color = sideBlockLabelColor;
    editorialPayload.side_block_title = sideBlockTitle;
    editorialPayload.side_block_title_color = sideBlockTitleColor;
    editorialPayload.side_block_author = sideBlockAuthor;
    editorialPayload.side_block_text = sideBlockText;
    editorialPayload.side_block_image_url = sideBlockImageUrl;
    editorialPayload.side_block_link_url = sideBlockLinkUrl;
  }

  await writeSupabaseAdmin("matchday_editorials?on_conflict=matchday_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(editorialPayload)
  });
}

async function saveMatchdayHeadline(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const statusValue = cleanText(formData.get("status")) ?? "draft";
  const title = cleanText(formData.get("title"));
  const summary = cleanText(formData.get("summary"));
  const titleColor = cleanText(formData.get("title_color"));

  if (!matchdayId || !["draft", "published"].includes(statusValue)) {
    throw new Error("missing-fields");
  }

  if (statusValue === "published" && !title) {
    throw new Error("editorial-title-required");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = await fetchSupabaseAdminTable<{
    id: string;
    image_url: string | null;
    headline_link_url: string | null;
  }>(`matchday_editorials?select=id,image_url,headline_link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`);
  const existing = existingRows[0] ?? null;
  const imageUrl = cleanText(formData.get("image_url")) ?? existing?.image_url ?? null;
  const headlineLinkUrl = formData.has("headline_link_url")
    ? cleanText(formData.get("headline_link_url"))
    : existing?.headline_link_url ?? null;
  const headlinePayload: Record<string, string | null> = {
    title,
    summary,
    title_color: titleColor,
    image_url: imageUrl,
    headline_link_url: headlineLinkUrl,
    status: statusValue,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(headlinePayload)
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      ...headlinePayload
    })
  });
}

async function saveMatchdaySideBlock(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const sideBlockStatusValue = cleanText(formData.get("side_block_status")) ?? "draft";
  const sideBlockType = cleanText(formData.get("side_block_type"));
  const sideBlockLabel = cleanText(formData.get("side_block_label"));
  const sideBlockLabelColor = cleanHexColor(formData.get("side_block_label_color"));
  const sideBlockTitle = cleanText(formData.get("side_block_title"));
  const sideBlockTitleColor = cleanText(formData.get("side_block_title_color"));
  const sideBlockAuthor = cleanText(formData.get("side_block_author"));
  const sideBlockText = cleanContextPostTitle(formData.get("side_block_text"));

  if (!matchdayId || !["draft", "published"].includes(sideBlockStatusValue)) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = await fetchSupabaseAdminTable<{
    id: string;
    side_block_image_url: string | null;
    side_block_link_url: string | null;
  }>(
    `matchday_editorials?select=id,side_block_image_url,side_block_link_url&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&limit=1`
  );
  const existing = existingRows[0] ?? null;
  const sideBlockImageUrl = cleanText(formData.get("side_block_image_url")) ?? existing?.side_block_image_url ?? null;
  const sideBlockLinkUrl = formData.has("side_block_link_url")
    ? cleanText(formData.get("side_block_link_url"))
    : existing?.side_block_link_url ?? null;
  const sideBlockPayload: Record<string, string | null> = {
    side_block_status: sideBlockStatusValue,
    side_block_type: sideBlockType,
    side_block_label: sideBlockLabel,
    side_block_label_color: sideBlockLabelColor,
    side_block_title: sideBlockTitle,
    side_block_title_color: sideBlockTitleColor,
    side_block_author: sideBlockAuthor,
    side_block_text: sideBlockText,
    side_block_image_url: sideBlockImageUrl,
    side_block_link_url: sideBlockLinkUrl,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(sideBlockPayload)
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      ...sideBlockPayload
    })
  });
}

async function saveMatchdayComplement(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const complementaryStatusValue = cleanText(formData.get("complementary_status")) ?? "draft";
  const complementaryStatus = complementaryStatusValue === "published" ? "published" : "draft";
  const complementaryLabel = cleanText(formData.get("complementary_label"));
  const complementaryLabelColor = cleanHexColor(formData.get("complementary_text_color"));
  const complementaryTitle = cleanText(formData.get("complementary_title"));
  const complementaryText = cleanText(formData.get("complementary_text"));

  if (!matchdayId) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = await fetchSupabaseAdminTable<{
    id: string;
    complementary_image_url: string | null;
    complementary_link_url: string | null;
  }>(
    `matchday_editorials?select=id,complementary_image_url,complementary_link_url&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&limit=1`
  );
  const existing = existingRows[0] ?? null;
  const complementaryImageUrl =
    cleanText(formData.get("complementary_image_url")) ?? existing?.complementary_image_url ?? null;
  const complementaryLinkUrl = formData.has("complementary_link_url")
    ? cleanText(formData.get("complementary_link_url"))
    : existing?.complementary_link_url ?? null;
  const complementPayload: Record<string, string | null> = {
    complementary_label: complementaryLabel,
    complementary_text_color: complementaryLabelColor,
    complementary_title: complementaryTitle,
    complementary_text: complementaryText,
    complementary_image_url: complementaryImageUrl,
    complementary_link_url: complementaryLinkUrl,
    complementary_status: complementaryStatus,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(complementPayload)
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      ...complementPayload
    })
  });
}

async function saveMatchdayRoundupSettings(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const complementaryMode = cleanText(formData.get("complementary_mode")) === "roundup_video" ? "roundup_video" : "none";
  const complementaryRoundupItemId = cleanText(formData.get("complementary_roundup_item_id"));
  const roundupVideoHeading = cleanText(formData.get("roundup_video_heading"));
  const roundupVideoHeadingColor = cleanText(formData.get("roundup_video_heading_color"));

  if (!matchdayId) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  if (
    complementaryRoundupItemId &&
    !(await hasRows(
      `matchday_roundup_items?select=id&id=eq.${encodeURIComponent(complementaryRoundupItemId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
    ))
  ) {
    throw new Error("roundup-item-invalid");
  }

  const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
    `matchday_editorials?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
  );
  const payload: Record<string, string | null> = {
    complementary_mode: complementaryMode,
    complementary_roundup_item_id: complementaryRoundupItemId,
    roundup_video_heading: roundupVideoHeading,
    roundup_video_heading_color: roundupVideoHeadingColor,
    updated_at: new Date().toISOString()
  };

  if (existingRows[0]) {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      status: "draft",
      ...payload
    })
  });
}

async function saveMatchdayBelowHeadline(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const belowHeadlineModeValue = cleanText(formData.get("below_headline_mode")) ?? "highlights";
  const belowHeadlineMode = belowHeadlineModeValue === "roundup" ? "roundup" : "highlights";
  const belowHeadlineHeading = cleanText(formData.get("below_headline_heading"));
  const belowHeadlineHeadingColor = cleanText(formData.get("below_headline_heading_color"));

  if (!matchdayId) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
    `matchday_editorials?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
  );
  const belowHeadlinePayload: Record<string, string | null> = {
    below_headline_mode: belowHeadlineMode,
    below_headline_heading: belowHeadlineHeading,
    below_headline_heading_color: belowHeadlineHeadingColor,
    updated_at: new Date().toISOString()
  };

  if (existingRows[0]) {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify(belowHeadlinePayload)
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      status: "draft",
      ...belowHeadlinePayload
    })
  });
}

async function setMatchdayBelowHeadlineMode(matchdayId: string, mode: "highlights" | "roundup") {
  const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
    `matchday_editorials?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
  );

  if (existingRows[0]) {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        below_headline_mode: mode,
        updated_at: new Date().toISOString()
      })
    });
    return;
  }

  await writeSupabaseAdmin("matchday_editorials", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      below_headline_mode: mode,
      status: "draft",
      updated_at: new Date().toISOString()
    })
  });
}

async function saveMatchdayHighlights(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));

  if (!matchdayId) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  for (const sortOrder of [1, 2, 3]) {
    const highlightId = cleanText(formData.get(`highlight_${sortOrder}_id`));
    const label = cleanText(formData.get(`highlight_${sortOrder}_label`));
    const labelColor = cleanHexColor(formData.get(`highlight_${sortOrder}_label_color`));
    const title = cleanText(formData.get(`highlight_${sortOrder}_title`));
    const subtitle = cleanText(formData.get(`highlight_${sortOrder}_subtitle`));
    const imageUrl = cleanText(formData.get(`highlight_${sortOrder}_image_url`));
    const linkUrl = cleanText(formData.get(`highlight_${sortOrder}_link_url`));
    const statusValue = cleanText(formData.get(`highlight_${sortOrder}_status`)) ?? "draft";
    const status = statusValue === "published" ? "published" : "draft";

    if (status === "published" && !title) {
      throw new Error("highlight-title-required");
    }

    const payload = {
      matchday_id: matchdayId,
      label,
      label_color: labelColor,
      title,
      subtitle,
      image_url: imageUrl,
      link_url: linkUrl,
      sort_order: sortOrder,
      status,
      updated_at: new Date().toISOString()
    };

    if (highlightId) {
      await writeSupabaseAdmin(
        `matchday_highlights?id=eq.${encodeURIComponent(highlightId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      continue;
    }

    const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
      `matchday_highlights?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
    );

    if (existingRows[0]) {
      await writeSupabaseAdmin(`matchday_highlights?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else if (label || title || subtitle || imageUrl || linkUrl || status === "published") {
      await writeSupabaseAdmin("matchday_highlights", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  }

}

async function saveMatchdayHighlightItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const sortOrder = cleanInteger(formData.get("highlight_sort_order"));
  const highlightId = cleanText(formData.get("highlight_id"));

  if (!matchdayId || !sortOrder || ![1, 2, 3].includes(sortOrder)) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const label = cleanText(formData.get("highlight_label"));
  const labelColor = cleanHexColor(formData.get("highlight_label_color"));
  const title = cleanText(formData.get("highlight_title"));
  const subtitle = cleanText(formData.get("highlight_subtitle"));
  const imageUrl = cleanText(formData.get("highlight_image_url"));
  const linkUrl = cleanText(formData.get("highlight_link_url"));
  const statusValue = cleanText(formData.get("highlight_status")) ?? "draft";
  const status = statusValue === "published" ? "published" : "draft";
  const hasContent = Boolean(label || labelColor || title || subtitle || imageUrl || linkUrl);

  if (status === "published" && !title) {
    throw new Error("highlight-title-required");
  }

  if (!hasContent && status !== "published") {
    return;
  }

  const payload = {
    matchday_id: matchdayId,
    label,
    label_color: labelColor,
    title,
    subtitle,
    image_url: imageUrl,
    link_url: linkUrl,
    sort_order: sortOrder,
    status,
    updated_at: new Date().toISOString()
  };

  const existingRows = highlightId
    ? await fetchSupabaseAdminTable<{ id: string }>(
        `matchday_highlights?select=id&id=eq.${encodeURIComponent(highlightId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
      ).catch(() => [])
    : await fetchSupabaseAdminTable<{ id: string }>(
        `matchday_highlights?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
      ).catch(() => []);

  const existingItem = existingRows[0] ?? null;

  if (existingItem) {
    await writeSupabaseAdmin(
      `matchday_highlights?id=eq.${encodeURIComponent(existingItem.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
  } else {
    await writeSupabaseAdmin("matchday_highlights", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

}

async function saveMatchdayRoundupItems(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const allowedTypes = new Set(["video", "golos", "resumo", "noticia"]);

  if (!matchdayId) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRoundupRows = await fetchSupabaseAdminTable<{ id: string; sort_order: number; image_url: string | null; title: string | null; video_url: string | null }>(
    `matchday_roundup_items?select=id,sort_order,image_url,title,video_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=200`
  ).catch(() => []);
  const existingRoundupById = new Map(existingRoundupRows.map((item) => [item.id, item]));
  const existingRoundupBySortOrder = new Map(existingRoundupRows.map((item) => [item.sort_order, item]));

  for (const sortOrder of ROUNDUP_EDITOR_SORT_ORDERS) {
    const itemId = cleanText(formData.get(`roundup_${sortOrder}_id`));
    const label = cleanText(formData.get(`roundup_${sortOrder}_label`));
    const title = cleanText(formData.get(`roundup_${sortOrder}_title`));
    const subtitle = cleanText(formData.get(`roundup_${sortOrder}_subtitle`));
    const imageUrlFieldName = `roundup_${sortOrder}_image_url`;
    const existingRoundup = itemId
      ? existingRoundupById.get(itemId) ?? null
      : existingRoundupBySortOrder.get(sortOrder) ?? null;
    const existingImageUrl = existingRoundup?.image_url ?? null;
    const submittedImageUrl = formData.has(imageUrlFieldName) ? cleanText(formData.get(imageUrlFieldName)) : null;
    const imageUrl = submittedImageUrl ?? existingImageUrl;
    const videoUrl = cleanText(formData.get(`roundup_${sortOrder}_video_url`));
    const duration = cleanText(formData.get(`roundup_${sortOrder}_duration`));
    const typeValue = cleanText(formData.get(`roundup_${sortOrder}_type`)) ?? "resumo";
    const statusValue = cleanText(formData.get(`roundup_${sortOrder}_status`)) ?? "draft";
    const type = allowedTypes.has(typeValue) ? typeValue : "resumo";
    const status = statusValue === "published" ? "published" : "draft";
    const hasContent = Boolean(label || title || subtitle || imageUrl || videoUrl || duration);

    const payload: Record<string, unknown> = {
      matchday_id: matchdayId,
      label,
      title,
      subtitle,
      image_url: imageUrl,
      video_url: videoUrl,
      duration,
      type,
      sort_order: sortOrder,
      status,
      updated_at: new Date().toISOString()
    };

    if (existingRoundup && (existingRoundup.title !== title || existingRoundup.video_url !== videoUrl)) {
      payload.match_id = null;
      payload.youtube_video_id = null;
      payload.youtube_channel_id = null;
      payload.is_embeddable = null;
      payload.source_candidate_id = null;
    }

    if (!hasContent && status !== "published") {
      continue;
    }

    if (itemId) {
      await writeSupabaseAdmin(
        `matchday_roundup_items?id=eq.${encodeURIComponent(itemId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      continue;
    }

    const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
      `matchday_roundup_items?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
    );

    if (existingRows[0]) {
      await writeSupabaseAdmin(`matchday_roundup_items?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else if (hasContent || status === "published") {
      await writeSupabaseAdmin("matchday_roundup_items", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  }

}

async function saveMatchdayRoundupItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const sortOrder = cleanInteger(formData.get("roundup_sort_order"));
  const itemId = cleanText(formData.get("roundup_id"));
  const allowedTypes = new Set(["video", "golos", "resumo", "noticia"]);

  if (!matchdayId || !sortOrder || !ROUNDUP_EDITOR_SORT_ORDERS.includes(sortOrder)) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = itemId
    ? await fetchSupabaseAdminTable<{ id: string; image_url: string | null; video_url: string | null; title: string | null }>(
        `matchday_roundup_items?select=id,image_url,video_url,title&id=eq.${encodeURIComponent(itemId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
      ).catch(() => [])
    : await fetchSupabaseAdminTable<{ id: string; image_url: string | null; video_url: string | null; title: string | null }>(
        `matchday_roundup_items?select=id,image_url,video_url,title&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
      ).catch(() => []);

  const existingItem = existingRows[0] ?? null;
  const label = cleanText(formData.get("roundup_label"));
  const title = cleanText(formData.get("roundup_title"));
  const subtitle = cleanText(formData.get("roundup_subtitle"));
  const submittedImageUrl = formData.has("roundup_image_url") ? cleanText(formData.get("roundup_image_url")) : null;
  const submittedVideoUrl = formData.has("roundup_video_url") ? cleanText(formData.get("roundup_video_url")) : null;
  const imageUrl = submittedImageUrl ?? existingItem?.image_url ?? null;
  const videoUrl = submittedVideoUrl ?? existingItem?.video_url ?? null;
  const duration = cleanText(formData.get("roundup_duration"));
  const typeValue = cleanText(formData.get("roundup_type")) ?? "resumo";
  const statusValue = cleanText(formData.get("roundup_status")) ?? "draft";
  const type = allowedTypes.has(typeValue) ? typeValue : "resumo";
  const status = statusValue === "published" ? "published" : "draft";
  const hasContent = Boolean(label || title || subtitle || imageUrl || videoUrl || duration);

  if (!hasContent && status !== "published") {
    return;
  }

  const payload: Record<string, unknown> = {
    matchday_id: matchdayId,
    label,
    title,
    subtitle,
    image_url: imageUrl,
    video_url: videoUrl,
    duration,
    type,
    sort_order: sortOrder,
    status,
    updated_at: new Date().toISOString()
  };

  if (existingItem && (existingItem.title !== title || existingItem.video_url !== videoUrl)) {
    payload.match_id = null;
    payload.youtube_video_id = null;
    payload.youtube_channel_id = null;
    payload.is_embeddable = null;
    payload.source_candidate_id = null;
  }

  if (existingItem) {
    await writeSupabaseAdmin(
      `matchday_roundup_items?id=eq.${encodeURIComponent(existingItem.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
  } else {
    await writeSupabaseAdmin("matchday_roundup_items", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

}

async function saveMatchdayLatestNews(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const latestZoneModeValue = cleanText(formData.get("latest_zone_mode")) ?? "latest_news";
  const latestZoneMode = latestZoneModeValue === "editorial_line" ? "editorial_line" : "latest_news";
  const latestZoneTitleValue = formData.get("latest_zone_title");
  const latestZoneTitle = typeof latestZoneTitleValue === "string" ? latestZoneTitleValue.trim() : "";
  const latestZoneTitleColor = cleanHexColor(formData.get("latest_zone_title_color"));

  if (!matchdayId) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  await writeSupabaseAdmin("matchday_editorials?on_conflict=matchday_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      matchday_id: matchdayId,
      latest_zone_mode: latestZoneMode,
      latest_zone_title: latestZoneTitle,
      latest_zone_title_color: latestZoneTitleColor,
      updated_at: new Date().toISOString()
    })
  });

  for (const sortOrder of latestNewsSortOrdersFromFormData(formData)) {
    const newsId = cleanText(formData.get(`latest_news_${sortOrder}_id`));
    const timeLabel = cleanText(formData.get(`latest_news_${sortOrder}_time_label`));
    const timeLabelColor = cleanHexColor(formData.get(`latest_news_${sortOrder}_time_label_color`));
    const title = cleanText(formData.get(`latest_news_${sortOrder}_title`));
    const subtitle = cleanText(formData.get(`latest_news_${sortOrder}_subtitle`));
    const imageUrl = cleanText(formData.get(`latest_news_${sortOrder}_image_url`));
    const linkUrl = cleanText(formData.get(`latest_news_${sortOrder}_link_url`));
    const rawArticleId = cleanText(formData.get(`latest_news_${sortOrder}_article_id`));
    const articleId = linkUrl?.startsWith("/noticias/") ? null : rawArticleId;
    const statusValue = cleanText(formData.get(`latest_news_${sortOrder}_status`)) ?? "draft";
    const status = statusValue === "published" ? "published" : "draft";
    const hasContent = Boolean(timeLabel || title || subtitle || imageUrl || linkUrl || articleId);

    if (status === "published" && !title) {
      throw new Error("latest-news-title-required");
    }

    if (!hasContent && status !== "published") {
      continue;
    }

    const payload = {
      matchday_id: matchdayId,
      time_label: timeLabel,
      time_label_color: timeLabelColor,
      title,
      subtitle,
      image_url: imageUrl,
      link_url: linkUrl,
      article_id: articleId,
      sort_order: sortOrder,
      status,
      updated_at: new Date().toISOString()
    };

    if (newsId) {
      await writeSupabaseAdmin(
        `matchday_latest_news?id=eq.${encodeURIComponent(newsId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      continue;
    }

    const existingRows = await fetchSupabaseAdminTable<{ id: string }>(
      `matchday_latest_news?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
    );

    if (existingRows[0]) {
      await writeSupabaseAdmin(`matchday_latest_news?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else if (hasContent || status === "published") {
      await writeSupabaseAdmin("matchday_latest_news", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  }
}

async function setMatchdayLatestZonePlacement(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const latestZonePlacement = cleanText(formData.get("latest_zone_placement"));

  if (!matchdayId || (latestZonePlacement !== "top" && latestZonePlacement !== "hidden" && latestZonePlacement !== "four_news")) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  await writeSupabaseAdmin("matchday_editorials?on_conflict=matchday_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      matchday_id: matchdayId,
      latest_zone_placement: latestZonePlacement,
      updated_at: new Date().toISOString()
    })
  });
}

async function saveMatchdayLatestNewsItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const sortOrder = cleanInteger(formData.get("latest_news_sort_order"));
  const newsId = cleanText(formData.get("latest_news_id"));

  if (!matchdayId || !sortOrder || sortOrder < 1) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = newsId
    ? await fetchSupabaseAdminTable<{ id: string; article_id: string | null }>(
        `matchday_latest_news?select=id,article_id&id=eq.${encodeURIComponent(newsId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
      ).catch(() => [])
    : await fetchSupabaseAdminTable<{ id: string; article_id: string | null }>(
        `matchday_latest_news?select=id,article_id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
      ).catch(() => []);

  const existingItem = existingRows[0] ?? null;
  const timeLabel = cleanText(formData.get("latest_news_time_label"));
  const timeLabelColor = cleanHexColor(formData.get("latest_news_time_label_color"));
  const title = cleanText(formData.get("latest_news_title"));
  const subtitle = cleanText(formData.get("latest_news_subtitle"));
  const imageUrl = cleanText(formData.get("latest_news_image_url"));
  const linkUrl = cleanText(formData.get("latest_news_link_url"));
  const rawArticleId = cleanText(formData.get("latest_news_article_id")) ?? existingItem?.article_id ?? null;
  const articleId = linkUrl?.startsWith("/noticias/") ? null : rawArticleId;
  const statusValue = cleanText(formData.get("latest_news_status")) ?? "draft";
  const status = statusValue === "published" ? "published" : "draft";
  const hasContent = Boolean(timeLabel || title || subtitle || imageUrl || linkUrl || articleId);

  if (status === "published" && !title) {
    throw new Error("latest-news-title-required");
  }

  if (!hasContent && status !== "published") {
    return;
  }

  const payload = {
    matchday_id: matchdayId,
    time_label: timeLabel,
    time_label_color: timeLabelColor,
    title,
    subtitle,
    image_url: imageUrl,
    link_url: linkUrl,
    article_id: articleId,
    sort_order: sortOrder,
    status,
    updated_at: new Date().toISOString()
  };

  if (existingItem) {
    await writeSupabaseAdmin(
      `matchday_latest_news?id=eq.${encodeURIComponent(existingItem.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
  } else {
    await writeSupabaseAdmin("matchday_latest_news", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}

async function saveMatchdayHorizontalNewsItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const sortOrder = cleanInteger(formData.get("horizontal_news_sort_order"));
  const newsId = cleanText(formData.get("horizontal_news_id"));

  if (!matchdayId || !sortOrder || sortOrder < 1) {
    throw new Error("missing-fields");
  }

  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const existingRows = newsId
    ? await fetchSupabaseAdminTable<{ id: string; sort_order: number }>(
        `matchday_horizontal_news?select=id,sort_order&id=eq.${encodeURIComponent(newsId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`
      ).catch(() => [])
    : await fetchSupabaseAdminTable<{ id: string; sort_order: number }>(
        `matchday_horizontal_news?select=id,sort_order&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`
      ).catch(() => []);
  const existingItem = existingRows[0] ?? null;
  if (newsId && (!existingItem || existingItem.sort_order !== sortOrder)) {
    throw new Error("horizontal-news-item-invalid");
  }

  const label = cleanText(formData.get("horizontal_news_label"));
  const labelColor = cleanHexColor(formData.get("horizontal_news_label_color"));
  const title = cleanText(formData.get("horizontal_news_title"));
  const subtitle = cleanText(formData.get("horizontal_news_subtitle"));
  const imageUrl = cleanText(formData.get("horizontal_news_image_url"));
  const linkUrl = cleanText(formData.get("horizontal_news_link_url"));
  const statusValue = cleanText(formData.get("horizontal_news_status")) ?? "draft";
  const status = statusValue === "published" ? "published" : "draft";
  const hasContent = Boolean(label || labelColor || title || subtitle || imageUrl || linkUrl);

  if (cleanText(formData.get("horizontal_news_delete")) === "1") {
    if (existingItem) {
      await writeSupabaseAdmin(
        `matchday_horizontal_news?id=eq.${encodeURIComponent(existingItem.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
        { method: "DELETE" }
      );
    }
    return;
  }

  if (status === "published" && !title) {
    throw new Error("horizontal-news-title-required");
  }

  const payload = {
    matchday_id: matchdayId,
    label,
    label_color: labelColor,
    title,
    subtitle,
    image_url: imageUrl,
    link_url: linkUrl,
    sort_order: sortOrder,
    status,
    updated_at: new Date().toISOString()
  };

  if (existingItem) {
    await writeSupabaseAdmin(
      `matchday_horizontal_news?id=eq.${encodeURIComponent(existingItem.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
  } else if (hasContent || status === "published") {
    await writeSupabaseAdmin("matchday_horizontal_news", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}

async function moveMatchdayHorizontalNewsOrder(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const newsId = cleanText(formData.get("horizontal_news_id"));
  const direction = cleanText(formData.get("horizontal_news_direction"));

  if (!matchdayId || !newsId || (direction !== "up" && direction !== "down")) {
    throw new Error("missing-fields");
  }

  await moveMatchdayHorizontalNewsItem(matchdayId, newsId, direction);
}

async function transferMatchdayNewsArticle(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const articleId = cleanText(formData.get("article_id"));
  const sourceSlotType = cleanText(formData.get("source_slot_type"));
  const sourceId = cleanText(formData.get("source_id"));
  const targetChoice = cleanText(formData.get("target_choice"));
  const [rawTargetSlotType = "", rawTargetId = ""] = (targetChoice ?? "").split("::", 2);
  const targetSlotType = cleanText(rawTargetSlotType);
  const targetId = cleanText(rawTargetId);

  const displacedTargetChoice = cleanText(formData.get("displaced_target_choice"));
  const [rawDisplacedTargetSlotType = "", rawDisplacedTargetOrder = ""] =
    (displacedTargetChoice ?? "").split("::", 2);
  const cleanDisplacedTargetSlotType = cleanText(rawDisplacedTargetSlotType);
  let displacedTargetSlotType: EditorialDisplacedTargetSlotType | null = null;

  if (cleanDisplacedTargetSlotType === "unplaced") {
    displacedTargetSlotType = "unplaced";
  } else if (
    cleanDisplacedTargetSlotType
    && isEditorialMatchdayTransferSlotType(cleanDisplacedTargetSlotType)
  ) {
    displacedTargetSlotType = cleanDisplacedTargetSlotType;
  } else if (displacedTargetChoice) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-invalid",
      "O destino escolhido para a notícia substituída já não é válido.",
    );
  }

  const displacedTargetOrder = cleanInteger(rawDisplacedTargetOrder);

  if (
    !matchdayId
    || !articleId
    || !sourceId
    || !isEditorialMatchdayTransferSlotType(sourceSlotType)
    || !isEditorialMatchdayTransferSlotType(targetSlotType)
  ) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-invalid",
      "A transferência pedida já não é válida. Atualiza a página e tenta novamente.",
    );
  }

  await transferPublishedArticleBetweenMatchdayZones({
    matchdayId,
    articleId,
    sourceSlotType,
    sourceId,
    targetSlotType,
    targetId,
    displacedTargetSlotType,
    displacedTargetOrder,
  });
}

function teamLookupKey(value: string | null | undefined) {
  return value ? slugify(value) : "";
}

function addTeamLookupKey(
  teamsByKey: Map<string, TeamRow>,
  key: string | null | undefined,
  team: TeamRow,
  options: { override?: boolean } = {}
) {
  const lookupKey = teamLookupKey(key);
  if (lookupKey && (options.override || !teamsByKey.has(lookupKey))) {
    teamsByKey.set(lookupKey, team);
  }
}

function buildTeamLookupIndex(teams: TeamRow[], aliases: TeamAliasRow[]) {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const teamsByKey = new Map<string, TeamRow>();

  teams.forEach((team) => {
    addTeamLookupKey(teamsByKey, team.slug, team);
    addTeamLookupKey(teamsByKey, team.name, team);
    addTeamLookupKey(teamsByKey, team.short_name, team);
    addTeamLookupKey(teamsByKey, team.code, team);
  });

  aliases.forEach((alias) => {
    const team = teamsById.get(alias.team_id);
    if (team) {
      addTeamLookupKey(teamsByKey, alias.normalized_alias, team, { override: true });
    }
  });

  return teamsByKey;
}

function resolveTeamByInputName({
  teamsByKey,
  slug,
  name,
  shortName,
  code
}: {
  teamsByKey: Map<string, TeamRow>;
  slug?: string | null;
  name?: string | null;
  shortName?: string | null;
  code?: string | null;
}) {
  const keys = [slug, name, shortName, code];

  for (const key of keys) {
    const lookupKey = teamLookupKey(key);
    const team = lookupKey ? teamsByKey.get(lookupKey) : null;
    if (team) {
      return team;
    }
  }

  return null;
}

async function readTeamsForCountryLookup(countryId: string) {
  return fetchSupabaseAdminTable<TeamRow>(
    `teams?select=id,name,short_name,slug,code,country_id&or=(country_id.eq.${encodeURIComponent(countryId)},country_id.is.null)&limit=2000`
  );
}

async function readTeamAliasesForTeamIds(teamIds: string[]) {
  const uniqueTeamIds = Array.from(new Set(teamIds)).filter(Boolean);
  if (uniqueTeamIds.length === 0) {
    return [];
  }

  return fetchSupabaseAdminTable<TeamAliasRow>(
    `team_aliases?select=team_id,normalized_alias&team_id=in.(${uniqueTeamIds.map(encodeURIComponent).join(",")})&limit=1000`
  ).catch(() => []);
}

class CalendarImportRequestError extends Error {
  code: string;
  status: number;
  checkpoint?: Partial<CalendarApplyCheckpoint>;
  progress?: CalendarApplicationProgress;

  constructor(
    code: string,
    message: string,
    status = 400,
    checkpoint?: Partial<CalendarApplyCheckpoint>,
    progress?: CalendarApplicationProgress
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.checkpoint = checkpoint;
    this.progress = progress;
  }
}

function calendarRejectRow({
  lineNumber,
  matchdayNumber,
  matchdayLabel,
  homeName,
  awayName,
  note,
  status = "reject"
}: {
  lineNumber: number;
  matchdayNumber: number | null;
  matchdayLabel: string;
  homeName: string;
  awayName: string;
  note: string;
  status?: "reject" | "duplicate";
}): CalendarPreviewRow {
  return {
    lineNumber,
    status,
    statusLabel: status === "duplicate" ? "duplicado" : "rejeitar",
    matchdayNumber,
    matchdayLabel,
    matchdayId: null,
    matchdayWillBeCreated: false,
    homeName,
    awayName,
    homeTeamId: null,
    awayTeamId: null,
    inputState: null,
    scheduledDate: null,
    kickoffAt: null,
    scheduleLabel: matchdayNumber ? `J${matchdayNumber} · DATA E HORA POR DEFINIR` : "DATA E HORA POR DEFINIR",
    venue: null,
    broadcastChannelName: null,
    broadcastChannelId: null,
    changes: [],
    existingMatchId: null,
    note
  };
}

async function validateCalendarContext(countryId: string, competitionId: string, seasonId: string) {
  if (!(await hasRows(`countries?select=id&id=eq.${encodeURIComponent(countryId)}`))) {
    throw new CalendarImportRequestError("country-not-found", "O país selecionado não existe.", 404);
  }
  if (
    !(await hasRows(
      `competitions?select=id&id=eq.${encodeURIComponent(competitionId)}&country_id=eq.${encodeURIComponent(countryId)}`
    ))
  ) {
    throw new CalendarImportRequestError("competition-country-invalid", "A competição não pertence ao país selecionado.");
  }
  if (
    !(await hasRows(
      `seasons?select=id&id=eq.${encodeURIComponent(seasonId)}&competition_id=eq.${encodeURIComponent(competitionId)}`
    ))
  ) {
    throw new CalendarImportRequestError("season-competition-invalid", "A época não pertence à competição selecionada.");
  }
}

async function buildCalendarServerPlan(formData: FormData): Promise<CalendarServerPlan> {
  const countryId = cleanText(formData.get("country_id"));
  const competitionId = cleanText(formData.get("competition_id"));
  const seasonId = cleanText(formData.get("season_id"));
  const rawEntry = formData.get("calendar_list");
  const rawList = typeof rawEntry === "string" ? rawEntry : null;

  if (!countryId || !competitionId || !seasonId || rawList === null) {
    throw new CalendarImportRequestError("missing-fields", "Faltam o contexto ou a lista do calendário.");
  }

  await validateCalendarContext(countryId, competitionId, seasonId);
  const parsed = parseCalendarImport(rawList);
  const previewRows: CalendarPreviewRow[] = parsed.issues.map((item) =>
    calendarRejectRow({
      lineNumber: item.lineNumber,
      matchdayNumber: item.matchdayNumber,
      matchdayLabel: item.matchdayLabel,
      homeName: item.homeName,
      awayName: item.awayName,
      note: item.message,
      status: item.status
    })
  );

  const participants = await fetchSupabaseAdminTable<ManualParticipantRow>(
    `season_teams?select=team_id,status&season_id=eq.${encodeURIComponent(seasonId)}&status=neq.inactive&limit=500`
  );
  const participantTeamIds = Array.from(new Set(participants.map((participant) => participant.team_id)));
  if (participantTeamIds.length === 0) {
    throw new CalendarImportRequestError("matchday-needs-participants", "A época não tem participantes ativos.");
  }

  const teamsQuery = participantTeamIds.map(encodeURIComponent).join(",");
  const [teams, teamAliases, matchdayRows, existingMatches, broadcastChannels] = await Promise.all([
    fetchSupabaseAdminTable<TeamRow>(
      `teams?select=id,name,short_name,slug,code,country_id&id=in.(${teamsQuery})&or=(country_id.eq.${encodeURIComponent(countryId)},country_id.is.null)&limit=500`
    ),
    fetchSupabaseAdminTable<TeamAliasRow>(
      `team_aliases?select=team_id,normalized_alias&team_id=in.(${teamsQuery})&limit=1000`
    ),
    fetchSupabaseAdminTable<CalendarMatchdayRow>(
      `matchdays?select=id,number,label&season_id=eq.${encodeURIComponent(seasonId)}&limit=500`
    ),
    fetchSupabaseAdminTable<ExistingCalendarMatchRow>(
      `matches?select=id,source_key,matchday_id,home_team_id,away_team_id,status,scheduled_date,kickoff_at,venue,broadcast_channel_id&season_id=eq.${encodeURIComponent(
        seasonId
      )}&limit=1000`
    ),
    fetchSupabaseAdminTable<BroadcastChannelRow>(
      "broadcast_channels?select=id,name&order=name.asc&limit=500"
    )
  ]);

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const teamLookup = buildCalendarTeamLookup([
    ...teams.map((team) => ({ teamId: team.id, keys: [team.name, team.short_name, team.slug, team.code] })),
    ...teamAliases
      .filter((alias) => teamsById.has(alias.team_id))
      .map((alias) => ({ teamId: alias.team_id, keys: [alias.normalized_alias] }))
  ]);

  const matchdaysByNumber = new Map(matchdayRows.map((matchday) => [matchday.number, matchday]));
  const matchdayNumberById = new Map(matchdayRows.map((matchday) => [matchday.id, matchday.number]));
  const broadcastChannelsById = new Map(broadcastChannels.map((channel) => [channel.id, channel]));
  const broadcastChannelLookup = buildCalendarBroadcastChannelLookup(broadcastChannels);
  const existingByIdentity = new Map<string, ExistingCalendarMatchRow[]>();
  const existingUses = new Map<number, Map<string, Set<string>>>();

  existingMatches.forEach((match) => {
    if (!match.matchday_id) return;
    const matchdayNumber = matchdayNumberById.get(match.matchday_id);
    if (matchdayNumber === undefined) return;
    const identity = createCompetitiveIdentity(seasonId, match.matchday_id, match.home_team_id, match.away_team_id);
    const identityMatches = existingByIdentity.get(identity) ?? [];
    identityMatches.push(match);
    existingByIdentity.set(identity, identityMatches);

    const uses = existingUses.get(matchdayNumber) ?? new Map<string, Set<string>>();
    [match.home_team_id, match.away_team_id].forEach((teamId) => {
      const matchIds = uses.get(teamId) ?? new Set<string>();
      matchIds.add(match.id);
      uses.set(teamId, matchIds);
    });
    existingUses.set(matchdayNumber, uses);
  });

  const importedUses = new Map<number, Map<string, Set<string>>>();
  const labelsByNumber = new Map<number, string>();
  const conflictingLabels = new Set<number>();
  parsed.rows.forEach((row) => {
    const current = labelsByNumber.get(row.matchdayNumber);
    if (current && current !== row.matchdayLabel) conflictingLabels.add(row.matchdayNumber);
    else labelsByNumber.set(row.matchdayNumber, row.matchdayLabel);
  });

  const seenResolvedIdentities: CalendarResolvedCompetitiveIdentity[] = [];
  const pairingCounts = new Map<string, number>();
  const writes: PlannedCalendarWrite[] = [];
  let unresolvedClubs = 0;
  let ambiguousClubs = 0;
  let repeatedTeamsInMatchday = 0;

  for (const row of parsed.rows) {
    const matchday = matchdaysByNumber.get(row.matchdayNumber) ?? null;
    const matchdayReference = matchday?.id ?? `planned-matchday-${row.matchdayNumber}`;
    if (conflictingLabels.has(row.matchdayNumber)) {
      previewRows.push(
        calendarRejectRow({ ...row, note: "A mesma jornada tem labels diferentes no ficheiro." })
      );
      continue;
    }

    const homeResolution = resolveCalendarTeam(teamLookup, row.homeName);
    const awayResolution = resolveCalendarTeam(teamLookup, row.awayName);
    if (homeResolution.status === "unresolved" || awayResolution.status === "unresolved") {
      unresolvedClubs += 1;
      previewRows.push(calendarRejectRow({ ...row, note: "Clube não resolvido entre os participantes ativos da época." }));
      continue;
    }
    if (homeResolution.status === "ambiguous" || awayResolution.status === "ambiguous") {
      ambiguousClubs += 1;
      previewRows.push(calendarRejectRow({ ...row, note: "Clube ambíguo: a chave corresponde a mais de um participante ativo." }));
      continue;
    }

    const homeTeamId = homeResolution.teamId;
    const awayTeamId = awayResolution.teamId;
    if (homeTeamId === awayTeamId) {
      previewRows.push(calendarRejectRow({ ...row, note: "Casa e Fora resolvem para o mesmo clube." }));
      continue;
    }

    let resolvedBroadcastChannel: BroadcastChannelRow | null = null;
    if (row.broadcastChannelName !== null) {
      const channelResolution = resolveCalendarBroadcastChannel(broadcastChannelLookup, row.broadcastChannelName);
      if (channelResolution.status === "unresolved") {
        previewRows.push(calendarRejectRow({ ...row, note: `CanalTV desconhecido: ${row.broadcastChannelName}.` }));
        continue;
      }
      if (channelResolution.status === "ambiguous") {
        previewRows.push(calendarRejectRow({ ...row, note: `CanalTV ambíguo no catálogo: ${row.broadcastChannelName}.` }));
        continue;
      }
      resolvedBroadcastChannel = broadcastChannelsById.get(channelResolution.channelId) ?? null;
      if (!resolvedBroadcastChannel) {
        previewRows.push(calendarRejectRow({ ...row, note: "O CanalTV deixou de estar disponível no catálogo." }));
        continue;
      }
    }

    const identity = createCompetitiveIdentity(seasonId, matchdayReference, homeTeamId, awayTeamId);
    const resolvedIdentity = {
      lineNumber: row.lineNumber,
      seasonId,
      matchdayId: matchdayReference,
      homeTeamId,
      awayTeamId
    };
    if (findCalendarCompetitiveDuplicate(seenResolvedIdentities, resolvedIdentity)) {
      previewRows.push(calendarRejectRow({ ...row, note: "Identidade competitiva repetida no ficheiro.", status: "duplicate" }));
      continue;
    }
    seenResolvedIdentities.push(resolvedIdentity);

    const pairingKey = `${homeTeamId}:${awayTeamId}`;
    pairingCounts.set(pairingKey, (pairingCounts.get(pairingKey) ?? 0) + 1);
    const existingForIdentity = matchday ? existingByIdentity.get(identity) ?? [] : [];
    if (existingForIdentity.length > 1) {
      previewRows.push(calendarRejectRow({ ...row, note: "Existem vários jogos com a mesma identidade competitiva." }));
      continue;
    }
    const existing = existingForIdentity[0] ?? null;

    const existingMatchUses = existingUses.get(row.matchdayNumber) ?? new Map<string, Set<string>>();
    const newMatchUses = importedUses.get(row.matchdayNumber) ?? new Map<string, Set<string>>();
    const hasOtherUse = [homeTeamId, awayTeamId].some((teamId) => {
      const currentIds = existingMatchUses.get(teamId) ?? new Set<string>();
      const plannedIds = newMatchUses.get(teamId) ?? new Set<string>();
      return Array.from(currentIds).some((matchId) => matchId !== existing?.id) || plannedIds.size > 0;
    });
    if (hasOtherUse) {
      repeatedTeamsInMatchday += 1;
      previewRows.push(calendarRejectRow({ ...row, note: "Uma das equipas já tem outro jogo nesta jornada." }));
      continue;
    }

    if (!existing) {
      [homeTeamId, awayTeamId].forEach((teamId) => {
        const plannedIds = newMatchUses.get(teamId) ?? new Set<string>();
        plannedIds.add(`line-${row.lineNumber}`);
        newMatchUses.set(teamId, plannedIds);
      });
      importedUses.set(row.matchdayNumber, newMatchUses);
    }

    const action = existing
      ? decideCalendarMatchAction(
          {
            scheduledDate: existing.scheduled_date,
            kickoffAt: existing.kickoff_at,
            status: existing.status,
            venue: existing.venue,
            broadcastChannelId: existing.broadcast_channel_id,
            broadcastChannelName: existing.broadcast_channel_id
              ? broadcastChannelsById.get(existing.broadcast_channel_id)?.name ?? null
              : null
          },
          row,
          resolvedBroadcastChannel
        )
      : null;
    if (action?.action === "conflict") {
      previewRows.push(calendarRejectRow({ ...row, note: action.reason }));
      continue;
    }

    const plannedAction = existing ? action?.action ?? "keep" : "create";
    const effectiveLabel = matchday?.label ?? row.matchdayLabel;
    const preview: CalendarPreviewRow = {
      lineNumber: row.lineNumber,
      status: plannedAction,
      statusLabel: plannedAction === "create" ? "criar" : plannedAction === "update" ? "atualizar" : "manter",
      matchdayNumber: row.matchdayNumber,
      matchdayLabel: effectiveLabel,
      matchdayId: matchday?.id ?? null,
      matchdayWillBeCreated: !matchday,
      homeName: row.homeName,
      awayName: row.awayName,
      homeTeamId,
      awayTeamId,
      inputState: row.inputState,
      scheduledDate: row.scheduledDate,
      kickoffAt: row.kickoffAt,
      scheduleLabel: formatCalendarPreviewDate(row.scheduledDate, row.kickoffAt, row.matchdayNumber),
      venue: row.venue,
      broadcastChannelName: resolvedBroadcastChannel?.name ?? null,
      broadcastChannelId: resolvedBroadcastChannel?.id ?? null,
      changes: action?.changes ?? [],
      existingMatchId: existing?.id ?? null,
      note: existing
        ? action?.reason ?? "O jogo existente será preservado."
        : matchday
          ? "A jornada existente será reutilizada."
          : "Jornada a criar; starts_on e ends_on permanecerão nulos."
    };
    previewRows.push(preview);
    writes.push({
      matchdayNumber: row.matchdayNumber,
      lineNumber: row.lineNumber,
      row,
      preview,
      homeTeamId,
      awayTeamId,
      existingMatchId: existing?.id ?? null,
      updatePatch: action?.patch ?? {}
    });
  }

  previewRows.sort((left, right) => left.lineNumber - right.lineNumber);
  const observedNumbers = Array.from(new Set(parsed.rows.map((row) => row.matchdayNumber))).sort((a, b) => a - b);
  const gamesByMatchday = observedNumbers.map((number) => ({
    number,
    games: parsed.rows.filter((row) => row.matchdayNumber === number).length
  }));
  const missingMatchdayNumbers: number[] = [];
  if (observedNumbers.length > 1) {
    for (let number = observedNumbers[0]; number <= observedNumbers[observedNumbers.length - 1]; number += 1) {
      if (!observedNumbers.includes(number)) missingMatchdayNumbers.push(number);
    }
  }

  const matchdays: CalendarMatchdayPlan[] = observedNumbers.map((number) => {
    const matchday = matchdaysByNumber.get(number) ?? null;
    const relevantRows = previewRows.filter((row) => row.matchdayNumber === number);
    const fingerprint = createCalendarFingerprint({
      seasonId,
      matchday: { number, id: matchday?.id ?? null, label: matchday?.label ?? labelsByNumber.get(number) ?? `Jornada ${number}` },
      rows: relevantRows.map((row) => ({
        lineNumber: row.lineNumber,
        status: row.status,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        existingMatchId: row.existingMatchId,
        scheduledDate: row.scheduledDate,
        kickoffAt: row.kickoffAt,
        venue: row.venue,
        broadcastChannelId: row.broadcastChannelId,
        broadcastChannelName: row.broadcastChannelName,
        changes: row.changes,
        note: row.note
      }))
    });
    return {
      number,
      label: matchday?.label ?? labelsByNumber.get(number) ?? `Jornada ${String(number).padStart(2, "0")}`,
      matchdayId: matchday?.id ?? null,
      willBeCreated: !matchday,
      fingerprint,
      createCount: relevantRows.filter((row) => row.status === "create").length,
      updateCount: relevantRows.filter((row) => row.status === "update").length,
      keepCount: relevantRows.filter((row) => row.status === "keep").length
    };
  });

  const summary: CalendarPreviewSummary = {
    activeParticipants: participantTeamIds.length,
    totalRows: parsed.usefulLineCount,
    distinctMatchdays: observedNumbers.length,
    matchesToCreate: previewRows.filter((row) => row.status === "create").length,
    matchesToUpdate: previewRows.filter((row) => row.status === "update").length,
    matchesToKeep: previewRows.filter((row) => row.status === "keep").length,
    rejectedRows: previewRows.filter((row) => row.status === "reject").length,
    duplicateRows: previewRows.filter((row) => row.status === "duplicate").length,
    unresolvedClubs,
    ambiguousClubs,
    matchdaysToCreate: matchdays.filter((matchday) => matchday.willBeCreated).length,
    gamesByMatchday,
    missingMatchdayNumbers,
    repeatedPairings: Array.from(pairingCounts.values()).reduce((total, count) => total + Math.max(0, count - 1), 0),
    repeatedTeamsInMatchday
  };
  const fingerprint = createCalendarFingerprint({
    seasonId,
    matchdays: matchdays.map((matchday) => ({ number: matchday.number, fingerprint: matchday.fingerprint })),
    blocked: { rejectedRows: summary.rejectedRows, duplicateRows: summary.duplicateRows }
  });

  return { response: { ok: true, fingerprint, rows: previewRows, matchdays, summary }, writes };
}

async function previewCalendarList(formData: FormData): Promise<CalendarPreviewResponse> {
  return (await buildCalendarServerPlan(formData)).response;
}

async function createOrReadCalendarMatchday(seasonId: string, plan: CalendarMatchdayPlan) {
  if (plan.matchdayId) return { id: plan.matchdayId, number: plan.number, label: plan.label, created: false };

  const created = await writeSupabaseAdminReturning<CalendarMatchdayRow>(
    "matchdays?on_conflict=season_id,number",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        season_id: seasonId,
        number: plan.number,
        label: plan.label,
        starts_on: null,
        ends_on: null,
        status: "scheduled",
        data_source: "manual",
        sync_status: "manual",
        manual_override: true,
        external_provider: null,
        external_id: null,
        last_synced_at: null
      })
    }
  );
  if (created[0]) return { ...created[0], created: true };

  const existing = await fetchSupabaseAdminTable<CalendarMatchdayRow>(
    `matchdays?select=id,number,label&season_id=eq.${encodeURIComponent(seasonId)}&number=eq.${plan.number}&limit=1`
  );
  if (!existing[0]) {
    throw new CalendarImportRequestError("matchday-create-failed", "Não foi possível criar ou reencontrar a jornada.", 409);
  }
  return { ...existing[0], created: false };
}

function readCalendarCheckpoints(formData: FormData): CalendarMatchdayCheckpoint[] {
  const raw = cleanText(formData.get("calendar_checkpoints"));
  if (!raw) return [];

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new CalendarImportRequestError("calendar-checkpoint-invalid", "Os checkpoints enviados não são JSON válido.");
  }
  if (!Array.isArray(value)) {
    throw new CalendarImportRequestError("calendar-checkpoint-invalid", "Os checkpoints enviados não formam uma lista.");
  }

  return value.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new CalendarImportRequestError("calendar-checkpoint-invalid", "Existe um checkpoint inválido.");
    }
    const record = item as Record<string, unknown>;
    const numbers = [
      record.matchdayNumber,
      record.createdMatches,
      record.updatedMatches,
      record.keptMatches
    ];
    if (
      !numbers.every((number) => typeof number === "number" && Number.isInteger(number) && number >= 0) ||
      typeof record.matchdayLabel !== "string" ||
      typeof record.createdMatchday !== "boolean" ||
      (record.status !== "completed" && record.status !== "failed") ||
      (record.message !== undefined && typeof record.message !== "string")
    ) {
      throw new CalendarImportRequestError("calendar-checkpoint-invalid", "Existe um checkpoint com campos inválidos.");
    }

    return {
      matchdayNumber: record.matchdayNumber as number,
      matchdayLabel: record.matchdayLabel,
      createdMatchday: record.createdMatchday,
      createdMatches: record.createdMatches as number,
      updatedMatches: record.updatedMatches as number,
      keptMatches: record.keptMatches as number,
      status: record.status,
      ...(record.message ? { message: record.message as string } : {})
    };
  });
}

async function applyCalendarMatchday(formData: FormData): Promise<CalendarApplyResponse> {
  const seasonId = cleanText(formData.get("season_id"));
  const competitionId = cleanText(formData.get("competition_id"));
  const fingerprint = cleanText(formData.get("matchday_fingerprint"));
  const matchdayText = cleanText(formData.get("matchday_number"));
  if (!seasonId || !competitionId || !fingerprint || !matchdayText || !/^[1-9]\d*$/.test(matchdayText)) {
    throw new CalendarImportRequestError("missing-fields", "Faltam dados para aplicar a jornada.");
  }

  const plan = await buildCalendarServerPlan(formData);
  if (plan.response.rows.some((row) => row.status === "reject" || row.status === "duplicate")) {
    throw new CalendarImportRequestError("calendar-plan-blocked", "A lista contém linhas rejeitadas ou duplicadas; é necessário novo preview.", 409);
  }

  const matchdayNumber = Number(matchdayText);
  const matchdayPlan = plan.response.matchdays.find((matchday) => matchday.number === matchdayNumber);
  if (!matchdayPlan) {
    throw new CalendarImportRequestError("matchday-not-in-plan", "A jornada não pertence ao plano validado.", 404);
  }
  const currentCheckpoints = readCalendarCheckpoints(formData);
  const checkpointValidation = validateCalendarCheckpointSequence(plan.response.matchdays, currentCheckpoints);
  if (!checkpointValidation.ok) {
    throw new CalendarImportRequestError(checkpointValidation.error, checkpointValidation.message, 409);
  }
  const nextMatchday = getNextCalendarMatchday(plan.response.matchdays, currentCheckpoints);
  if (!nextMatchday) {
    throw new CalendarImportRequestError(
      "calendar-checkpoint-stopped",
      "A aplicação está concluída ou parada no primeiro checkpoint falhado; atualiza o preview antes de retomar.",
      409
    );
  }
  if (nextMatchday.number !== matchdayNumber) {
    throw new CalendarImportRequestError("calendar-checkpoint-invalid", "A jornada pedida não é a próxima jornada aplicável.", 409);
  }

  const fingerprintValidation = validateCalendarFingerprint(fingerprint, matchdayPlan.fingerprint);
  if (!fingerprintValidation.ok) {
    throw new CalendarImportRequestError(fingerprintValidation.error, fingerprintValidation.message, 409);
  }

  const checkpoint: CalendarApplyCheckpoint = {
    matchdayNumber,
    matchdayLabel: matchdayPlan.label,
    createdMatchday: false,
    createdMatches: 0,
    updatedMatches: 0,
    keptMatches: matchdayPlan.keepCount
  };

  try {
    const matchday = await createOrReadCalendarMatchday(seasonId, matchdayPlan);
    checkpoint.createdMatchday = matchday.created;
    const matchdayWrites =
      groupCalendarActionsByMatchday(plan.writes).find((group) => group.matchdayNumber === matchdayNumber)?.items ?? [];
    const creates = matchdayWrites.filter((write) => write.preview.status === "create");
    if (creates.length > 0) {
      await writeSupabaseAdmin("matches?on_conflict=source_key", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(
          creates.map((write) => ({
            source_key: createCalendarSourceKey(seasonId, matchday.id, write.homeTeamId, write.awayTeamId),
            competition_id: competitionId,
            season_id: seasonId,
            matchday_id: matchday.id,
            home_team_id: write.homeTeamId,
            away_team_id: write.awayTeamId,
            scheduled_date: write.row.scheduledDate,
            kickoff_at: write.row.kickoffAt,
            venue: write.row.venue,
            broadcast_channel_id: write.preview.broadcastChannelId,
            status: "scheduled",
            data_source: "manual",
            sync_status: "manual",
            manual_override: true,
            external_provider: null,
            external_id: null,
            external_match_id: null,
            last_synced_at: null
          }))
        )
      });
      checkpoint.createdMatches = creates.length;
    }

    const updates = matchdayWrites.filter((write) => write.preview.status === "update" && write.existingMatchId);
    for (const update of updates) {
      if (Object.keys(update.updatePatch).length === 0) {
        throw new CalendarImportRequestError("calendar-update-invalid", "Uma atualização ficou sem campos efetivamente alterados.", 409, checkpoint);
      }
      const updated = await writeSupabaseAdminReturning<{ id: string }>(
        `matches?id=eq.${encodeURIComponent(update.existingMatchId ?? "")}&season_id=eq.${encodeURIComponent(
          seasonId
        )}&matchday_id=eq.${encodeURIComponent(matchday.id)}&home_team_id=eq.${encodeURIComponent(
          update.homeTeamId
        )}&away_team_id=eq.${encodeURIComponent(update.awayTeamId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(update.updatePatch)
        }
      );
      if (!updated[0]) {
        throw new CalendarImportRequestError("match-update-stale", "Um jogo deixou de estar disponível para atualização.", 409, checkpoint);
      }
      checkpoint.updatedMatches += 1;
    }
  } catch (error) {
    const message = error instanceof CalendarImportRequestError ? error.message : "A aplicação da jornada falhou; atualiza o preview e retoma.";
    const failedTransition = applyCalendarCheckpointTransition(plan.response.matchdays, currentCheckpoints, {
      ...checkpoint,
      status: "failed",
      message
    });
    if (error instanceof CalendarImportRequestError) {
      error.checkpoint = { ...checkpoint, ...(error.checkpoint ?? {}) };
      if (failedTransition.ok) error.progress = failedTransition.progress;
      throw error;
    }
    throw new CalendarImportRequestError(
      "calendar-apply-failed",
      message,
      500,
      checkpoint,
      failedTransition.ok ? failedTransition.progress : undefined
    );
  }

  const completedTransition = applyCalendarCheckpointTransition(plan.response.matchdays, currentCheckpoints, {
    ...checkpoint,
    status: "completed"
  });
  if (!completedTransition.ok) {
    throw new CalendarImportRequestError(completedTransition.error, completedTransition.message, 409, checkpoint);
  }
  return { ok: true, checkpoint, progress: completedTransition.progress };
}

function calendarErrorResponse(error: unknown) {
  if (error instanceof CalendarImportRequestError) {
    const payload: CalendarErrorResponse = {
      ok: false,
      error: error.code,
      message: error.message,
      ...(error.checkpoint ? { checkpoint: error.checkpoint } : {}),
      ...(error.progress ? { progress: error.progress } : {})
    };
    return NextResponse.json(payload, { status: error.status });
  }

  console.error("[admin/gestor] calendar import failed");
  const payload: CalendarErrorResponse = {
    ok: false,
    error: "calendar-unexpected-error",
    message: "A operação do calendário falhou sem alterar o contexto selecionado."
  };
  return NextResponse.json(payload, { status: 500 });
}

async function readAgendaMatch(formData: FormData): Promise<AgendaMatchRow> {
  const matchId = cleanText(formData.get("match_id"));
  const competitionId = cleanText(formData.get("competition_id"));
  const seasonId = cleanText(formData.get("season_id"));
  const matchdayId = cleanText(formData.get("matchday_id"));

  if (!matchId || !competitionId || !seasonId || !matchdayId) {
    throw new Error("missing-fields");
  }

  const rows = await fetchSupabaseAdminTable<AgendaMatchRow>(
    `matches?select=id,competition_id,season_id,matchday_id,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score,broadcast_channel_id&id=eq.${encodeURIComponent(
      matchId
    )}&competition_id=eq.${encodeURIComponent(competitionId)}&season_id=eq.${encodeURIComponent(
      seasonId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&manual_override=is.true&limit=1`
  );
  const match = rows[0];

  if (!match) {
    throw new Error("match-not-found");
  }

  return match;
}

function assertSimpleScheduledMatch(match: AgendaMatchRow, action: "edit" | "remove" = "edit") {
  if (match.status === "finished" || match.home_score !== null || match.away_score !== null) {
    throw new Error(action === "remove" ? "match-has-result-remove" : "match-has-result-edit");
  }

  if (
    match.status !== "scheduled" ||
    match.minute !== null ||
    match.broadcast_channel_id !== null
  ) {
    throw new Error("match-not-simple");
  }
}

async function assertMatchTeamsAreManualParticipants(seasonId: string, homeTeamId: string, awayTeamId: string) {
  const participantBasePath =
    `season_teams?select=id&season_id=eq.${encodeURIComponent(
      seasonId
    )}&data_source=eq.manual&sync_status=eq.manual&manual_override=is.true`;

  const homeIsParticipant = await hasRows(`${participantBasePath}&team_id=eq.${encodeURIComponent(homeTeamId)}`);
  const awayIsParticipant = await hasRows(`${participantBasePath}&team_id=eq.${encodeURIComponent(awayTeamId)}`);

  if (!homeIsParticipant || !awayIsParticipant) {
    throw new Error("match-team-not-participant");
  }
}

async function assertTeamsFreeInMatchday(
  matchdayId: string,
  homeTeamId: string,
  awayTeamId: string,
  ignoredMatchId?: string | null
) {
  const matches = await fetchSupabaseAdminTable<MatchdayTeamUse>(
    `matches?select=id,home_team_id,away_team_id&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&manual_override=is.true`
  );
  const usedInOtherMatch = matches.some(
    (match) =>
      match.id !== ignoredMatchId &&
      (match.home_team_id === homeTeamId ||
        match.away_team_id === homeTeamId ||
        match.home_team_id === awayTeamId ||
        match.away_team_id === awayTeamId)
  );

  if (usedInOtherMatch) {
    throw new Error("match-team-already-in-matchday");
  }
}

async function assertUniqueSeasonMatch(
  seasonId: string,
  homeTeamId: string,
  awayTeamId: string,
  ignoredMatchId?: string | null
) {
  const matches = await fetchSupabaseAdminTable<{ id: string }>(
    `matches?select=id&season_id=eq.${encodeURIComponent(seasonId)}&home_team_id=eq.${encodeURIComponent(
      homeTeamId
    )}&away_team_id=eq.${encodeURIComponent(awayTeamId)}`
  );
  const duplicate = matches.some((match) => match.id !== ignoredMatchId);

  if (duplicate) {
    throw new Error("match-duplicate-season");
  }
}

async function hasMatchDependencies(matchId: string) {
  const encodedMatchId = encodeURIComponent(matchId);

  if (await hasRows(`match_events?select=id&match_id=eq.${encodedMatchId}`)) return true;
  if (await hasRows(`goals?select=id&match_id=eq.${encodedMatchId}`)) return true;
  if (await hasRows(`live_updates?select=id&match_id=eq.${encodedMatchId}`)) return true;
  if (await hasRows(`articles?select=id&match_id=eq.${encodedMatchId}`)) return true;
  if (await hasRows(`headlines?select=id&match_id=eq.${encodedMatchId}`)) return true;

  return false;
}

async function createMatch(formData: FormData) {
  const competitionId = cleanText(formData.get("competition_id"));
  const seasonId = cleanText(formData.get("season_id"));
  const matchdayId = cleanText(formData.get("matchday_id"));
  const homeTeamId = cleanText(formData.get("home_team_id"));
  const awayTeamId = cleanText(formData.get("away_team_id"));
  const kickoffAt = normalizeKickoff(cleanText(formData.get("kickoff_at")));

  if (!competitionId || !seasonId || !matchdayId || !homeTeamId || !awayTeamId || !kickoffAt) {
    throw new Error("missing-fields");
  }

  if (homeTeamId === awayTeamId) {
    throw new Error("match-team-same");
  }

  if (!(await hasRows(`seasons?select=id&id=eq.${encodeURIComponent(seasonId)}&competition_id=eq.${encodeURIComponent(competitionId)}`))) {
    throw new Error("match-missing-context");
  }

  if (
    !(await hasRows(
      `matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}&season_id=eq.${encodeURIComponent(
        seasonId
      )}&manual_override=is.true`
    ))
  ) {
    throw new Error("matchday-invalid");
  }

  await assertMatchTeamsAreManualParticipants(seasonId, homeTeamId, awayTeamId);
  await assertUniqueSeasonMatch(seasonId, homeTeamId, awayTeamId);
  await assertTeamsFreeInMatchday(matchdayId, homeTeamId, awayTeamId);

  await writeSupabaseAdmin("matches", {
    method: "POST",
    body: JSON.stringify({
      source_key: `manual-${Date.now()}`,
      competition_id: competitionId,
      season_id: seasonId,
      matchday_id: matchdayId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_at: kickoffAt,
      venue: cleanText(formData.get("venue")),
      status: "scheduled",
      data_source: "manual",
      sync_status: "manual",
      manual_override: true,
      external_provider: null,
      external_id: null,
      external_match_id: null,
      last_synced_at: null
    })
  });
}

async function updateMatch(formData: FormData) {
  const competitionId = cleanText(formData.get("competition_id"));
  const seasonId = cleanText(formData.get("season_id"));
  const matchdayId = cleanText(formData.get("matchday_id"));
  const matchId = cleanText(formData.get("match_id"));
  const homeTeamId = cleanText(formData.get("home_team_id"));
  const awayTeamId = cleanText(formData.get("away_team_id"));
  const kickoffAt = normalizeKickoff(cleanText(formData.get("kickoff_at")));

  if (!competitionId || !seasonId || !matchdayId || !matchId || !homeTeamId || !awayTeamId || !kickoffAt) {
    throw new Error("missing-fields");
  }

  if (homeTeamId === awayTeamId) {
    throw new Error("match-team-same");
  }

  const match = await readAgendaMatch(formData);
  assertSimpleScheduledMatch(match, "edit");

  if (
    !(await hasRows(
      `matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}&season_id=eq.${encodeURIComponent(
        seasonId
      )}&manual_override=is.true`
    ))
  ) {
    throw new Error("matchday-invalid");
  }

  await assertMatchTeamsAreManualParticipants(seasonId, homeTeamId, awayTeamId);
  await assertUniqueSeasonMatch(seasonId, homeTeamId, awayTeamId, matchId);
  await assertTeamsFreeInMatchday(matchdayId, homeTeamId, awayTeamId, matchId);

  await writeSupabaseAdmin(
    `matches?id=eq.${encodeURIComponent(matchId)}&competition_id=eq.${encodeURIComponent(
      competitionId
    )}&season_id=eq.${encodeURIComponent(seasonId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&manual_override=is.true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: kickoffAt,
        venue: cleanText(formData.get("venue")),
        status: "scheduled",
        data_source: "manual",
        sync_status: "manual",
        manual_override: true
      })
    }
  );
}

async function removeMatch(formData: FormData) {
  const matchId = cleanText(formData.get("match_id"));

  if (!matchId) {
    throw new Error("missing-fields");
  }

  const match = await readAgendaMatch(formData);
  assertSimpleScheduledMatch(match, "remove");

  if (await hasMatchDependencies(matchId)) {
    throw new Error("match-has-dependencies");
  }

  await writeSupabaseAdmin(
    `matches?id=eq.${encodeURIComponent(matchId)}&competition_id=eq.${encodeURIComponent(
      match.competition_id
    )}&season_id=eq.${encodeURIComponent(match.season_id)}&matchday_id=eq.${encodeURIComponent(
      match.matchday_id ?? ""
    )}&status=eq.scheduled&manual_override=is.true&minute=is.null&home_score=is.null&away_score=is.null&broadcast_channel_id=is.null`,
    {
      method: "DELETE"
    }
  );
}

async function clearSeasonCalendar(formData: FormData) {
  const seasonId = cleanText(formData.get("season_id"));

  if (!seasonId) {
    throw new Error("missing-fields");
  }

  const encodedSeasonId = encodeURIComponent(seasonId);
  let matches: MatchIdRow[] = [];
  let matchdays: MatchdayIdRow[] = [];

  await runClearSeasonStep("ler jogos da epoca selecionada", async () => {
    matches = await fetchSupabaseAdminTable<MatchIdRow>(
      `matches?select=id&season_id=eq.${encodedSeasonId}&limit=500`
    );
  });

  await runClearSeasonStep("ler jornadas da epoca selecionada", async () => {
    matchdays = await fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchdays?select=id&season_id=eq.${encodedSeasonId}&limit=5000`
    );
  });

  while (matches.length > 0) {
    for (const matchChunk of chunkRows(matches, 100)) {
      const matchIds = matchChunk.map((match) => match.id);
      const matchList = encodedInList(matchIds);
      const matchFilter = `match_id=in.(${matchList})`;

      await runClearSeasonStep("apagar dependencias por match_id", async () => {
        await deleteExistingOptionalRows("headlines", matchFilter, "headlines.match_id");
        await deleteExistingOptionalRows("articles", matchFilter, "articles.match_id");
        await deleteExistingOptionalRows("live_updates", matchFilter, "live_updates.match_id");
        await deleteExistingOptionalRows("match_events", matchFilter, "match_events.match_id");
        await deleteExistingOptionalRows("goals", matchFilter, "goals.match_id");
      });

      await runClearSeasonStep("apagar matches", async () => {
        await deleteRows(`matches?id=in.(${matchList})&season_id=eq.${encodedSeasonId}`);
      });
    }

    await runClearSeasonStep("confirmar jogos restantes da epoca selecionada", async () => {
      matches = await fetchSupabaseAdminTable<MatchIdRow>(
        `matches?select=id&season_id=eq.${encodedSeasonId}&limit=500`
      );
    });
  }

  for (const matchdayChunk of chunkRows(matchdays, 100)) {
    const matchdayIds = matchdayChunk.map((matchday) => matchday.id);
    const matchdayList = encodedInList(matchdayIds);
    const matchdayFilter = `matchday_id=in.(${matchdayList})`;

    await runClearSeasonStep("apagar editoriais das jornadas", async () => {
      await deleteExistingOptionalRows("matchday_editorials", matchdayFilter, "matchday_editorials.matchday_id");
    });
  }

  await runClearSeasonStep("apagar matchdays", async () => {
    await deleteRows(`matchdays?season_id=eq.${encodedSeasonId}`);
  });

  await runClearSeasonStep("apagar participantes", async () => {
    await deleteRows(`season_teams?season_id=eq.${encodedSeasonId}`);
  });
}

async function finishMatch(formData: FormData) {
  const competitionId = cleanText(formData.get("competition_id"));
  const seasonId = cleanText(formData.get("season_id"));
  const matchdayId = cleanText(formData.get("matchday_id"));
  const matchId = cleanText(formData.get("match_id"));
  const homeScore = cleanScore(formData.get("home_score"));
  const awayScore = cleanScore(formData.get("away_score"));
  let minute = cleanMatchMinute(formData.get("minute"));
  let liveBaseMinute = cleanMatchMinute(formData.get("live_base_minute"));
  let isClockRunning = cleanClockRunning(formData.get("is_clock_running"));
  let liveStartedAt: string | null = null;
  const clockAction = cleanClockAction(formData.get("clock_action"));

  if (!competitionId || !seasonId || !matchdayId || !matchId) {
    throw new Error("missing-fields");
  }

  if ((homeScore === null) !== (awayScore === null)) {
    throw new Error("match-score-invalid");
  }

  if (!(await hasRows(`seasons?select=id&id=eq.${encodeURIComponent(seasonId)}&competition_id=eq.${encodeURIComponent(competitionId)}`))) {
    throw new Error("match-missing-context");
  }

  if (
    !(await hasRows(
      `matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}&season_id=eq.${encodeURIComponent(
        seasonId
      )}&manual_override=is.true`
    ))
  ) {
    throw new Error("matchday-invalid");
  }

  const match = await readAgendaMatch(formData);
  let status = cleanMatchStatus(formData.get("status"), match.status);
  const currentLiveMinute = getPublicLiveMinute(match);

  if (clockAction === "start_clock") {
    status = "live";
    liveBaseMinute = liveBaseMinute ?? minute ?? currentLiveMinute ?? match.minute ?? 0;
    minute = liveBaseMinute;
    liveStartedAt = new Date().toISOString();
    isClockRunning = true;
  } else if (clockAction === "pause_clock") {
    const frozenMinute = currentLiveMinute ?? liveBaseMinute ?? minute ?? match.minute;
    liveBaseMinute = frozenMinute;
    minute = frozenMinute;
    liveStartedAt = null;
    isClockRunning = false;
  } else if (status === "live" && isClockRunning) {
    liveBaseMinute = liveBaseMinute ?? minute ?? currentLiveMinute ?? match.minute ?? 0;
    minute = liveBaseMinute;
    liveStartedAt =
      match.is_clock_running && match.live_started_at && match.live_base_minute === liveBaseMinute
        ? match.live_started_at
        : new Date().toISOString();
  } else if (status === "live") {
    liveBaseMinute = liveBaseMinute ?? minute ?? match.live_base_minute ?? match.minute;
    liveStartedAt = null;
    isClockRunning = false;
  } else if (status === "postponed") {
    minute = null;
    liveBaseMinute = null;
    liveStartedAt = null;
    isClockRunning = false;
  } else {
    liveStartedAt = null;
    isClockRunning = false;
    if (status === "scheduled") {
      liveBaseMinute = null;
    } else {
      liveBaseMinute = liveBaseMinute ?? minute ?? currentLiveMinute ?? match.live_base_minute ?? match.minute;
    }
  }

  await writeSupabaseAdmin(
    `matches?id=eq.${encodeURIComponent(matchId)}&competition_id=eq.${encodeURIComponent(
      competitionId
    )}&season_id=eq.${encodeURIComponent(seasonId)}&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&manual_override=is.true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        home_score: status === "postponed" ? null : homeScore,
        away_score: status === "postponed" ? null : awayScore,
        minute,
        live_base_minute: liveBaseMinute,
        live_started_at: liveStartedAt,
        is_clock_running: isClockRunning,
        status,
        ...(status === "postponed" ? { rollover_excluded: true } : {}),
        data_source: "manual",
        sync_status: "manual",
        manual_override: true
      })
    }
  );
}

async function moveMatchdayLivePublicZoneOrder(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const zoneKey = cleanText(formData.get("live_zone_key"));
  const direction = cleanText(formData.get("direction"));

  if (
    !matchdayId ||
    !isMatchdayLivePublicZoneKey(zoneKey) ||
    (direction !== "up" && direction !== "down")
  ) {
    throw new Error("missing-fields");
  }

  const rows = await fetchSupabaseAdminTable<{
    matchday_id: string;
    live_public_zone_order: unknown;
  }>(
    `matchday_editorial_desk_control?select=matchday_id,live_public_zone_order&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&limit=1`
  );

  const currentOrder = normalizeMatchdayLivePublicZoneOrder(
    rows[0]?.live_public_zone_order
  );
  const nextOrder = moveMatchdayLivePublicZone(
    currentOrder,
    zoneKey,
    direction
  );

  if (nextOrder.join("|") === currentOrder.join("|")) {
    return;
  }

  const now = new Date().toISOString();

  if (rows[0]) {
    await writeSupabaseAdmin(
      `matchday_editorial_desk_control?matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          live_public_zone_order: nextOrder,
          updated_at: now,
        }),
      }
    );
    return;
  }

  await writeSupabaseAdmin("matchday_editorial_desk_control", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      live_public_zone_order: nextOrder,
      updated_at: now,
    }),
  });
}

async function removeSeason(formData: FormData) {
  const seasonId = cleanText(formData.get("season_id"));

  if (!seasonId) {
    throw new Error("missing-fields");
  }

  await clearSeasonCalendar(formData);

  await runClearSeasonStep("apagar epoca", async () => {
    await writeSupabaseAdmin(`seasons?id=eq.${encodeURIComponent(seasonId)}`, {
      method: "DELETE"
    });
  });
}

async function removeCompetition(formData: FormData) {
  const competitionId = cleanText(formData.get("competition_id"));

  if (!competitionId) {
    throw new Error("missing-fields");
  }

  if (await hasRows(`seasons?select=id&competition_id=eq.${encodeURIComponent(competitionId)}`)) {
    throw new Error("competition-has-seasons");
  }

  await writeSupabaseAdmin(`competitions?id=eq.${encodeURIComponent(competitionId)}`, {
    method: "DELETE"
  });
}

async function removeCountry(formData: FormData) {
  const countryId = cleanText(formData.get("country_id"));

  if (!countryId) {
    throw new Error("missing-fields");
  }

  if (await hasRows(`competitions?select=id&country_id=eq.${encodeURIComponent(countryId)}`)) {
    throw new Error("country-has-competitions");
  }

  if (await hasRows(`teams?select=id&country_id=eq.${encodeURIComponent(countryId)}`)) {
    throw new Error("country-has-teams");
  }

  await writeSupabaseAdmin(`countries?id=eq.${encodeURIComponent(countryId)}`, {
    method: "DELETE"
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const actionType = cleanText(formData.get("action_type"));

  if (actionType === "remove_team") {
    return returnUrl(request, formData, "error", "safe-deletion-required");
  }

  if (!getSupabaseServiceConfig()) {
    if (actionType === "preview_calendar_list" || actionType === "apply_calendar_matchday") {
      const payload: CalendarErrorResponse = {
        ok: false,
        error: "missing-service",
        message: "A escrita administrativa não está configurada."
      };
      return NextResponse.json(payload, { status: 503 });
    }
    return returnUrl(request, formData, "error", "missing-service");
  }

  if (actionType === "preview_calendar_list") {
    try {
      return NextResponse.json(await previewCalendarList(formData));
    } catch (error) {
      return calendarErrorResponse(error);
    }
  }

  if (actionType === "apply_calendar_matchday") {
    try {
      return NextResponse.json(await applyCalendarMatchday(formData));
    } catch (error) {
      return calendarErrorResponse(error);
    }
  }

  let createdValue = actionType ?? "1";
  let extraParams: Record<string, string> | undefined;

  try {
    if (actionType === "country") {
      await createCountry(formData);
    } else if (actionType === "competition") {
      await createCompetition(formData);
    } else if (actionType === "season") {
      await createSeason(formData);
    } else if (actionType === "team") {
      await createTeam(formData);
    } else if (actionType === "attach_team_to_country") {
      await attachTeamToCountry(formData);
    } else if (actionType === "participant") {
      await createParticipant(formData);
    } else if (actionType === "apply_club_list") {
      const summary = await applyClubList(formData);
      extraParams = { club_apply_summary: JSON.stringify(summary) };
    } else if (actionType === "remove_participant") {
      await removeParticipant(formData);
    } else if (actionType === "remove_all_participants") {
      await removeAllParticipants(formData);
    } else if (actionType === "remove_old_participant") {
      await removeOldParticipant(formData);
    } else if (actionType === "matchday") {
      await createMatchday(formData);
    } else if (actionType === "remove_matchday") {
      await removeMatchday(formData);
    } else if (actionType === "save_matchday_headline") {
      await saveMatchdayHeadline(formData);
    } else if (actionType === "save_matchday_side_block") {
      await saveMatchdaySideBlock(formData);
    } else if (actionType === "save_matchday_complement") {
      await saveMatchdayComplement(formData);
    } else if (actionType === "save_matchday_roundup_settings") {
      await saveMatchdayRoundupSettings(formData);
    } else if (actionType === "save_matchday_below_headline") {
      await saveMatchdayBelowHeadline(formData);
    } else if (actionType === "save_matchday_editorial") {
      await saveMatchdayEditorial(formData);
    } else if (actionType === "save_matchday_highlights") {
      await saveMatchdayHighlights(formData);
    } else if (actionType === "save_matchday_highlight_item") {
      await saveMatchdayHighlightItem(formData);
    } else if (actionType === "save_matchday_roundup_items") {
      await saveMatchdayRoundupItems(formData);
    } else if (actionType === "save_matchday_roundup_item") {
      await saveMatchdayRoundupItem(formData);
    } else if (actionType === "save_matchday_latest_news") {
      await saveMatchdayLatestNews(formData);
      const matchdayId = cleanText(formData.get("matchday_id"));
      if (matchdayId) {
        await normalizeLatestNewsOrder(matchdayId);
      }
    } else if (actionType === "set_matchday_latest_zone_placement") {
      await setMatchdayLatestZonePlacement(formData);
    } else if (actionType === "save_matchday_latest_news_item") {
      await saveMatchdayLatestNewsItem(formData);
      const matchdayId = cleanText(formData.get("matchday_id"));
      if (matchdayId) {
        await normalizeLatestNewsOrder(matchdayId);
      }
    } else if (actionType === "save_matchday_horizontal_news_item") {
      await saveMatchdayHorizontalNewsItem(formData);
      const matchdayId = cleanText(formData.get("matchday_id"));
      if (matchdayId) {
        await normalizeMatchdayHorizontalNewsOrder(matchdayId);
      }
    } else if (actionType === "move_matchday_horizontal_news_item") {
      await moveMatchdayHorizontalNewsOrder(formData);
    } else if (actionType === "move_matchday_live_public_zone") {
      await moveMatchdayLivePublicZoneOrder(formData);
    } else if (actionType === "transfer_matchday_news_article") {
      await transferMatchdayNewsArticle(formData);
    } else if (actionType === "match") {
      await createMatch(formData);
    } else if (actionType === "update_match") {
      await updateMatch(formData);
    } else if (actionType === "remove_match") {
      await removeMatch(formData);
    } else if (actionType === "clear_season_calendar") {
      await clearSeasonCalendar(formData);
    } else if (actionType === "finish_match") {
      await finishMatch(formData);
    } else if (actionType === "remove_season") {
      await removeSeason(formData);
    } else if (actionType === "remove_competition") {
      await removeCompetition(formData);
    } else if (actionType === "remove_country") {
      await removeCountry(formData);
    } else {
      return returnUrl(request, formData, "error", "unknown-action");
    }

    if (actionType && NEWS_FLOW_REFERENCE_SYNC_ACTIONS.has(actionType)) {
      const matchdayId = cleanText(formData.get("matchday_id"));
      if (matchdayId) {
        await syncCurrentPublishedReferenceCompositionNewsFlow(matchdayId);
      }
    }
  } catch (error) {
    if (error instanceof ClearSeasonCalendarError) {
      console.error("[admin/gestor] clear_season_calendar failed:", error.detail);
      return returnUrl(request, formData, "error", error.message, {
        clear_calendar_error_detail: error.detail
      });
    }

    if (actionType === "transfer_matchday_news_article") {
      return returnUrl(request, formData, "error", "news-flow-transfer-failed", {
        news_flow_error_detail: error instanceof Error ? shortActionError(error) : "Não foi possível transferir a notícia."
      });
    }

    if (actionType === "save_matchday_latest_news" || actionType === "save_matchday_latest_news_item") {
      return returnUrl(request, formData, "error", "latest-news-save-failed", {
        latest_news_error_detail: shortActionError(error)
      });
    }

    if (actionType === "save_matchday_horizontal_news_item" || actionType === "move_matchday_horizontal_news_item") {
      return returnUrl(request, formData, "error", "horizontal-news-save-failed", {
        horizontal_news_error_detail: shortActionError(error)
      });
    }

    if (actionType === "move_matchday_live_public_zone") {
      return returnUrl(request, formData, "error", "live-zone-order-save-failed");
    }

    return returnUrl(request, formData, "error", error instanceof Error ? error.message : "save");
  }

  return returnUrl(request, formData, "created", createdValue, extraParams);
}
