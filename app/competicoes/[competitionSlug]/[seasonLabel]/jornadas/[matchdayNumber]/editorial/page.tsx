import PublicMatchdayHeader from "@/components/public/PublicMatchdayHeader";
import matchdayStyles from "../page.module.css";
import { notFound } from "next/navigation";

import PublicMatchStrip from "@/components/public/PublicMatchStrip";
import PublicSideAdvertisement from "@/components/public/PublicSideAdvertisement";
import PublicEditorialImage from "@/components/public/PublicEditorialImage";
import { readPublicHierarchicalEditorialImage } from "@/lib/public-hierarchical-editorial-image";
import {
  hierarchicalCompositionEditorialParagraphs,
  isPublishableHierarchicalCompositionEditorial,
} from "@/lib/editorial-hierarchical-composition";
import { getPublicCompetitionMenu } from "@/lib/public-competition-menu";
import {
  getPublicMatchdayDiagnostic,
  seasonLabelToUrlSegment,
} from "@/lib/public-matchday";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    competitionSlug: string;
    seasonLabel: string;
    matchdayNumber: string;
  }>;
};

const styles = `
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

  .news-article-shell.public-matchday-editorial-shell {
    --public-top-gutter: 24px;
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

  .news-article-editorial-image {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 0 28px;
  }

  .news-article-body p {
    margin: 0 0 22px;
  }

  .news-article-layout:not(:has(.news-article-sidebar)) {
    grid-template-columns: minmax(0, 1fr);
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
      padding: 0 24px 26px;
    }

    .news-article-layout {
      /* Preserve the article measure while matching the Jornada header gutters. */
      width: min(1180px, calc(100% - 12px));
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
  @media (max-width: 760px) {
    .news-article-shell.public-matchday-editorial-shell {
      --public-top-gutter: 16px;
      padding-inline: 16px;
    }

    .news-article-layout {
      width: min(1180px, calc(100% - 28px));
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

  const [sideAdvertisement, editorialImageUrl] = await Promise.all([
    PublicSideAdvertisement({ className: "news-article-ad" }),
    readPublicHierarchicalEditorialImage(composition),
  ]);

  return (
    <div className="news-article-shell public-matchday-editorial-shell">
      <style>{styles}</style>

      <PublicMatchdayHeader
        context={context}
        competitions={publicCompetitionMenuBase}
        classificationHref={classificationHref}
      />
      <div className={`public-league-match-strip-scroll ${matchdayStyles.matchStrip}`}>
        <PublicMatchStrip
          carouselLayout="fluid-peek"
          matches={context.matchesForMatchday.map((match) => ({
            ...match,
            matchdayNumber: context.matchday.number,
          }))}
          variant="clean"
        />
      </div>

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

          {editorialImageUrl ? (
            <PublicEditorialImage
              className="news-article-editorial-image"
              src={editorialImageUrl}
              imageSize="article"
              alt={editorial.title ?? ""}
            />
          ) : null}

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

        {sideAdvertisement ? (
          <aside className="news-article-sidebar">{sideAdvertisement}</aside>
        ) : null}
      </main>
    </div>
  );
}
