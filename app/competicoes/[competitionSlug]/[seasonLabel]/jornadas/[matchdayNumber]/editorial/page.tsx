import type { CSSProperties } from "react";
import { notFound } from "next/navigation";

import { publicTopNavigationStyles } from "@/components/public/publicEditorialStyles";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import PublicMatchStrip from "@/components/public/PublicMatchStrip";
import PublicSideAdvertisement from "@/components/public/PublicSideAdvertisement";
import {
  hierarchicalCompositionEditorialParagraphs,
  isPublishableHierarchicalCompositionEditorial,
} from "@/lib/editorial-hierarchical-composition";
import { getPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { buildPublicMatchdayLegNavigation } from "@/lib/public-matchday-leg-navigation";
import {
  getPublicMatchdayDiagnostic,
  seasonLabelToUrlSegment,
  type PublicSeasonMatch,
} from "@/lib/public-matchday";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    competitionSlug: string;
    seasonLabel: string;
    matchdayNumber: string;
  }>;
};

const civilMonthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function publicCompetitionBarColor(
  competitionSlug: string
) {
  if (competitionSlug === "liga-portugal") {
    return "#00235a";
  }

  if (competitionSlug === "premier-league") {
    return "#3d195b";
  }

  if (competitionSlug === "la-liga") {
    return "#1d2230";
  }

  return "#262626";
}

function parseCivilDate(
  value: string | null | undefined
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value ?? ""
    );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return {
    day,
    month,
    year,
    key: value as string,
  };
}

function formatCivilDateRange(
  firstDate: NonNullable<
    ReturnType<typeof parseCivilDate>
  >,
  lastDate: NonNullable<
    ReturnType<typeof parseCivilDate>
  >
) {
  if (firstDate.key === lastDate.key) {
    return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} de ${firstDate.year}`;
  }

  if (
    firstDate.year === lastDate.year &&
    firstDate.month === lastDate.month
  ) {
    return `${firstDate.day}–${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
  }

  if (firstDate.year === lastDate.year) {
    return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} – ${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
  }

  return `${firstDate.day} de ${civilMonthNames[firstDate.month - 1]} de ${firstDate.year} – ${lastDate.day} de ${civilMonthNames[lastDate.month - 1]} de ${lastDate.year}`;
}

function formatPreferredMatchdayDateContext(
  matches: PublicSeasonMatch[],
  startsOn: string | null,
  endsOn: string | null
) {
  const startsDate = parseCivilDate(startsOn);
  const endsDate = parseCivilDate(endsOn);

  if (startsDate && endsDate) {
    return formatCivilDateRange(
      startsDate,
      endsDate
    );
  }

  const scheduledDates = matches
    .map((match) =>
      parseCivilDate(match.scheduled_date)
    )
    .filter(
      (
        value
      ): value is NonNullable<
        ReturnType<typeof parseCivilDate>
      > => value !== null
    )
    .sort((a, b) =>
      a.key.localeCompare(b.key)
    );

  if (scheduledDates.length === 0) {
    return "Data por definir";
  }

  return formatCivilDateRange(
    scheduledDates[0],
    scheduledDates[
      scheduledDates.length - 1
    ]
  );
}

const styles = `
  ${publicTopNavigationStyles}

  body {
    margin: 0;
    overflow-x: hidden;
    background: #ffffff;
  }

  .news-article-shell {
    min-height: 100vh;
    padding: 0 24px 28px;
    background: #ffffff;
    color: #111820;
    font-family: Arial, Helvetica, sans-serif;
  }

  .news-article-layout {
    display: grid;
    grid-template-columns: minmax(0,780px) 320px;
    gap: 42px;
    width: min(1180px, calc(100% - 32px));
    margin: 0 auto;
    padding: 38px 0 56px;
  }

  .news-article-main {
    min-width: 0;
  }

  .editorial-article-label {
    margin: 0 0 12px;
    color: #c40012;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .news-article-title {
    margin: 0;
    color: #05080c;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(32px,3vw,43px);
    font-weight: 900;
    line-height: 1.09;
  }

  .news-article-meta {
    display: grid;
    gap: 4px;
    margin: 16px 0 28px;
    color: #5e6976;
    font-size: 12.5px;
  }

  .news-article-author {
    color: #4d5967;
    font-size: 13px;
    font-weight: 700;
  }

  .news-article-body {
    max-width: 780px;
    color: #111820;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 20px;
    line-height: 1.62;
  }

  .news-article-body p {
    margin: 0 0 22px;
  }

  .news-article-sidebar {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 20px;
    position: sticky;
    top: 128px;
  }

  .news-article-ad {
    display: block;
    overflow: hidden;
    width: min(100%, 252px);
    background: #ffffff;
    color: inherit;
    text-decoration: none;
  }

  .news-article-ad img {
    display: block;
    width: 100%;
    height: auto;
  }

  @media (max-width: 900px) {
    .news-article-shell {
      padding: 0 14px 26px;
    }

    .news-article-layout {
      grid-template-columns: 1fr;
      padding-top: 26px;
    }

    .news-article-sidebar {
      position: static;
    }

    .news-article-title {
      font-size: 31px;
    }

    .news-article-body {
      font-size: 18px;
    }
  }
`;

export default async function EditorialDaJornadaPage({
  params,
}: PageProps) {
  const resolved = await params;

  const matchdayNumber =
    Number.parseInt(
      resolved.matchdayNumber,
      10
    );

  if (
    !Number.isSafeInteger(matchdayNumber) ||
    matchdayNumber <= 0
  ) {
    notFound();
  }

  const [
    diagnostic,
    publicCompetitionMenuBase,
  ] = await Promise.all([
    getPublicMatchdayDiagnostic({
      competitionSlug:
        resolved.competitionSlug,
      seasonLabel:
        resolved.seasonLabel,
      matchdayNumber,
    }),
    getPublicCompetitionMenu().catch(
      () => []
    ),
  ]);

  const context = diagnostic.context;

  if (!context) {
    notFound();
  }

  const composition =
    context.referenceComposition;

  if (
    !context.hasPublishedReferenceComposition ||
    !composition ||
    composition.status !== "published" ||
    !composition.is_current ||
    composition.presentation_mode !==
      "hierarchical"
  ) {
    notFound();
  }

  const editorial = {
    title:
      composition.hierarchical_editorial_title,
    excerpt:
      composition.hierarchical_editorial_excerpt,
    text:
      composition.hierarchical_editorial_text,
    author:
      composition.hierarchical_editorial_author,
  };

  if (
    !isPublishableHierarchicalCompositionEditorial(
      editorial
    )
  ) {
    notFound();
  }

  const paragraphs =
    hierarchicalCompositionEditorialParagraphs(
      editorial.text
    );

  const seasonSegment =
    seasonLabelToUrlSegment(
      context.season.label
    );

  const matchdayHref = (
    number: number
  ) =>
    `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/${number}`;

  const currentMatchdayHref =
    matchdayHref(
      context.matchday.number
    );

  const classificationHref =
    `${currentMatchdayHref}#classificacao`;

  const currentCompetitionMenuItem = {
    label: context.competition.name,
    slug: context.competition.slug,
    href: currentMatchdayHref,
    logoUrl:
      context.competition.logo_url,
  };

  const publicCompetitionMenu =
    publicCompetitionMenuBase.map(
      (item) =>
        item.slug ===
        currentCompetitionMenuItem.slug
          ? currentCompetitionMenuItem
          : item
    );

  const seasonOptions =
    context.seasons.map((season) => ({
      id: season.id,
      label: season.label,
      href:
        `/competicoes/${context.competition.slug}/${seasonLabelToUrlSegment(season.label)}/jornadas/1`,
    }));

  const currentSeasonHref =
    `/competicoes/${context.competition.slug}/${seasonSegment}/jornadas/1`;

  const legNavigation =
    buildPublicMatchdayLegNavigation(
      context.matchdays,
      context.activeParticipantCount,
      context.matchday.id
    );

  const firstLegHref =
    legNavigation.firstLegTarget
      ? matchdayHref(
          legNavigation
            .firstLegTarget.number
        )
      : currentSeasonHref;

  const secondLegHref =
    legNavigation.secondLegTarget
      ? matchdayHref(
          legNavigation
            .secondLegTarget.number
        )
      : currentSeasonHref;

  const selectedDate =
    formatPreferredMatchdayDateContext(
      context.matchesForMatchday,
      context.matchday.starts_on,
      context.matchday.ends_on
    );

  const competitionBarColor =
    publicCompetitionBarColor(
      context.competition.slug
    );

  return (
    <div className="news-article-shell">
      <style>{styles}</style>

      <div className="public-top-stack">
        <header
          className="public-site-topbar"
          aria-label="Topo do Jornada.pt"
        >
          <a
            className="public-site-brand"
            href="/"
          >
            Jornada<span>.pt</span>
          </a>

          <PublicCompetitionNavigation
            competitions={
              publicCompetitionMenu
            }
            activeCompetitionSlug={
              context.competition.slug
            }
            classificationHref={
              classificationHref
            }
            showMessageTicker={false}
          />

          <div
            className="public-site-actions"
            aria-label="Ações"
          >
            <span
              className="public-site-search"
              aria-label="Pesquisar"
            >
              Pesquisar
            </span>

            <a href="/admin/gestor">
              Entrar
            </a>
          </div>
        </header>

        <section
          className="public-season-nav-bar"
          aria-label="Navegação de jornadas"
          style={{ "--public-season-accent": competitionBarColor } as CSSProperties}
        >
          <div className="public-hidden-heading">
            <h2>Jornadas</h2>
          </div>

          <div className="public-season-nav-inner">
            <div
              className="public-season-context-card"
              aria-label="Contexto da competição"
            >
              <label className="public-season-select-wrap">
                <span>Época</span>

                <select
                  className="public-season-select"
                  data-season-select
                  defaultValue={
                    currentSeasonHref
                  }
                >
                  {seasonOptions.map(
                    (season) => (
                      <option
                        key={season.id}
                        value={season.href}
                      >
                        {season.label}
                      </option>
                    )
                  )}
                </select>
              </label>

              {legNavigation.applies ? (
                <nav
                  className="public-matchday-leg-nav"
                  aria-label="Voltas da época"
                >
                  <a
                    aria-current={
                      legNavigation.activeLeg ===
                      "first"
                        ? "true"
                        : undefined
                    }
                    href={firstLegHref}
                  >
                    1.ª volta
                  </a>

                  <a
                    aria-current={
                      legNavigation.activeLeg ===
                      "second"
                        ? "true"
                        : undefined
                    }
                    href={secondLegHref}
                  >
                    2.ª volta
                  </a>
                </nav>
              ) : null}
            </div>

            <nav
              className="public-matchday-nav-compact"
              aria-label="Jornadas da época"
            >
              {legNavigation.visibleMatchdays.map(
                (matchday) => (
                  <a
                    aria-current={
                      matchday.id ===
                      context.matchday.id
                        ? "page"
                        : undefined
                    }
                    href={matchdayHref(
                      matchday.number
                    )}
                    key={matchday.id}
                  >
                    J
                    {String(
                      matchday.number
                    ).padStart(2, "0")}
                  </a>
                )
              )}
            </nav>

            <div className="public-matchday-date-row">
              <span className="public-matchday-date-context">
                <strong>Data:</strong>{" "}
                {selectedDate}
              </span>
            </div>
          </div>
        </section>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("DOMContentLoaded", function () {
              var select = document.querySelector("[data-season-select]");
              if (select) {
                select.addEventListener("change", function () {
                  if (select.value) window.location.href = select.value;
                });
              }
            });
          `,
        }}
      />

      {context.matchesForMatchday.length >
      0 ? (
        <section
          className="public-league-match-strip-scroll"
          aria-label="Jogos da jornada"
        >
          <PublicMatchStrip
            carouselLayout="fluid-peek"
            matches={context.matchesForMatchday.map(
              (match) => ({
                ...match,
                matchdayNumber:
                  match.matchday?.number ??
                  null,
              })
            )}
            variant="clean"
          />
        </section>
      ) : null}

      <main className="news-article-layout">
        <article className="news-article-main">
          <p className="editorial-article-label">
            Editorial da Jornada · Jornada{" "}
            {String(
              context.matchday.number
            ).padStart(2, "0")}
          </p>

          <h1 className="news-article-title">
            {editorial.title}
          </h1>

          <div className="news-article-meta">
            <span className="news-article-author">
              {editorial.author}
            </span>
          </div>

          <div className="news-article-body">
            {paragraphs.map(
              (paragraph, index) => (
                <p
                  key={`${index}-${paragraph.slice(
                    0,
                    24
                  )}`}
                >
                  {paragraph}
                </p>
              )
            )}
          </div>
        </article>

        <aside className="news-article-sidebar">
          <PublicSideAdvertisement className="news-article-ad" />
        </aside>
      </main>
    </div>
  );
}
