import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  PORTAL_ESCOLAS_LOGIN_PATH,
  PORTAL_ESCOLAS_PANEL_PATH,
  createPortalEscolasServerClient,
  readPortalAuthorization
} from "@/lib/portal-escolas/auth";
import { readPortalCompetitionDetail } from "@/lib/portal-escolas/readPortalCompetitionDetail";
import { PortalCompetitionFormatCreateForm } from "./PortalCompetitionFormatCreateForm";
import { PortalCompetitionStructureCreateForm } from "./PortalCompetitionStructureCreateForm";
import { PortalCompetitionParticipantCreateForm } from "./PortalCompetitionParticipantCreateForm";
import { PortalCompetitionEventCreateForm } from "./PortalCompetitionEventCreateForm";
import { PortalEscolasInternalNav } from "../../_components/PortalEscolasInternalNav";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    formato?: string | string[];
    estrutura?: string | string[];
    participante?: string | string[];
    evento?: string | string[];
  }>;
};

export const metadata = {
  title: "Detalhe da competição | Portal das Escolas | Jornada.pt",
  description: "Leitura read-only detalhada por competição formal no Portal das Escolas."
};

export const dynamic = "force-dynamic";

const competitionDetailStyles = `
  body {
    margin: 0;
    background: #eef3f8;
  }

  .portal-competition-detail-shell {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at top left, rgba(15, 111, 141, 0.12), transparent 32%),
      linear-gradient(180deg, #f8fbfd 0%, #eef3f8 100%);
    color: #102033;
    font-family: Arial, Helvetica, sans-serif;
  }

  .portal-competition-detail-wrap {
    width: min(1180px, 100%);
    margin: 0 auto;
  }

  .portal-competition-detail-hero,
  .portal-competition-detail-section,
  .portal-competition-detail-warning,
  .portal-competition-detail-notice {
    border: 1px solid #cbdce7;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 16px 34px rgba(15, 35, 52, 0.09);
  }

  .portal-competition-detail-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 20px;
    align-items: end;
    padding: 28px;
  }

  .portal-competition-detail-section,
  .portal-competition-detail-warning,
  .portal-competition-detail-notice {
    margin-top: 18px;
    padding: 22px;
  }

  .portal-competition-detail-eyebrow {
    margin: 0 0 10px;
    color: #0f6f8d;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .portal-competition-detail-hero h1,
  .portal-competition-detail-warning h1,
  .portal-competition-detail-section h2,
  .portal-competition-detail-section h3,
  .portal-competition-detail-notice h2 {
    margin: 0;
  }

  .portal-competition-detail-hero h1,
  .portal-competition-detail-warning h1 {
    font-size: 38px;
    line-height: 1.05;
  }

  .portal-competition-detail-section h2,
  .portal-competition-detail-notice h2 {
    font-size: 24px;
    line-height: 1.2;
  }

  .portal-competition-detail-section h3 {
    font-size: 18px;
    line-height: 1.25;
  }

  .portal-competition-detail-text,
  .portal-competition-detail-warning p,
  .portal-competition-detail-notice p {
    margin: 12px 0 0;
    color: #526274;
    font-size: 15px;
    line-height: 1.55;
  }

  .portal-competition-detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 16px 0;
  }

  .portal-competition-detail-actions a,
  .portal-competition-detail-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 8px 12px;
    border: 1px solid #cbdce7;
    border-radius: 8px;
    background: #ffffff;
    color: #0f6f8d;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.2;
    text-decoration: none;
    text-transform: uppercase;
  }

  .portal-competition-detail-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    min-height: 30px;
    padding: 6px 10px;
    border: 1px solid #bcd7df;
    border-radius: 999px;
    background: #e7f4f8;
    color: #0f6478;
    font-size: 11px;
    font-weight: 900;
    line-height: 1.2;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }

  .portal-competition-detail-section-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
    margin-bottom: 16px;
  }

  .portal-competition-detail-summary-grid,
  .portal-competition-detail-tree,
  .portal-competition-detail-format-list,
  .portal-competition-detail-stage-list,
  .portal-competition-detail-participant-list,
  .portal-competition-detail-event-list,
  .portal-competition-detail-ranking-list {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .portal-competition-detail-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .portal-competition-detail-tree {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .portal-competition-detail-summary-card,
  .portal-competition-detail-tree-card,
  .portal-competition-detail-format,
  .portal-competition-detail-stage,
  .portal-competition-detail-participant,
  .portal-competition-detail-event,
  .portal-competition-detail-ranking {
    min-width: 0;
    border: 1px solid #dbe7ef;
    border-radius: 8px;
    background: #f8fbfd;
    padding: 14px;
  }

  .portal-competition-detail-summary-card,
  .portal-competition-detail-tree-card,
  .portal-competition-detail-format,
  .portal-competition-detail-stage,
  .portal-competition-detail-participant,
  .portal-competition-detail-event,
  .portal-competition-detail-ranking {
    display: grid;
    gap: 6px;
  }

  .portal-competition-detail-summary-card span,
  .portal-competition-detail-tree-card span,
  .portal-competition-detail-format span,
  .portal-competition-detail-stage span,
  .portal-competition-detail-participant span,
  .portal-competition-detail-event span,
  .portal-competition-detail-ranking span,
  .portal-competition-detail-label,
  .portal-competition-detail-table th {
    color: #526274;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .portal-competition-detail-summary-card strong,
  .portal-competition-detail-tree-card strong,
  .portal-competition-detail-format strong,
  .portal-competition-detail-stage strong,
  .portal-competition-detail-participant strong,
  .portal-competition-detail-event strong,
  .portal-competition-detail-ranking strong {
    color: #102033;
    overflow-wrap: anywhere;
  }


  .portal-competition-detail-format-list,
  .portal-competition-detail-stage-list,
  .portal-competition-detail-participant-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .portal-competition-detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  .portal-competition-detail-table-wrap {
    width: 100%;
    overflow-x: auto;
    border: 1px solid #dbe7ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .portal-competition-detail-table {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
  }

  .portal-competition-detail-table th,
  .portal-competition-detail-table td {
    padding: 10px;
    border-bottom: 1px solid #dbe7ef;
    text-align: left;
    vertical-align: top;
  }

  .portal-competition-detail-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .portal-competition-detail-table td {
    color: #1b2c3d;
    font-size: 14px;
  }

  .portal-competition-detail-ranking-guide,
  .portal-competition-detail-result-guide {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 0 0 14px;
    padding: 0;
    list-style: none;
  }

  .portal-competition-detail-ranking-guide li,
  .portal-competition-detail-result-guide li {
    min-width: 0;
    padding: 12px;
    border: 1px solid #dbe7ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .portal-competition-detail-ranking-guide span,
  .portal-competition-detail-result-guide span {
    display: block;
    color: #0f6f8d;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .portal-competition-detail-ranking-guide strong,
  .portal-competition-detail-result-guide strong {
    display: block;
    margin-top: 6px;
    color: #102033;
    font-size: 13px;
    line-height: 1.3;
  }

  .portal-competition-detail-empty {
    margin: 0;
    padding: 14px;
    border: 1px dashed #bcd7df;
    border-radius: 8px;
    color: #526274;
    background: #f8fbfd;
    font-size: 14px;
    line-height: 1.5;
  }


  .portal-competition-format-create-form {
    display: grid;
    gap: 14px;
    margin-top: 14px;
    padding: 16px;
    border: 1px solid #dbe7ef;
    border-radius: 8px;
    background: #f8fbfd;
  }

  .portal-competition-format-create-state {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .portal-competition-format-create-field {
    display: grid;
    gap: 6px;
  }

  .portal-competition-format-create-field label {
    color: #526274;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .portal-competition-format-create-field input,
  .portal-competition-format-create-field select,
  .portal-competition-format-create-field textarea {
    min-height: 42px;
    border: 1px solid #cbdce7;
    border-radius: 8px;
    background: #ffffff;
    color: #102033;
    font: inherit;
    padding: 10px 12px;
  }

  .portal-competition-format-create-field textarea {
    min-height: 92px;
    resize: vertical;
  }

  .portal-competition-format-create-field input[readonly] {
    background: #eef3f8;
    color: #526274;
  }

  .portal-competition-format-create-field span {
    color: #526274;
    font-size: 12px;
    line-height: 1.4;
  }

  .portal-competition-format-create-form button {
    justify-self: start;
    min-height: 40px;
    border: 0;
    border-radius: 8px;
    background: #0f6f8d;
    color: #ffffff;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    padding: 10px 16px;
    text-transform: uppercase;
  }

  .portal-competition-format-create-form button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .portal-competition-event-create-options {
    display: grid;
    gap: 8px;
  }

  .portal-competition-event-create-option {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    border: 1px solid #dbe7ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .portal-competition-event-create-option input {
    width: 16px;
    min-height: auto;
    margin-top: 2px;
  }

  .portal-competition-event-create-option span {
    display: grid;
    gap: 3px;
  }

  .portal-competition-event-create-option strong {
    color: #102033;
    font-size: 14px;
  }

  .portal-competition-event-create-option small {
    color: #526274;
    font-size: 12px;
    line-height: 1.35;
  }

  .portal-competition-detail-feedback {
    margin: 0 0 14px;
    padding: 12px;
    border: 1px solid #bcd7df;
    border-radius: 8px;
    background: #e7f4f8;
    color: #0f6478;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.45;
  }

  .portal-competition-detail-feedback-error {
    border-color: #efb7b7;
    background: #fff1f1;
    color: #9b1c1c;
  }

  @media (max-width: 980px) {
    .portal-competition-detail-shell {
      padding: 18px;
    }

    .portal-competition-detail-hero,
    .portal-competition-detail-section-header {
      grid-template-columns: 1fr;
      display: grid;
    }

    .portal-competition-detail-hero h1,
    .portal-competition-detail-warning h1 {
      font-size: 32px;
    }

    .portal-competition-detail-summary-grid,
    .portal-competition-detail-tree,
    .portal-competition-detail-format-list,
    .portal-competition-detail-stage-list,
    .portal-competition-detail-ranking-guide,
    .portal-competition-detail-result-guide {
      grid-template-columns: 1fr;
    }
  }
`;

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Madeira"
  }).format(date);
}

function formatUnavailableSection(section: string) {
  const labels: Record<string, string> = {
    entidades: "Entidades",
    contextos: "Contextos",
    competições: "Competições",
    "modalidades formais": "Modalidades formais",
    "catálogo de modalidades": "Catálogo de modalidades",
    "formatos multidesporto": "Formatos multidesporto",
    "catálogo de formatos": "Catálogo de formatos",
    "eventos multidesporto": "Eventos multidesporto",
    "participantes de evento": "Participantes de evento",
    "entradas de resultado multidesporto": "Entradas de resultado multidesporto",
    "rankings multidesporto": "Rankings multidesporto",
    "linhas de ranking multidesporto": "Linhas de ranking multidesporto",
    "estrutura competitiva": "Estrutura competitiva",
    "fases/jornadas": "Fases/jornadas",
    participantes: "Participantes"
  };

  return labels[section] ?? section;
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function readSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readOptionalNonNegativeInteger(formData: FormData, fieldName: string) {
  const rawValue = readFormText(formData, fieldName);

  if (!rawValue) {
    return null;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return Number.NaN;
  }

  return parsedValue;
}

function getCreateFormatStatusMessage(status: string | null) {
  const messages: Record<string, { kind: "success" | "error"; text: string }> = {
    criado: { kind: "success", text: "Formato competitivo definido em rascunho para esta competição." },
    duplicado: { kind: "error", text: "Esta competição já tem um formato competitivo definido neste âmbito." },
    "dados-invalidos": { kind: "error", text: "Não foi possível definir o formato: confirma a opção escolhida." },
    "sem-permissao": { kind: "error", text: "Não tens permissão ativa para definir o formato desta competição." },
    erro: { kind: "error", text: "Não foi possível definir o formato. Tenta novamente ou valida a configuração da fase SQL." }
  };

  return status ? messages[status] ?? null : null;
}

function getCreateStructureStatusMessage(status: string | null) {
  const messages: Record<string, { kind: "success" | "error"; text: string }> = {
    criada: { kind: "success", text: "Estrutura competitiva criada em rascunho para esta competição." },
    duplicada: { kind: "error", text: "Esta competição já tem uma estrutura competitiva definida neste âmbito." },
    "dados-invalidos": { kind: "error", text: "Não foi possível criar a estrutura: confirma os dados da competição." },
    "sem-formato": { kind: "error", text: "Define primeiro o formato competitivo antes de criar a estrutura." },
    "sem-permissao": { kind: "error", text: "Não tens permissão ativa para criar a estrutura desta competição." },
    erro: { kind: "error", text: "Não foi possível criar a estrutura. Tenta novamente ou valida a configuração da fase SQL." }
  };

  return status ? messages[status] ?? null : null;
}

function getCreateParticipantStatusMessage(status: string | null) {
  const messages: Record<string, { kind: "success" | "error"; text: string }> = {
    criado: { kind: "success", text: "Participante adicionado em rascunho a esta competição." },
    duplicado: { kind: "error", text: "Já existe um participante com esse nome nesta competição." },
    "dados-invalidos": { kind: "error", text: "Não foi possível adicionar o participante: confirma o nome e os campos opcionais." },
    "sem-formato": { kind: "error", text: "Define primeiro o formato competitivo antes de adicionar participantes." },
    "sem-estrutura": { kind: "error", text: "Cria primeiro a estrutura competitiva antes de adicionar participantes." },
    "sem-permissao": { kind: "error", text: "Não tens permissão ativa para adicionar participantes a esta competição." },
    erro: { kind: "error", text: "Não foi possível adicionar o participante. Tenta novamente ou valida a configuração da fase SQL." }
  };

  return status ? messages[status] ?? null : null;
}

function getCreateEventStatusMessage(status: string | null) {
  const messages: Record<string, { kind: "success" | "error"; text: string }> = {
    criado: { kind: "success", text: "Evento criado em rascunho para esta competição." },
    duplicado: { kind: "error", text: "Já existe um evento com esse nome nesta estrutura." },
    "dados-invalidos": { kind: "error", text: "Não foi possível criar o evento: confirma nome, ordem, data/hora e participantes selecionados." },
    "sem-formato": { kind: "error", text: "Define primeiro o formato competitivo antes de criar eventos." },
    "sem-estrutura": { kind: "error", text: "Cria primeiro a estrutura competitiva antes de criar eventos." },
    "sem-participantes": { kind: "error", text: "Adiciona primeiro participantes à competição antes de criar eventos." },
    "participante-invalido": { kind: "error", text: "Só podes associar ao evento participantes já inscritos nesta competição." },
    "sem-permissao": { kind: "error", text: "Não tens permissão ativa para criar eventos nesta competição." },
    erro: { kind: "error", text: "Não foi possível criar o evento. Tenta novamente ou valida a configuração da fase SQL." }
  };

  return status ? messages[status] ?? null : null;
}

function canCreateFormatForCompetition(
  permissions: {
    portal_entity_id: string;
    portal_context_id: string | null;
    portal_competition_id: string | null;
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    status: string;
  }[],
  portalEntityId: string,
  portalContextId: string,
  portalCompetitionId: string
) {
  return permissions.some(
    (permission) =>
      permission.status === "active" &&
      permission.can_view &&
      permission.can_create &&
      permission.can_edit &&
      permission.portal_entity_id === portalEntityId &&
      (!permission.portal_context_id || permission.portal_context_id === portalContextId) &&
      (!permission.portal_competition_id || permission.portal_competition_id === portalCompetitionId)
  );
}

async function createPortalCompetitionFormat(formData: FormData) {
  "use server";

  const supabase = await createPortalEscolasServerClient();

  if (!supabase) {
    redirect(`${PORTAL_ESCOLAS_LOGIN_PATH}?status=not-configured`);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(PORTAL_ESCOLAS_LOGIN_PATH);
  }

  const authorization = await readPortalAuthorization(supabase, user.id);

  if (!authorization.allowed) {
    redirect("/portal-escolas/competicoes?formato=sem-permissao");
  }

  const portalCompetitionId = readFormText(formData, "portal_competition_id");
  const competitionSlug = readFormText(formData, "competition_slug");
  const catalogFormatId = readFormText(formData, "catalog_format_id");

  if (!isUuid(portalCompetitionId) || !isUuid(catalogFormatId) || !competitionSlug) {
    redirect(`/portal-escolas/competicoes/${competitionSlug || "competicao-teste-ui"}?formato=dados-invalidos`);
  }

  const data = await readPortalCompetitionDetail(supabase, authorization, competitionSlug);
  const competition = data.competitions.find((item) => item.id === portalCompetitionId && item.slug === competitionSlug);

  if (!competition || competition.formats.length > 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?formato=duplicado`);
  }

  if (
    !canCreateFormatForCompetition(
      authorization.permissions,
      competition.portalEntityId,
      competition.portalContextId,
      competition.id
    )
  ) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?formato=sem-permissao`);
  }

  const { error } = await supabase.rpc("portal_create_competition_format", {
    p_portal_competition_id: portalCompetitionId,
    p_catalog_format_id: catalogFormatId,
    p_name: null,
    p_code: null,
    p_format_scope: "competition",
    p_format_family: null,
    p_event_model: null,
    p_result_model: null,
    p_ranking_model: null,
    p_notes: null,
    p_status: "draft"
  });

  if (error) {
    const errorCode = typeof error.code === "string" ? error.code : "";
    const errorMessage = typeof error.message === "string" ? error.message.toLowerCase() : "";

    if (errorCode === "23505" || errorMessage.includes("already")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?formato=duplicado`);
    }

    if (errorCode === "42501") {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?formato=sem-permissao`);
    }

    redirect(`/portal-escolas/competicoes/${competitionSlug}?formato=erro`);
  }

  revalidatePath(`/portal-escolas/competicoes/${competitionSlug}`);
  revalidatePath("/portal-escolas/competicoes");
  redirect(`/portal-escolas/competicoes/${competitionSlug}?formato=criado`);
}

async function createPortalCompetitionStructure(formData: FormData) {
  "use server";

  const supabase = await createPortalEscolasServerClient();

  if (!supabase) {
    redirect(`${PORTAL_ESCOLAS_LOGIN_PATH}?status=not-configured`);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(PORTAL_ESCOLAS_LOGIN_PATH);
  }

  const authorization = await readPortalAuthorization(supabase, user.id);

  if (!authorization.allowed) {
    redirect("/portal-escolas/competicoes?estrutura=sem-permissao");
  }

  const portalCompetitionId = readFormText(formData, "portal_competition_id");
  const competitionSlug = readFormText(formData, "competition_slug");

  if (!isUuid(portalCompetitionId) || !competitionSlug) {
    redirect(`/portal-escolas/competicoes/${competitionSlug || ""}?estrutura=dados-invalidos`);
  }

  const data = await readPortalCompetitionDetail(supabase, authorization, competitionSlug);
  const competition = data.competitions.find((item) => item.id === portalCompetitionId && item.slug === competitionSlug);

  if (!competition) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=dados-invalidos`);
  }

  if (competition.formats.length === 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=sem-formato`);
  }

  if (competition.stages.length > 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=duplicada`);
  }

  if (
    !canCreateFormatForCompetition(
      authorization.permissions,
      competition.portalEntityId,
      competition.portalContextId,
      competition.id
    )
  ) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=sem-permissao`);
  }

  const { error } = await supabase.rpc("portal_create_competition_structure", {
    p_portal_competition_id: portalCompetitionId,
    p_name: null,
    p_type: null,
    p_stage_order: null,
    p_scheduled_date: null,
    p_status: "draft"
  });

  if (error) {
    const errorCode = typeof error.code === "string" ? error.code : "";
    const errorMessage = typeof error.message === "string" ? error.message.toLowerCase() : "";

    if (errorCode === "23505" || errorMessage.includes("already")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=duplicada`);
    }

    if (errorMessage.includes("format_required")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=sem-formato`);
    }

    if (errorCode === "42501") {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=sem-permissao`);
    }

    redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=erro`);
  }

  revalidatePath(`/portal-escolas/competicoes/${competitionSlug}`);
  revalidatePath("/portal-escolas/competicoes");
  redirect(`/portal-escolas/competicoes/${competitionSlug}?estrutura=criada`);
}

async function createPortalCompetitionParticipant(formData: FormData) {
  "use server";

  const supabase = await createPortalEscolasServerClient();

  if (!supabase) {
    redirect(`${PORTAL_ESCOLAS_LOGIN_PATH}?status=not-configured`);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(PORTAL_ESCOLAS_LOGIN_PATH);
  }

  const authorization = await readPortalAuthorization(supabase, user.id);

  if (!authorization.allowed) {
    redirect("/portal-escolas/competicoes?participante=sem-permissao");
  }

  const portalCompetitionId = readFormText(formData, "portal_competition_id");
  const competitionSlug = readFormText(formData, "competition_slug");
  const participantName = readFormText(formData, "participant_name");
  const participantType = readFormText(formData, "participant_type") || "team";
  const groupLabel = readFormText(formData, "group_label") || null;
  const notes = readFormText(formData, "notes") || null;
  const seedOrder = readOptionalNonNegativeInteger(formData, "seed_order");

  if (!isUuid(portalCompetitionId) || !competitionSlug || !participantName || Number.isNaN(seedOrder)) {
    redirect(`/portal-escolas/competicoes/${competitionSlug || ""}?participante=dados-invalidos`);
  }

  const allowedTypes = new Set(["team", "group", "individual", "participant"]);

  if (!allowedTypes.has(participantType)) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=dados-invalidos`);
  }

  const data = await readPortalCompetitionDetail(supabase, authorization, competitionSlug);
  const competition = data.competitions.find((item) => item.id === portalCompetitionId && item.slug === competitionSlug);

  if (!competition) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=dados-invalidos`);
  }

  if (competition.formats.length === 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=sem-formato`);
  }

  if (competition.stages.length === 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=sem-estrutura`);
  }

  if (
    !canCreateFormatForCompetition(
      authorization.permissions,
      competition.portalEntityId,
      competition.portalContextId,
      competition.id
    )
  ) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=sem-permissao`);
  }

  const { error } = await supabase.rpc("portal_create_competition_participant", {
    p_portal_competition_id: portalCompetitionId,
    p_name: participantName,
    p_type: participantType,
    p_group_label: groupLabel,
    p_seed_order: seedOrder,
    p_external_reference: null,
    p_notes: notes,
    p_status: "draft",
    p_registration_status: "draft"
  });

  if (error) {
    const errorCode = typeof error.code === "string" ? error.code : "";
    const errorMessage = typeof error.message === "string" ? error.message.toLowerCase() : "";

    if (errorCode === "23505" || errorMessage.includes("already")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=duplicado`);
    }

    if (errorMessage.includes("format_required")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=sem-formato`);
    }

    if (errorMessage.includes("structure_required")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=sem-estrutura`);
    }

    if (errorCode === "42501") {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=sem-permissao`);
    }

    redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=erro`);
  }

  revalidatePath(`/portal-escolas/competicoes/${competitionSlug}`);
  revalidatePath("/portal-escolas/competicoes");
  revalidatePath("/portal-escolas/participantes");
  redirect(`/portal-escolas/competicoes/${competitionSlug}?participante=criado`);
}

async function createPortalCompetitionEvent(formData: FormData) {
  "use server";

  const supabase = await createPortalEscolasServerClient();

  if (!supabase) {
    redirect(`${PORTAL_ESCOLAS_LOGIN_PATH}?status=not-configured`);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(PORTAL_ESCOLAS_LOGIN_PATH);
  }

  const authorization = await readPortalAuthorization(supabase, user.id);

  if (!authorization.allowed) {
    redirect("/portal-escolas/competicoes?evento=sem-permissao");
  }

  const portalCompetitionId = readFormText(formData, "portal_competition_id");
  const portalStageId = readFormText(formData, "portal_stage_id");
  const competitionSlug = readFormText(formData, "competition_slug");
  const eventName = readFormText(formData, "event_name");
  const eventType = readFormText(formData, "event_type") || "match";
  const eventOrder = readOptionalNonNegativeInteger(formData, "event_order");
  const scheduledAtRaw = readFormText(formData, "scheduled_at");
  const venue = readFormText(formData, "venue") || null;
  const notes = readFormText(formData, "notes") || null;
  const participantIds = formData
    .getAll("participant_ids")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    !isUuid(portalCompetitionId) ||
    !isUuid(portalStageId) ||
    !competitionSlug ||
    !eventName ||
    Number.isNaN(eventOrder) ||
    (eventOrder !== null && eventOrder < 1) ||
    participantIds.some((participantId) => !isUuid(participantId))
  ) {
    redirect(`/portal-escolas/competicoes/${competitionSlug || ""}?evento=dados-invalidos`);
  }

  const allowedTypes = new Set(["match", "event"]);

  if (!allowedTypes.has(eventType)) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=dados-invalidos`);
  }

  let scheduledAt: string | null = null;

  if (scheduledAtRaw) {
    const parsedDate = new Date(scheduledAtRaw);

    if (Number.isNaN(parsedDate.getTime())) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=dados-invalidos`);
    }

    scheduledAt = parsedDate.toISOString();
  }

  const data = await readPortalCompetitionDetail(supabase, authorization, competitionSlug);
  const competition = data.competitions.find((item) => item.id === portalCompetitionId && item.slug === competitionSlug);

  if (!competition) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=dados-invalidos`);
  }

  if (competition.formats.length === 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-formato`);
  }

  if (competition.stages.length === 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-estrutura`);
  }

  if (!competition.stages.some((stage) => stage.key === portalStageId)) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=dados-invalidos`);
  }

  if (competition.participants.length === 0) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-participantes`);
  }

  const allowedParticipantIds = new Set(competition.participants.map((participant) => participant.participantId));

  if (participantIds.some((participantId) => !allowedParticipantIds.has(participantId))) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=participante-invalido`);
  }

  if (
    !canCreateFormatForCompetition(
      authorization.permissions,
      competition.portalEntityId,
      competition.portalContextId,
      competition.id
    )
  ) {
    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-permissao`);
  }

  const { error } = await supabase.rpc("portal_create_competition_event", {
    p_portal_competition_id: portalCompetitionId,
    p_name: eventName,
    p_portal_stage_id: portalStageId,
    p_type: eventType,
    p_event_order: eventOrder,
    p_scheduled_at: scheduledAt,
    p_venue: venue,
    p_notes: notes,
    p_participant_ids: participantIds,
    p_status: "draft"
  });

  if (error) {
    const errorCode = typeof error.code === "string" ? error.code : "";
    const errorMessage = typeof error.message === "string" ? error.message.toLowerCase() : "";

    if (errorCode === "23505" || errorMessage.includes("already")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=duplicado`);
    }

    if (errorMessage.includes("format_required")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-formato`);
    }

    if (errorMessage.includes("structure_required")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-estrutura`);
    }

    if (errorMessage.includes("participant_not_registered")) {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=participante-invalido`);
    }

    if (errorCode === "42501") {
      redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=sem-permissao`);
    }

    redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=erro`);
  }

  revalidatePath(`/portal-escolas/competicoes/${competitionSlug}`);
  revalidatePath("/portal-escolas/competicoes");
  revalidatePath("/portal-escolas/eventos");
  redirect(`/portal-escolas/competicoes/${competitionSlug}?evento=criado`);
}

export default async function PortalCompetitionDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const safeSlug = decodeURIComponent(slug ?? "").trim();
  const supabase = await createPortalEscolasServerClient();

  if (!supabase) {
    redirect(`${PORTAL_ESCOLAS_LOGIN_PATH}?status=not-configured`);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(PORTAL_ESCOLAS_LOGIN_PATH);
  }

  const authorization = await readPortalAuthorization(supabase, user.id);

  if (!authorization.allowed) {
    return (
      <main className="portal-competition-detail-shell">
        <style>{competitionDetailStyles}</style>
        <div className="portal-competition-detail-wrap">
          <section className="portal-competition-detail-warning" aria-labelledby="portal-competition-detail-warning-title">
            <p className="portal-competition-detail-eyebrow">Portal das Escolas</p>
            <h1 id="portal-competition-detail-warning-title">Acesso sem autorização ativa</h1>
            <p>{authorization.message}</p>
            <p>A sessão existe, mas o utilizador precisa de estado ativo no Portal e de uma permissão de leitura autorizada.</p>
            <nav className="portal-competition-detail-actions" aria-label="Navegação do Portal das Escolas">
              <a href={PORTAL_ESCOLAS_LOGIN_PATH}>Voltar ao login</a>
              <a href="/portal-escolas">Voltar ao portal</a>
            </nav>
          </section>
        </div>
      </main>
    );
  }

  const data = await readPortalCompetitionDetail(supabase, authorization, safeSlug);
  const mainCompetition = data.competitions[0] ?? null;
  const formatCount = data.competitions.reduce((total, competition) => total + competition.summary.formatCount, 0);
  const stageCount = data.competitions.reduce((total, competition) => total + competition.summary.stageCount, 0);
  const eventCount = data.competitions.reduce((total, competition) => total + competition.summary.eventCount, 0);
  const rankingCount = data.competitions.reduce((total, competition) => total + competition.summary.rankingCount, 0);
  const participantCount = data.competitions.reduce((total, competition) => total + competition.summary.competitionParticipantCount, 0);
  const createFormatStatusMessage = getCreateFormatStatusMessage(readSearchParam(resolvedSearchParams?.formato));
  const createStructureStatusMessage = getCreateStructureStatusMessage(readSearchParam(resolvedSearchParams?.estrutura));
  const createParticipantStatusMessage = getCreateParticipantStatusMessage(readSearchParam(resolvedSearchParams?.participante));
  const createEventStatusMessage = getCreateEventStatusMessage(readSearchParam(resolvedSearchParams?.evento));

  return (
    <main className="portal-competition-detail-shell">
      <style>{competitionDetailStyles}</style>
      <div className="portal-competition-detail-wrap">
        <section className="portal-competition-detail-hero" aria-labelledby="portal-competition-detail-title">
          <div>
            <p className="portal-competition-detail-eyebrow">Portal das Escolas · detalhe da competição</p>
            <h1 id="portal-competition-detail-title">{mainCompetition?.name ?? "Competição não encontrada"}</h1>
            <p className="portal-competition-detail-text">
              Esta é a página central da competição: confirma o âmbito, consulta eventos e resultados, e acompanha a classificação/ranking recalculada a partir dos resultados.
            </p>
          </div>
          <span className="portal-competition-detail-tag">
            {mainCompetition ? `${formatCount} formatos · ${stageCount} estruturas · ${participantCount} participantes · ${eventCount} eventos · ${rankingCount} rankings` : "sem dados"}
          </span>
        </section>

        <PortalEscolasInternalNav current="competicoes" />

        <nav className="portal-competition-detail-actions" aria-label="Ações do detalhe da competição">
          <a href="/portal-escolas/competicoes">Voltar a competições</a>
          <a href={PORTAL_ESCOLAS_PANEL_PATH}>Voltar ao painel</a>
          {mainCompetition ? (
            <>
              <a href={`#portal-competition-events-${mainCompetition.key}`}>Ver eventos e resultados</a>
              <a href={`#portal-competition-rankings-${mainCompetition.key}`}>Ver classificação</a>
              <a href="/portal-escolas/resultados">Inserir/editar resultados</a>
            </>
          ) : null}
        </nav>

        {data.unavailableSections.length > 0 ? (
          <section className="portal-competition-detail-notice" aria-labelledby="portal-competition-detail-notice-title">
            <h2 id="portal-competition-detail-notice-title">Dados parcialmente disponíveis</h2>
            <p>
              Algumas áreas da competição ainda não estão disponíveis para leitura nesta base de dados: {data.unavailableSections.map(formatUnavailableSection).join(", ")}.
            </p>
          </section>
        ) : null}

        {!mainCompetition ? (
          <section className="portal-competition-detail-section" aria-labelledby="portal-competition-detail-empty-title">
            <h2 id="portal-competition-detail-empty-title">Sem competição visível neste âmbito</h2>
            <p className="portal-competition-detail-text">
              Não foi encontrada uma competição com o identificador <strong>{safeSlug || "sem slug"}</strong> dentro das permissões ativas deste utilizador.
            </p>
          </section>
        ) : (
          data.competitions.map((competition) => (
            <section className="portal-competition-detail-section" key={competition.key} aria-labelledby={`portal-competition-${competition.key}`}>
              <div className="portal-competition-detail-section-header">
                <div>
                  <p className="portal-competition-detail-eyebrow">Eixo formal</p>
                  <h2 id={`portal-competition-${competition.key}`}>{competition.name}</h2>
                  <p className="portal-competition-detail-text">
                    Esta leitura não substitui jogos, resultados ou páginas legacy. Apenas mostra a competição como nó intermédio da árvore multidesporto.
                  </p>
                </div>
                <span className="portal-competition-detail-tag">{competition.statusLabel}</span>
              </div>

              <div className="portal-competition-detail-tree" aria-label="Árvore multidesporto da competição">
                <article className="portal-competition-detail-tree-card">
                  <span>Entidade</span>
                  <strong>{competition.entityLabel}</strong>
                </article>
                <article className="portal-competition-detail-tree-card">
                  <span>Contexto</span>
                  <strong>{competition.contextLabel}</strong>
                </article>
                <article className="portal-competition-detail-tree-card">
                  <span>Modalidade</span>
                  <strong>{competition.formalModalityLabel}</strong>
                  {competition.formalModalityHref ? (
                    <a className="portal-competition-detail-link" href={competition.formalModalityHref}>
                      Abrir modalidade
                    </a>
                  ) : null}
                </article>
                <article className="portal-competition-detail-tree-card">
                  <span>Competição</span>
                  <strong>{competition.name}</strong>
                </article>
                <article className="portal-competition-detail-tree-card">
                  <span>Formato</span>
                  <strong>{competition.formats[0]?.name ?? competition.legacyFormatLabel}</strong>
                </article>
                <article className="portal-competition-detail-tree-card">
                  <span>Estrutura competitiva</span>
                  <strong>{formatCountLabel(competition.summary.stageCount, "estrutura", "estruturas")}</strong>
                  <a className="portal-competition-detail-link" href="/portal-escolas/jornadas">
                    Abrir estrutura
                  </a>
                </article>
              </div>

              <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-summary-${competition.key}`}>
                <div className="portal-competition-detail-section-header">
                  <div>
                    <p className="portal-competition-detail-eyebrow">Resumo</p>
                    <h3 id={`portal-competition-summary-${competition.key}`}>Competição formal</h3>
                  </div>
                  <span className="portal-competition-detail-tag">{competition.scopeLabel}</span>
                </div>

                <div className="portal-competition-detail-summary-grid">
                  <article className="portal-competition-detail-summary-card">
                    <span>Modalidade formal</span>
                    <strong>{competition.formalModalityLabel}</strong>
                    <span>Estado da modalidade</span>
                    <strong>{competition.formalModalityStatusLabel}</strong>
                  </article>
                  <article className="portal-competition-detail-summary-card">
                    <span>Catálogo da modalidade</span>
                    <strong>{competition.modalityCatalogLabel}</strong>
                    <span>Código canónico</span>
                    <strong>{competition.modalityCatalogCode ?? "Sem código associado"}</strong>
                  </article>
                  <article className="portal-competition-detail-summary-card">
                    <span>Formato legacy</span>
                    <strong>{competition.legacyFormatLabel}</strong>
                    <span>Modalidade legacy</span>
                    <strong>{competition.legacyModalityLabel}</strong>
                  </article>
                  <article className="portal-competition-detail-summary-card">
                    <span>Slug</span>
                    <strong>{competition.slug ?? "Sem slug"}</strong>
                    <span>Código local da modalidade</span>
                    <strong>{competition.formalModalityLocalCode ?? "Sem código local"}</strong>
                  </article>
                  <article className="portal-competition-detail-summary-card">
                    <span>Estrutura competitiva</span>
                    <strong>{formatCountLabel(competition.summary.stageCount, "estrutura", "estruturas")}</strong>
                    <span>Eventos</span>
                    <strong>{formatCountLabel(competition.summary.eventCount, "evento", "eventos")}</strong>
                  </article>
                  <article className="portal-competition-detail-summary-card">
                    <span>Participantes em eventos</span>
                    <strong>{competition.summary.eventParticipantCount}</strong>
                    <span>Resultados em eventos</span>
                    <strong>{competition.summary.resultEntryCount}</strong>
                  </article>
                  <article className="portal-competition-detail-summary-card">
                    <span>Rankings</span>
                    <strong>{competition.summary.rankingCount} rankings</strong>
                    <span>Linhas de ranking</span>
                    <strong>{competition.summary.rankingEntryCount}</strong>
                  </article>
                </div>
              </section>

              {createFormatStatusMessage ? (
                <p
                  className={`portal-competition-detail-feedback${
                    createFormatStatusMessage.kind === "error" ? " portal-competition-detail-feedback-error" : ""
                  }`}
                >
                  {createFormatStatusMessage.text}
                </p>
              ) : null}

              {competition.formats.length === 0 &&
              competition.status === "draft" &&
              competition.slug &&
              canCreateFormatForCompetition(
                authorization.permissions,
                competition.portalEntityId,
                competition.portalContextId,
                competition.id
              ) ? (
                <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-create-format-${competition.key}`}>
                  <div className="portal-competition-detail-section-header">
                    <div>
                      <p className="portal-competition-detail-eyebrow">Próximo passo</p>
                      <h3 id={`portal-competition-create-format-${competition.key}`}>Definir formato competitivo</h3>
                      <p className="portal-competition-detail-text">
                        Escolhe a mecânica da competição. O Portal preenche os campos técnicos por baixo e mantém tudo em rascunho até validação futura de gatekeeper.
                      </p>
                    </div>
                    <span className="portal-competition-detail-tag">Competição → formato</span>
                  </div>

                  <PortalCompetitionFormatCreateForm
                    action={createPortalCompetitionFormat}
                    portalCompetitionId={competition.id}
                    competitionSlug={competition.slug}
                    competitionName={competition.name}
                    formatOptions={data.formatCatalogOptions}
                  />
                </section>
              ) : null}

              <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-formats-${competition.key}`}>
                <div className="portal-competition-detail-section-header">
                  <div>
                    <p className="portal-competition-detail-eyebrow">Competição → formato</p>
                    <h3 id={`portal-competition-formats-${competition.key}`}>Formatos competitivos</h3>
                    <p className="portal-competition-detail-text">
                      O formato define a mecânica competitiva: tipo de evento, modelo de resultado e modelo de ranking/classificação.
                    </p>
                  </div>
                  <span className="portal-competition-detail-tag">{formatCountLabel(competition.summary.formatCount, "formato", "formatos")}</span>
                </div>

                {competition.formats.length > 0 ? (
                  <div className="portal-competition-detail-format-list">
                    {competition.formats.map((format) => (
                      <article className="portal-competition-detail-format" key={format.key}>
                        <span>Formato escolhido</span>
                        <strong>{format.name}</strong>
                        <div className="portal-competition-detail-meta">
                          <span className="portal-competition-detail-tag">{format.statusLabel}</span>
                        </div>
                        <span>Como será organizada</span>
                        <strong>{format.eventModelLabel} · {format.resultModelLabel} · {format.rankingModelLabel}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="portal-competition-detail-empty">Ainda não existe formato formal disponível para esta competição neste âmbito autorizado.</p>
                )}
              </section>

              {createStructureStatusMessage ? (
                <p
                  className={`portal-competition-detail-feedback${
                    createStructureStatusMessage.kind === "error" ? " portal-competition-detail-feedback-error" : ""
                  }`}
                >
                  {createStructureStatusMessage.text}
                </p>
              ) : null}

              {competition.formats.length > 0 &&
              competition.stages.length === 0 &&
              competition.status === "draft" &&
              competition.slug &&
              canCreateFormatForCompetition(
                authorization.permissions,
                competition.portalEntityId,
                competition.portalContextId,
                competition.id
              ) ? (
                <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-create-structure-${competition.key}`}>
                  <div className="portal-competition-detail-section-header">
                    <div>
                      <p className="portal-competition-detail-eyebrow">Próximo passo</p>
                      <h3 id={`portal-competition-create-structure-${competition.key}`}>Criar estrutura competitiva</h3>
                      <p className="portal-competition-detail-text">
                        O Portal cria a primeira camada de organização da competição. Para este formato, a estrutura sugerida é uma fase regular organizada por jornadas.
                      </p>
                    </div>
                    <span className="portal-competition-detail-tag">Formato → estrutura</span>
                  </div>

                  <PortalCompetitionStructureCreateForm
                    action={createPortalCompetitionStructure}
                    portalCompetitionId={competition.id}
                    competitionSlug={competition.slug}
                    competitionName={competition.name}
                    formatName={competition.formats[0]?.name ?? "Formato competitivo definido"}
                  />
                </section>
              ) : null}

              <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-stages-${competition.key}`}>
                <div className="portal-competition-detail-section-header">
                  <div>
                    <p className="portal-competition-detail-eyebrow">Formato → estrutura competitiva</p>
                    <h3 id={`portal-competition-stages-${competition.key}`}>Estrutura competitiva</h3>
                    <p className="portal-competition-detail-text">
                      A estrutura organiza a competição antes dos eventos: jornadas, fases, rondas, séries, grupos, provas ou etapas. A rota /portal-escolas/jornadas mantém o nome por compatibilidade, mas aqui é lida como camada genérica.
                    </p>
                  </div>
                  <span className="portal-competition-detail-tag">{formatCountLabel(competition.summary.stageCount, "estrutura", "estruturas")}</span>
                </div>

                {competition.stages.length > 0 ? (
                  <div className="portal-competition-detail-stage-list">
                    {competition.stages.map((stage) => (
                      <article className="portal-competition-detail-stage" key={stage.key}>
                        <span>Estrutura escolhida</span>
                        <strong>{stage.name}</strong>
                        <div className="portal-competition-detail-meta">
                          <span className="portal-competition-detail-tag">{stage.statusLabel}</span>
                        </div>
                        <span>Eventos nesta estrutura</span>
                        <strong>{formatCountLabel(stage.eventCount, "evento", "eventos")}</strong>
                        <span>Participantes · resultados</span>
                        <strong>{stage.participantCount} participantes · {stage.resultEntryCount} resultados</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="portal-competition-detail-empty">Ainda não existe estrutura competitiva formal disponível para esta competição neste âmbito autorizado.</p>
                )}
              </section>

              {createParticipantStatusMessage ? (
                <p
                  className={`portal-competition-detail-feedback${
                    createParticipantStatusMessage.kind === "error" ? " portal-competition-detail-feedback-error" : ""
                  }`}
                >
                  {createParticipantStatusMessage.text}
                </p>
              ) : null}

              {competition.formats.length > 0 &&
              competition.stages.length > 0 &&
              competition.status === "draft" &&
              competition.slug &&
              canCreateFormatForCompetition(
                authorization.permissions,
                competition.portalEntityId,
                competition.portalContextId,
                competition.id
              ) ? (
                <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-create-participant-${competition.key}`}>
                  <div className="portal-competition-detail-section-header">
                    <div>
                      <p className="portal-competition-detail-eyebrow">Próximo passo</p>
                      <h3 id={`portal-competition-create-participant-${competition.key}`}>Adicionar participantes</h3>
                      <p className="portal-competition-detail-text">
                        Adiciona turmas, equipas, alunos ou grupos à competição. O Portal mantém o participante e a inscrição em rascunho até validação futura de gatekeeper.
                      </p>
                    </div>
                    <span className="portal-competition-detail-tag">Estrutura → participantes</span>
                  </div>

                  <PortalCompetitionParticipantCreateForm
                    action={createPortalCompetitionParticipant}
                    portalCompetitionId={competition.id}
                    competitionSlug={competition.slug}
                    competitionName={competition.name}
                  />
                </section>
              ) : null}

              <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-participants-${competition.key}`}>
                <div className="portal-competition-detail-section-header">
                  <div>
                    <p className="portal-competition-detail-eyebrow">Estrutura competitiva → participantes</p>
                    <h3 id={`portal-competition-participants-${competition.key}`}>Participantes da competição</h3>
                    <p className="portal-competition-detail-text">
                      Lista de participantes inscritos na competição. Ainda não cria eventos, resultados ou rankings.
                    </p>
                  </div>
                  <span className="portal-competition-detail-tag">{formatCountLabel(competition.summary.competitionParticipantCount, "participante", "participantes")}</span>
                </div>

                {competition.participants.length > 0 ? (
                  <div className="portal-competition-detail-participant-list">
                    {competition.participants.map((participant) => (
                      <article className="portal-competition-detail-participant" key={participant.key}>
                        <span>Participante</span>
                        <strong>{participant.name}</strong>
                        <div className="portal-competition-detail-meta">
                          <span className="portal-competition-detail-tag">{participant.typeLabel}</span>
                          <span className="portal-competition-detail-tag">Participante: {participant.statusLabel}</span>
                          <span className="portal-competition-detail-tag">Inscrição: {participant.registrationStatusLabel}</span>
                        </div>
                        <span>Grupo/série</span>
                        <strong>{participant.groupLabel ?? "Sem grupo/série"}</strong>
                        <span>Ordem</span>
                        <strong>{participant.seedOrderLabel}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="portal-competition-detail-empty">Ainda não existem participantes associados a esta competição.</p>
                )}
              </section>

              {createEventStatusMessage ? (
                <p
                  className={`portal-competition-detail-feedback${
                    createEventStatusMessage.kind === "error" ? " portal-competition-detail-feedback-error" : ""
                  }`}
                >
                  {createEventStatusMessage.text}
                </p>
              ) : null}

              {competition.formats.length > 0 &&
              competition.stages.length > 0 &&
              competition.participants.length > 0 &&
              competition.status === "draft" &&
              competition.slug &&
              canCreateFormatForCompetition(
                authorization.permissions,
                competition.portalEntityId,
                competition.portalContextId,
                competition.id
              ) ? (
                <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-create-event-${competition.key}`}>
                  <div className="portal-competition-detail-section-header">
                    <div>
                      <p className="portal-competition-detail-eyebrow">Próximo passo</p>
                      <h3 id={`portal-competition-create-event-${competition.key}`}>Criar evento/jornada</h3>
                      <p className="portal-competition-detail-text">
                        Cria a unidade concreta onde depois serão inseridos resultados: jornada, jogo, prova, partida, série ou final. O evento fica em rascunho e a publicação continua dependente de gatekeeper.
                      </p>
                    </div>
                    <span className="portal-competition-detail-tag">Participantes → eventos</span>
                  </div>

                  <PortalCompetitionEventCreateForm
                    action={createPortalCompetitionEvent}
                    portalCompetitionId={competition.id}
                    portalStageId={competition.stages[0]?.key ?? ""}
                    competitionSlug={competition.slug}
                    competitionName={competition.name}
                    stageName={competition.stages[0]?.name ?? "Estrutura competitiva"}
                    participantOptions={competition.participants}
                  />
                </section>
              ) : null}

              <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-events-${competition.key}`}>
                <div className="portal-competition-detail-section-header">
                  <div>
                    <p className="portal-competition-detail-eyebrow">Estrutura competitiva → eventos</p>
                    <h3 id={`portal-competition-events-${competition.key}`}>Eventos, participantes e resultados</h3>
                    <p className="portal-competition-detail-text">
                      Cada evento mostra os participantes e os resultados já guardados. Nos campeonatos por jornadas são jogos; noutras modalidades podem ser provas, partidas, séries ou finais.
                    </p>
                    <ul className="portal-competition-detail-result-guide" aria-label="Como ler resultados nesta competição">
                      <li>
                        <span>Evento</span>
                        <strong>A unidade concreta onde se produz o resultado.</strong>
                      </li>
                      <li>
                        <span>Resultado</span>
                        <strong>Valor por participante: marcador, tempo, marca, pontos ou sets.</strong>
                      </li>
                      <li>
                        <span>Pontos/desfecho</span>
                        <strong>O registo técnico usado para alimentar a classificação.</strong>
                      </li>
                    </ul>
                  </div>
                  <span className="portal-competition-detail-tag">{formatCountLabel(competition.summary.eventCount, "evento", "eventos")}</span>
                </div>

                {competition.events.length > 0 ? (
                  <div className="portal-competition-detail-event-list">
                    {competition.events.map((event) => (
                      <article className="portal-competition-detail-event" key={event.key}>
                        <div className="portal-competition-detail-section-header">
                          <div>
                            <span>{event.stageLabel}</span>
                            <h3>{event.name}</h3>
                          </div>
                          <span className="portal-competition-detail-tag">{event.statusLabel}</span>
                        </div>
                        <div className="portal-competition-detail-meta">
                          <span className="portal-competition-detail-tag">{event.typeLabel}</span>
                          <span className="portal-competition-detail-tag">{formatDateTime(event.scheduledAt)}</span>
                          <span className="portal-competition-detail-tag">{event.venue ?? "Sem local"}</span>
                        </div>
                        <span>Participantes</span>
                        <strong>{event.participantLabels.length > 0 ? event.participantLabels.join(" · ") : "Sem participantes associados"}</strong>
                        {event.resultEntries.length > 0 ? (
                          <div className="portal-competition-detail-table-wrap">
                            <table className="portal-competition-detail-table">
                              <thead>
                                <tr>
                                  <th>Participante</th>
                                  <th>Resultado</th>
                                  <th>Pontos</th>
                                  <th>Desfecho</th>
                                </tr>
                              </thead>
                              <tbody>
                                {event.resultEntries.map((entry) => (
                                  <tr key={entry.key}>
                                    <td>{entry.participantLabel}</td>
                                    <td>{entry.scoreLabel}</td>
                                    <td>{entry.pointsLabel}</td>
                                    <td>{entry.isWinner ? `${entry.outcomeLabel} · vencedor` : entry.outcomeLabel}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="portal-competition-detail-empty">Este evento ainda não tem entradas de resultado no modelo novo.</p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="portal-competition-detail-empty">Ainda não existem eventos formais disponíveis para esta competição neste âmbito autorizado.</p>
                )}
              </section>

              <section className="portal-competition-detail-section" aria-labelledby={`portal-competition-rankings-${competition.key}`}>
                <div className="portal-competition-detail-section-header">
                  <div>
                    <p className="portal-competition-detail-eyebrow">Resultados → ranking</p>
                    <h3 id={`portal-competition-rankings-${competition.key}`}>Classificação / ranking</h3>
                    <p className="portal-competition-detail-text">
                      A classificação é recalculada a partir dos resultados guardados para os eventos desta competição. Depois de guardar um resultado, esta tabela reflete automaticamente pontos, jogos/provas, registo e marcador acumulado.
                    </p>
                    <ul className="portal-competition-detail-ranking-guide" aria-label="Como interpretar a classificação">
                      <li>
                        <span>Pontos</span>
                        <strong>Total competitivo calculado pelos resultados dos eventos.</strong>
                      </li>
                      <li>
                        <span>Registo</span>
                        <strong>Vitórias-empates-derrotas quando o formato usa classificação tipo campeonato.</strong>
                      </li>
                      <li>
                        <span>Marcador</span>
                        <strong>Resultado acumulado e diferença usada como critério de ordenação.</strong>
                      </li>
                    </ul>
                  </div>
                  <span className="portal-competition-detail-tag">{formatCountLabel(competition.summary.rankingCount, "ranking", "rankings")}</span>
                </div>

                {competition.rankings.length > 0 ? (
                  <div className="portal-competition-detail-ranking-list">
                    {competition.rankings.map((ranking) => (
                      <article className="portal-competition-detail-ranking" key={ranking.key}>
                        <div className="portal-competition-detail-section-header">
                          <div>
                            <span>{ranking.rankingScopeLabel}</span>
                            <h3>{ranking.name}</h3>
                          </div>
                          <span className="portal-competition-detail-tag">{ranking.statusLabel}</span>
                        </div>
                        <div className="portal-competition-detail-meta">
                          <span className="portal-competition-detail-tag">{ranking.rankingTypeLabel}</span>
                          <span className="portal-competition-detail-tag">{formatCountLabel(ranking.rows.length, "linha", "linhas")}</span>
                        </div>
                        {ranking.rows.length > 0 ? (
                          <div className="portal-competition-detail-table-wrap">
                            <table className="portal-competition-detail-table">
                              <thead>
                                <tr>
                                  <th>Posição</th>
                                  <th>Participante</th>
                                  <th>Pontos</th>
                                  <th>Jogos/provas</th>
                                  <th>Registo</th>
                                  <th>Marcador</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ranking.rows.map((row) => (
                                  <tr key={row.key}>
                                    <td>{row.rankLabel}</td>
                                    <td>{row.participantLabel}</td>
                                    <td>{row.pointsLabel}</td>
                                    <td>{row.playedLabel}</td>
                                    <td>{row.recordLabel}</td>
                                    <td>{row.scoreLabel}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="portal-competition-detail-empty">Este ranking ainda não tem linhas disponíveis.</p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="portal-competition-detail-empty">Ainda não existe ranking formal disponível para esta competição neste âmbito autorizado.</p>
                )}
              </section>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
