import Link from "next/link";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import { PublicEditorialLayout, type PublicEditorialHighlight, type PublicEditorialLatestNews } from "@/components/public/PublicEditorialLayout";
import PublicHorizontalNewsStrip from "@/components/public/PublicHorizontalNewsStrip";
import PublicMatchStrip, { type PublicMatchStripMatch } from "@/components/public/PublicMatchStrip";
import { publicEditorialStyles } from "@/components/public/publicEditorialStyles";
import { buildEditorialHorizontalNewsItems } from "@/lib/editorial-horizontal-news";
import { readPublicCompetitionMenu } from "@/lib/public-competition-menu";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SiteEditorial = {
  id: string;
  slug: string;
  status: "draft" | "published";
  headline_title: string | null;
  headline_subtitle: string | null;
  headline_image_url: string | null;
  headline_link_url: string | null;
  headline_title_color: string | null;
  below_headline_mode: "highlights" | "roundup" | null;
  below_headline_heading: string | null;
  below_headline_heading_color: string | null;
  side_block_status: "draft" | "published";
  side_block_type: string | null;
  side_block_label: string | null;
  side_block_label_color: string | null;
  side_block_title: string | null;
  side_block_title_color: string | null;
  side_block_author: string | null;
  side_block_text: string | null;
  side_block_image_url: string | null;
  side_block_link_url: string | null;
  complementary_mode: "none" | "complementary_story" | "roundup_video" | null;
  complementary_roundup_item_id: string | null;
  complementary_label: string | null;
  complementary_title: string | null;
  complementary_text: string | null;
  complementary_image_url: string | null;
  complementary_link_url: string | null;
  complementary_status: "draft" | "published";
  roundup_video_heading: string | null;
  roundup_video_heading_color: string | null;
  final_zone_title: string | null;
  final_zone_title_color: string | null;
  final_zone_mode: "latest_news" | "editorial_line" | null;
};

type SiteHighlight = {
  id: string;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: "draft" | "published";
};

type SiteRoundupItem = {
  id: string;
  sort_order: number;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  video_url: string | null;
  duration: string | null;
  type: "video" | "golos" | "resumo" | "noticia";
  status: "draft" | "published";
};

type SiteLatestNews = {
  id: string;
  time_label: string | null;
  time_label_color: string | null;
  title: string | null;
  subtitle: string | null;
  link_url: string | null;
  image_url: string | null;
  sort_order: number;
  status: "draft" | "published";
};

type SiteHorizontalNews = {
  id: string;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: "draft" | "published";
};

type EditorialContentHeadlineMediaRow = {
  slug: string;
  status: "draft" | "published" | "archived";
  content_type: string | null;
  video_url: string | null;
  video_provider: string | null;
  embed_url: string | null;
  is_embeddable: boolean | null;
  thumbnail_url: string | null;
  image_url: string | null;
  image_caption: string | null;
  title: string | null;
};

type HomeHeadlineInlineMedia = {
  kind: "embed" | "direct_video";
  embedUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  caption: string | null;
  contentSlug: string;
  contentType: string | null;
  title: string | null;
};

type SiteFeaturedMatch = {
  match_id: string;
  sort_order: number | null;
  created_at: string | null;
};

type HomeMatchRow = {
  id: string;
  matchday_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  scheduled_date: string | null;
  kickoff_at: string | null;
  status: string | null;
  minute: number | string | null;
  live_started_at: string | null;
  live_base_minute: number | string | null;
  is_clock_running: boolean | null;
  home_score: number | null;
  away_score: number | null;
  broadcast_channel_id: string | null;
};

type HomeMatchdayRow = {
  id: string;
  number: number | null;
};

type HomeTeamRow = {
  id: string;
  name: string | null;
  public_name: string | null;
  short_name: string | null;
  code: string | null;
  slug: string | null;
  logo_url: string | null;
};

type HomeBroadcastLinkRow = {
  match_id: string | null;
  broadcast_channel_id: string | null;
};

type HomeBroadcastChannelRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
};

const fallbackHighlights = [
  {
    id: "fallback-highlight-1",
    label: "Antevisao",
    label_color: null,
    title: "Os temas fortes antes da bola rolar",
    subtitle: "",
    image_url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=700&q=80",
    link_url: null
  },
  {
    id: "fallback-highlight-2",
    label: "Ambiente",
    label_color: null,
    title: "A jornada vista pelas bancadas e pelos protagonistas",
    subtitle: "",
    image_url: "https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=700&q=80",
    link_url: null
  },
  {
    id: "fallback-highlight-3",
    label: "Contexto",
    label_color: null,
    title: "O futebol contado antes, durante e depois do jogo",
    subtitle: "",
    image_url: "https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=700&q=80",
    link_url: null
  }
];

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function contentSlugFromHref(value: string | null | undefined) {
  const trimmed = cleanText(value);
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, "https://jornada.pt");
    if (url.hostname !== "jornada.pt" && url.hostname !== "www.jornada.pt") return null;
    const [section, slug] = url.pathname.split("/").filter(Boolean);
    return section === "conteudos" && slug ? decodeURIComponent(slug) : null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(value: string) {
  try {
    return /\.(mp4|webm|ogg)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

async function readHomeHeadlineInlineMedia(linkUrl: string | null | undefined, fallbackPosterUrl: string | null | undefined): Promise<HomeHeadlineInlineMedia | null> {
  const slug = contentSlugFromHref(linkUrl);
  if (!slug) return null;

  const rows = await fetchSupabaseAdminTable<EditorialContentHeadlineMediaRow>(
    `editorial_contents?select=slug,status,content_type,video_url,video_provider,embed_url,is_embeddable,thumbnail_url,image_url,image_caption,title&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`
  ).catch(() => []);
  const content = rows[0] ?? null;
  if (!content) return null;

  const embedUrl = cleanText(content.embed_url);
  const videoUrl = cleanText(content.video_url);
  const posterUrl = cleanText(content.thumbnail_url) || cleanText(content.image_url) || cleanText(fallbackPosterUrl);
  const base = {
    posterUrl,
    caption: cleanText(content.image_caption),
    contentSlug: content.slug,
    contentType: cleanText(content.content_type),
    title: cleanText(content.title)
  };

  if (content.is_embeddable && embedUrl) {
    return { ...base, kind: "embed", embedUrl, videoUrl: null };
  }

  if (videoUrl && isDirectVideoUrl(videoUrl)) {
    return { ...base, kind: "direct_video", embedUrl: null, videoUrl };
  }

  return null;
}

function inFilter(values: string[]) {
  return `in.(${values.map((value) => encodeURIComponent(value)).join(",")})`;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function readRowsById<T extends { id: string }>(table: string, select: string, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, T>();
  }

  const rows = await fetchSupabaseAdminTable<T>(
    `${table}?select=${select}&id=${inFilter(ids)}`
  ).catch(() => []);

  return new Map(rows.map((row) => [row.id, row]));
}

function sideBlockTypeLabel(type: string | null | undefined) {
  const labels: Record<string, string> = {
    opiniao: "OPINIAO",
    arbitragem: "ARBITRAGEM",
    balanco: "BALANCO",
    analise: "ANALISE",
    cronica: "CRONICA",
    "figura-da-jornada": "FIGURA"
  };

  return type ? labels[type] ?? type.toUpperCase() : null;
}

async function readHomeEditorial() {
  const editorials = await fetchSupabaseAdminTable<SiteEditorial>(
    "site_editorials?select=id,slug,status,headline_title,headline_subtitle,headline_image_url,headline_link_url,headline_title_color,below_headline_mode,below_headline_heading,below_headline_heading_color,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,final_zone_title,final_zone_title_color,final_zone_mode&slug=eq.home&limit=1"
  ).catch(() => []);

  return editorials[0] ?? null;
}

async function readHomeHighlights(siteEditorialId: string) {
  return fetchSupabaseAdminTable<SiteHighlight>(
    `site_editorial_highlights?select=id,label,label_color,title,subtitle,image_url,link_url,sort_order,status&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&status=eq.published&order=sort_order.asc&limit=3`
  ).catch(() => []);
}

async function readHomeRoundupItems(siteEditorialId: string) {
  return fetchSupabaseAdminTable<SiteRoundupItem>(
    `site_editorial_roundup_items?select=id,sort_order,label,title,subtitle,image_url,video_url,duration,type,status&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&status=eq.published&order=sort_order.asc&limit=20`
  ).catch(() => []);
}

async function readHomeLatestNews(siteEditorialId: string) {
  return fetchSupabaseAdminTable<SiteLatestNews>(
    `site_editorial_latest_news?select=id,time_label,time_label_color,title,subtitle,link_url,image_url,sort_order,status&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&status=eq.published&order=sort_order.asc&limit=8`
  ).catch(() => []);
}

async function readHomeHorizontalNews(siteEditorialId: string) {
  return fetchSupabaseAdminTable<SiteHorizontalNews>(
    `site_editorial_horizontal_news?select=id,label,title,subtitle,image_url,link_url,sort_order,status&site_editorial_id=eq.${encodeURIComponent(siteEditorialId)}&status=eq.published&order=sort_order.asc&limit=4`
  ).catch(() => []);
}

async function readHomeFeaturedMatches(): Promise<PublicMatchStripMatch[]> {
  const featuredRows = await fetchSupabaseAdminTable<SiteFeaturedMatch>(
    "site_featured_matches?select=match_id,sort_order,created_at&order=sort_order.asc.nullslast,created_at.asc"
  ).catch(() => []);
  const matchIds = featuredRows.map((row) => row.match_id);

  if (matchIds.length === 0) {
    return [];
  }

  const matchesById = await readRowsById<HomeMatchRow>(
    "matches",
    "id,matchday_id,home_team_id,away_team_id,scheduled_date,kickoff_at,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score,broadcast_channel_id",
    matchIds
  );
  const matches = Array.from(matchesById.values());
  const [teamsById, matchdaysById, broadcastChannelsByMatchId] = await Promise.all([
    readRowsById<HomeTeamRow>(
      "teams",
      "id,name,public_name,short_name,code,slug,logo_url",
      uniqueValues(matches.flatMap((match) => [match.home_team_id, match.away_team_id]))
    ),
    readRowsById<HomeMatchdayRow>(
      "matchdays",
      "id,number",
      uniqueValues(matches.map((match) => match.matchday_id))
    ),
    readBroadcastChannelsByMatchId(matchIds, matches)
  ]);
  const sortOrderByMatchId = new Map(featuredRows.map((row) => [row.match_id, row.sort_order]));

  const selectedMatches: PublicMatchStripMatch[] = [];

  for (const matchId of matchIds) {
    const match = matchesById.get(matchId);
    if (!match) continue;

    selectedMatches.push({
      id: match.id,
      scheduled_date: match.scheduled_date,
      kickoff_at: match.kickoff_at,
      matchdayNumber: match.matchday_id ? matchdaysById.get(match.matchday_id)?.number ?? null : null,
      status: match.status ?? "scheduled",
      minute: match.minute,
      live_started_at: match.live_started_at,
      live_base_minute: match.live_base_minute,
      is_clock_running: match.is_clock_running,
      home_score: match.home_score,
      away_score: match.away_score,
      homeTeam: match.home_team_id ? teamsById.get(match.home_team_id) ?? null : null,
      awayTeam: match.away_team_id ? teamsById.get(match.away_team_id) ?? null : null,
      broadcastChannel: broadcastChannelsByMatchId.get(match.id) ?? null
    });
  }

  return selectedMatches.sort((first, second) => {
    if (first.matchdayNumber !== second.matchdayNumber) {
      if (first.matchdayNumber === null) return 1;
      if (second.matchdayNumber === null) return -1;
      return first.matchdayNumber - second.matchdayNumber;
    }

    if (first.scheduled_date !== second.scheduled_date) {
      if (first.scheduled_date === null) return 1;
      if (second.scheduled_date === null) return -1;
      return first.scheduled_date.localeCompare(second.scheduled_date);
    }

    if (first.kickoff_at !== second.kickoff_at) {
      if (first.kickoff_at === null || first.kickoff_at === undefined) return 1;
      if (second.kickoff_at === null || second.kickoff_at === undefined) return -1;
      const firstTime = new Date(first.kickoff_at).getTime();
      const secondTime = new Date(second.kickoff_at).getTime();
      const firstValid = !Number.isNaN(firstTime);
      const secondValid = !Number.isNaN(secondTime);
      if (firstValid && secondValid && firstTime !== secondTime) return firstTime - secondTime;
      if (firstValid !== secondValid) return firstValid ? -1 : 1;
    }

    const firstOrder = sortOrderByMatchId.get(first.id) ?? null;
    const secondOrder = sortOrderByMatchId.get(second.id) ?? null;
    if (firstOrder !== null && secondOrder !== null && firstOrder !== secondOrder) return firstOrder - secondOrder;
    if (firstOrder !== null && secondOrder === null) return -1;
    if (firstOrder === null && secondOrder !== null) return 1;
    return first.id.localeCompare(second.id);
  });
}

async function readBroadcastChannelsByMatchId(matchIds: string[], matches: HomeMatchRow[] = []) {
  const empty = new Map<string, HomeBroadcastChannelRow>();
  if (matchIds.length === 0) return empty;

  const directChannelIdsByMatchId = new Map(
    matches
      .filter((match) => Boolean(match.broadcast_channel_id))
      .map((match) => [match.id, match.broadcast_channel_id as string])
  );
  const directChannelsById = await readRowsById<HomeBroadcastChannelRow>(
    "broadcast_channels",
    "id,name,logo_url",
    uniqueValues(Array.from(directChannelIdsByMatchId.values()))
  );
  const channelsByMatchId = new Map<string, HomeBroadcastChannelRow>();

  for (const [matchId, channelId] of directChannelIdsByMatchId) {
    const channel = directChannelsById.get(channelId);
    if (channel) {
      channelsByMatchId.set(matchId, channel);
    }
  }

  const matchFilter = inFilter(matchIds);
  const relationQueries = [
    `match_broadcast_channels?select=match_id,broadcast_channel_id&match_id=${matchFilter}`,
    `match_broadcasts?select=match_id,broadcast_channel_id&match_id=${matchFilter}`,
    `matches_broadcast_channels?select=match_id,broadcast_channel_id&match_id=${matchFilter}`
  ];
  let links: HomeBroadcastLinkRow[] = [];

  for (const query of relationQueries) {
    links = await fetchSupabaseAdminTable<HomeBroadcastLinkRow>(query).catch(() => []);
    if (links.length > 0) break;
  }

  if (links.length === 0) return channelsByMatchId;

  const channelsById = await readRowsById<HomeBroadcastChannelRow>(
    "broadcast_channels",
    "id,name,logo_url",
    uniqueValues(links.map((link) => link.broadcast_channel_id))
  );

  for (const link of links) {
    if (!link.match_id || !link.broadcast_channel_id || channelsByMatchId.has(link.match_id)) continue;
    const channel = channelsById.get(link.broadcast_channel_id);
    if (channel) {
      channelsByMatchId.set(link.match_id, channel);
    }
  }

  return channelsByMatchId;
}

export default async function HomePage() {
  const editorial = await readHomeEditorial();
  const [featuredMatches, competitionLinks] = await Promise.all([readHomeFeaturedMatches(), readPublicCompetitionMenu()]);
  const [highlights, roundupItems, latestNews, horizontalNews]: [SiteHighlight[], SiteRoundupItem[], SiteLatestNews[], SiteHorizontalNews[]] = editorial
    ? await Promise.all([
        readHomeHighlights(editorial.id),
        readHomeRoundupItems(editorial.id),
        readHomeLatestNews(editorial.id),
        readHomeHorizontalNews(editorial.id)
      ])
    : [[], [], [], []];
  const headlineIsPublished = editorial?.status === "published";
  const headlineTitle = headlineIsPublished ? cleanText(editorial.headline_title) : null;
  const headlineSubtitle = headlineIsPublished ? cleanText(editorial.headline_subtitle) : null;
  const headlineImageUrl = headlineIsPublished ? cleanText(editorial.headline_image_url) : null;
  const headlineLinkUrl = headlineIsPublished ? cleanText(editorial.headline_link_url) : null;
  const headlineTitleColor = headlineIsPublished ? cleanText(editorial.headline_title_color) : null;
  const headlineInlineMedia = await readHomeHeadlineInlineMedia(headlineLinkUrl, headlineImageUrl);
  const belowHeadlineMode = editorial?.below_headline_mode === "roundup" ? "roundup" : "highlights";
  const belowHeadlineHeading =
    cleanText(editorial?.below_headline_heading) || (belowHeadlineMode === "roundup" ? "Resumo da Jornada" : "Destaques");
  const belowHeadlineHeadingColor = cleanText(editorial?.below_headline_heading_color);
  const hasPublishedSideBlock =
    editorial?.side_block_status === "published" &&
    Boolean(cleanText(editorial.side_block_title) || cleanText(editorial.side_block_text));
  const sideBlockLabel = cleanText(editorial?.side_block_label) || sideBlockTypeLabel(editorial?.side_block_type);
  const sideBlockLabelColor = cleanText(editorial?.side_block_label_color);
  const sideBlockTitle = cleanText(editorial?.side_block_title);
  const sideBlockText = cleanText(editorial?.side_block_text);
  const sideBlockAuthor = cleanText(editorial?.side_block_author);
  const sideBlockImageUrl = cleanText(editorial?.side_block_image_url);
  const sideBlockLinkUrl = cleanText(editorial?.side_block_link_url);
  const sideBlockTitleColor = cleanText(editorial?.side_block_title_color);
  const complementaryMode = editorial?.complementary_mode ?? "none";
  const complementaryLabel = cleanText(editorial?.complementary_label);
  const complementaryTitle = cleanText(editorial?.complementary_title);
  const complementaryText = cleanText(editorial?.complementary_text);
  const complementaryImageUrl = cleanText(editorial?.complementary_image_url);
  const complementaryLinkUrl = cleanText(editorial?.complementary_link_url);
  const hasComplementaryStory =
    editorial?.complementary_status === "published" &&
    Boolean(complementaryTitle || complementaryText || complementaryImageUrl);
  const complementaryInlineMedia = hasComplementaryStory
    ? complementaryLinkUrl && complementaryLinkUrl === headlineLinkUrl
      ? headlineInlineMedia
      : await readHomeHeadlineInlineMedia(complementaryLinkUrl, complementaryImageUrl)
    : null;
  const validHighlights = highlights.filter((item) => Boolean(cleanText(item.title) || cleanText(item.image_url) || cleanText(item.link_url)));
  const validRoundupItems = roundupItems.filter((item) => Boolean(cleanText(item.title) || cleanText(item.image_url) || cleanText(item.video_url)));
  const visibleHighlights = belowHeadlineMode === "highlights" ? (validHighlights.length > 0 ? validHighlights : fallbackHighlights) : [];
  const visibleRoundupItems = belowHeadlineMode === "roundup" || complementaryMode === "roundup_video" ? validRoundupItems : [];
  const hasRoundupVideoBlock = (belowHeadlineMode === "roundup" || complementaryMode === "roundup_video") && visibleRoundupItems.length > 0;
  const publicHighlights: PublicEditorialHighlight[] = visibleHighlights.slice(0, 3).map((item) => ({
    id: item.id,
    label: cleanText(item.label),
    labelColor: cleanText(item.label_color),
    title: cleanText(item.title),
    subtitle: cleanText(item.subtitle),
    imageUrl: cleanText(item.image_url),
    linkUrl: cleanText(item.link_url)
  }));
  const publicRoundupItems: SiteRoundupItem[] = visibleRoundupItems.map((item) => ({
    ...item,
    label: cleanText(item.label),
    title: cleanText(item.title),
    subtitle: cleanText(item.subtitle),
    image_url: cleanText(item.image_url),
    video_url: cleanText(item.video_url),
    duration: cleanText(item.duration)
  }));
  const finalZoneTitle = cleanText(editorial?.final_zone_title);
  const publicLatestNews: PublicEditorialLatestNews[] = latestNews.map((item) => ({
    id: item.id,
    timeLabel: cleanText(item.time_label),
    timeLabelColor: cleanText(item.time_label_color),
    title: cleanText(item.title) || "Noticia",
    subtitle: cleanText(item.subtitle),
    imageUrl: cleanText(item.image_url),
    linkUrl: cleanText(item.link_url)
  }));
  const publicHorizontalNews = buildEditorialHorizontalNewsItems(
    horizontalNews.map((item) => ({
      id: item.id,
      label: item.label,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.image_url,
      linkUrl: item.link_url,
      sortOrder: item.sort_order
    })),
    4
  );

  return (
    <main className="public-matchday-shell">
      <style>{publicEditorialStyles}</style>
      <div className="public-top-stack">
      <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
        <Link className="public-site-brand" href="/" aria-label="Jornada.pt">
          Jornada<span>.pt</span>
        </Link>
        <PublicCompetitionNavigation competitions={competitionLinks} />
        <div className="public-site-actions" aria-label="Acoes">
          <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
          <Link href="/admin/login">Entrar</Link>
        </div>
      </header>
      </div>

      <PublicMatchStrip matches={featuredMatches} variant="home" />

      <PublicEditorialLayout
        ariaLabel="Capa da jornada"
        sideBlock={{
          isPublished: hasPublishedSideBlock,
          label: sideBlockLabel,
          labelColor: sideBlockLabelColor,
          title: sideBlockTitle,
          titleColor: sideBlockTitleColor,
          author: sideBlockAuthor,
          text: sideBlockText,
          imageUrl: sideBlockImageUrl,
          linkUrl: sideBlockLinkUrl,
          placeholder: "Espaco editorial por definir"
        }}
        headline={{
          title: headlineTitle,
          subtitle: headlineSubtitle,
          imageUrl: headlineImageUrl,
          linkUrl: headlineLinkUrl,
          inlineMedia: headlineInlineMedia,
          titleColor: headlineTitleColor,
          fallbackTitle: "Jornada.pt",
          fallbackSubtitle: "A capa editorial do futebol, pronta para acompanhar os grandes temas antes, durante e depois dos jogos."
        }}
        belowHeadline={{
          mode: belowHeadlineMode,
          label: belowHeadlineHeading,
          labelColor: belowHeadlineHeadingColor,
          highlights: publicHighlights,
          roundupItems: publicRoundupItems,
          showRoundupVideo: hasRoundupVideoBlock,
          roundupHeading: editorial?.roundup_video_heading ?? null,
          roundupHeadingColor: editorial?.roundup_video_heading_color ?? null,
          initialRoundupItemId: editorial?.complementary_roundup_item_id ?? null,
          complementary: {
            isPublished: Boolean(hasComplementaryStory && editorial),
            label: complementaryLabel,
            title: complementaryTitle,
            text: complementaryText,
            imageUrl: complementaryImageUrl,
            linkUrl: complementaryLinkUrl,
            inlineMedia: complementaryInlineMedia,
            fallbackTitle: "Leitura editorial",
            fallbackText: "O complemento da capa fica reservado para a proxima historia publicada."
          }
        }}
        latestNews={publicLatestNews}
        latestNewsTitle={finalZoneTitle ?? ""}
      />

      <PublicHorizontalNewsStrip items={publicHorizontalNews} ariaLabel="Mais noticias da Home" />
    </main>
  );
}
