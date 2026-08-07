import RoundupVideoSwitcher, { type RoundupVideoItem } from "./RoundupVideoSwitcher";

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
  sideBlock: PublicSideBlockData;
  headline: PublicHeadlineData;
  belowHeadline: PublicBelowHeadlineData;
  latestNews: PublicEditorialLatestNews[];
  latestNewsTitle?: string;
};

const publicEditorialLayoutPolishStyles = `
  .public-matchday-panel .public-matchday-lead-grid > .public-matchday-news,
  .public-matchday-panel .public-matchday-lead-grid > .public-side-editorial-block,
  .public-matchday-panel .public-matchday-depth-row > .public-matchday-main-lower,
  .public-matchday-panel .public-matchday-depth-row > .public-matchday-cover-side,
  .public-matchday-panel .public-roundup-video-layout > .public-matchday-roundup,
  .public-matchday-panel .public-roundup-video-layout > .public-roundup-video-panel {
    border-left: 0 !important;
    border-right: 0 !important;
  }

  .public-matchday-panel .public-matchday-depth-row {
    border-top: 0 !important;
  }

  .public-matchday-panel .public-matchday-depth-row > .public-below-headline-side .public-editorial-section-title,
  .public-matchday-panel .public-matchday-depth-row > .public-below-headline-side .public-context-title {
    margin-top: 0 !important;
    padding-top: 0 !important;
    border-top: 0 !important;
  }

  .public-matchday-panel .public-matchday-depth-row > .public-below-headline-side .public-editorial-section-title::before,
  .public-matchday-panel .public-matchday-depth-row > .public-below-headline-side .public-editorial-section-title::after,
  .public-matchday-panel .public-matchday-depth-row > .public-below-headline-side .public-context-title::before,
  .public-matchday-panel .public-matchday-depth-row > .public-below-headline-side .public-context-title::after {
    content: none !important;
    display: none !important;
    border: 0 !important;
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
        <iframe
          src={inlineMedia.embedUrl}
          title={inlineMedia.title || title}
          allow="encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
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
  sectionTitle
}: {
  data: PublicComplementaryData;
  ariaLabel?: string;
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
        <iframe
          src={inlineMedia.embedUrl}
          title={inlineMedia.title || data.title || "Conteudo complementar"}
          allow="encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
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
      {sectionTitle ? <h3 className="public-editorial-section-title">{sectionTitle}</h3> : null}
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

function PublicRoundupSummary({ data }: { data: PublicBelowHeadlineData }) {
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
      />
    </div>
  );
}

export function PublicLatestNewsBlock({ items, title }: { items: PublicEditorialLatestNews[]; title?: string }) {
  const visibleTitle = title?.trim() ?? "";

  return (
    <aside className="public-matchday-news" aria-label={visibleTitle || "NotÃ­cias"}>
      {visibleTitle ? <h3>{visibleTitle}</h3> : null}
      <ul className="public-news-list">
        {items.map((item) => (
          <li className="public-news-item" key={item.id}>
            {item.imageUrl ? (
              <div className="public-news-thumb">
                <img alt="" src={item.imageUrl} />
              </div>
            ) : null}
            <div className="public-news-copy">
              {item.timeLabel ? (
                <time dateTime={item.timeLabel} style={item.timeLabelColor ? { color: item.timeLabelColor } : undefined}>
                  {item.timeLabel}
                </time>
              ) : null}
              {item.linkUrl ? (
                <a className="public-news-title" href={item.linkUrl}>{item.title}</a>
              ) : (
                <span className="public-news-title">{item.title}</span>
              )}
              {item.subtitle ? <p className="public-news-subtitle">{item.subtitle}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function PublicEditorialLayout({ ariaLabel = "Capa da jornada", sideBlock, headline, belowHeadline, latestNews, latestNewsTitle }: PublicEditorialLayoutProps) {
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

  return (
    <section className="public-matchday-panel" aria-label={ariaLabel}>
      <style>{publicEditorialLayoutPolishStyles}</style>
      <div className="public-matchday-cover">
        <div className="public-matchday-lead-grid">
          <div className="public-matchday-main-column">
            <PublicHeadlineBlock data={headline} />
            <PublicHighlightsSection data={belowHeadline} />
          </div>
          <PublicLatestNewsBlock items={latestNews} title={latestNewsTitle} />
          <PublicSideBlock
            data={sideBlock}
            ariaLabel="Leitura editorial do tema principal"
          />
        </div>

        {hasRoundupSummary || hasComplementary ? (
          <div className={`public-matchday-depth-row${hasRoundupSummary ? "" : " public-matchday-depth-row-complement-only"}`}>
            <PublicRoundupSummary data={belowHeadline} />
            <PublicComplementaryBlock
              data={belowHeadline.complementary}
              ariaLabel="Aprofundamento editorial"
              sectionTitle={belowHeadline.complementary.label ?? undefined}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
