import { NextResponse } from "next/server";

import {
  agendaSourceMatchesTeams,
  buildPortugalKickoffAt,
  canonicalAgendaChannelKey,
  parseZerozeroAgendaHtml,
  resolveZerozeroMatchdayUrl,
  zerozeroPageHasContext,
  type MatchdayAgendaTvSourceMatch,
} from "@/lib/matchday-agenda-tv-sync";
import {
  isGenericAgendaTvChannel,
  ligaPortugalMatchUrl,
  parseLigaPortugalMatchHtml,
  parseOndeBolaAgendaHtml,
  type AgendaTvSourceRead,
} from "@/lib/matchday-agenda-tv-sources";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdmin,
  type SupabaseBroadcastChannel,
  type SupabaseCompetition,
  type SupabaseMatch,
  type SupabaseMatchday,
  type SupabaseSeason,
  type SupabaseTeam,
} from "@/lib/supabase";

const ZEROZERO_BASE_URL =
  "https://www.zerozero.pt/competicao/liga-portuguesa?redird=1&v=tt1";
const ONDEBOLA_URL = "https://ondebola.com/";

type AgendaTvAction = "preview" | "apply";

type AgendaTvInput = Readonly<{
  action?: AgendaTvAction;
}>;

type PreviewStatus =
  | "update"
  | "unchanged"
  | "source_not_found"
  | "source_conflict"
  | "channel_not_found";

type PreviewRow = Readonly<{
  matchId: string;
  label: string;
  status: PreviewStatus;
  note: string;
  currentDate: string | null;
  currentKickoffAt: string | null;
  currentChannel: string | null;
  currentChannelId: string | null;
  nextDate: string | null;
  nextKickoffAt: string | null;
  nextChannel: string | null;
  nextChannelId: string | null;
}>;

type AgendaTvPreview = Readonly<{
  matchdayId: string;
  matchdayLabel: string;
  competitionName: string;
  seasonLabel: string;
  sourceLabel: string;
  sourceUrl: string;
  rows: readonly PreviewRow[];
  summary: Readonly<{
    total: number;
    update: number;
    unchanged: number;
    blockers: number;
  }>;
  canApply: boolean;
}>;

type RouteContext = Readonly<{
  params: Promise<{
    matchdayId: string;
  }>;
}>;

type LoadedSource = AgendaTvSourceRead & Readonly<{
  key: "liga_portugal" | "ondebola" | "zerozero";
}>;

type MatchEvidence = Readonly<{
  source: LoadedSource;
  candidates: readonly MatchdayAgendaTvSourceMatch[];
}>;

function responseError(
  message: string,
  status: number,
  code: string,
) {
  return NextResponse.json(
    { ok: false, code, message },
    { status },
  );
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.5",
      "User-Agent": "Jornada.pt/1.0 agenda-tv-sync (+https://www.jornada.pt)",
    },
  });

  if (!response.ok) {
    throw new Error(`source-http-${response.status}`);
  }

  const contentType =
    response.headers.get("content-type")
    ?? "";

  if (
    !contentType
      .toLowerCase()
      .includes("text/html")
  ) {
    throw new Error("source-not-html");
  }

  return {
    html: await response.text(),
    url: response.url || url,
  };
}

function seasonStartFallback(label: string) {
  const match = /^(20\d{2})/.exec(label.trim());

  if (!match) {
    throw new Error("invalid-season-label");
  }

  return `${match[1]}-07-01`;
}

async function readLigaPortugalMatchday(input: Readonly<{
  matchdayNumber: number;
  seasonLabel: string;
  seasonStartsOn: string;
  matchCount: number;
}>): Promise<LoadedSource> {
  const rows: MatchdayAgendaTvSourceMatch[] = [];
  let sourceUrl = "https://www.ligaportugal.pt/";

  // Deliberately sequential: this is a manual admin action, so there is no
  // reason to burst nine requests at the official source at once.
  for (let index = 1; index <= input.matchCount; index += 1) {
    const requestedUrl = ligaPortugalMatchUrl({
      seasonLabel: input.seasonLabel,
      matchdayNumber: input.matchdayNumber,
      matchIndex: index,
    });

    try {
      const page = await fetchHtml(requestedUrl);
      const parsed = parseLigaPortugalMatchHtml(page.html, {
        sourceUrl: page.url,
        seasonStartsOn: input.seasonStartsOn,
      });

      if (parsed) {
        rows.push(parsed);
        sourceUrl = page.url;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      console.warn("[agenda-tv] source item unavailable", {
        source: "liga_portugal",
        requestedUrl,
        detail,
      });
    }
  }

  if (rows.length === 0) {
    throw new Error("source-empty-liga-portugal");
  }

  return {
    key: "liga_portugal",
    label: "Liga Portugal",
    sourceUrl,
    rows,
  };
}

async function readOndeBolaMatchday(input: Readonly<{
  matchdayNumber: number;
  seasonStartsOn: string;
}>): Promise<LoadedSource> {
  const page = await fetchHtml(ONDEBOLA_URL);
  const rows = parseOndeBolaAgendaHtml(page.html, {
    sourceUrl: page.url,
    seasonStartsOn: input.seasonStartsOn,
    matchdayNumber: input.matchdayNumber,
  });

  if (rows.length === 0) {
    throw new Error("source-empty-ondebola");
  }

  return {
    key: "ondebola",
    label: "OndeBola",
    sourceUrl: page.url,
    rows,
  };
}

async function readZerozeroMatchday(input: Readonly<{
  matchdayNumber: number;
  seasonLabel: string;
  seasonStartsOn: string;
}>): Promise<LoadedSource> {
  const base = await fetchHtml(ZEROZERO_BASE_URL);

  const targetUrl = resolveZerozeroMatchdayUrl(
    base.html,
    input.matchdayNumber,
    base.url,
  );

  const page = await fetchHtml(targetUrl);

  if (
    !zerozeroPageHasContext(page.html, {
      matchdayNumber: input.matchdayNumber,
      seasonLabel: input.seasonLabel,
    })
  ) {
    throw new Error("source-wrong-context");
  }

  const rows = parseZerozeroAgendaHtml(
    page.html,
    {
      sourceUrl: page.url,
      seasonStartsOn: input.seasonStartsOn,
    },
  );

  if (rows.length === 0) {
    throw new Error("source-empty-zerozero");
  }

  return {
    key: "zerozero",
    label: "ZeroZero",
    sourceUrl: page.url,
    rows,
  };
}

async function safeReadSource(
  key: LoadedSource["key"],
  read: () => Promise<LoadedSource>,
) {
  try {
    return await read();
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "unknown";

    console.warn("[agenda-tv] external source unavailable", {
      source: key,
      detail,
    });

    return null;
  }
}

function teamNames(
  team: SupabaseTeam | undefined,
) {
  if (!team) return [];

  return [
    team.name,
    team.short_name,
    team.public_name ?? "",
    team.slug,
  ].filter(Boolean);
}

function sameInstant(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left || !right) return left === right;

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (
    !Number.isFinite(leftTime)
    || !Number.isFinite(rightTime)
  ) {
    return left === right;
  }

  return leftTime === rightTime;
}

function evidenceForMatch(
  source: LoadedSource | null,
  homeNames: readonly string[],
  awayNames: readonly string[],
): MatchEvidence | null {
  if (!source) return null;

  return {
    source,
    candidates: source.rows.filter((candidate) =>
      agendaSourceMatchesTeams(
        candidate,
        homeNames,
        awayNames,
      ),
    ),
  };
}

function resolveScheduleEvidence(
  evidence: readonly (MatchEvidence | null)[],
) {
  for (const item of evidence) {
    if (!item) continue;

    if (item.candidates.length === 1) {
      return {
        status: "ok" as const,
        row: item.candidates[0],
        source: item.source,
      };
    }

    if (item.candidates.length > 1) {
      return {
        status: "conflict" as const,
        source: item.source,
      };
    }
  }

  return { status: "not_found" as const };
}

function resolveChannelEvidence(input: Readonly<{
  liga: MatchEvidence | null;
  ondebola: MatchEvidence | null;
  zerozero: MatchEvidence | null;
  channelsByKey: ReadonlyMap<string, SupabaseBroadcastChannel>;
}>) {
  const single = (evidence: MatchEvidence | null) =>
    evidence?.candidates.length === 1
      ? evidence.candidates[0]
      : null;

  const liga = single(input.liga);
  const ondebola = single(input.ondebola);
  const zerozero = single(input.zerozero);

  const ordered = [
    liga && !isGenericAgendaTvChannel(liga.channel)
      ? { row: liga, source: input.liga!.source }
      : null,
    ondebola
      ? { row: ondebola, source: input.ondebola!.source }
      : null,
    liga
      ? { row: liga, source: input.liga!.source }
      : null,
    zerozero
      ? { row: zerozero, source: input.zerozero!.source }
      : null,
  ];

  let firstReportedChannel: string | null = null;

  for (const candidate of ordered) {
    if (!candidate?.row.channel) continue;

    firstReportedChannel ??= candidate.row.channel;

    const channel = input.channelsByKey.get(
      canonicalAgendaChannelKey(candidate.row.channel),
    );

    if (channel) {
      return {
        channel,
        source: candidate.source,
        reportedChannel: candidate.row.channel,
      } as const;
    }
  }

  return {
    channel: null,
    source: null,
    reportedChannel: firstReportedChannel,
  } as const;
}

async function buildPreview(
  matchdayId: string,
): Promise<AgendaTvPreview> {
  const [matchday] =
    await fetchSupabaseAdminTable<SupabaseMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );

  if (!matchday) {
    throw new Error("matchday-not-found");
  }

  const [season] =
    await fetchSupabaseAdminTable<SupabaseSeason>(
      `seasons?select=id,competition_id,label,starts_on,ends_on,is_current&id=eq.${encodeURIComponent(matchday.season_id)}&limit=1`,
    );

  if (!season) {
    throw new Error("season-not-found");
  }

  const [competition] =
    await fetchSupabaseAdminTable<SupabaseCompetition>(
      `competitions?select=id,name,slug,country,logo_url,is_active&id=eq.${encodeURIComponent(season.competition_id)}&limit=1`,
    );

  if (!competition) {
    throw new Error("competition-not-found");
  }

  if (competition.slug !== "liga-portugal") {
    throw new Error("unsupported-competition");
  }

  const matches =
    await fetchSupabaseAdminTable<SupabaseMatch>(
      `matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,status,scheduled_date,kickoff_at,broadcast_channel_id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=100`,
    );

  if (matches.length === 0) {
    throw new Error("matchday-has-no-matches");
  }

  const teamIds = Array.from(
    new Set(
      matches.flatMap((match) => [
        match.home_team_id,
        match.away_team_id,
      ]),
    ),
  );

  const teams =
    await fetchSupabaseAdminTable<SupabaseTeam>(
      `teams?select=id,name,short_name,public_name,slug,country,logo_url,primary_color&id=in.(${teamIds.map(encodeURIComponent).join(",")})&limit=100`,
    );

  const channels =
    await fetchSupabaseAdminTable<SupabaseBroadcastChannel>(
      "broadcast_channels?select=id,name,platform,country,logo_url&order=name.asc&limit=500",
    );

  const startsOn =
    season.starts_on
    ?? seasonStartFallback(season.label);

  const [liga, ondebola] = await Promise.all([
    safeReadSource("liga_portugal", () =>
      readLigaPortugalMatchday({
        matchdayNumber: matchday.number,
        seasonLabel: season.label,
        seasonStartsOn: startsOn,
        matchCount: matches.length,
      }),
    ),
    safeReadSource("ondebola", () =>
      readOndeBolaMatchday({
        matchdayNumber: matchday.number,
        seasonStartsOn: startsOn,
      }),
    ),
  ]);

  const teamsById = new Map(
    teams.map((team) => [team.id, team]),
  );

  const unresolvedWithoutLegacy = matches.some((match) => {
    const homeNames = teamNames(teamsById.get(match.home_team_id));
    const awayNames = teamNames(teamsById.get(match.away_team_id));

    const schedule = resolveScheduleEvidence([
      evidenceForMatch(liga, homeNames, awayNames),
      evidenceForMatch(ondebola, homeNames, awayNames),
    ]);

    return schedule.status !== "ok";
  });

  const zerozero = unresolvedWithoutLegacy
    ? await safeReadSource("zerozero", () =>
        readZerozeroMatchday({
          matchdayNumber: matchday.number,
          seasonLabel: season.label,
          seasonStartsOn: startsOn,
        }),
      )
    : null;

  if (!liga && !ondebola && !zerozero) {
    throw new Error("source-all-unavailable");
  }

  const channelsById = new Map(
    channels.map((channel) => [
      channel.id,
      channel,
    ]),
  );

  const channelsByKey = new Map(
    channels.map((channel) => [
      canonicalAgendaChannelKey(channel.name),
      channel,
    ]),
  );

  const previewRows: PreviewRow[] =
    matches.map((match) => {
      const home = teamsById.get(match.home_team_id);
      const away = teamsById.get(match.away_team_id);
      const homeNames = teamNames(home);
      const awayNames = teamNames(away);
      const label =
        `${home?.name ?? "Casa"} – ${away?.name ?? "Fora"}`;

      const ligaEvidence = evidenceForMatch(
        liga,
        homeNames,
        awayNames,
      );
      const ondebolaEvidence = evidenceForMatch(
        ondebola,
        homeNames,
        awayNames,
      );
      const zerozeroEvidence = evidenceForMatch(
        zerozero,
        homeNames,
        awayNames,
      );

      const currentChannel =
        match.broadcast_channel_id
          ? (
              channelsById.get(
                match.broadcast_channel_id,
              )?.name
              ?? null
            )
          : null;

      const base = {
        matchId: match.id,
        label,
        currentDate: match.scheduled_date,
        currentKickoffAt: match.kickoff_at,
        currentChannel,
        currentChannelId: match.broadcast_channel_id,
      };

      const schedule = resolveScheduleEvidence([
        ligaEvidence,
        ondebolaEvidence,
        zerozeroEvidence,
      ]);

      if (schedule.status === "not_found") {
        return {
          ...base,
          status: "source_not_found" as const,
          note:
            "O jogo não foi identificado de forma inequívoca nas fontes disponíveis.",
          nextDate: null,
          nextKickoffAt: null,
          nextChannel: null,
          nextChannelId: null,
        };
      }

      if (schedule.status === "conflict") {
        return {
          ...base,
          status: "source_conflict" as const,
          note:
            `${schedule.source.label} devolveu mais do que um jogo compatível.`,
          nextDate: null,
          nextKickoffAt: null,
          nextChannel: null,
          nextChannelId: null,
        };
      }

      const channelEvidence = resolveChannelEvidence({
        liga: ligaEvidence,
        ondebola: ondebolaEvidence,
        zerozero: zerozeroEvidence,
        channelsByKey,
      });

      const nextKickoffAt = buildPortugalKickoffAt(
        schedule.row.date,
        schedule.row.time,
      );
      const nextChannelId =
        channelEvidence.channel?.id
        ?? null;
      const nextChannel =
        channelEvidence.channel?.name
        ?? currentChannel;

      const scheduleChanged =
        match.scheduled_date !== schedule.row.date
        || !sameInstant(
          match.kickoff_at,
          nextKickoffAt,
        );
      const channelChanged =
        nextChannelId !== null
        && match.broadcast_channel_id !== nextChannelId;
      const unchanged =
        !scheduleChanged
        && !channelChanged;

      const sourceNote =
        `Data e hora: ${schedule.source.label}.`;
      const channelNote = channelEvidence.channel
        ? ` Canal: ${channelEvidence.source?.label ?? "catálogo"}.`
        : channelEvidence.reportedChannel
          ? ` Canal "${channelEvidence.reportedChannel}" sem correspondência exata no catálogo; a TV atual será preservada.`
          : " Canal sem confirmação exata; a TV atual será preservada.";

      return {
        ...base,
        status:
          unchanged
            ? "unchanged" as const
            : "update" as const,
        note:
          unchanged
            ? `${sourceNote}${channelNote}`
            : `Alteração pronta para confirmação. ${sourceNote}${channelNote}`,
        nextDate: schedule.row.date,
        nextKickoffAt,
        nextChannel,
        nextChannelId,
      };
    });

  const blockers =
    previewRows.filter(
      (row) =>
        row.status === "source_not_found"
        || row.status === "source_conflict",
    ).length;

  const update =
    previewRows.filter(
      (row) => row.status === "update",
    ).length;

  const unchanged =
    previewRows.filter(
      (row) => row.status === "unchanged",
    ).length;

  const loadedSources = [liga, ondebola, zerozero]
    .filter((source): source is LoadedSource => source !== null);

  return {
    matchdayId,
    matchdayLabel: matchday.label,
    competitionName: competition.name,
    seasonLabel: season.label,
    sourceLabel: loadedSources.map((source) => source.label).join(" + "),
    sourceUrl:
      liga?.sourceUrl
      ?? ondebola?.sourceUrl
      ?? zerozero?.sourceUrl
      ?? "",
    rows: previewRows,
    summary: {
      total: previewRows.length,
      update,
      unchanged,
      blockers,
    },
    canApply:
      blockers === 0
      && update > 0,
  };
}

function rpcRows(
  preview: AgendaTvPreview,
) {
  return preview.rows.map((row) => {
    if (
      !row.nextDate
      || !row.nextKickoffAt
    ) {
      throw new Error(
        "agenda-tv-incomplete-rpc-row",
      );
    }

    return {
      match_id: row.matchId,
      expected_scheduled_date: row.currentDate,
      expected_kickoff_at: row.currentKickoffAt,
      expected_broadcast_channel_id: row.currentChannelId,
      scheduled_date: row.nextDate,
      kickoff_at: row.nextKickoffAt,
      broadcast_channel_id: row.nextChannelId,
    };
  });
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  if (!getSupabaseServiceConfig()) {
    return responseError(
      "Configuração administrativa do Supabase indisponível.",
      500,
      "missing-service",
    );
  }

  const { matchdayId } =
    await context.params;

  if (!matchdayId) {
    return responseError(
      "Jornada inválida.",
      400,
      "missing-matchday",
    );
  }

  let input: AgendaTvInput = {};

  try {
    input =
      await request.json() as AgendaTvInput;
  } catch {
    input = {};
  }

  const action: AgendaTvAction =
    input.action === "apply"
      ? "apply"
      : "preview";

  try {
    const preview =
      await buildPreview(matchdayId);

    if (action === "preview") {
      return NextResponse.json({
        ok: true,
        preview,
        applied: 0,
      });
    }

    if (preview.summary.blockers > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "agenda-tv-blocked",
          message:
            "A atualização foi bloqueada porque nem todos os jogos têm correspondência segura.",
          preview,
          applied: 0,
        },
        { status: 409 },
      );
    }

    if (preview.summary.update === 0) {
      return NextResponse.json({
        ok: true,
        preview,
        applied: 0,
        message:
          "A agenda e os canais já estavam atualizados.",
      });
    }

    await writeSupabaseAdmin(
      "rpc/apply_matchday_agenda_tv_sync_v2",
      {
        method: "POST",
        body: JSON.stringify({
          p_matchday_id: matchdayId,
          p_rows: rpcRows(preview),
        }),
      },
    );

    const confirmed =
      await buildPreview(matchdayId);

    return NextResponse.json({
      ok: true,
      preview: confirmed,
      applied: preview.summary.update,
      message:
        `${preview.summary.update} ${
          preview.summary.update === 1
            ? "jogo atualizado"
            : "jogos atualizados"
        }.`,
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "unknown";

    if (detail === "unsupported-competition") {
      return responseError(
        "A sincronização automática ainda não está configurada para esta competição.",
        422,
        "unsupported-competition",
      );
    }

    if (
      detail.startsWith("source-")
      || detail === "invalid-season-label"
      || detail === "invalid-season-start"
      || detail === "invalid-kickoff-date"
      || detail === "unsupported-portugal-offset"
    ) {
      console.warn("[agenda-tv] external source unavailable", {
        matchdayId,
        detail,
      });
      return responseError(
        "Agenda externa indisponível neste momento. Nenhuma alteração foi efetuada.",
        502,
        "source-unavailable",
      );
    }

    if (
      detail.includes(
        "agenda-tv-v2-stale-state",
      )
    ) {
      return responseError(
        "Os jogos mudaram desde a pré-visualização. Volta a procurar antes de confirmar.",
        409,
        "agenda-tv-stale-state",
      );
    }

    return responseError(
      "Não foi possível preparar ou aplicar a agenda e TV desta jornada.",
      500,
      "agenda-tv-failed",
    );
  }
}
