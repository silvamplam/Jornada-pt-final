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
      "User-Agent": "Jornada.pt/1.0 agenda-tv-sync",
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

async function readZerozeroMatchday(input: Readonly<{
  matchdayNumber: number;
  seasonLabel: string;
  seasonStartsOn: string;
}>) {
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
    throw new Error("source-empty");
  }

  return {
    rows,
    sourceUrl: page.url,
  };
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

  const source = await readZerozeroMatchday({
    matchdayNumber: matchday.number,
    seasonLabel: season.label,
    seasonStartsOn:
      season.starts_on
      ?? seasonStartFallback(season.label),
  });

  const teamsById = new Map(
    teams.map((team) => [team.id, team]),
  );

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
      const home =
        teamsById.get(match.home_team_id);
      const away =
        teamsById.get(match.away_team_id);

      const label =
        `${home?.name ?? "Casa"} – ${away?.name ?? "Fora"}`;

      const sourceCandidates:
        MatchdayAgendaTvSourceMatch[] =
          source.rows.filter((candidate) =>
            agendaSourceMatchesTeams(
              candidate,
              teamNames(home),
              teamNames(away),
            ),
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
        currentChannelId:
          match.broadcast_channel_id,
      };

      if (sourceCandidates.length === 0) {
        return {
          ...base,
          status: "source_not_found",
          note:
            "O jogo não foi identificado de forma inequívoca na fonte.",
          nextDate: null,
          nextKickoffAt: null,
          nextChannel: null,
          nextChannelId: null,
        };
      }

      if (sourceCandidates.length > 1) {
        return {
          ...base,
          status: "source_conflict",
          note:
            "A fonte devolveu mais do que um jogo compatível.",
          nextDate: null,
          nextKickoffAt: null,
          nextChannel: null,
          nextChannelId: null,
        };
      }

      const candidate = sourceCandidates[0];

      const channel =
        channelsByKey.get(
          canonicalAgendaChannelKey(
            candidate.channel,
          ),
        )
        ?? null;

      const nextKickoffAt =
        buildPortugalKickoffAt(
          candidate.date,
          candidate.time,
        );

      if (!channel) {
        return {
          ...base,
          status: "channel_not_found",
          note:
            `O canal exato "${candidate.channel}" não existe no catálogo da Jornada.`,
          nextDate: candidate.date,
          nextKickoffAt,
          nextChannel: candidate.channel,
          nextChannelId: null,
        };
      }

      const unchanged =
        match.scheduled_date === candidate.date
        && sameInstant(
          match.kickoff_at,
          nextKickoffAt,
        )
        && match.broadcast_channel_id === channel.id;

      return {
        ...base,
        status:
          unchanged
            ? "unchanged"
            : "update",
        note:
          unchanged
            ? "Data, hora e canal já correspondem à fonte."
            : "Alteração pronta para confirmação.",
        nextDate: candidate.date,
        nextKickoffAt,
        nextChannel: channel.name,
        nextChannelId: channel.id,
      };
    });

  const blockers =
    previewRows.filter(
      (row) =>
        row.status !== "update"
        && row.status !== "unchanged",
    ).length;

  const update =
    previewRows.filter(
      (row) => row.status === "update",
    ).length;

  const unchanged =
    previewRows.filter(
      (row) => row.status === "unchanged",
    ).length;

  return {
    matchdayId,
    matchdayLabel: matchday.label,
    competitionName: competition.name,
    seasonLabel: season.label,
    sourceLabel: "zerozero.pt",
    sourceUrl: source.sourceUrl,
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
      || !row.nextChannelId
    ) {
      throw new Error(
        "agenda-tv-incomplete-rpc-row",
      );
    }

    return {
      match_id: row.matchId,
      expected_scheduled_date:
        row.currentDate,
      expected_kickoff_at:
        row.currentKickoffAt,
      expected_broadcast_channel_id:
        row.currentChannelId,
      scheduled_date:
        row.nextDate,
      kickoff_at:
        row.nextKickoffAt,
      broadcast_channel_id:
        row.nextChannelId,
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
            "A atualização foi bloqueada porque nem todos os jogos têm correspondência e canal exato.",
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
      "rpc/apply_matchday_agenda_tv_sync_v1",
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
      return responseError(
        "Não foi possível obter uma agenda externa completa e segura. Nada foi alterado.",
        502,
        "source-unavailable",
      );
    }

    if (
      detail.includes(
        "agenda-tv-v1-stale-state",
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
