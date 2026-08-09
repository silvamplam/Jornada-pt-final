import Script from "next/script";

import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CountryRow = {
  id: string;
  name: string | null;
};

type CompetitionRow = {
  id: string;
  country_id: string | null;
  name: string | null;
  slug: string | null;
  is_active: boolean | null;
};

type SeasonRow = {
  id: string;
  competition_id: string | null;
  label: string | null;
  is_current: boolean | null;
  starts_on: string | null;
  ends_on: string | null;
};

type MatchdayRow = {
  id: string;
  season_id: string | null;
  number: number | null;
  label: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: string | null;
};

const selectorStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .matchday-selector-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .matchday-selector-hero,
  .matchday-selector-panel {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .matchday-selector-hero {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: 24px;
    background: linear-gradient(135deg, #10151b, #25303c);
    color: #ffffff;
  }

  .matchday-selector-hero h1,
  .matchday-selector-hero p,
  .matchday-selector-hero small {
    margin: 0;
  }

  .matchday-selector-hero h1 {
    margin-top: 8px;
    font-size: 34px;
    line-height: 1.05;
  }

  .matchday-selector-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .matchday-selector-hero small {
    display: block;
    margin-top: 10px;
    color: #cdd5df;
    font-size: 15px;
  }

  .matchday-selector-actions {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 10px;
  }

  .matchday-selector-button,
  .matchday-selector-actions a {
    display: inline-block;
    width: fit-content;
    padding: 12px 16px;
    border: 0;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
  }

  .matchday-selector-actions a {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: transparent;
  }

  .matchday-selector-panel {
    margin-top: 18px;
    padding: 22px;
  }

  .matchday-selector-panel h2,
  .matchday-selector-panel p {
    margin: 0;
  }

  .matchday-selector-panel p {
    margin-top: 6px;
    color: #526170;
    font-size: 14px;
    line-height: 1.5;
  }

  .matchday-selector-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 20px;
  }

  .matchday-selector-field {
    display: grid;
    gap: 7px;
  }

  .matchday-selector-field label {
    color: #526170;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .matchday-selector-field select {
    width: 100%;
    min-height: 42px;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 14px;
  }

  .matchday-selector-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 18px;
  }

  .matchday-selector-note {
    max-width: 660px;
    color: #526170;
    font-size: 13px;
    line-height: 1.5;
  }

  .matchday-selector-button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  .matchday-selector-empty {
    margin-top: 18px;
    padding: 16px;
    border: 1px dashed #cfd8e3;
    border-radius: 8px;
    color: #526170;
    font-size: 14px;
  }

  @media (max-width: 780px) {
    .matchday-selector-shell {
      padding: 18px;
    }

    .matchday-selector-hero,
    .matchday-selector-grid {
      display: block;
    }

    .matchday-selector-actions,
    .matchday-selector-field {
      margin-top: 14px;
    }
  }
`;

async function readSelectorData() {
  try {
    const [countries, competitions, seasons, matchdays] = await Promise.all([
      fetchSupabaseAdminTable<CountryRow>("countries?select=id,name&order=name.asc"),
      fetchSupabaseAdminTable<CompetitionRow>("competitions?select=id,country_id,name,slug,is_active&order=name.asc"),
      fetchSupabaseAdminTable<SeasonRow>(
        "seasons?select=id,competition_id,label,is_current,starts_on,ends_on&order=label.desc"
      ),
      fetchSupabaseAdminTable<MatchdayRow>("matchdays?select=id,season_id,number,label,starts_on,ends_on,status&order=number.asc")
    ]);

    return { countries, competitions, seasons, matchdays, error: "" };
  } catch (error) {
    return {
      countries: [] as CountryRow[],
      competitions: [] as CompetitionRow[],
      seasons: [] as SeasonRow[],
      matchdays: [] as MatchdayRow[],
      error: error instanceof Error ? error.message : "Nao foi possivel ler jornadas."
    };
  }
}

function formatMatchdayLabel(
  matchday: MatchdayRow,
  seasonById: Map<string, SeasonRow>,
  competitionById: Map<string, CompetitionRow>,
  countryById: Map<string, CountryRow>
) {
  const season = matchday.season_id ? seasonById.get(matchday.season_id) : null;
  const competition = season?.competition_id ? competitionById.get(season.competition_id) : null;
  const country = competition?.country_id ? countryById.get(competition.country_id) : null;
  const parts = [
    country?.name,
    competition?.name,
    season?.label,
    matchday.label ?? (matchday.number ? `Jornada ${matchday.number}` : "Jornada")
  ].filter(Boolean);

  return parts.join(" / ");
}

function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function AdminEditorialMatchdaySelectorPage() {
  const { countries, competitions, seasons, matchdays, error } = await readSelectorData();
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const seasonOptions = seasons.map((season) => ({
    id: season.id,
    competitionId: season.competition_id ?? "",
    label: season.label ?? "Epoca sem nome"
  }));
  const matchdayOptions = matchdays.map((matchday) => ({
    id: matchday.id,
    seasonId: matchday.season_id ?? "",
    label: formatMatchdayLabel(matchday, seasonById, competitionById, countryById)
  }));

  return (
    <main className="matchday-selector-shell">
      <style>{selectorStyles}</style>
      <section className="matchday-selector-hero">
        <div>
          <p>Jornada.pt</p>
          <h1>Editorial da Jornada</h1>
          <small>Escolhe explicitamente a competicao, epoca e jornada antes de abrir a edicao editorial.</small>
        </div>
        <nav className="matchday-selector-actions" aria-label="Navegacao editorial">
          <a href="/admin/editorial/home">Home Editorial</a>
          <a href="/admin/editorial/redacao-automatica">Redação automática</a>
          <a href="/admin/editorial/artigos">Artigos / Noticias</a>
          <a href="/admin/editorial/conteudos">VÍDEO</a>
          <a href="/admin/editorial/composicao">Composicao Editorial</a>
          <a href="/admin/gestor">Centro de Gestao</a>
          <a href="/admin">Backoffice</a>
        </nav>
      </section>

      <section className="matchday-selector-panel" aria-label="Selecionar jornada editorial">
        <h2>Selecionar jornada</h2>
        <p>Esta entrada nao escolhe uma liga por defeito nem reabre contexto guardado no browser.</p>

        {error ? <div className="matchday-selector-empty">Erro ao ler dados: {error}</div> : null}
        {!error && matchdays.length === 0 ? (
          <div className="matchday-selector-empty">Nao existem jornadas disponiveis para selecionar.</div>
        ) : (
          <form
            data-matchday-selector="jornada"
            data-target-base="/admin/editorial/jornada"
            data-season-options={scriptJson(seasonOptions)}
            data-matchday-options={scriptJson(matchdayOptions)}
          >
            <div className="matchday-selector-grid">
              <div className="matchday-selector-field">
                <label htmlFor="editorial-competition">Competicao</label>
                <select id="editorial-competition" name="competition_id" defaultValue="">
                  <option value="">Escolher competicao</option>
                  {competitions.map((competition) => (
                    <option key={competition.id} value={competition.id}>
                      {[countryById.get(competition.country_id ?? "")?.name, competition.name].filter(Boolean).join(" / ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="matchday-selector-field">
                <label htmlFor="editorial-season">Epoca</label>
                <select id="editorial-season" name="season_id" defaultValue="">
                  <option value="">Seleciona competicao primeiro</option>
                </select>
              </div>

              <div className="matchday-selector-field">
                <label htmlFor="editorial-matchday">Jornada</label>
                <select id="editorial-matchday" name="matchday_id" defaultValue="">
                  <option value="">Seleciona epoca primeiro</option>
                </select>
              </div>
            </div>

            <div className="matchday-selector-footer">
              <span className="matchday-selector-note">
                So depois de escolher uma jornada e que a pagina abre /admin/editorial/jornada/[matchdayId].
              </span>
              <button className="matchday-selector-button" type="submit" disabled>
                Abrir Editorial da Jornada
              </button>
            </div>
          </form>
        )}
      </section>

      <Script
        id="admin-editorial-jornada-selector"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              if (window.__adminEditorialJornadaSelectorBound) return;
              window.__adminEditorialJornadaSelectorBound = true;

              function parseOptions(form, name) {
                try {
                  return JSON.parse(form.getAttribute(name) || "[]");
                } catch (error) {
                  return [];
                }
              }

              function formParts(form) {
                if (!form) return null;
                return {
                  competition: form.querySelector('select[name="competition_id"]'),
                  season: form.querySelector('select[name="season_id"]'),
                  matchday: form.querySelector('select[name="matchday_id"]'),
                  button: form.querySelector('button[type="submit"]')
                };
              }

              function initForm(form) {
                var parts = formParts(form);
                if (!parts || !parts.competition || !parts.season || !parts.matchday || !parts.button) return;
                renderSeasons(form);
              }

              function resetSelect(select, label) {
                select.innerHTML = "";
                var option = document.createElement("option");
                option.value = "";
                option.textContent = label;
                select.appendChild(option);
              }

              function appendOption(select, value, label) {
                var option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                select.appendChild(option);
              }

              function renderMatchdays(form) {
                var parts = formParts(form);
                if (!parts || !parts.season || !parts.matchday || !parts.button) return;
                var matchdayOptions = parseOptions(form, "data-matchday-options");
                var seasonId = parts.season.value;
                var selectedMatchdayId = parts.matchday.value;
                var filteredMatchdays = seasonId
                  ? matchdayOptions.filter(function (option) {
                      return option.seasonId === seasonId;
                    })
                  : [];

                resetSelect(parts.matchday, seasonId ? "Escolher jornada" : "Seleciona epoca primeiro");
                filteredMatchdays.forEach(function (option) {
                  appendOption(parts.matchday, option.id, option.label);
                });

                if (filteredMatchdays.some(function (option) { return option.id === selectedMatchdayId; })) {
                  parts.matchday.value = selectedMatchdayId;
                }

                parts.button.disabled = !parts.matchday.value;
              }

              function renderSeasons(form) {
                var parts = formParts(form);
                if (!parts || !parts.competition || !parts.season || !parts.matchday) return;
                var seasonOptions = parseOptions(form, "data-season-options");
                var competitionId = parts.competition.value;
                var seasonId = parts.season.value;
                var filteredSeasons = competitionId
                  ? seasonOptions.filter(function (option) {
                      return option.competitionId === competitionId;
                    })
                  : [];

                resetSelect(parts.season, competitionId ? "Escolher epoca" : "Seleciona competicao primeiro");
                filteredSeasons.forEach(function (option) {
                  appendOption(parts.season, option.id, option.label);
                });

                if (filteredSeasons.some(function (option) { return option.id === seasonId; })) {
                  parts.season.value = seasonId;
                } else {
                  parts.season.value = "";
                }

                renderMatchdays(form);
              }

              document.addEventListener("change", function (event) {
                var control = event.target && event.target.closest
                  ? event.target.closest('[name="competition_id"], [name="season_id"], [name="matchday_id"]')
                  : null;
                if (!control) return;
                var form = control.closest("[data-matchday-selector]");
                var parts = formParts(form);
                if (!parts) return;
                if (control.name === "competition_id") {
                  parts.season.value = "";
                  parts.matchday.value = "";
                  renderSeasons(form);
                  return;
                }
                if (control.name === "season_id") {
                  parts.matchday.value = "";
                  renderMatchdays(form);
                  return;
                }
                renderMatchdays(form);
              });

              document.addEventListener("submit", function (event) {
                var form = event.target && event.target.closest ? event.target.closest("[data-matchday-selector]") : null;
                if (!form) return;
                event.preventDefault();
                var parts = formParts(form);
                if (!parts || !parts.matchday.value) {
                  renderMatchdays(form);
                  return;
                }

                window.location.href = form.getAttribute("data-target-base") + "/" + encodeURIComponent(parts.matchday.value);
              });

              function initAll() {
                Array.prototype.forEach.call(document.querySelectorAll("[data-matchday-selector]"), initForm);
              }

              if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", initAll, { once: true });
              } else {
                initAll();
              }
            })();
          `
        }}
      />
    </main>
  );
}
