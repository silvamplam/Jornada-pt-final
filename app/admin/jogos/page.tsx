import type { ReactNode } from "react";
import { getAdminMatchesEditor, type SupabaseAdminMatch, type SupabaseBroadcastChannel } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const matchAdminStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .match-admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .match-admin-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #10151b, #25303c);
    color: #ffffff;
    box-shadow: 0 18px 40px rgba(8, 15, 24, 0.16);
  }

  .match-admin-hero p,
  .match-admin-hero h1,
  .match-admin-hero span {
    margin: 0;
  }

  .match-admin-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .match-admin-hero h1 {
    margin-top: 8px;
    font-size: 42px;
    line-height: 1;
  }

  .match-admin-hero span {
    display: block;
    margin-top: 10px;
    color: #cdd5df;
    font-size: 16px;
  }

  .match-admin-hero a {
    flex: 0 0 auto;
    padding: 11px 16px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .match-admin-message {
    margin-top: 18px;
    padding: 16px 18px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .match-admin-message.warning {
    border-color: #ffd3a3;
    background: #fff8ee;
    color: #8a3a00;
  }

  .match-admin-message.success {
    border-color: #bfe4c9;
    background: #f0fbf3;
    color: #146b2c;
  }

  .match-admin-create,
  .match-admin-list {
    margin-top: 18px;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .match-admin-create header,
  .match-admin-list header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
  }

  .match-admin-create h2,
  .match-admin-list h2 {
    margin: 0;
    font-size: 21px;
    text-transform: uppercase;
  }

  .match-admin-create small,
  .match-admin-list small {
    color: #687380;
  }

  .match-admin-create .match-create-form {
    display: none;
  }

  .match-create-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
    align-items: end;
    padding: 16px 18px;
  }

  .match-form {
    display: grid;
    grid-template-columns: minmax(250px, 310px) minmax(0, 860px);
    justify-content: start;
    column-gap: 16px;
    row-gap: 10px;
    align-items: start;
    padding: 14px 18px;
    border-bottom: 1px solid #eef2f6;
  }

  .match-form:last-child {
    border-bottom: 0;
  }

  .match-card {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .match-card strong {
    font-size: 15px;
  }

  .match-card small {
    color: #687380;
  }

  .match-teams {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
    font-weight: 900;
  }

  .match-teams img {
    display: block;
    width: 24px !important;
    max-width: 24px !important;
    height: 24px !important;
    max-height: 24px !important;
    object-fit: contain;
  }

  .match-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 10px;
    align-items: end;
    max-width: 860px;
  }

  .match-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .match-field label {
    color: #687380;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .match-field input,
  .match-field select {
    width: 100%;
    box-sizing: border-box;
    min-height: 39px;
    padding: 9px 10px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    background: #ffffff;
    font: inherit;
    font-size: 14px;
  }

  .match-field select {
    min-width: 0;
    text-overflow: ellipsis;
  }

  .match-field input:focus,
  .match-field select:focus {
    outline: 2px solid rgba(229, 37, 42, 0.16);
    border-color: #e5252a;
  }

  .match-helper {
    align-self: center;
    color: #687380;
    font-size: 11px;
    line-height: 1.3;
  }

  .match-helper.warning {
    color: #9a3412;
    font-weight: 800;
  }

  .match-score-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .match-channel-preview {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .match-channel-preview figure {
    display: grid;
    place-items: center;
    width: 42px;
    height: 32px;
    margin: 0;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    background: #f8fafc;
    color: #5e6874;
    font-size: 10px;
    font-weight: 900;
  }

  .match-channel-preview img {
    display: block;
    width: 34px !important;
    max-width: 34px !important;
    height: 22px !important;
    max-height: 22px !important;
    object-fit: contain;
  }

  .match-sync-badge {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    padding: 6px 8px;
    border: 1px solid #dce3eb;
    border-radius: 999px;
    background: #ffffff;
    color: #44505c;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .match-sync-badge.api {
    border-color: #b9ddff;
    background: #eef7ff;
    color: #0b5fa5;
  }

  .match-sync-badge.mixed,
  .match-sync-badge.override {
    border-color: #ffd3a3;
    background: #fff8ee;
    color: #8a3a00;
  }

  .match-sync-time {
    color: #687380;
    font-size: 11px;
  }

  .match-admin-button {
    width: 100%;
    min-height: 39px;
    padding: 10px 12px;
    border: 0;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font: inherit;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    cursor: pointer;
  }

  .match-admin-button:disabled,
  .match-field input:disabled,
  .match-field select:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  @media (max-width: 1500px) {
    .match-form {
      grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
    }

    .match-fields {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      max-width: none;
    }
  }

  @media (max-width: 980px) {
    .match-form {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .match-admin-shell {
      padding: 16px;
    }

    .match-admin-hero,
    .match-fields,
    .match-create-form {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
`;

type AdminMatchesPageProps = {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
  }>;
};

type AdminMatchesOverview = Awaited<ReturnType<typeof getAdminMatchesEditor>>;

const statusOptions = [
  { value: "scheduled", label: "Agendado" },
  { value: "live", label: "Em direto" },
  { value: "halftime", label: "Intervalo" },
  { value: "finished", label: "Finalizado" }
];

function errorMessage(error?: string) {
  if (error === "missing-service") {
    return "Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel para gravar alteracoes.";
  }

  if (error === "missing-fields") {
    return "Competicao, epoca, equipas e data sao obrigatorias.";
  }

  if (error === "save") {
    return "Nao foi possivel guardar o jogo. Confirma se todos os campos obrigatorios estao bem preenchidos.";
  }

  if (error === "season-competition-mismatch") {
    return "A epoca escolhida nao pertence a essa competicao. Escolhe primeiro a competicao certa e depois uma epoca dessa competicao.";
  }

  if (error === "matchday-season-mismatch") {
    return "A jornada escolhida nao pertence a essa epoca. Escolhe uma jornada da mesma epoca do jogo.";
  }

  if (error === "missing-season" || error === "missing-matchday") {
    return "Nao foi possivel confirmar a epoca ou jornada escolhida. Reve o contexto do jogo antes de guardar.";
  }

  if (error === "missing-season-participants") {
    return "Esta epoca ainda nao tem participantes. Vai a Participantes, adiciona os clubes dessa epoca e depois cria os jogos.";
  }

  if (error === "team-not-in-season") {
    return "Casa e Fora so podem ser clubes que estao nos participantes da epoca escolhida.";
  }

  if (error === "same-team") {
    return "Casa e Fora nao podem ser o mesmo clube.";
  }

  return null;
}

function formatCivilDate(value: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function formatDateTimeInput(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);

  return parts.replace(" ", "T");
}

function scoreValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function selectField(
  id: string,
  label: string,
  name: string,
  defaultValue: string | null | undefined,
  children: ReactNode,
  disabled: boolean,
  required = false
) {
  return (
    <div className="match-field">
      <label htmlFor={id}>{label}</label>
      <select disabled={disabled} id={id} name={name} defaultValue={defaultValue ?? ""} required={required}>
        {children}
      </select>
    </div>
  );
}

function textField(
  id: string,
  label: string,
  name: string,
  defaultValue: string,
  disabled: boolean,
  type = "text",
  required = false
) {
  return (
    <div className="match-field">
      <label htmlFor={id}>{label}</label>
      <input disabled={disabled} id={id} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}

function channelPreview(channel: SupabaseBroadcastChannel | null) {
  return (
    <div className="match-channel-preview">
      <figure>{channel?.logo_url ? <img alt="" src={channel.logo_url} /> : "TV"}</figure>
      <span>
        <strong>{channel?.name ?? "Sem canal"}</strong>
        <br />
        <small>{channel?.platform ?? "Por definir"}</small>
      </span>
    </div>
  );
}

function formatSyncTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function sourceBadge(match: SupabaseAdminMatch, syncMetadataAvailable: boolean) {
  if (!syncMetadataAvailable) {
    return null;
  }

  const source = match.data_source ?? "manual";
  const isOverride = Boolean(match.manual_override);
  const label = isOverride
    ? "Corrigido pelo administrador"
    : source === "api"
      ? "Sincronizado por API"
      : source === "mixed"
        ? "Dados mistos"
        : "Introduzido manualmente";
  const lastSync = formatSyncTime(match.last_synced_at);
  const provider = match.external_provider ? `Fonte: ${match.external_provider}` : null;

  return (
    <>
      <span className={`match-sync-badge ${isOverride ? "override" : source}`}>{label}</span>
      {provider ? <span className="match-sync-time">{provider}</span> : null}
      {lastSync ? <span className="match-sync-time">Ultima sincronizacao: {lastSync}</span> : null}
    </>
  );
}

function teamOptions(
  overview: AdminMatchesOverview,
  seasonIdsByTeam: Map<string, string[]>,
  currentTeamId?: string | null
) {
  return overview.teams.map((team) => (
    <option
      data-current-team={team.id === currentTeamId ? "1" : ""}
      data-season-ids={seasonIdsByTeam.get(team.id)?.join(",") ?? ""}
      key={team.id}
      value={team.id}
    >
      {team.name}
    </option>
  ));
}

function renderMatchFields(
  match: SupabaseAdminMatch,
  overview: AdminMatchesOverview,
  canWrite: boolean
) {
  return (
    <>
      <input name="source_key" type="hidden" defaultValue={match.source_key ?? ""} />
      {overview.syncMetadataAvailable ? (
        <>
          <input name="sync_metadata_available" type="hidden" value="1" />
          <input name="current_data_source" type="hidden" value={match.data_source ?? "manual"} />
        </>
      ) : null}
      {selectField(
        `competition-${match.id}`,
        "Competicao",
        "competition_id",
        match.competition_id,
        overview.competitions.map((competition) => (
          <option key={competition.id} value={competition.id}>
            {competition.name}
          </option>
        )),
        !canWrite,
        true
      )}
      {selectField(
        `season-${match.id}`,
        "Epoca",
        "season_id",
        match.season_id,
        overview.seasons.map((season) => {
          const competition = overview.competitions.find((item) => item.id === season.competition_id);

          return (
            <option data-competition-id={season.competition_id} key={season.id} value={season.id}>
              {competition?.name ?? "Competicao"} {season.label}
            </option>
          );
        }),
        !canWrite,
        true
      )}
      {selectField(
        `matchday-${match.id}`,
        "Jornada",
        "matchday_id",
        match.matchday_id,
        <>
          <option value="">Sem jornada</option>
          {overview.matchdays.map((matchday) => {
            const season = overview.seasons.find((item) => item.id === matchday.season_id);
            const competition = season ? overview.competitions.find((item) => item.id === season.competition_id) : null;

            return (
              <option data-season-id={matchday.season_id} key={matchday.id} value={matchday.id}>
                {competition?.name ?? "Competicao"} J{String(matchday.number).padStart(2, "0")}
              </option>
            );
          })}
        </>,
        !canWrite
      )}
      {textField(`kickoff-${match.id}`, "Data e hora", "kickoff_at", formatDateTimeInput(match.kickoff_at), !canWrite, "datetime-local", true)}
      {!match.kickoff_at ? (match.scheduled_date ? (
        <small className="match-helper">Data: {formatCivilDate(match.scheduled_date)} · Hora por definir</small>
      ) : (
        <small className="match-helper">Data e hora por definir</small>
      )) : null}
      {selectField(
        `status-${match.id}`,
        "Estado",
        "status",
        match.status,
        statusOptions.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        )),
        !canWrite,
        true
      )}
      {textField(`minute-${match.id}`, "Minuto", "minute", scoreValue(match.minute), !canWrite, "number")}
      <div className="match-field">
        <label>Resultado</label>
        <div className="match-score-fields">
          <input disabled={!canWrite} name="home_score" type="number" defaultValue={scoreValue(match.home_score)} aria-label="Golos casa" />
          <input disabled={!canWrite} name="away_score" type="number" defaultValue={scoreValue(match.away_score)} aria-label="Golos fora" />
        </div>
      </div>
      {textField(`venue-${match.id}`, "Estadio", "venue", match.venue ?? "", !canWrite)}
      {selectField(
        `broadcast-${match.id}`,
        "Onde se ve",
        "broadcast_channel_id",
        match.broadcast_channel_id,
        <>
          <option value="">Sem canal</option>
          {overview.broadcastChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </>,
        !canWrite
      )}
    </>
  );
}

export default async function AdminMatchesPage({ searchParams }: AdminMatchesPageProps) {
  const params = await searchParams;
  const overview = await getAdminMatchesEditor();
  const message = errorMessage(params.error);
  const canWrite = false;
  const seasonIdsByTeam = overview.seasonTeams.reduce<Map<string, string[]>>((map, participant) => {
    if (participant.status === "inactive") {
      return map;
    }

    const seasonIds = map.get(participant.team_id) ?? [];
    seasonIds.push(participant.season_id);
    map.set(participant.team_id, seasonIds);
    return map;
  }, new Map());
  return (
    <main className="match-admin-shell">
      <style>{matchAdminStyles}</style>
      <header className="match-admin-hero">
        <div>
          <p>Jornada.pt</p>
          <h1>Jogos</h1>
          <span>Consulta tecnica de jogos. A gestao operacional deve ser feita no Centro de gestao.</span>
        </div>
        <a href="/admin/gestor">Abrir Centro de gestao</a>
      </header>

      <section className="match-admin-message warning">
        Esta pagina e tecnica/legada. A gestao operacional de jogos deve ser feita no Centro de gestao.
      </section>
      {!overview.configured ? <section className="match-admin-message warning">Falta configurar a ligacao ao Supabase.</section> : null}
      {!overview.writeConfigured ? (
        <section className="match-admin-message warning">
          Modo leitura ativo. Para editar, adiciona a variavel SUPABASE_SERVICE_ROLE_KEY na Vercel.
        </section>
      ) : null}
      {overview.error ? <section className="match-admin-message warning">{overview.error}</section> : null}
      {message ? <section className="match-admin-message warning">{message}</section> : null}
      {params.created ? <section className="match-admin-message success">Jogo criado.</section> : null}
      {params.updated ? <section className="match-admin-message success">Jogo atualizado.</section> : null}

      <section className="match-admin-create">
        <header>
          <h2>Criacao de jogos desativada</h2>
          <small>Esta pagina ficou apenas para consulta tecnica. Cria e gere jogos no Centro de gestao.</small>
        </header>
        <form action="/api/admin/matches" className="match-create-form" method="post">
          {overview.syncMetadataAvailable ? <input name="sync_metadata_available" type="hidden" value="1" /> : null}
          {selectField(
            "new-competition",
            "Competicao",
            "competition_id",
            "",
            overview.competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            )),
            !canWrite,
            true
          )}
          {selectField(
            "new-season",
            "Epoca",
            "season_id",
            "",
            overview.seasons.map((season) => {
              const competition = overview.competitions.find((item) => item.id === season.competition_id);

              return (
                <option data-competition-id={season.competition_id} key={season.id} value={season.id}>
                  {competition?.name ?? "Competicao"} {season.label}
                </option>
              );
            }),
            !canWrite,
            true
          )}
          {selectField(
            "new-matchday",
            "Jornada",
            "matchday_id",
            undefined,
            overview.matchdays.map((matchday) => {
              const season = overview.seasons.find((item) => item.id === matchday.season_id);
              const competition = season ? overview.competitions.find((item) => item.id === season.competition_id) : null;

              return (
                <option data-season-id={matchday.season_id} key={matchday.id} value={matchday.id}>
                  {competition?.name ?? "Competicao"} J{String(matchday.number).padStart(2, "0")}
                </option>
              );
            }),
            !canWrite
          )}
          {selectField(
            "new-home",
            "Casa",
            "home_team_id",
            "",
            <>
              <option value="">Escolhe equipa</option>
              {teamOptions(overview, seasonIdsByTeam)}
            </>,
            !canWrite,
            true
          )}
          {selectField(
            "new-away",
            "Fora",
            "away_team_id",
            "",
            <>
              <option value="">Escolhe equipa</option>
              {teamOptions(overview, seasonIdsByTeam)}
            </>,
            !canWrite,
            true
          )}
          <small className="match-helper" id="new-team-context-helper">
            Os clubes do jogo vêm dos participantes da época escolhida.
          </small>
          {textField("new-kickoff", "Data e hora", "kickoff_at", "", !canWrite, "datetime-local", true)}
          <button className="match-admin-button" disabled={!canWrite} type="submit">Criar</button>
        </form>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const competition = document.getElementById("new-competition");
                const season = document.getElementById("new-season");
                const matchday = document.getElementById("new-matchday");
                const home = document.getElementById("new-home");
                const away = document.getElementById("new-away");
                const helper = document.getElementById("new-team-context-helper");
                const submit = home?.closest("form")?.querySelector('button[type="submit"]');

                if (!competition || !season || !matchday || !home || !away || !helper || !submit) return;

                const homeBaseDisabled = home.disabled;
                const awayBaseDisabled = away.disabled;
                const submitBaseDisabled = submit.disabled;

                function firstVisibleOption(select) {
                  return Array.from(select.options).find((option) => !option.hidden && !option.disabled && option.style.display !== "none");
                }

                function seasonIds(option) {
                  return (option.dataset.seasonIds || "").split(",").filter(Boolean);
                }

                function setOptionVisible(option, visible) {
                  option.hidden = !visible;
                  option.disabled = !visible;
                  option.style.display = visible ? "" : "none";
                }

                function visibleTeamCount(select) {
                  return Array.from(select.options).filter((option) => option.value && !option.hidden && !option.disabled && option.style.display !== "none").length;
                }

                function syncTeamSelect(select, seasonId) {
                  Array.from(select.options).forEach((option) => {
                    setOptionVisible(option, Boolean(option.value && seasonIds(option).includes(seasonId)));
                  });

                  if (!select.value || select.selectedOptions[0]?.hidden || select.selectedOptions[0]?.disabled) {
                    const first = firstVisibleOption(select);
                    select.value = first ? first.value : "";
                  }

                  const hasParticipants = Boolean(firstVisibleOption(select));
                  select.disabled = (select === home ? homeBaseDisabled : awayBaseDisabled) || !hasParticipants;
                  return hasParticipants;
                }

                function avoidSameTeams() {
                  if (!home.value || !away.value || home.value !== away.value) return;

                  const replacement = Array.from(away.options).find((option) => !option.hidden && !option.disabled && option.value !== home.value);
                  if (replacement) away.value = replacement.value;
                }

                function syncTeams() {
                  const seasonId = season.value;
                  const homeHasParticipants = syncTeamSelect(home, seasonId);
                  const awayHasParticipants = syncTeamSelect(away, seasonId);
                  const count = visibleTeamCount(home);
                  avoidSameTeams();

                  const canCreateMatch = homeHasParticipants && awayHasParticipants && count >= 2;
                  submit.disabled = submitBaseDisabled || !canCreateMatch;

                  if (!homeHasParticipants || !awayHasParticipants) {
                    helper.textContent = "Esta epoca ainda nao tem participantes. Define os participantes antes de criar jogos.";
                    helper.className = "match-helper warning";
                    return;
                  }

                  if (count < 2) {
                    helper.textContent = "Esta epoca precisa de pelo menos dois participantes para criar jogos.";
                    helper.className = "match-helper warning";
                    return;
                  }

                  helper.textContent = "Equipas filtradas pelos participantes da epoca escolhida.";
                  helper.className = "match-helper";
                }

                function syncMatchdays() {
                  const seasonId = season.value;
                  Array.from(matchday.options).forEach((option) => {
                    setOptionVisible(option, option.dataset.seasonId ? option.dataset.seasonId === seasonId : true);
                  });

                  if (matchday.selectedOptions[0]?.hidden) {
                    const first = firstVisibleOption(matchday);
                    if (first) matchday.value = first.value;
                  }
                }

                function syncSeasons() {
                  const competitionId = competition.value;
                  Array.from(season.options).forEach((option) => {
                    setOptionVisible(option, option.dataset.competitionId ? option.dataset.competitionId === competitionId : true);
                  });

                  if (season.selectedOptions[0]?.hidden) {
                    const first = firstVisibleOption(season);
                    if (first) season.value = first.value;
                  }

                  syncMatchdays();
                  syncTeams();
                }

                competition.addEventListener("change", syncSeasons);
                season.addEventListener("change", () => {
                  syncMatchdays();
                  syncTeams();
                });
                home.addEventListener("change", avoidSameTeams);
                away.addEventListener("change", avoidSameTeams);
                syncSeasons();
              })();
            `
          }}
        />
      </section>

      <section className="match-admin-list">
        <header>
          <h2>Jogos existentes</h2>
          <small>{overview.matches.length} jogos na base de dados</small>
        </header>

        {overview.matches.map((match) => (
          <form action={`/api/admin/matches/${match.id}`} className="match-form" key={match.id} method="post">
            <div className="match-card">
              <strong>{match.competition?.name ?? "Competicao"}</strong>
              <div className="match-teams">
                {match.homeTeam?.logo_url ? <img alt="" src={match.homeTeam.logo_url} /> : null}
                <span>{match.homeTeam?.name ?? "Casa"}</span>
                <span>x</span>
                {match.awayTeam?.logo_url ? <img alt="" src={match.awayTeam.logo_url} /> : null}
                <span>{match.awayTeam?.name ?? "Fora"}</span>
              </div>
              <small>
                {match.matchday?.label ?? "Sem jornada"} · {match.season?.label ?? "Epoca"}
              </small>
              {sourceBadge(match, overview.syncMetadataAvailable)}
              {channelPreview(match.broadcastChannel)}
            </div>

            <div className="match-fields">
              {selectField(
                `home-${match.id}`,
                "Casa",
                "home_team_id",
                match.home_team_id,
                teamOptions(overview, seasonIdsByTeam, match.home_team_id),
                !canWrite,
                true
              )}
              {selectField(
                `away-${match.id}`,
                "Fora",
                "away_team_id",
                match.away_team_id,
                teamOptions(overview, seasonIdsByTeam, match.away_team_id),
                !canWrite,
                true
              )}
              {renderMatchFields(match, overview, canWrite)}
              <button className="match-admin-button" disabled={!canWrite} type="submit">Guardar</button>
              <script
                dangerouslySetInnerHTML={{
                  __html: `
                    (() => {
                      const form = document.currentScript.closest("form");
                      if (!form) return;

                      const competition = form.querySelector('select[name="competition_id"]');
                      const season = form.querySelector('select[name="season_id"]');
                      const matchday = form.querySelector('select[name="matchday_id"]');
                      const home = form.querySelector('select[name="home_team_id"]');
                      const away = form.querySelector('select[name="away_team_id"]');
                      const submit = form.querySelector('button[type="submit"]');

                      if (!competition || !season || !matchday || !home || !away || !submit) return;

                      const homeBaseDisabled = home.disabled;
                      const awayBaseDisabled = away.disabled;
                      const submitBaseDisabled = submit.disabled;

                      function firstVisibleOption(select) {
                        return Array.from(select.options).find((option) => !option.hidden && !option.disabled && option.style.display !== "none");
                      }

                      function seasonIds(option) {
                        return (option.dataset.seasonIds || "").split(",").filter(Boolean);
                      }

                      function setOptionVisible(option, visible) {
                        option.hidden = !visible;
                        option.disabled = !visible;
                        option.style.display = visible ? "" : "none";
                      }

                      function visibleTeamCount(select) {
                        return Array.from(select.options).filter((option) => option.value && !option.hidden && !option.disabled && option.style.display !== "none").length;
                      }

                      function syncTeamSelect(select, seasonId) {
                        Array.from(select.options).forEach((option) => {
                          setOptionVisible(option, seasonIds(option).includes(seasonId));
                        });

                        if (!select.value || select.selectedOptions[0]?.hidden || select.selectedOptions[0]?.disabled) {
                          const first = firstVisibleOption(select);
                          select.value = first ? first.value : "";
                        }

                        const hasParticipants = Boolean(firstVisibleOption(select));
                        select.disabled = (select === home ? homeBaseDisabled : awayBaseDisabled) || !hasParticipants;
                        return hasParticipants;
                      }

                      function avoidSameTeams() {
                        if (!home.value || !away.value || home.value !== away.value) return;

                        const replacement = Array.from(away.options).find((option) => !option.hidden && !option.disabled && option.value !== home.value);
                        if (replacement) away.value = replacement.value;
                      }

                      function syncTeams() {
                        const seasonId = season.value;
                        const homeHasParticipants = syncTeamSelect(home, seasonId);
                        const awayHasParticipants = syncTeamSelect(away, seasonId);
                        avoidSameTeams();
                        submit.disabled = submitBaseDisabled || !homeHasParticipants || !awayHasParticipants || visibleTeamCount(home) < 2;
                      }

                      function syncMatchdays() {
                        const seasonId = season.value;
                        Array.from(matchday.options).forEach((option) => {
                          setOptionVisible(option, option.dataset.seasonId ? option.dataset.seasonId === seasonId : true);
                        });

                        if (matchday.selectedOptions[0]?.hidden) {
                          const first = firstVisibleOption(matchday);
                          if (first) matchday.value = first.value;
                        }
                      }

                      function syncSeasons() {
                        const competitionId = competition.value;
                        Array.from(season.options).forEach((option) => {
                          setOptionVisible(option, option.dataset.competitionId ? option.dataset.competitionId === competitionId : true);
                        });

                        if (season.selectedOptions[0]?.hidden) {
                          const first = firstVisibleOption(season);
                          if (first) season.value = first.value;
                        }

                        syncMatchdays();
                        syncTeams();
                      }

                      competition.addEventListener("change", syncSeasons);
                      season.addEventListener("change", () => {
                        syncMatchdays();
                        syncTeams();
                      });
                      home.addEventListener("change", avoidSameTeams);
                      away.addEventListener("change", avoidSameTeams);
                      syncSeasons();
                    })();
                  `
                }}
              />
            </div>
          </form>
        ))}
      </section>
    </main>
  );
}
