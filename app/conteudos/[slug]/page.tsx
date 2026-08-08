import type { Metadata } from "next";
import { notFound } from "next/navigation";

import YouTubeEmbedWithFallback from "@/components/public/YouTubeEmbedWithFallback";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type EditorialContent = {
  id: string;
  slug: string | null;
  status: string | null;
  scope: string | null;
  content_type: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  body: string | null;
  author: string | null;
  image_url: string | null;
  image_caption: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  video_provider: string | null;
  embed_url: string | null;
  duration: string | null;
  is_embeddable: boolean | null;
  published_at: string | null;
};

const editorialContentSelect = [
  "id",
  "slug",
  "status",
  "scope",
  "content_type",
  "label",
  "title",
  "subtitle",
  "summary",
  "body",
  "author",
  "image_url",
  "image_caption",
  "thumbnail_url",
  "video_url",
  "video_provider",
  "embed_url",
  "duration",
  "is_embeddable",
  "published_at",
].join(",");

function cleanText(value: string | null | undefined) {
  const cleanValue = value?.trim();
  return cleanValue || "";
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleanValue = cleanText(value);
    if (cleanValue) {
      return cleanValue;
    }
  }

  return "";
}

function safeExternalUrl(value: string | null | undefined) {
  const cleanValue = cleanText(value);
  if (!cleanValue) {
    return "";
  }

  try {
    const url = new URL(cleanValue);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function isDirectVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(mp4|webm|ogg)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function splitParagraphs(value: string | null) {
  return cleanText(value)
    .split(/\n{2,}|\r\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

async function readPublishedContent(slug: string) {
  try {
    const rows = await fetchSupabaseAdminTable<EditorialContent>(
      `editorial_contents?select=${editorialContentSelect}&slug=eq.${encodeURIComponent(
        slug,
      )}&status=eq.published&limit=1`,
    );

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const content = await readPublishedContent(slug);

  if (!content) {
    return {
      title: "Conteudo editorial | Jornada",
    };
  }

  const title = firstText(content.title, "Conteudo editorial");
  const description = firstText(content.subtitle, content.summary);
  const image = safeExternalUrl(firstText(content.thumbnail_url, content.image_url));

  return {
    title: `${title} | Jornada`,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function PublicEditorialContentPage({ params }: PageProps) {
  const { slug } = await params;
  const content = await readPublishedContent(slug);

  if (!content) {
    notFound();
  }

  const title = firstText(content.title, "Conteudo editorial");
  const type = firstText(content.content_type, "conteudo");
  const label = firstText(content.label, type);
  const subtitle = cleanText(content.subtitle);
  const summary = cleanText(content.summary);
  const bodyParagraphs = splitParagraphs(content.body);
  const imageUrl = safeExternalUrl(firstText(content.thumbnail_url, content.image_url));
  const imageCaption = cleanText(content.image_caption);
  const embedUrl = content.is_embeddable ? safeExternalUrl(content.embed_url) : "";
  const videoUrl = safeExternalUrl(content.video_url);
  const directVideoUrl = videoUrl && isDirectVideoUrl(videoUrl) ? videoUrl : "";
  const publishedAt = formatDate(content.published_at);
  const author = cleanText(content.author);
  const duration = cleanText(content.duration);
  const provider = cleanText(content.video_provider);

  return (
    <div className="editorial-content-page">
      <style>{publicEditorialContentStyles}</style>

      <header className="editorial-content-topbar" aria-label="Topo do Jornada.pt">
        <a className="editorial-content-brand" href="/">
          Jornada<span>.pt</span>
        </a>
      </header>

      <main className="editorial-content-shell">
        <header className="editorial-content-header">
          <p className="editorial-content-kicker">
            <span>{label}</span>
            <span>{type}</span>
            {duration ? <span>{duration}</span> : null}
          </p>

          <h1>{title}</h1>
          {subtitle ? <p className="editorial-content-subtitle">{subtitle}</p> : null}

          <div className="editorial-content-meta">
            {author ? <span>{author}</span> : null}
            {publishedAt ? <span>{publishedAt}</span> : null}
            {provider ? <span>{provider}</span> : null}
          </div>
        </header>

        {embedUrl ? (
          <section className="editorial-content-media" aria-label="Video">
            <YouTubeEmbedWithFallback
              embedUrl={embedUrl}
              posterUrl={imageUrl}
              title={title}
              videoUrl={videoUrl}
            />
          </section>
        ) : directVideoUrl ? (
          <figure className="editorial-content-media">
            <video controls poster={imageUrl || undefined}>
              <source src={directVideoUrl} />
              O seu navegador nao suporta video HTML5.
            </video>
            {imageCaption ? <figcaption>{imageCaption}</figcaption> : null}
          </figure>
        ) : imageUrl ? (
          <figure className="editorial-content-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" />
            {imageCaption ? <figcaption>{imageCaption}</figcaption> : null}
          </figure>
        ) : null}

        {videoUrl ? (
          <p className="editorial-content-video-link">
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              Abrir video
            </a>
          </p>
        ) : null}

        <div className="editorial-content-body">
          {summary ? <p className="editorial-content-summary">{summary}</p> : null}

          {bodyParagraphs.length > 0
            ? bodyParagraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)
            : null}
        </div>
      </main>
    </div>
  );
}

const publicEditorialContentStyles = `
  body {
    margin: 0;
    overflow-x: hidden;
    background: #ffffff;
  }

  .editorial-content-page {
    min-height: 100vh;
    background: #ffffff;
    color: #111820;
    padding: 0 24px 56px;
    font-family: Arial, Helvetica, sans-serif;
  }

  .editorial-content-topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    min-height: 56px;
    margin: 0 -24px 0;
    padding: 0 24px;
    border-bottom: 1px solid #d8dee6;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.08);
  }

  .editorial-content-brand {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    width: min(1180px, 100%);
    margin: 0 auto;
    color: #2f343b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 29px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    letter-spacing: 0;
  }

  .editorial-content-brand span {
    color: #6b7480;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .editorial-content-shell {
    width: min(920px, calc(100% - 32px));
    margin: 0 auto;
    background: #fff;
    padding: 28px 0 0;
  }

  .editorial-content-header {
    padding: 0 0 24px;
  }

  .editorial-content-kicker,
  .editorial-content-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
  }

  .editorial-content-kicker span {
    display: inline-block;
    padding: 5px 7px 4px;
    border-radius: 2px;
    background: #ffe04f;
    color: #111820;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .editorial-content-kicker span:first-child {
    background: #ffe04f;
    color: #111820;
  }

  .editorial-content-kicker span + span {
    background: transparent;
    color: #c40012;
  }

  .editorial-content-header h1 {
    max-width: 820px;
    margin: 18px 0 0;
    color: #05080c;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(32px, 3vw, 43px);
    font-weight: 900;
    line-height: 1.09;
    letter-spacing: 0;
  }

  .editorial-content-subtitle {
    max-width: 690px;
    margin: 14px 0 0;
    color: #293442;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 20px;
    font-weight: 500;
    line-height: 1.45;
  }

  .editorial-content-meta {
    margin-top: 16px;
    color: #5e6976;
    font-size: 12.5px;
    font-weight: 600;
  }

  .editorial-content-meta span:not(:last-child)::after {
    content: "/";
    margin-left: 8px;
    color: #d1d5db;
  }

  .editorial-content-media {
    margin: 0 0 22px;
    background: #eef2f6;
  }

  .editorial-content-media iframe,
  .editorial-content-media img,
  .editorial-content-media video {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    background: #eef2f6;
  }

  .editorial-content-media video {
    background: #0f1720;
  }

  .editorial-content-media img {
    object-fit: cover;
  }

  .editorial-content-media figcaption {
    margin-top: 8px;
    color: #687482;
    font-size: 12px;
  }

  .editorial-content-video-link {
    margin: 0;
    padding: 0 0 22px;
  }

  .editorial-content-video-link a {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    background: #111820;
    padding: 0 14px;
    color: #fff;
    font-size: 13px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .editorial-content-body {
    max-width: 880px;
    padding: 0 0 56px;
  }

  .editorial-content-body p {
    margin: 0 0 22px;
    color: #111820;
    font-size: 20px;
    line-height: 1.62;
  }

  .editorial-content-body .editorial-content-summary {
    color: #293442;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 20px;
    font-weight: 500;
    line-height: 1.45;
  }

  @media (max-width: 720px) {
    .editorial-content-page {
      padding: 0 14px 36px;
    }

    .editorial-content-topbar {
      margin: 0 -14px;
      padding: 0 14px;
    }

    .editorial-content-shell {
      width: 100%;
      padding-top: 20px;
    }

    .editorial-content-header h1 {
      font-size: 31px;
    }

    .editorial-content-subtitle,
    .editorial-content-body p {
      font-size: 17px;
    }

  }
`;
