import { getAdminOverview } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const adminPageStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .admin-hero {
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

  .admin-hero p,
  .admin-hero h1 {
    margin: 0;
  }

  .admin-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .admin-hero h1 {
    margin-top: 8px;
    font-size: 42px;
    line-height: 1;
  }

  .admin-hero span {
    display: block;
    margin-top: 10px;
    max-width: 680px;
    color: #cdd5df;
    font-size: 16px;
  }

  .admin-hero-actions {
    display: flex;
    flex: 1 1 620px;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
  }

  .admin-hero-actions form {
    margin: 0;
  }

  .admin-hero a,
  .admin-hero button,
  .admin-hero .admin-disabled-link {
    display: inline-block;
    flex: 0 0 auto;
    padding: 11px 16px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    background: transparent;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-hero .admin-disabled-link {
    opacity: 0.52;
    cursor: not-allowed;
    pointer-events: none;
  }

  .admin-hero button {
    background: rgba(229, 37, 42, 0.92);
    border-color: rgba(229, 37, 42, 0.92);
  }

  .admin-section-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .admin-section-actions a {
    display: inline-block;
    padding: 12px 16px;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font-size: 13px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .admin-section-actions.secondary a {
    background: #ffffff;
    color: #10151b;
    border: 1px solid #dce3eb;
  }

  .admin-tools {
    margin-top: 18px;
    padding: 20px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .admin-tools h2,
  .admin-tools h3,
  .admin-tools p {
    margin: 0;
  }

  .admin-tools h2 {
    font-size: 21px;
    text-transform: uppercase;
  }

  .admin-tools h3 {
    margin-top: 18px;
    color: #5e6874;
    font-size: 13px;
    text-transform: uppercase;
  }

  .admin-tools p {
    margin-top: 6px;
    color: #687380;
  }

  .admin-flow {
    margin-top: 18px;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .admin-flow header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
  }

  .admin-flow h2,
  .admin-flow p {
    margin: 0;
  }

  .admin-flow h2 {
    font-size: 21px;
    text-transform: uppercase;
  }

  .admin-flow p {
    margin-top: 6px;
    color: #687380;
  }

  .admin-flow ol {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .admin-flow li {
    display: grid;
    gap: 10px;
    padding: 18px;
    border-right: 1px solid #eef2f6;
  }

  .admin-flow li:last-child {
    border-right: 0;
  }

  .admin-flow span {
    width: fit-content;
    padding: 5px 8px;
    border-radius: 999px;
    background: #10151b;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
  }

  .admin-flow b {
    display: block;
    font-size: 15px;
    text-transform: uppercase;
  }

  .admin-flow small {
    display: block;
    margin-top: 5px;
    min-height: 38px;
    color: #687380;
    line-height: 1.35;
  }

  .admin-flow a {
    display: inline-block;
    width: fit-content;
    margin-top: 10px;
    color: #e5252a;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .admin-warning {
    margin-top: 18px;
    padding: 22px;
    border: 1px solid #ffd3a3;
    border-radius: 8px;
    background: #fff8ee;
  }

  .admin-warning h2,
  .admin-warning p {
    margin: 0;
  }

  .admin-warning p {
    margin-top: 8px;
    color: #5b6571;
  }

  .admin-stats {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .admin-stats article {
    padding: 20px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .admin-stats strong {
    display: block;
    color: #e5252a;
    font-size: 38px;
    line-height: 1;
  }

  .admin-stats span {
    display: block;
    margin-top: 7px;
    color: #5e6874;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  .admin-panel {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .admin-panel header {
    padding: 16px 18px;
    border-bottom: 1px solid #e6ebf1;
  }

  .admin-panel h2 {
    margin: 0;
    font-size: 19px;
    text-transform: uppercase;
  }

  .admin-panel small {
    color: #687380;
  }

  .admin-panel ul {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .admin-panel li {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 52px;
    padding: 9px 14px;
    border-bottom: 1px solid #eef2f6;
  }

  .admin-panel li:last-child {
    border-bottom: 0;
  }

  .admin-panel li span:first-child {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 50%;
    background: #f8fafc;
    color: #5e6874;
    font-size: 11px;
    font-weight: 900;
  }

  .admin-panel img,
  .admin-panel li span:first-child img {
    display: block;
    width: 24px !important;
    max-width: 24px !important;
    height: 24px !important;
    max-height: 24px !important;
    object-fit: contain;
  }

  .admin-panel b {
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 920px) {
    .admin-shell {
      padding: 16px;
    }

    .admin-hero,
    .admin-stats,
    .admin-grid,
    .admin-flow ol {
      display: grid;
      grid-template-columns: 1fr;
    }

    .admin-flow li {
      border-right: 0;
      border-bottom: 1px solid #eef2f6;
    }

    .admin-hero-actions {
      display: grid;
      grid-template-columns: 1fr;
    }

    .admin-hero-actions a,
    .admin-hero-actions button,
    .admin-hero-actions .admin-disabled-link {
      width: 100%;
      text-align: center;
    }
  }
`;

export default async function AdminPage() {
  const overview = await getAdminOverview();
  const matchdayEditorialHref = "/admin/editorial/jornada";
  const matchdayCompositionHref = "/admin/editorial/composicao";
  const countriesById = new Map(overview.countries.map((country) => [country.id, country]));
  const competitionsById = new Map(overview.competitions.map((competition) => [competition.id, competition]));

  return (
    <main className="admin-shell">
      <style>{adminPageStyles}</style>
      <header className="admin-hero">
        <div>
          <p>Jornada.pt</p>
          <h1>Backoffice</h1>
          <span>O Centro de gestao e a entrada principal para construir a epoca pela ordem certa.</span>
        </div>
        <div className="admin-hero-actions">
          <a href="/admin/gestor">Centro de gestao</a>
          <a href="/admin/editorial/redacao-automatica">Redação automática</a>
          <a href="/admin/editorial/home">HOME EDITORIAL</a>
          <a href="/admin/editorial/artigos">ARTIGOS / NOTÍCIAS</a>
          <a href="/admin/editorial/conteudos">VÍDEO</a>
          <a href={matchdayEditorialHref}>EDITORIAL DA JORNADA</a>
          <a href={matchdayCompositionHref}>COMPOSIÇÃO EDITORIAL</a>
          <a href="/">Voltar ao site</a>
          <form action="/api/admin/logout" method="post">
            <button type="submit">Sair</button>
          </form>
        </div>
      </header>

      {!overview.configured ? (
        <section className="admin-warning">
          <h2>Supabase ainda não ligado</h2>
          <p>
            Falta configurar as variáveis <strong>NEXT_PUBLIC_SUPABASE_URL</strong> e{" "}
            <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> na Vercel.
          </p>
        </section>
      ) : overview.error ? (
        <section className="admin-warning">
          <h2>Ligação encontrada, mas a leitura falhou</h2>
          <p>{overview.error}</p>
          <p>Se a base tiver RLS ativo, aplica primeiro as políticas públicas de leitura segura.</p>
        </section>
      ) : (
        <>
          <section className="admin-stats" aria-label="Resumo da base de dados">
            <article>
              <strong>{overview.countries.length}</strong>
              <span>Paises</span>
            </article>
            <article>
              <strong>{overview.competitions.length}</strong>
              <span>Competições</span>
            </article>
            <article>
              <strong>{overview.seasons.length}</strong>
              <span>Epocas</span>
            </article>
            <article>
              <strong>{overview.matchdays.length}</strong>
              <span>Jornadas</span>
            </article>
            <article>
              <strong>{overview.teams.length}</strong>
              <span>Clubes</span>
            </article>
            <article>
              <strong>{overview.broadcastChannels.length}</strong>
              <span>Canais TV</span>
            </article>
          </section>

          <section className="admin-flow" aria-label="Fluxo recomendado do backoffice">
            <header>
              <h2>Fluxo principal</h2>
              <p>Usa o Centro de gestao para seguir a cadeia: Pais - Competicao - Epoca - Participantes - Jornadas - Jogos - Resultados - Classificacao.</p>
            </header>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <b>Pais</b>
                  <small>Define o contexto nacional antes de abrir competicoes.</small>
                  <a href="/admin/gestor">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <b>Competicao</b>
                  <small>Liga cada competicao manualmente ao pais escolhido.</small>
                  <a href="/admin/gestor">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <b>Epoca</b>
                  <small>Cria a epoca dentro da competicao selecionada.</small>
                  <a href="/admin/gestor">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <b>Participantes</b>
                  <small>Escolhe clubes do pais e associa-os a epoca.</small>
                  <a href="/admin/gestor#participantes">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>05</span>
                <div>
                  <b>Jornadas</b>
                  <small>Organiza o calendario apenas depois dos participantes.</small>
                  <a href="/admin/gestor#calendario">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>06</span>
                <div>
                  <b>Jogos</b>
                  <small>Cria a agenda dentro da jornada selecionada.</small>
                  <a href="/admin/gestor#jogos">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>07</span>
                <div>
                  <b>Resultados</b>
                  <small>Guarda resultados finais manuais nos jogos da jornada.</small>
                  <a href="/admin/gestor#jogos">Abrir no centro</a>
                </div>
              </li>
              <li>
                <span>08</span>
                <div>
                  <b>Classificacao</b>
                  <small>Consulta a tabela acumulada calculada a partir dos resultados.</small>
                  <a href="/admin/gestor#classificacao">Abrir no centro</a>
                </div>
              </li>
            </ol>
          </section>

          <nav className="admin-section-actions" aria-label="Ferramentas do backoffice">
            <a href="/admin/gestor">Centro de gestao</a>
          </nav>

          <section className="admin-tools" aria-label="Paginas de apoio tecnico">
            <header>
              <h2>Apoio tecnico</h2>
              <p>O Centro de gestao e o fluxo principal. Estas paginas ficam apenas como apoio tecnico e catalogos.</p>
            </header>
            <h3>Catalogos</h3>
            <nav className="admin-section-actions secondary" aria-label="Dados base">
              <a href="/admin/paises">Gerir paises</a>
              <a href="/admin/competicoes">Gerir competicoes</a>
              <a href="/admin/epocas">Gerir epocas</a>
              <a href="/admin/clubes">Gerir clubes</a>
              <a href="/admin/canais-tv">Gerir canais TV</a>
            </nav>
            <h3>TV</h3>
            <nav className="admin-section-actions secondary" aria-label="Apoio tecnico de TV">
              <a href="/admin/jogos-tv">Ligar jogos a TV</a>
            </nav>
          </section>

          <section className="admin-grid">
            <article className="admin-panel">
              <header>
                <h2>Paises</h2>
                <small>Primeira camada do backoffice</small>
              </header>
              <ul>
                {overview.countries.map((country) => (
                  <li key={country.id}>
                    <span>{country.flag_emoji ?? country.iso2 ?? "PA"}</span>
                    <b>{country.name}</b>
                    <small>{country.slug}</small>
                  </li>
                ))}
              </ul>
            </article>

            <article className="admin-panel">
              <header>
                <h2>Competições</h2>
                <small>Base competitiva do site</small>
              </header>
              <ul>
                {overview.competitions.map((competition) => (
                  <li key={competition.id}>
                    <span>{competition.logo_url ? <img src={competition.logo_url} alt="" /> : null}</span>
                    <b>{competition.name}</b>
                    <small>{countriesById.get(competition.country_id ?? "")?.name ?? competition.country ?? competition.slug}</small>
                  </li>
                ))}
              </ul>
            </article>

            <article className="admin-panel">
              <header>
                <h2>Epocas</h2>
                <small>Estrutura anual de cada competicao</small>
              </header>
              <ul>
                {overview.seasons.slice(0, 12).map((season) => {
                  const competition = competitionsById.get(season.competition_id);

                  return (
                    <li key={season.id}>
                      <span>{competition?.logo_url ? <img src={competition.logo_url} alt="" /> : "EP"}</span>
                      <b>{season.label}</b>
                      <small>{competition?.name ?? "Competicao"}</small>
                    </li>
                  );
                })}
              </ul>
            </article>

            <article className="admin-panel">
              <header>
                <h2>Jornadas</h2>
                <small>Unidade editorial e cronologica</small>
              </header>
              <ul>
                {overview.matchdays.slice(0, 12).map((matchday) => (
                  <li key={matchday.id}>
                    <span>{matchday.number}</span>
                    <b>{matchday.editorial_title || matchday.label}</b>
                    <small>{matchday.competition?.name ?? matchday.season?.label ?? "Jornada"}</small>
                  </li>
                ))}
              </ul>
            </article>

            <article className="admin-panel">
              <header>
                <h2>Clubes</h2>
                <small>Primeiros emblemas e nomes curtos</small>
              </header>
              <ul>
                {overview.teams.slice(0, 12).map((team) => (
                  <li key={team.id}>
                    <span>{team.logo_url ? <img src={team.logo_url} alt="" /> : team.short_name}</span>
                    <b>{team.name}</b>
                    <small>{team.short_name}</small>
                  </li>
                ))}
              </ul>
            </article>

            <article className="admin-panel">
              <header>
                <h2>Canais TV</h2>
                <small>Onde se vê cada jogo</small>
              </header>
              <ul>
                {overview.broadcastChannels.map((channel) => (
                  <li key={channel.id}>
                    <span>{channel.logo_url ? <img src={channel.logo_url} alt="" /> : "TV"}</span>
                    <b>{channel.name}</b>
                    <small>{channel.platform ?? channel.country ?? "Canal"}</small>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
