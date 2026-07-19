import { getAdminTeamPublicNameManagement } from "@/lib/supabase";
import TeamPublicNameManager from "./TeamPublicNameManager";

export const dynamic = "force-dynamic";

const teamAdminStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .team-admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .team-admin-hero {
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

  .team-admin-hero p,
  .team-admin-hero h1,
  .team-admin-hero span {
    margin: 0;
  }

  .team-admin-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .team-admin-hero h1 {
    margin-top: 8px;
    font-size: 42px;
    line-height: 1;
  }

  .team-admin-hero span {
    display: block;
    margin-top: 10px;
    color: #cdd5df;
    font-size: 16px;
  }

  .team-admin-hero a {
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

  .team-admin-hero-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }

  .team-admin-message {
    margin-top: 18px;
    padding: 16px 18px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #dce3eb;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .team-admin-message.warning {
    border-color: #ffd3a3;
    background: #fff8ee;
    color: #8a3a00;
  }

  .team-admin-message.success {
    border-color: #bfe4c9;
    background: #f0fbf3;
    color: #146b2c;
  }

  .team-admin-create,
  .team-admin-list {
    margin-top: 18px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .team-admin-create header,
  .team-admin-list header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
  }

  .team-admin-create h2,
  .team-admin-list h2 {
    margin: 0;
    font-size: 21px;
    text-transform: uppercase;
  }

  .team-admin-create small,
  .team-admin-list small {
    color: #687380;
  }

  .team-admin-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
  }

  .team-admin-summary span {
    padding: 6px 9px;
    border-radius: 999px;
    background: #eef2f6;
    color: #34404d;
    font-size: 12px;
    font-weight: 800;
  }

  .team-form {
    display: grid;
    grid-template-columns: 48px minmax(150px, 1.2fr) 90px minmax(130px, 1fr) minmax(110px, 0.8fr) minmax(220px, 1.5fr) 110px auto;
    gap: 10px;
    align-items: end;
    padding: 14px 18px;
    border-bottom: 1px solid #eef2f6;
  }

  .team-form:last-child {
    border-bottom: 0;
  }

  .team-form figure {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    margin: 0;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 50%;
    background: #f8fafc;
    color: #5e6874;
    font-size: 11px;
    font-weight: 900;
  }

  .team-form img {
    display: block;
    width: 28px !important;
    max-width: 28px !important;
    height: 28px !important;
    max-height: 28px !important;
    object-fit: contain;
  }

  .team-field {
    display: grid;
    gap: 5px;
  }

  .team-field label {
    color: #687380;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .team-field input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 11px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    font: inherit;
    font-size: 14px;
  }

  .team-field textarea {
    min-height: 150px;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 11px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    font: inherit;
    font-size: 14px;
    resize: vertical;
  }

  .team-field input:focus,
  .team-field textarea:focus {
    outline: 2px solid rgba(229, 37, 42, 0.16);
    border-color: #e5252a;
  }

  .team-assets-form {
    display: grid;
    gap: 14px;
    padding: 18px 20px 20px;
  }

  .team-assets-option {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #34404d;
    font-size: 13px;
    font-weight: 800;
  }

  .team-assets-option input {
    width: 16px;
    height: 16px;
    accent-color: #e5252a;
  }

  .team-form button,
  .team-assets-form button {
    min-height: 39px;
    padding: 10px 13px;
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

  .team-assets-form button {
    justify-self: start;
  }

  .team-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .team-form .team-remove-button {
    background: #10151b;
  }

  .team-form button:disabled,
  .team-assets-form button:disabled,
  .team-field input:disabled,
  .team-field textarea:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  @media (max-width: 1180px) {
    .team-form {
      grid-template-columns: 48px repeat(2, minmax(0, 1fr));
    }

    .team-form button {
      grid-column: 1 / -1;
    }

    .team-actions {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 720px) {
    .team-admin-shell {
      padding: 16px;
    }

    .team-admin-hero,
    .team-form {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
`;

type TeamsPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    updated?: string;
    assets_updated?: string;
    assets_existing?: string;
    assets_replaced?: string;
    assets_missing?: string;
    assets_invalid?: string;
    assets_found?: string;
    assets_errors?: string;
    assets_replace?: string;
    public_name_updated?: string;
    public_name_cleared?: string;
    public_name_unchanged?: string;
    error?: string;
  }>;
};

function errorMessage(error?: string) {
  if (error === "missing-service") {
    return "Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel para gravar alteracoes.";
  }

  if (error === "missing-fields") {
    return "Nome, sigla e slug sao obrigatorios.";
  }

  if (error === "save") {
    return "Nao foi possivel guardar. Confirma se o slug nao esta repetido.";
  }

  if (error === "delete") {
    return "Nao foi possivel remover este clube.";
  }

  if (error === "team-has-dependencies") {
    return "Este clube nao pode ser removido porque ainda tem participantes, jogos ou outros dados associados.";
  }

  if (error === "public-name-invalid") {
    return "O nome público é inválido. Usa no máximo 80 caracteres e não incluas caracteres de controlo.";
  }

  if (error === "public-name-team-not-found") {
    return "O clube do nome público já não existe.";
  }

  if (error === "public-name-response" || error === "public-name-save") {
    return "Não foi possível guardar o nome público.";
  }

  return null;
}

export default async function AdminTeamsPage({ searchParams }: TeamsPageProps) {
  const params = await searchParams;
  const overview = await getAdminTeamPublicNameManagement();
  const message = errorMessage(params.error);
  const canWrite = overview.writeConfigured && !overview.error;
  const assetSummary =
    params.assets_updated ||
    params.assets_existing ||
    params.assets_replaced ||
    params.assets_missing ||
    params.assets_invalid ||
    params.assets_found ||
    params.assets_errors ||
    params.assets_replace
      ? {
          updated: Number(params.assets_updated ?? 0),
          existing: Number(params.assets_existing ?? 0),
          replaced: Number(params.assets_replaced ?? 0),
          missing: Number(params.assets_missing ?? 0),
          invalid: Number(params.assets_invalid ?? 0),
          found: Number(params.assets_found ?? 0),
          errors: Number(params.assets_errors ?? 0),
          replace: params.assets_replace === "1"
        }
      : null;

  return (
    <main className="team-admin-shell">
      <style>{teamAdminStyles}</style>
      <header className="team-admin-hero">
        <div>
          <p>Jornada.pt</p>
          <h1>Clubes</h1>
          <span>Adicionar e corrigir nomes, siglas, paises, cores e emblemas.</span>
        </div>
        <nav aria-label="Ações de clubes" className="team-admin-hero-actions">
          <a href="/admin/clubes/aliases">Gerir aliases</a>
          <a href="/admin/gestor">Voltar ao gestor</a>
        </nav>
      </header>

      {!overview.configured ? (
        <section className="team-admin-message warning">
          Falta configurar a ligacao ao Supabase.
        </section>
      ) : null}

      {!overview.writeConfigured ? (
        <section className="team-admin-message warning">
          Modo leitura ativo. Para editar, adiciona a variavel SUPABASE_SERVICE_ROLE_KEY na Vercel.
        </section>
      ) : null}

      {overview.error ? <section className="team-admin-message warning">{overview.error}</section> : null}
      {message ? <section className="team-admin-message warning">{message}</section> : null}
      {params.created ? <section className="team-admin-message success">Clube criado.</section> : null}
      {params.updated ? <section className="team-admin-message success">Clube atualizado.</section> : null}
      {params.deleted ? <section className="team-admin-message success">Clube removido.</section> : null}
      {params.public_name_updated ? (
        <section className="team-admin-message success">Nome público guardado.</section>
      ) : null}
      {params.public_name_cleared ? (
        <section className="team-admin-message success">Nome público limpo.</section>
      ) : null}
      {params.public_name_unchanged ? (
        <section className="team-admin-message success">O nome público já tinha esse valor.</section>
      ) : null}
      {assetSummary ? (
        <section className="team-admin-message success">
          Atualizacao de emblemas concluida.
          <div className="team-admin-summary">
            <span>Substituicao {assetSummary.replace ? "ativa" : "inativa"}</span>
            <span>{assetSummary.found} slugs encontrados</span>
            <span>{assetSummary.updated} clubes atualizados</span>
            <span>{assetSummary.existing} emblemas existentes ignorados</span>
            <span>{assetSummary.replaced} emblemas substituidos</span>
            <span>{assetSummary.missing} nao encontrados</span>
            <span>{assetSummary.invalid} linhas invalidas</span>
            <span>{assetSummary.errors} erros de gravacao</span>
          </div>
        </section>
      ) : null}

      <section className="team-admin-create">
        <header>
          <h2>Novo clube</h2>
          <small>Cria primeiro a base do clube. Depois podes ligar jogos, noticias e classificacoes.</small>
        </header>
        <form action="/api/admin/teams" className="team-form" method="post">
          <figure>+</figure>
          <div className="team-field">
            <label htmlFor="new-name">Nome</label>
            <input disabled={!canWrite} id="new-name" name="name" placeholder="Ex: Liverpool" required />
          </div>
          <div className="team-field">
            <label htmlFor="new-short-name">Sigla</label>
            <input disabled={!canWrite} id="new-short-name" maxLength={6} name="short_name" placeholder="LIV" required />
          </div>
          <div className="team-field">
            <label htmlFor="new-slug">Slug</label>
            <input disabled={!canWrite} id="new-slug" name="slug" placeholder="liverpool" />
          </div>
          <div className="team-field">
            <label htmlFor="new-country">Pais</label>
            <input disabled={!canWrite} id="new-country" name="country" placeholder="Inglaterra" />
          </div>
          <div className="team-field">
            <label htmlFor="new-logo-url">Emblema URL</label>
            <input disabled={!canWrite} id="new-logo-url" name="logo_url" placeholder="https://..." />
          </div>
          <div className="team-field">
            <label htmlFor="new-primary-color">Cor</label>
            <input disabled={!canWrite} id="new-primary-color" name="primary_color" placeholder="#e5252a" />
          </div>
          <button disabled={!canWrite} type="submit">Criar</button>
        </form>
      </section>

      <section className="team-admin-create">
        <header>
          <h2>Atualizar emblemas e cores</h2>
          <small>
            Atualiza apenas Emblema URL e Cor de clubes existentes por slug. Nao altera nomes, paises,
            participantes, jornadas, jogos ou resultados.
          </small>
        </header>
        <form action="/api/admin/teams" className="team-assets-form" method="post">
          <input type="hidden" name="action_type" value="bulk_assets" />
          <div className="team-field">
            <label htmlFor="team-assets">Lista</label>
            <textarea
              disabled={!canWrite}
              id="team-assets"
              name="team_assets"
              placeholder={"Slug;Emblema URL;Cor\nfc-barcelona;https://...;#A50044\natletico-de-madrid;https://...;#CB3524"}
            />
          </div>
          <label className="team-assets-option">
            <input disabled={!canWrite} name="replace_existing_logos" type="checkbox" value="1" />
            <span>Substituir emblemas existentes</span>
          </label>
          <button disabled={!canWrite} type="submit">Atualizar clubes</button>
        </form>
      </section>

      <TeamPublicNameManager
        competitions={overview.competitions}
        countries={overview.countries}
        disabled={!canWrite}
        teams={overview.teams}
      />
    </main>
  );
}
