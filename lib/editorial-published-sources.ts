import { fetchSupabaseAdminTable } from "@/lib/supabase";

export type EditorialPublishedSource = {
  source_type: "article" | "editorial_content";
  source_id: string;
  source_slug: string;
  content_type: string;
  media_kind: "image" | "video" | "mixed";
  label: string | null;
  author: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  embed_url: string | null;
  duration: string | null;
  link_url: string;
  published_at: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
  origin_label: string;
};

export type EditorialPublishedSourceOptions = {
  competitionId?: string | null;
  seasonId?: string | null;
  matchdayId?: string | null;
};

type EditorialPublishedSourceContext = {
  competitionId: string | null;
  seasonId: string | null;
  matchdayId: string | null;
};

type EditorialArticleRow = {
  id: string;
  slug: string | null;
  title: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  label?: string | null;
  author?: string | null;
  status: string | null;
  published_at?: string | null;
  created_at?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
};

type EditorialContentRow = {
  id: string;
  slug: string | null;
  status: string | null;
  content_type: string | null;
  label: string | null;
  author: string | null;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  body: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  embed_url: string | null;
  duration: string | null;
  published_at: string | null;
  created_at: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
};

function cleanText(value: string | null | undefined) {
  const cleanValue = value?.trim();
  return cleanValue || null;
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleanValue = cleanText(value);
    if (cleanValue) {
      return cleanValue;
    }
  }

  return null;
}

function publicContentHref(kind: "article" | "editorial_content", slug: string) {
  return kind === "article" ? `/noticias/${encodeURIComponent(slug)}` : `/conteudos/${encodeURIComponent(slug)}`;
}

export function matchesContextScope(
  source: { competition_id?: string | null; season_id?: string | null; matchday_id?: string | null },
  context: EditorialPublishedSourceContext
) {
  const sourceCompetitionId = cleanText(source.competition_id);
  const sourceSeasonId = cleanText(source.season_id);
  const sourceMatchdayId = cleanText(source.matchday_id);

  const matchesCompetition = !context.competitionId || !sourceCompetitionId || sourceCompetitionId === context.competitionId;
  const matchesSeason = !context.seasonId || !sourceSeasonId || sourceSeasonId === context.seasonId;
  const matchesMatchday = !context.matchdayId || !sourceMatchdayId || sourceMatchdayId === context.matchdayId;

  return matchesCompetition && matchesSeason && matchesMatchday;
}

export function buildEditorialPublishedSourceContextFilter(
  options: EditorialPublishedSourceOptions = {},
) {
  const filters = [
    ["competition_id", cleanText(options.competitionId)],
    ["season_id", cleanText(options.seasonId)],
    ["matchday_id", cleanText(options.matchdayId)],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([column, value]) => `or(${column}.is.null,${column}.eq.${encodeURIComponent(value)})`);

  return filters.length > 0 ? `&and=(${filters.join(",")})` : "";
}

function contentMediaKind(content: EditorialContentRow): EditorialPublishedSource["media_kind"] {
  const hasVideo = Boolean(firstText(content.video_url, content.embed_url));
  const hasImage = Boolean(firstText(content.thumbnail_url, content.image_url));
  const hasText = Boolean(firstText(content.subtitle, content.summary, content.body));

  if (hasVideo && hasText) {
    return "mixed";
  }

  if (hasVideo) {
    return "video";
  }

  return hasImage ? "image" : "image";
}

function contentOriginLabel(content: EditorialContentRow) {
  const contentType = cleanText(content.content_type);

  if (contentType === "video") {
    return "Video";
  }

  if (contentType === "reportagem") {
    return "Reportagem";
  }

  if (contentType === "entrevista") {
    return "Entrevista";
  }

  if (contentType === "especial") {
    return "Especial";
  }

  return "Conteudo editorial";
}

function normalizeArticle(article: EditorialArticleRow): EditorialPublishedSource | null {
  const slug = cleanText(article.slug);
  const title = cleanText(article.title);

  if (!slug || !title) {
    return null;
  }

  return {
    source_type: "article",
    source_id: article.id,
    source_slug: slug,
    content_type: "article",
    media_kind: "image",
    label: cleanText(article.label),
    author: cleanText(article.author),
    title,
    subtitle: cleanText(article.subtitle),
    summary: null,
    image_url: cleanText(article.image_url),
    thumbnail_url: null,
    video_url: null,
    embed_url: null,
    duration: null,
    link_url: publicContentHref("article", slug),
    published_at: cleanText(article.published_at) ?? cleanText(article.created_at),
    competition_id: cleanText(article.competition_id),
    season_id: cleanText(article.season_id),
    matchday_id: cleanText(article.matchday_id),
    origin_label: "Artigo / Noticia",
  };
}

function normalizeContent(content: EditorialContentRow): EditorialPublishedSource | null {
  const slug = cleanText(content.slug);
  const title = cleanText(content.title);

  if (!slug || !title) {
    return null;
  }

  return {
    source_type: "editorial_content",
    source_id: content.id,
    source_slug: slug,
    content_type: cleanText(content.content_type) ?? "conteudo",
    media_kind: contentMediaKind(content),
    label: cleanText(content.label),
    author: cleanText(content.author),
    title,
    subtitle: cleanText(content.subtitle),
    summary: cleanText(content.summary),
    image_url: cleanText(content.image_url),
    thumbnail_url: cleanText(content.thumbnail_url),
    video_url: cleanText(content.video_url),
    embed_url: cleanText(content.embed_url),
    duration: cleanText(content.duration),
    link_url: publicContentHref("editorial_content", slug),
    published_at: cleanText(content.published_at) ?? cleanText(content.created_at),
    competition_id: cleanText(content.competition_id),
    season_id: cleanText(content.season_id),
    matchday_id: cleanText(content.matchday_id),
    origin_label: contentOriginLabel(content),
  };
}

function publishedTime(value: EditorialPublishedSource) {
  const date = value.published_at ? new Date(value.published_at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

export async function getEditorialPublishedSources(options: EditorialPublishedSourceOptions = {}): Promise<EditorialPublishedSource[]> {
  const competitionId = cleanText(options.competitionId);
  const seasonId = cleanText(options.seasonId);
  const matchdayId = cleanText(options.matchdayId);
  const contextFilter = buildEditorialPublishedSourceContextFilter({ competitionId, seasonId, matchdayId });
  const [articleRows, contentRows] = await Promise.all([
    fetchSupabaseAdminTable<EditorialArticleRow>(
      `editorial_articles?select=id,slug,title,subtitle,label,author,image_url,status,published_at,created_at,competition_id,season_id,matchday_id&status=eq.published${contextFilter}&order=published_at.desc.nullslast,created_at.desc.nullslast`,
    ).catch(() => []),
    fetchSupabaseAdminTable<EditorialContentRow>(
      `editorial_contents?select=id,slug,status,content_type,label,author,title,subtitle,summary,body,image_url,thumbnail_url,video_url,embed_url,duration,published_at,created_at,competition_id,season_id,matchday_id&status=eq.published${contextFilter}&order=published_at.desc.nullslast,created_at.desc.nullslast`,
    ).catch(() => []),
  ]);

  const context = { competitionId, seasonId, matchdayId };
  const scopedArticleRows = articleRows.filter((article) => matchesContextScope(article, context));
  const scopedContentRows = contentRows.filter((content) => matchesContextScope(content, context));

  return [
    ...scopedArticleRows.map(normalizeArticle),
    ...scopedContentRows.map(normalizeContent),
  ]
    .filter((source): source is EditorialPublishedSource => Boolean(source))
    .sort((left, right) => publishedTime(right) - publishedTime(left));
}
