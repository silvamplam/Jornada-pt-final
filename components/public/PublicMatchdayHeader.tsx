import type { CSSProperties } from "react";
import type { PublicCompetitionMenuItem } from "@/lib/public-competition-menu";
import { buildPublicMatchdayHeaderModel, type PublicMatchdayHeaderContext } from "@/lib/public-matchday-header";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import { publicTopNavigationStyles } from "@/components/public/publicEditorialStyles";
import headerStyles from "@/components/public/PublicLeagueNewsHeader.module.css";

type PublicMatchdayHeaderProps = {
  context: PublicMatchdayHeaderContext;
  competitions: PublicCompetitionMenuItem[];
  classificationHref?: string;
};

export default function PublicMatchdayHeader({
  context, competitions, classificationHref = "#classificacao",
}: PublicMatchdayHeaderProps) {
  const {
    competitionBarColor, currentCompetitionMenuItem, competitionLogo, publicCompetitionMenu,
    seasonOptions, currentSeasonHref, shouldSplitMatchdayNav, activeMatchdayLeg,
    visibleMatchdays, firstLegHref, secondLegHref, matchdayHref, selectedMatchdayDateContext,
  } = buildPublicMatchdayHeaderModel(context, competitions);

  return (
    <>
      <style>{publicTopNavigationStyles}</style>
      <div className={`public-top-stack ${headerStyles.topStack}`} data-competition={context.competition.slug}>
      <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
        <a className={headerStyles.competitionIdentity} href={currentCompetitionMenuItem.href}>
          {competitionLogo ? (
            <img
              alt=""
              data-variant={competitionLogo.variant}
              height={competitionLogo.intrinsicHeight}
              src={competitionLogo.logoUrl}
              width={competitionLogo.intrinsicWidth}
            />
          ) : null}
          <span>{context.competition.name}</span>
        </a>
        <a className={headerStyles.matchdayBrand} href="/" aria-label={`Jornada.pt — Jornada ${context.matchday.number}`}>
          <span>a Jornada</span>
          <strong>{String(context.matchday.number).padStart(2, "0")}</strong>
        </a>
        <PublicCompetitionNavigation
          competitions={publicCompetitionMenu}
          activeCompetitionSlug={context.competition.slug}
          classificationHref={classificationHref}
          showMessageTicker={false}
        />
        <div className="public-matchday-date-row">
          <span className="public-matchday-date-context">
            {selectedMatchdayDateContext}
          </span>
        </div>
        <div className="public-site-actions" aria-label="Ações">
          <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
          <a href="/admin/gestor">Entrar</a>
        </div>
      </header>
      <section className="public-season-nav-bar" aria-label="Navegacao de jornadas" style={{ "--public-season-accent": competitionBarColor } as CSSProperties}>
        <div className="public-hidden-heading">
          <h2>Jornadas</h2>
          <p>Navegação principal da época {context.season.label}.</p>
        </div>
        <div className="public-season-nav-inner">
          <div className="public-season-context-card" aria-label="Contexto da competição">
            <label className="public-season-select-wrap">
              <span>Época</span>
              <select className="public-season-select" data-season-select defaultValue={currentSeasonHref}>
                {seasonOptions.map((season) => (
                  <option key={season.id} value={season.href}>
                    {season.label}
                  </option>
                ))}
              </select>
            </label>
            {shouldSplitMatchdayNav ? (
              <nav className="public-matchday-leg-nav" aria-label="Voltas da época">
                <a aria-current={activeMatchdayLeg === "first" ? "true" : undefined} href={firstLegHref}>
                  1.ª volta
                </a>
                <a aria-current={activeMatchdayLeg === "second" ? "true" : undefined} href={secondLegHref}>
                  2.ª volta
                </a>
              </nav>
            ) : null}
          </div>
          <nav className="public-matchday-nav-compact" aria-label="Jornadas da época">
            {visibleMatchdays.map((matchday) => (
              <a
                aria-current={matchday.id === context.matchday.id ? "page" : undefined}
                href={matchdayHref(matchday.number)}
                key={matchday.id}
              >
                J{String(matchday.number).padStart(2, "0")}
              </a>
            ))}
          </nav>
        </div>
      </section>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("DOMContentLoaded", function () {
              var select = document.querySelector("[data-season-select]");
              if (!select) return;
              select.addEventListener("change", function () {
                if (select.value) window.location.href = select.value;
              });
            });
          `
        }}
      />
    </>
  );
}
