import PublicLatestNewsBlock from "./PublicLatestNewsBlock";
import RoundupVideoSwitcher, { type RoundupVideoItem } from "./RoundupVideoSwitcher";
import YouTubeEmbedWithFallback from "./YouTubeEmbedWithFallback";

export type PublicEditorialHighlight = {
  id: string;
  label?: string | null;
  labelColor?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
};

export type PublicEditorialLatestNews = {
  id: string;
  timeLabel?: string | null;
  timeLabelColor?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
};

export type PublicSideBlockData = {
  isPublished: boolean;
  label?: string | null;
  labelColor?: string | null;
  title?: string | null;
  titleColor?: string | null;
  author?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  placeholder?: string;
};

export type PublicInlineMedia = {
  kind: "embed" | "direct_video";
  embedUrl?: string | null;
  videoUrl?: string | null;
  posterUrl?: string | null;
  caption?: string | null;
  contentSlug?: string | null;
  contentType?: string | null;
  title?: string | null;
};

export type PublicHeadlineData = {
  title?: string | null;
  subtitle?: string | null;
  author?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  inlineMedia?: PublicInlineMedia | null;
  titleColor?: string | null;
  fallbackTitle: string;
  fallbackSubtitle: string;
  titleTag?: "h1" | "h2";
};

export type PublicComplementaryData = {
  isPublished: boolean;
  label?: string | null;
  title?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  inlineMedia?: PublicInlineMedia | null;
};

export type PublicBelowHeadlineData = {
  highlightHeading: string;
  highlightHeadingColor?: string | null;
  highlights: PublicEditorialHighlight[];
  roundupItems: RoundupVideoItem[];
  showRoundupVideo: boolean;
  roundupHeading?: string | null;
  roundupHeadingColor?: string | null;
  initialRoundupItemId?: string | null;
  matchdayNumber?: number | null;
  complementary: PublicComplementaryData;
};

type PublicEditorialLayoutProps = {
  ariaLabel?: string;
  scope?: "home" | "matchday";
  sideBlock: PublicSideBlockData;
  headline: PublicHeadlineData;
  belowHeadline: PublicBelowHeadlineData;
  latestNews: PublicEditorialLatestNews[];
  latestNewsTitle?: string;
  latestNewsTitleColor?: string | null;
  showHeadline?: boolean;
  showSideBlock?: boolean;
  showLatestNews?: boolean;
};

const publicEditorialLayoutPolishStyles = `
  .public-matchday-panel.public-editorial-layout-panel {
    width: min(100%, 1200px) !important;
    max-width: 1200px !important;
    margin-left: auto !important;
    margin-right: auto !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .public-editorial-layout-panel .public-matchday-lead-grid > .public-matchday-news,
  .public-editorial-layout-panel .public-matchday-lead-grid > .public-side-editorial-block,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-main-lower,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-cover-side,
  .public-editorial-layout-panel .public-roundup-video-content > .public-matchday-roundup,
  .public-editorial-layout-panel .public-roundup-video-content > .public-roundup-video-panel {
    border-left: 0 !important;
    border-right: 0 !important;
  }

  .public-editorial-layout-panel .public-matchday-cover {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: none;
    gap: 20px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 18px 0 22px;
    align-items: start;
    min-height: 0;
  }

  .public-editorial-layout-panel .public-matchday-lead-grid {
    display: grid;
    column-gap: 20px;
    row-gap: 20px;
    align-items: stretch;
    min-width: 0;
  }

  .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="3"] {
    grid-template-columns: minmax(0, 1fr) minmax(220px, 235px) minmax(190px, 205px);
  }

  .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="2"] {
    grid-template-columns: minmax(0, 1fr) minmax(210px, 260px);
  }

  .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="1"] {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-editorial-layout-panel .public-matchday-lead-grid > * {
    grid-area: auto !important;
    min-width: 0;
  }

  .public-editorial-layout-panel .public-matchday-main-column {
    gap: 20px;
    padding: 0;
    border: 0;
    grid-template-rows: auto;
  }

  .public-editorial-layout-panel .public-cover-headline {
    grid-template-columns: minmax(250px, 1fr) minmax(0, 420px);
    grid-template-areas: "copy media";
    gap: 18px;
    min-height: 285px;
    padding: 0 0 10px;
  }

  .public-editorial-layout-panel .public-cover-headline-copy,
  .public-editorial-layout-panel .public-cover-headline-copy-link {
    grid-area: copy;
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }

  .public-editorial-layout-panel .public-editorial-main-image {
    grid-area: media;
    height: 300px;
    max-height: 300px;
  }

  .public-editorial-layout-panel .public-matchday-editorial h1,
  .public-editorial-layout-panel .public-matchday-editorial h2 {
    max-width: 100%;
    font-size: clamp(30px, 1.9vw, 34px);
    line-height: 1.03;
    letter-spacing: -0.015em;
    text-transform: none;
  }

  .public-editorial-layout-panel .public-matchday-editorial h1 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .public-editorial-layout-panel .public-cover-headline p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 6;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    font-size: 15px;
    line-height: 1.4;
  }

  .public-editorial-layout-panel .public-matchday-lead-grid > .public-matchday-news,
  .public-editorial-layout-panel .public-matchday-lead-grid > .public-side-editorial-block {
    align-self: stretch;
    height: 100%;
    min-height: 100%;
    padding: 0 0 0 20px;
    border: 0;
    border-left: 0 !important;
    background: transparent;
    box-shadow: none;
  }

  .public-editorial-layout-panel .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    min-height: 100%;
    align-content: start;
  }

  .public-editorial-layout-panel .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-image {
    aspect-ratio: 4 / 3;
  }

  .public-editorial-layout-panel .public-editorial-highlights-section {
    padding-top: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-main-lower,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-cover-side {
    padding-top: 0 !important;
    border-top: 0 !important;
    border-right: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .public-editorial-layout-panel .public-roundup-video-content > .public-matchday-roundup,
  .public-editorial-layout-panel .public-roundup-video-content > .public-roundup-video-panel {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .public-editorial-layout-panel .public-matchday-depth-row {
    display: grid;
    grid-template-columns: minmax(0, 1.72fr) minmax(280px, 0.78fr);
    gap: 24px;
    align-items: start;
    min-width: 0;
    padding-top: 18px;
    border-top: 1px solid #dbe4ee;
  }

  .public-editorial-layout-panel .public-matchday-depth-row-single {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-cover-side {
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-editorial-layout-panel .public-matchday-depth-row .public-below-headline-side {
    display: grid;
    gap: 12px;
    align-content: start;
    min-height: 0;
  }

  .public-editorial-layout-panel .public-matchday-depth-row:not(.public-matchday-depth-row-single) > .public-below-headline-side {
    margin-top: 0;
  }

  .public-editorial-layout-panel .public-matchday-depth-row:not(.public-matchday-depth-row-single) .public-roundup-zone-heading,
  .public-editorial-layout-panel .public-matchday-depth-row:not(.public-matchday-depth-row-single) > .public-below-headline-side > .public-editorial-section-title {
    box-sizing: border-box;
    height: 14px;
    min-height: 14px;
    margin: 0;
    padding: 0;
    line-height: 14px;
  }

  .public-editorial-layout-panel .public-matchday-main-lower {
    display: block;
    min-width: 0;
    padding: 0;
    border: 0;
  }

  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-main-lower,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-matchday-cover-side,
  .public-editorial-layout-panel .public-roundup-video-content > .public-matchday-roundup,
  .public-editorial-layout-panel .public-roundup-video-content > .public-roundup-video-panel {
    border-left: 0 !important;
    border-right: 0 !important;
  }

  .public-editorial-layout-panel .public-matchday-depth-row > .public-below-headline-side .public-editorial-section-title,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-below-headline-side .public-context-title {
    margin-top: 0 !important;
    padding-top: 0 !important;
    border-top: 0 !important;
  }

  .public-editorial-layout-panel .public-matchday-depth-row > .public-below-headline-side .public-editorial-section-title::before,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-below-headline-side .public-editorial-section-title::after,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-below-headline-side .public-context-title::before,
  .public-editorial-layout-panel .public-matchday-depth-row > .public-below-headline-side .public-context-title::after {
    content: none !important;
    display: none !important;
    border: 0 !important;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-editorial h1,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-editorial h2,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-cover-headline p,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-below-headline-highlights .public-cover-story strong,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-below-headline-highlights .public-cover-story small,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-news-title,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-side-editorial-label,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-side-editorial-copy strong,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-side-editorial-copy p,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row .public-editorial-section-title,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row .public-complement-body strong,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row .public-complement-body p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-editorial h1,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-editorial h2 {
    -webkit-line-clamp: 5;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-cover-headline p {
    -webkit-line-clamp: 6;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-below-headline-highlights .public-cover-story > span {
    display: none;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-below-headline-highlights .public-cover-story strong,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-below-headline-highlights .public-cover-story small {
    -webkit-line-clamp: 3;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-news .public-news-thumb {
    display: none;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-news-title {
    -webkit-line-clamp: 4;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-side-editorial-label {
    -webkit-line-clamp: 2;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-side-editorial-copy strong {
    -webkit-line-clamp: 6;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-side-editorial-copy p {
    -webkit-line-clamp: 15;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row .public-editorial-section-title,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row .public-complement-body strong,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row .public-complement-body p {
    -webkit-line-clamp: 1;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-headline-author {
    margin: 0;
    color: #607086;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
  }

  .public-editorial-layout-panel .public-depth-zone-heading-placeholder {
    visibility: hidden;
    pointer-events: none;
  }

  @media (max-width: 1180px) {
    .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="3"] {
      grid-template-columns: minmax(0, 1fr) minmax(210px, 230px);
    }

    .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="3"] > .public-matchday-main-column {
      grid-column: 1;
      grid-row: 1;
    }

    .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="3"] > .public-side-editorial-block {
      grid-column: 2;
      grid-row: 1;
    }

    .public-editorial-layout-panel .public-matchday-lead-grid[data-top-columns="3"] > .public-matchday-news {
      grid-column: 1 / -1;
      grid-row: 2;
      min-height: 0;
      padding: 20px 0 0;
      border-left: 0;
      border-top: 1px solid #dbe4ee;
    }

    .public-editorial-layout-panel .public-matchday-depth-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 840px) {
    .public-editorial-layout-panel .public-matchday-lead-grid,
    .public-editorial-layout-panel .public-matchday-depth-row {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 24px;
    }

    .public-editorial-layout-panel .public-matchday-lead-grid > * {
      grid-column: auto !important;
      grid-row: auto !important;
    }

    .public-editorial-layout-panel .public-matchday-lead-grid > .public-matchday-news,
    .public-editorial-layout-panel .public-matchday-lead-grid > .public-side-editorial-block {
      grid-column: auto !important;
      min-height: 0;
      padding: 20px 0 0;
      border-left: 0;
      border-top: 1px solid #dbe4ee;
    }
  }
  @media (max-width: 680px) {
    .public-editorial-layout-panel .public-cover-headline {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "copy"
        "media";
      min-height: 0;
    }
  }

`;

export function PublicSideBlock({
  data,
  ariaLabel = "Bloco editorial lateral da jornada",
  sectionTitle
}: {
  data: PublicSideBlockData;
  ariaLabel?: string;
  sectionTitle?: string;
}) {
  return (
    <aside className="public-matchday-feature public-side-editorial-block" aria-label={ariaLabel}>
      {sectionTitle ? <h3 className="public-context-title">{sectionTitle}</h3> : null}
      <div className="public-side-editorial-inner">
        {data.isPublished ? (
          <>
            {data.imageUrl ? (
              <div className="public-side-editorial-image">
                <img alt="" src={data.imageUrl} />
              </div>
            ) : null}
            <div className="public-side-editorial-copy">
              {data.label ? (
                <span className="public-side-editorial-label" style={data.labelColor ? { color: data.labelColor } : undefined}>
                  {data.label}
                </span>
              ) : null}
              {data.title ? (
                data.linkUrl ? (
                  <a className="public-side-editorial-title-link" href={data.linkUrl}>
                    <strong style={data.titleColor ? { color: data.titleColor } : undefined}>{data.title}</strong>
                  </a>
                ) : (
                  <strong style={data.titleColor ? { color: data.titleColor } : undefined}>{data.title}</strong>
                )
              ) : null}
              {data.author ? <small>{data.author}</small> : null}
              {data.text ? <p>{data.text}</p> : null}
            </div>
          </>
        ) : (
          <div className="public-side-editorial-placeholder">{data.placeholder ?? "Espaco editorial por definir"}</div>
        )}
      </div>
    </aside>
  );
}

export function PublicHeadlineBlock({ data }: { data: PublicHeadlineData }) {
  const title = data.title || data.fallbackTitle;
  const subtitle = data.subtitle || data.fallbackSubtitle;
  const linkUrl = data.linkUrl?.trim();
  const TitleTag = data.titleTag ?? "h2";
  const inlineMedia = data.inlineMedia;
  const media = inlineMedia ? (
    <div className="public-editorial-main-image">
      {inlineMedia.kind === "embed" && inlineMedia.embedUrl ? (
        <YouTubeEmbedWithFallback
          embedUrl={inlineMedia.embedUrl}
          posterUrl={inlineMedia.posterUrl || data.imageUrl}
          title={inlineMedia.title || title}
          videoUrl={inlineMedia.videoUrl}
        />
      ) : inlineMedia.kind === "direct_video" && inlineMedia.videoUrl ? (
        <video controls preload="metadata" poster={inlineMedia.posterUrl || data.imageUrl || undefined}>
          <source src={inlineMedia.videoUrl} />
          O seu navegador nao suporta video HTML5.
        </video>
      ) : null}
    </div>
  ) : data.imageUrl ? (
    <div className="public-editorial-main-image">
      <img src={data.imageUrl} alt="" />
    </div>
  ) : null;

  const copy = (
    <div className="public-cover-headline-copy">
      <TitleTag style={data.titleColor ? { color: data.titleColor } : undefined}>{title}</TitleTag>
      {data.author ? <small className="public-headline-author">{data.author}</small> : null}
      <p>{subtitle}</p>
    </div>
  );

  if (inlineMedia) {
    return (
      <article className="public-matchday-editorial">
        <div className="public-cover-headline">
          {linkUrl ? (
            <a
              aria-label={`Abrir ${title}`}
              className="public-cover-headline-copy-link"
              href={linkUrl}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {copy}
            </a>
          ) : (
            copy
          )}
          {media}
        </div>
      </article>
    );
  }

  const content = (
    <>
      {copy}
      {media}
    </>
  );

  return (
    <article className="public-matchday-editorial">
      {linkUrl ? (
        <a
          aria-label={`Abrir ${title}`}
          className="public-cover-headline public-cover-headline-link"
          href={linkUrl}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {content}
        </a>
      ) : (
        <div className="public-cover-headline">{content}</div>
      )}
    </article>
  );
}

function PublicHighlightCard({ item }: { item: PublicEditorialHighlight }) {
  const body = (
    <>
      <div className="public-highlight-image">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}</div>
      {item.label ? <span style={item.labelColor ? { color: item.labelColor } : undefined}>{item.label}</span> : null}
      <strong>{item.title}</strong>
      {item.subtitle ? <small>{item.subtitle}</small> : null}
    </>
  );

  return item.linkUrl ? (
    <a className="public-cover-story" href={item.linkUrl}>
      {body}
    </a>
  ) : (
    <article className="public-cover-story">{body}</article>
  );
}

export function PublicHighlightsBlock({ highlights }: { highlights: PublicEditorialHighlight[] }) {
  return (
    <div className="public-cover-story-strip">
      {highlights.map((item) => (
        <PublicHighlightCard item={item} key={item.id} />
      ))}
    </div>
  );
}

export function PublicComplementaryBlock({
  data,
  ariaLabel = "Bloco complementar da jornada",
  reserveHeadingSpace = false,
  sectionTitle
}: {
  data: PublicComplementaryData;
  ariaLabel?: string;
  reserveHeadingSpace?: boolean;
  sectionTitle?: string;
}) {
  const inlineMedia = data.inlineMedia;
  const hasVisibleContent =
    data.isPublished &&
    Boolean(inlineMedia || data.imageUrl || data.title || data.text || data.linkUrl);

  if (!hasVisibleContent) {
    return null;
  }
  const media = inlineMedia ? (
    <div className="public-complement-media">
      {inlineMedia.kind === "embed" && inlineMedia.embedUrl ? (
        <YouTubeEmbedWithFallback
          embedUrl={inlineMedia.embedUrl}
          posterUrl={inlineMedia.posterUrl || data.imageUrl}
          title={inlineMedia.title || data.title || "Conteúdo complementar"}
          videoUrl={inlineMedia.videoUrl}
        />
      ) : inlineMedia.kind === "direct_video" && inlineMedia.videoUrl ? (
        <video controls preload="metadata" poster={inlineMedia.posterUrl || data.imageUrl || undefined}>
          <source src={inlineMedia.videoUrl} />
          O seu navegador nao suporta video HTML5.
        </video>
      ) : null}
    </div>
  ) : data.imageUrl ? (
    <div className="public-complement-media">
      <img src={data.imageUrl} alt="" />
    </div>
  ) : null;

  return (
    <aside className="public-matchday-cover-side public-editorial-flex-block public-below-headline-side" data-editorial-slot="video-ou-imagem-noticia" aria-label={ariaLabel}>
      {sectionTitle ? (
        <h3 className="public-editorial-section-title">{sectionTitle}</h3>
      ) : reserveHeadingSpace ? (
        <h3 aria-hidden="true" className="public-editorial-section-title public-depth-zone-heading-placeholder">
          Vídeo
        </h3>
      ) : null}
      {media}
      <div className="public-complement-body">
        {data.title ? (
          data.linkUrl ? (
            <a className="public-complement-title-link" href={data.linkUrl}>
              <strong>{data.title}</strong>
            </a>
          ) : (
            <strong>{data.title}</strong>
          )
        ) : null}
        {data.text ? <p>{data.text}</p> : null}
      </div>
    </aside>
  );
}

function PublicHighlightsSection({ data }: { data: PublicBelowHeadlineData }) {
  if (data.highlights.length === 0) {
    return null;
  }

  return (
    <section
      className="public-matchday-roundup public-below-headline-highlights public-editorial-flex-block public-editorial-highlights-section"
      data-editorial-slot="destaques-da-manchete"
      aria-label={data.highlightHeading}
    >
      {data.highlightHeading.trim() ? (
        <div className="public-editorial-block-head">
          <span
            className="public-roundup-matchday-label"
            style={data.highlightHeadingColor ? { color: data.highlightHeadingColor } : undefined}
          >
            {data.highlightHeading}
          </span>
        </div>
      ) : null}
      <PublicHighlightsBlock highlights={data.highlights} />
    </section>
  );
}

function PublicRoundupSummary({ data, reserveHeadingSpace = false }: { data: PublicBelowHeadlineData; reserveHeadingSpace?: boolean }) {
  if (!data.showRoundupVideo || data.roundupItems.length === 0) {
    return null;
  }

  return (
    <div className="public-matchday-main-lower public-matchday-summary-column">
      <RoundupVideoSwitcher
        items={data.roundupItems}
        initialItemId={data.initialRoundupItemId ?? null}
        heading={data.roundupHeading}
        headingColor={data.roundupHeadingColor ?? null}
        matchdayNumber={data.matchdayNumber ?? null}
        reserveHeadingSpace={reserveHeadingSpace}
      />
    </div>
  );
}

export function PublicEditorialLayout({
  ariaLabel = "Capa da jornada",
  scope = "home",
  sideBlock,
  headline,
  belowHeadline,
  latestNews,
  latestNewsTitle,
  latestNewsTitleColor,
  showHeadline = true,
  showSideBlock = true,
  showLatestNews = true
}: PublicEditorialLayoutProps) {
  const hasHighlights = belowHeadline.highlights.length > 0;
  const hasMainColumn = showHeadline || hasHighlights;
  const hasLatestNews = showLatestNews && latestNews.length > 0;
  const hasSideBlock = showSideBlock && sideBlock.isPublished;
  const topColumnCount = [hasMainColumn, hasLatestNews, hasSideBlock].filter(Boolean).length;
  const hasRoundupSummary = belowHeadline.showRoundupVideo && belowHeadline.roundupItems.length > 0;
  const hasComplementary =
    belowHeadline.complementary.isPublished &&
    Boolean(
      belowHeadline.complementary.inlineMedia ||
      belowHeadline.complementary.imageUrl ||
      belowHeadline.complementary.title ||
      belowHeadline.complementary.text ||
      belowHeadline.complementary.linkUrl
    );
  const hasDepthRow = hasRoundupSummary || hasComplementary;

  if (topColumnCount === 0 && !hasDepthRow) {
    return null;
  }

  return (
    <section className="public-matchday-panel public-editorial-layout-panel" data-editorial-scope={scope} aria-label={ariaLabel}>
      <style>{publicEditorialLayoutPolishStyles}</style>
      <div className="public-matchday-cover">
        {topColumnCount > 0 ? (
          <div className="public-matchday-lead-grid" data-top-columns={topColumnCount}>
            {hasMainColumn ? (
              <div className="public-matchday-main-column">
                {showHeadline ? <PublicHeadlineBlock data={headline} /> : null}
                <PublicHighlightsSection data={belowHeadline} />
              </div>
            ) : null}
            {hasLatestNews ? (
              <PublicLatestNewsBlock items={latestNews} title={latestNewsTitle} titleColor={latestNewsTitleColor} constrainToMainColumn={scope === "matchday"} />
            ) : null}
            {hasSideBlock ? (
              <PublicSideBlock
                data={sideBlock}
                ariaLabel="Leitura editorial do tema principal"
              />
            ) : null}
          </div>
        ) : null}

        {hasDepthRow ? (
          <div className={`public-matchday-depth-row${hasRoundupSummary !== hasComplementary ? " public-matchday-depth-row-single" : ""}`}>
            <PublicRoundupSummary data={belowHeadline} reserveHeadingSpace={hasRoundupSummary && hasComplementary} />
            <PublicComplementaryBlock
              data={belowHeadline.complementary}
              ariaLabel="Aprofundamento editorial"
              reserveHeadingSpace={hasRoundupSummary && hasComplementary}
              sectionTitle={belowHeadline.complementary.label ?? undefined}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
