import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalAuthorization, PortalPermissionRow } from "@/lib/portal-escolas/auth";

type AuthorizedPortal = Extract<PortalAuthorization, { allowed: true }>;

type RowWithId = {
  id: string;
};

type PortalQueryResult = {
  data: unknown[] | null;
  error: unknown;
};

type PortalQuery = {
  eq(column: string, value: string | number | boolean | null): PortalQuery;
  in(column: string, values: string[]): PortalQuery;
  order(column: string, options?: { ascending?: boolean }): PortalQuery;
  limit(count: number): Promise<PortalQueryResult>;
};

type PortalCompetitionEntityRow = RowWithId & {
  name: string;
};

type PortalCompetitionContextRow = RowWithId & {
  portal_entity_id: string;
  label: string;
};

type PortalCompetitionRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  name: string;
  slug: string | null;
  modality: string | null;
  scope: string | null;
  format: string | null;
  status: string;
};

type PortalCompetitionModalityRow = RowWithId & {
  catalog_modality_id: string | null;
  name: string;
  slug: string | null;
  local_code: string | null;
  status: string;
};

type PortalCompetitionModalityCatalogRow = RowWithId & {
  code: string;
  name: string;
  status: string;
};

type PortalCompetitionFormatRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  portal_competition_id: string;
  catalog_format_id: string | null;
  name: string;
  code: string | null;
  format_scope: string;
  format_family: string | null;
  event_model: string | null;
  result_model: string | null;
  ranking_model: string | null;
  status: string;
};

type PortalCompetitionFormatCatalogRow = RowWithId & {
  code: string;
  name: string;
  format_family: string | null;
  default_event_model: string | null;
  default_result_model: string | null;
  default_ranking_model: string | null;
  status: string;
};

export type PortalCompetitionFormatCatalogOption = {
  id: string;
  name: string;
};

type PortalStageRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_competition_id: string;
  name: string;
  type: string | null;
  stage_order: number | null;
  scheduled_date: string | null;
  status: string;
};

type PortalParticipantRow = RowWithId & {
  portal_entity_id: string;
  name: string;
  type: string | null;
  status: string | null;
};

type PortalCompetitionParticipantRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_competition_id: string;
  portal_participant_id: string;
  registration_status: string;
  group_label: string | null;
  seed_order: number | null;
};

type PortalEventRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  portal_competition_id: string;
  portal_stage_id: string | null;
  name: string;
  slug: string | null;
  type: string | null;
  event_order: number | null;
  scheduled_at: string | null;
  venue: string | null;
  status: string;
};

type PortalEventParticipantRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  portal_competition_id: string;
  portal_stage_id: string | null;
  portal_event_id: string;
  portal_participant_id: string;
  role: string | null;
  seed_order: number | null;
  status: string;
};

type PortalResultEntryRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  portal_competition_id: string;
  portal_stage_id: string | null;
  portal_event_id: string;
  portal_participant_id: string;
  score_numeric: number | string | null;
  score_text: string | null;
  points: number | string | null;
  outcome: string | null;
  is_winner: boolean | null;
  result_status: string | null;
};

type PortalRankingRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  portal_competition_id: string;
  portal_format_id: string | null;
  name: string;
  slug: string | null;
  ranking_scope: string;
  ranking_type: string;
  status: string;
};

type PortalRankingEntryRow = RowWithId & {
  portal_entity_id: string;
  portal_context_id: string;
  portal_modality_id: string | null;
  portal_competition_id: string;
  portal_ranking_id: string;
  portal_participant_id: string;
  rank: number | null;
  position_label: string | null;
  points: number | string | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  score_for: number | string | null;
  score_against: number | string | null;
  score_difference: number | string | null;
  status: string;
};

export type PortalCompetitionDetailScope = {
  id: string;
  entityLabel: string;
  contextLabel: string;
  competitionLabel: string;
};

export type PortalCompetitionDetailFormat = {
  key: string;
  name: string;
  codeLabel: string;
  catalogLabel: string;
  catalogCode: string | null;
  formatScopeLabel: string;
  formatFamilyLabel: string;
  eventModelLabel: string;
  resultModelLabel: string;
  rankingModelLabel: string;
  statusLabel: string;
};

export type PortalCompetitionDetailStage = {
  key: string;
  name: string;
  typeLabel: string;
  orderLabel: string;
  scheduledDate: string | null;
  statusLabel: string;
  eventCount: number;
  participantCount: number;
  resultEntryCount: number;
};

export type PortalCompetitionDetailParticipant = {
  key: string;
  name: string;
  typeLabel: string;
  statusLabel: string;
  registrationStatusLabel: string;
  groupLabel: string | null;
  seedOrderLabel: string;
};

export type PortalCompetitionDetailEvent = {
  key: string;
  name: string;
  slug: string | null;
  typeLabel: string;
  stageLabel: string;
  statusLabel: string;
  scheduledAt: string | null;
  venue: string | null;
  participantLabels: string[];
  resultEntries: Array<{
    key: string;
    participantLabel: string;
    scoreLabel: string;
    pointsLabel: string;
    outcomeLabel: string;
    isWinner: boolean;
  }>;
};

export type PortalCompetitionDetailRanking = {
  key: string;
  name: string;
  slug: string | null;
  rankingScopeLabel: string;
  rankingTypeLabel: string;
  statusLabel: string;
  rows: Array<{
    key: string;
    rankLabel: string;
    participantLabel: string;
    pointsLabel: string;
    playedLabel: string;
    recordLabel: string;
    scoreLabel: string;
    statusLabel: string;
  }>;
};

export type PortalCompetitionDetailRecord = {
  key: string;
  id: string;
  portalEntityId: string;
  portalContextId: string;
  portalModalityId: string | null;
  name: string;
  slug: string | null;
  status: string;
  entityLabel: string;
  contextLabel: string;
  statusLabel: string;
  scopeLabel: string;
  legacyFormatLabel: string;
  legacyModalityLabel: string;
  formalModalityLabel: string;
  formalModalityHref: string | null;
  formalModalityLocalCode: string | null;
  formalModalityStatusLabel: string;
  modalityCatalogLabel: string;
  modalityCatalogCode: string | null;
  formats: PortalCompetitionDetailFormat[];
  stages: PortalCompetitionDetailStage[];
  participants: PortalCompetitionDetailParticipant[];
  events: PortalCompetitionDetailEvent[];
  rankings: PortalCompetitionDetailRanking[];
  summary: {
    formatCount: number;
    stageCount: number;
    competitionParticipantCount: number;
    eventCount: number;
    eventParticipantCount: number;
    resultEntryCount: number;
    rankingCount: number;
    rankingEntryCount: number;
  };
};

export type PortalCompetitionDetailData = {
  competitions: PortalCompetitionDetailRecord[];
  scopes: PortalCompetitionDetailScope[];
  formatCatalogOptions: PortalCompetitionFormatCatalogOption[];
  unavailableSections: string[];
};

const LIST_LIMIT = 1000;
const LOOKUP_LIMIT = 1000;

const labelMap: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  draft: "Rascunho",
  scheduled: "Agendado",
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  published: "Publicado",
  archived: "Arquivado",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  completed: "Concluído",
  finished: "Concluído",
  in_progress: "Em curso",
  live: "Em curso",
  competition: "Competição",
  category: "Escalão/categoria",
  stage: "Fase/jornada/ronda",
  event_series: "Série de eventos",
  matchdays_table: "Tabela por jornadas",
  round_robin_league: "Liga todos contra todos",
  knockout_cup: "Taça/eliminatória",
  groups_then_knockout: "Grupos + eliminatória",
  swiss_tournament: "Torneio suíço",
  event_meeting: "Meeting/prova",
  race_ranking: "Ranking por corrida",
  field_event_ranking: "Ranking por marca",
  points_ranking: "Ranking por pontos",
  multi_event_points: "Pontuação multi-evento",
  league_table: "Classificação geral",
  event: "Evento",
  match: "Jogo",
  mixed: "Misto",
  score: "Resultado/pontuação",
  home: "Casa",
  away: "Fora",
  winner: "Vencedor",
  draw: "Empate",
  loss: "Derrota",
  win: "Vitória",
  overall: "Geral",
  team: "Turma/equipa",
  group: "Grupo",
  individual: "Individual",
  participant: "Participante"
};

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function indexById<T extends RowWithId>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function mergeRows<T extends RowWithId>(target: Map<string, T>, rows: T[]) {
  rows.forEach((row) => {
    target.set(row.id, row);
  });
}

function sortByLabel<T>(rows: T[], readLabel: (row: T) => string) {
  return [...rows].sort((first, second) => readLabel(first).localeCompare(readLabel(second), "pt"));
}

function formatValue(value: number | string | null | undefined, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatLabel(value: string | null | undefined, fallback = "Por definir") {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  return labelMap[trimmed] ?? trimmed.replace(/[_-]/g, " ");
}

async function readRows<T extends RowWithId>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  options: {
    sectionLabel: string;
    limit?: number;
    apply?: (query: PortalQuery) => PortalQuery;
  }
) {
  try {
    let query = supabase.from(table).select(select) as unknown as PortalQuery;

    if (options.apply) {
      query = options.apply(query);
    }

    const { data, error } = await query.limit(options.limit ?? LIST_LIMIT);

    if (error) {
      return {
        rows: [] as T[],
        unavailableSection: options.sectionLabel
      };
    }

    return {
      rows: (data ?? []) as unknown as T[],
      unavailableSection: null
    };
  } catch {
    return {
      rows: [] as T[],
      unavailableSection: options.sectionLabel
    };
  }
}

async function readScopedRows<T extends RowWithId>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  permissions: PortalPermissionRow[],
  options: {
    sectionLabel: string;
    orderColumn?: string;
    ascending?: boolean;
    includeCompetitionScope?: boolean;
    contextScopeColumn?: "portal_context_id" | "id";
    competitionScopeColumn?: "portal_competition_id" | "id";
  }
) {
  const rowsById = new Map<string, T>();
  const unavailableSections = new Set<string>();

  await Promise.all(
    permissions.map(async (permission) => {
      const result = await readRows<T>(supabase, table, select, {
        sectionLabel: options.sectionLabel,
        apply(query) {
          let scopedQuery = query.eq("portal_entity_id", permission.portal_entity_id);
          const contextScopeColumn = options.contextScopeColumn ?? "portal_context_id";
          const competitionScopeColumn = options.competitionScopeColumn ?? "portal_competition_id";

          if (permission.portal_context_id) {
            scopedQuery = scopedQuery.eq(contextScopeColumn, permission.portal_context_id);
          }

          if (options.includeCompetitionScope !== false && permission.portal_competition_id) {
            scopedQuery = scopedQuery.eq(competitionScopeColumn, permission.portal_competition_id);
          }

          if (options.orderColumn) {
            scopedQuery = scopedQuery.order(options.orderColumn, { ascending: options.ascending ?? true });
          }

          return scopedQuery;
        }
      });

      mergeRows(rowsById, result.rows);

      if (result.unavailableSection) {
        unavailableSections.add(result.unavailableSection);
      }
    })
  );

  return {
    rows: Array.from(rowsById.values()),
    unavailableSections
  };
}

async function readEntities(supabase: SupabaseClient, permissions: PortalPermissionRow[]) {
  const entityIds = uniqueValues(permissions.map((permission) => permission.portal_entity_id));

  if (entityIds.length === 0) {
    return { rows: [] as PortalCompetitionEntityRow[], unavailableSection: null };
  }

  return readRows<PortalCompetitionEntityRow>(supabase, "portal_entities", "id,name", {
    sectionLabel: "entidades",
    limit: LOOKUP_LIMIT,
    apply(query) {
      return query.in("id", entityIds).order("name", { ascending: true });
    }
  });
}

async function readFormalModalities(supabase: SupabaseClient, competitions: PortalCompetitionRow[]) {
  const modalityIds = uniqueValues(competitions.map((competition) => competition.portal_modality_id));

  if (modalityIds.length === 0) {
    return { rows: [] as PortalCompetitionModalityRow[], unavailableSection: null };
  }

  return readRows<PortalCompetitionModalityRow>(
    supabase,
    "portal_modalities",
    "id,catalog_modality_id,name,slug,local_code,status",
    {
      sectionLabel: "modalidades formais",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("id", modalityIds).order("name", { ascending: true });
      }
    }
  );
}

async function readModalityCatalog(supabase: SupabaseClient, modalities: PortalCompetitionModalityRow[]) {
  const catalogIds = uniqueValues(modalities.map((modality) => modality.catalog_modality_id));

  if (catalogIds.length === 0) {
    return { rows: [] as PortalCompetitionModalityCatalogRow[], unavailableSection: null };
  }

  return readRows<PortalCompetitionModalityCatalogRow>(supabase, "portal_modality_catalog", "id,code,name,status", {
    sectionLabel: "catálogo de modalidades",
    limit: LOOKUP_LIMIT,
    apply(query) {
      return query.in("id", catalogIds).order("name", { ascending: true });
    }
  });
}

async function readFormats(supabase: SupabaseClient, competitionIds: string[]) {
  if (competitionIds.length === 0) {
    return { rows: [] as PortalCompetitionFormatRow[], unavailableSection: null };
  }

  return readRows<PortalCompetitionFormatRow>(
    supabase,
    "portal_competition_formats",
    "id,portal_entity_id,portal_context_id,portal_modality_id,portal_competition_id,catalog_format_id,name,code,format_scope,format_family,event_model,result_model,ranking_model,status",
    {
      sectionLabel: "formatos multidesporto",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_competition_id", competitionIds).order("name", { ascending: true });
      }
    }
  );
}

async function readFormatCatalog(supabase: SupabaseClient, formats: PortalCompetitionFormatRow[]) {
  const catalogIds = uniqueValues(formats.map((format) => format.catalog_format_id));

  if (catalogIds.length === 0) {
    return { rows: [] as PortalCompetitionFormatCatalogRow[], unavailableSection: null };
  }

  return readRows<PortalCompetitionFormatCatalogRow>(
    supabase,
    "portal_competition_format_catalog",
    "id,code,name,format_family,default_event_model,default_result_model,default_ranking_model,status",
    {
      sectionLabel: "catálogo de formatos",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("id", catalogIds).order("name", { ascending: true });
      }
    }
  );
}

async function readActiveFormatCatalog(supabase: SupabaseClient) {
  return readRows<PortalCompetitionFormatCatalogRow>(
    supabase,
    "portal_competition_format_catalog",
    "id,code,name,format_family,default_event_model,default_result_model,default_ranking_model,status",
    {
      sectionLabel: "catálogo de formatos",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.eq("status", "active").order("name", { ascending: true });
      }
    }
  );
}

function makeFormatCatalogOptions(catalogRows: PortalCompetitionFormatCatalogRow[]): PortalCompetitionFormatCatalogOption[] {
  return sortByLabel(
    catalogRows.filter((row) => row.status === "active"),
    (row) => row.name
  ).map((row) => ({
    id: row.id,
    name: row.name
  }));
}

async function readEvents(supabase: SupabaseClient, competitionIds: string[]) {
  if (competitionIds.length === 0) {
    return { rows: [] as PortalEventRow[], unavailableSection: null };
  }

  return readRows<PortalEventRow>(
    supabase,
    "portal_events",
    "id,portal_entity_id,portal_context_id,portal_modality_id,portal_competition_id,portal_stage_id,name,slug,type,event_order,scheduled_at,venue,status",
    {
      sectionLabel: "eventos multidesporto",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_competition_id", competitionIds).order("event_order", { ascending: true });
      }
    }
  );
}

async function readRankings(supabase: SupabaseClient, competitionIds: string[]) {
  if (competitionIds.length === 0) {
    return { rows: [] as PortalRankingRow[], unavailableSection: null };
  }

  return readRows<PortalRankingRow>(
    supabase,
    "portal_rankings",
    "id,portal_entity_id,portal_context_id,portal_modality_id,portal_competition_id,portal_format_id,name,slug,ranking_scope,ranking_type,status",
    {
      sectionLabel: "rankings multidesporto",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_competition_id", competitionIds).order("name", { ascending: true });
      }
    }
  );
}

async function readStages(supabase: SupabaseClient, competitionIds: string[]) {
  if (competitionIds.length === 0) {
    return { rows: [] as PortalStageRow[], unavailableSection: null };
  }

  return readRows<PortalStageRow>(
    supabase,
    "portal_stages",
    "id,portal_entity_id,portal_context_id,portal_competition_id,name,type,stage_order,scheduled_date,status",
    {
      sectionLabel: "estrutura competitiva",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_competition_id", competitionIds).order("stage_order", { ascending: true });
      }
    }
  );
}

async function readCompetitionParticipants(supabase: SupabaseClient, competitionIds: string[]) {
  if (competitionIds.length === 0) {
    return { rows: [] as PortalCompetitionParticipantRow[], unavailableSection: null };
  }

  return readRows<PortalCompetitionParticipantRow>(
    supabase,
    "portal_competition_participants",
    "id,portal_entity_id,portal_context_id,portal_competition_id,portal_participant_id,registration_status,group_label,seed_order",
    {
      sectionLabel: "participantes da competição",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_competition_id", competitionIds).order("seed_order", { ascending: true });
      }
    }
  );
}

async function readEventParticipants(supabase: SupabaseClient, eventIds: string[]) {
  if (eventIds.length === 0) {
    return { rows: [] as PortalEventParticipantRow[], unavailableSection: null };
  }

  return readRows<PortalEventParticipantRow>(
    supabase,
    "portal_event_participants",
    "id,portal_entity_id,portal_context_id,portal_modality_id,portal_competition_id,portal_stage_id,portal_event_id,portal_participant_id,role,seed_order,status",
    {
      sectionLabel: "participantes de evento",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_event_id", eventIds).order("seed_order", { ascending: true });
      }
    }
  );
}

async function readResultEntries(supabase: SupabaseClient, eventIds: string[]) {
  if (eventIds.length === 0) {
    return { rows: [] as PortalResultEntryRow[], unavailableSection: null };
  }

  return readRows<PortalResultEntryRow>(
    supabase,
    "portal_result_entries",
    "id,portal_entity_id,portal_context_id,portal_modality_id,portal_competition_id,portal_stage_id,portal_event_id,portal_participant_id,score_numeric,score_text,points,outcome,is_winner,result_status",
    {
      sectionLabel: "entradas de resultado multidesporto",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_event_id", eventIds).order("portal_participant_id", { ascending: true });
      }
    }
  );
}

async function readRankingEntries(supabase: SupabaseClient, rankingIds: string[]) {
  if (rankingIds.length === 0) {
    return { rows: [] as PortalRankingEntryRow[], unavailableSection: null };
  }

  return readRows<PortalRankingEntryRow>(
    supabase,
    "portal_ranking_entries",
    "id,portal_entity_id,portal_context_id,portal_modality_id,portal_competition_id,portal_ranking_id,portal_participant_id,rank,position_label,points,played,wins,draws,losses,score_for,score_against,score_difference,status",
    {
      sectionLabel: "linhas de ranking multidesporto",
      limit: LOOKUP_LIMIT,
      apply(query) {
        return query.in("portal_ranking_id", rankingIds).order("rank", { ascending: true });
      }
    }
  );
}

async function readParticipantsByIds(supabase: SupabaseClient, participantIds: string[]) {
  if (participantIds.length === 0) {
    return { rows: [] as PortalParticipantRow[], unavailableSection: null };
  }

  return readRows<PortalParticipantRow>(supabase, "portal_participants", "id,portal_entity_id,name,type,status", {
    sectionLabel: "participantes",
    limit: LOOKUP_LIMIT,
    apply(query) {
      return query.in("id", participantIds).order("name", { ascending: true });
    }
  });
}

function makeScopes(
  permissions: PortalPermissionRow[],
  entities: PortalCompetitionEntityRow[],
  contexts: PortalCompetitionContextRow[],
  competitions: PortalCompetitionRow[]
) {
  const entitiesById = indexById(entities);
  const contextsById = indexById(contexts);
  const competitionsById = indexById(competitions);

  return permissions.map((permission) => {
    const context = permission.portal_context_id ? contextsById.get(permission.portal_context_id) : null;
    const competition = permission.portal_competition_id ? competitionsById.get(permission.portal_competition_id) : null;

    return {
      id: permission.id,
      entityLabel: entitiesById.get(permission.portal_entity_id)?.name ?? "Entidade autorizada",
      contextLabel: permission.portal_context_id ? context?.label ?? "Contexto autorizado" : "Todos os contextos",
      competitionLabel: permission.portal_competition_id ? competition?.name ?? "Competição autorizada" : "Todas as competições"
    };
  });
}

function makeFormats(
  competitionId: string,
  formats: PortalCompetitionFormatRow[],
  formatCatalogById: Map<string, PortalCompetitionFormatCatalogRow>
): PortalCompetitionDetailFormat[] {
  return sortByLabel(
    formats.filter((format) => format.portal_competition_id === competitionId),
    (format) => format.name
  ).map((format) => {
    const catalog = format.catalog_format_id ? formatCatalogById.get(format.catalog_format_id) ?? null : null;

    return {
      key: format.id,
      name: format.name,
      codeLabel: format.code ?? "Sem código local",
      catalogLabel: catalog?.name ?? "Sem catálogo associado",
      catalogCode: catalog?.code ?? null,
      formatScopeLabel: formatLabel(format.format_scope),
      formatFamilyLabel: formatLabel(format.format_family ?? catalog?.format_family, "Família por definir"),
      eventModelLabel: formatLabel(format.event_model ?? catalog?.default_event_model, "Evento por definir"),
      resultModelLabel: formatLabel(format.result_model ?? catalog?.default_result_model, "Resultado por definir"),
      rankingModelLabel: formatLabel(format.ranking_model ?? catalog?.default_ranking_model, "Ranking por definir"),
      statusLabel: formatLabel(format.status)
    };
  });
}

function makeStages(
  competitionId: string,
  stages: PortalStageRow[],
  events: PortalEventRow[],
  eventParticipants: PortalEventParticipantRow[],
  resultEntries: PortalResultEntryRow[]
): PortalCompetitionDetailStage[] {
  return [...stages]
    .filter((stage) => stage.portal_competition_id === competitionId)
    .sort((first, second) => {
      const firstOrder = first.stage_order ?? 999999;
      const secondOrder = second.stage_order ?? 999999;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return first.name.localeCompare(second.name, "pt");
    })
    .map((stage) => {
      const stageEvents = events.filter((event) => event.portal_stage_id === stage.id);
      const stageParticipants = eventParticipants.filter((participant) => participant.portal_stage_id === stage.id);
      const stageResults = resultEntries.filter((entry) => entry.portal_stage_id === stage.id);

      return {
        key: stage.id,
        name: stage.name,
        typeLabel: formatLabel(stage.type, "Estrutura"),
        orderLabel: stage.stage_order === null ? "Sem ordem" : `Ordem ${stage.stage_order}`,
        scheduledDate: stage.scheduled_date,
        statusLabel: formatLabel(stage.status),
        eventCount: stageEvents.length,
        participantCount: stageParticipants.length,
        resultEntryCount: stageResults.length
      };
    });
}

function makeCompetitionParticipants(
  competitionId: string,
  competitionParticipants: PortalCompetitionParticipantRow[],
  participantsById: Map<string, PortalParticipantRow>
): PortalCompetitionDetailParticipant[] {
  return [...competitionParticipants]
    .filter((participant) => participant.portal_competition_id === competitionId)
    .sort((first, second) => {
      const firstOrder = first.seed_order ?? 999999;
      const secondOrder = second.seed_order ?? 999999;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      const firstName = participantsById.get(first.portal_participant_id)?.name ?? "Participante";
      const secondName = participantsById.get(second.portal_participant_id)?.name ?? "Participante";

      return firstName.localeCompare(secondName, "pt");
    })
    .map((competitionParticipant) => {
      const participant = participantsById.get(competitionParticipant.portal_participant_id);

      return {
        key: competitionParticipant.id,
        name: participant?.name ?? "Participante",
        typeLabel: formatLabel(participant?.type, "Participante"),
        statusLabel: formatLabel(participant?.status, "Rascunho"),
        registrationStatusLabel: formatLabel(competitionParticipant.registration_status),
        groupLabel: competitionParticipant.group_label,
        seedOrderLabel: competitionParticipant.seed_order === null ? "Sem ordem" : `Ordem ${competitionParticipant.seed_order}`
      };
    });
}

function makeEvents(
  competitionId: string,
  events: PortalEventRow[],
  eventParticipants: PortalEventParticipantRow[],
  resultEntries: PortalResultEntryRow[],
  stagesById: Map<string, PortalStageRow>,
  participantsById: Map<string, PortalParticipantRow>
): PortalCompetitionDetailEvent[] {
  return [...events]
    .filter((event) => event.portal_competition_id === competitionId)
    .sort((first, second) => {
      const firstOrder = first.event_order ?? 999999;
      const secondOrder = second.event_order ?? 999999;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return first.name.localeCompare(second.name, "pt");
    })
    .map((event) => {
      const participants = eventParticipants
        .filter((participant) => participant.portal_event_id === event.id)
        .sort((first, second) => (first.seed_order ?? 999999) - (second.seed_order ?? 999999));
      const eventResults = resultEntries.filter((entry) => entry.portal_event_id === event.id);

      return {
        key: event.id,
        name: event.name,
        slug: event.slug,
        typeLabel: formatLabel(event.type, "Evento"),
        stageLabel: event.portal_stage_id
          ? stagesById.get(event.portal_stage_id)?.name ?? "Estrutura competitiva"
          : "Sem estrutura competitiva",
        statusLabel: formatLabel(event.status),
        scheduledAt: event.scheduled_at,
        venue: event.venue,
        participantLabels: participants.map((participant) => {
          const name = participantsById.get(participant.portal_participant_id)?.name ?? "Participante";
          const role = participant.role ? ` (${formatLabel(participant.role).toLowerCase()})` : "";

          return `${name}${role}`;
        }),
        resultEntries: eventResults.map((entry) => ({
          key: entry.id,
          participantLabel: participantsById.get(entry.portal_participant_id)?.name ?? "Participante",
          scoreLabel: formatValue(entry.score_text ?? entry.score_numeric),
          pointsLabel: formatValue(entry.points),
          outcomeLabel: formatLabel(entry.outcome, "Sem desfecho"),
          isWinner: Boolean(entry.is_winner)
        }))
      };
    });
}

function makeRankings(
  competitionId: string,
  rankings: PortalRankingRow[],
  rankingEntries: PortalRankingEntryRow[],
  participantsById: Map<string, PortalParticipantRow>
): PortalCompetitionDetailRanking[] {
  return sortByLabel(
    rankings.filter((ranking) => ranking.portal_competition_id === competitionId),
    (ranking) => ranking.name
  ).map((ranking) => ({
    key: ranking.id,
    name: ranking.name,
    slug: ranking.slug,
    rankingScopeLabel: formatLabel(ranking.ranking_scope),
    rankingTypeLabel: formatLabel(ranking.ranking_type),
    statusLabel: formatLabel(ranking.status),
    rows: rankingEntries
      .filter((entry) => entry.portal_ranking_id === ranking.id)
      .sort((first, second) => (first.rank ?? 999999) - (second.rank ?? 999999))
      .map((entry) => ({
        key: entry.id,
        rankLabel: entry.position_label ?? formatValue(entry.rank),
        participantLabel: participantsById.get(entry.portal_participant_id)?.name ?? "Participante",
        pointsLabel: formatValue(entry.points),
        playedLabel: formatValue(entry.played),
        recordLabel: `${formatValue(entry.wins, "0")}-${formatValue(entry.draws, "0")}-${formatValue(entry.losses, "0")}`,
        scoreLabel: `${formatValue(entry.score_for, "0")}-${formatValue(entry.score_against, "0")} (${formatValue(entry.score_difference, "0")})`,
        statusLabel: formatLabel(entry.status)
      }))
  }));
}

function makeCompetitionDetails(
  competitions: PortalCompetitionRow[],
  entities: PortalCompetitionEntityRow[],
  contexts: PortalCompetitionContextRow[],
  formalModalities: PortalCompetitionModalityRow[],
  modalityCatalog: PortalCompetitionModalityCatalogRow[],
  formats: PortalCompetitionFormatRow[],
  formatCatalog: PortalCompetitionFormatCatalogRow[],
  events: PortalEventRow[],
  eventParticipants: PortalEventParticipantRow[],
  resultEntries: PortalResultEntryRow[],
  competitionParticipants: PortalCompetitionParticipantRow[],
  rankings: PortalRankingRow[],
  rankingEntries: PortalRankingEntryRow[],
  stages: PortalStageRow[],
  participants: PortalParticipantRow[]
) {
  const entitiesById = indexById(entities);
  const contextsById = indexById(contexts);
  const formalModalitiesById = indexById(formalModalities);
  const modalityCatalogById = indexById(modalityCatalog);
  const formatCatalogById = indexById(formatCatalog);
  const stagesById = indexById(stages);
  const participantsById = indexById(participants);

  return sortByLabel(competitions, (competition) => competition.name).map((competition) => {
    const formalModality = competition.portal_modality_id
      ? formalModalitiesById.get(competition.portal_modality_id) ?? null
      : null;
    const catalog = formalModality?.catalog_modality_id
      ? modalityCatalogById.get(formalModality.catalog_modality_id) ?? null
      : null;
    const competitionFormats = makeFormats(competition.id, formats, formatCatalogById);
    const competitionStages = makeStages(competition.id, stages, events, eventParticipants, resultEntries);
    const competitionParticipantsList = makeCompetitionParticipants(competition.id, competitionParticipants, participantsById);
    const competitionEvents = makeEvents(competition.id, events, eventParticipants, resultEntries, stagesById, participantsById);
    const competitionRankings = makeRankings(competition.id, rankings, rankingEntries, participantsById);
    const competitionEventParticipants = eventParticipants.filter((participant) => participant.portal_competition_id === competition.id);
    const competitionResultEntries = resultEntries.filter((entry) => entry.portal_competition_id === competition.id);
    const competitionRankingEntries = rankingEntries.filter((entry) => entry.portal_competition_id === competition.id);

    return {
      key: competition.id,
      id: competition.id,
      portalEntityId: competition.portal_entity_id,
      portalContextId: competition.portal_context_id,
      portalModalityId: competition.portal_modality_id,
      name: competition.name,
      slug: competition.slug,
      status: competition.status,
      entityLabel: entitiesById.get(competition.portal_entity_id)?.name ?? "Entidade autorizada",
      contextLabel: contextsById.get(competition.portal_context_id)?.label ?? "Contexto autorizado",
      statusLabel: formatLabel(competition.status),
      scopeLabel: formatLabel(competition.scope, "Âmbito por definir"),
      legacyFormatLabel: formatLabel(competition.format, "Formato legacy por definir"),
      legacyModalityLabel: formatLabel(competition.modality, "Sem modalidade legacy"),
      formalModalityLabel: formalModality?.name ?? "Sem modalidade formal",
      formalModalityHref: formalModality?.slug ? `/portal-escolas/modalidades/${formalModality.slug}` : null,
      formalModalityLocalCode: formalModality?.local_code ?? null,
      formalModalityStatusLabel: formatLabel(formalModality?.status, "Sem estado formal"),
      modalityCatalogLabel: catalog?.name ?? "Sem catálogo associado",
      modalityCatalogCode: catalog?.code ?? null,
      formats: competitionFormats,
      stages: competitionStages,
      participants: competitionParticipantsList,
      events: competitionEvents,
      rankings: competitionRankings,
      summary: {
        formatCount: competitionFormats.length,
        stageCount: competitionStages.length,
        competitionParticipantCount: competitionParticipantsList.length,
        eventCount: competitionEvents.length,
        eventParticipantCount: competitionEventParticipants.length,
        resultEntryCount: competitionResultEntries.length,
        rankingCount: competitionRankings.length,
        rankingEntryCount: competitionRankingEntries.length
      }
    };
  });
}

export async function readPortalCompetitionDetail(
  supabase: SupabaseClient,
  authorization: AuthorizedPortal,
  slug: string
): Promise<PortalCompetitionDetailData> {
  const permissions = authorization.permissions;
  const unavailableSections = new Set<string>();
  const safeSlug = decodeURIComponent(slug ?? "").trim();

  const [entitiesResult, contextsResult, competitionsResult] = await Promise.all([
    readEntities(supabase, permissions),
    readScopedRows<PortalCompetitionContextRow>(supabase, "portal_contexts", "id,portal_entity_id,label", permissions, {
      sectionLabel: "contextos",
      contextScopeColumn: "id",
      includeCompetitionScope: false,
      orderColumn: "label"
    }),
    readScopedRows<PortalCompetitionRow>(
      supabase,
      "portal_competitions",
      "id,portal_entity_id,portal_context_id,portal_modality_id,name,slug,modality,scope,format,status",
      permissions,
      {
        sectionLabel: "competições",
        competitionScopeColumn: "id",
        orderColumn: "name"
      }
    )
  ]);

  if (entitiesResult.unavailableSection) {
    unavailableSections.add(entitiesResult.unavailableSection);
  }

  contextsResult.unavailableSections.forEach((section) => unavailableSections.add(section));
  competitionsResult.unavailableSections.forEach((section) => unavailableSections.add(section));

  const visibleCompetitions = sortByLabel(competitionsResult.rows, (competition) => competition.name);
  const matchingCompetitions = visibleCompetitions.filter((competition) => competition.slug === safeSlug);
  const competitionIds = matchingCompetitions.map((competition) => competition.id);

  if (matchingCompetitions.length === 0) {
    return {
      competitions: [],
      scopes: makeScopes(permissions, entitiesResult.rows, contextsResult.rows, visibleCompetitions),
      formatCatalogOptions: [],
      unavailableSections: Array.from(unavailableSections).sort((first, second) => first.localeCompare(second, "pt"))
    };
  }

  const [formalModalitiesResult, formatsResult, eventsResult, rankingsResult] = await Promise.all([
    readFormalModalities(supabase, matchingCompetitions),
    readFormats(supabase, competitionIds),
    readEvents(supabase, competitionIds),
    readRankings(supabase, competitionIds)
  ]);

  [formalModalitiesResult, formatsResult, eventsResult, rankingsResult].forEach((result) => {
    if (result.unavailableSection) {
      unavailableSections.add(result.unavailableSection);
    }
  });

  const [modalityCatalogResult, formatCatalogResult, activeFormatCatalogResult] = await Promise.all([
    readModalityCatalog(supabase, formalModalitiesResult.rows),
    readFormatCatalog(supabase, formatsResult.rows),
    readActiveFormatCatalog(supabase)
  ]);

  [modalityCatalogResult, formatCatalogResult, activeFormatCatalogResult].forEach((result) => {
    if (result.unavailableSection) {
      unavailableSections.add(result.unavailableSection);
    }
  });

  const eventIds = uniqueValues(eventsResult.rows.map((event) => event.id));
  const rankingIds = uniqueValues(rankingsResult.rows.map((ranking) => ranking.id));

  const [eventParticipantsResult, resultEntriesResult, rankingEntriesResult, stagesResult, competitionParticipantsResult] = await Promise.all([
    readEventParticipants(supabase, eventIds),
    readResultEntries(supabase, eventIds),
    readRankingEntries(supabase, rankingIds),
    readStages(supabase, competitionIds),
    readCompetitionParticipants(supabase, competitionIds)
  ]);

  [eventParticipantsResult, resultEntriesResult, rankingEntriesResult, stagesResult, competitionParticipantsResult].forEach((result) => {
    if (result.unavailableSection) {
      unavailableSections.add(result.unavailableSection);
    }
  });

  const participantIds = uniqueValues([
    ...competitionParticipantsResult.rows.map((participant) => participant.portal_participant_id),
    ...eventParticipantsResult.rows.map((participant) => participant.portal_participant_id),
    ...resultEntriesResult.rows.map((entry) => entry.portal_participant_id),
    ...rankingEntriesResult.rows.map((entry) => entry.portal_participant_id)
  ]);
  const participantsResult = await readParticipantsByIds(supabase, participantIds);

  if (participantsResult.unavailableSection) {
    unavailableSections.add(participantsResult.unavailableSection);
  }

  return {
    competitions: makeCompetitionDetails(
      matchingCompetitions,
      entitiesResult.rows,
      contextsResult.rows,
      formalModalitiesResult.rows,
      modalityCatalogResult.rows,
      formatsResult.rows,
      formatCatalogResult.rows,
      eventsResult.rows,
      eventParticipantsResult.rows,
      resultEntriesResult.rows,
      competitionParticipantsResult.rows,
      rankingsResult.rows,
      rankingEntriesResult.rows,
      stagesResult.rows,
      participantsResult.rows
    ),
    scopes: makeScopes(permissions, entitiesResult.rows, contextsResult.rows, visibleCompetitions),
    formatCatalogOptions: makeFormatCatalogOptions(activeFormatCatalogResult.rows),
    unavailableSections: Array.from(unavailableSections).sort((first, second) => first.localeCompare(second, "pt"))
  };
}
