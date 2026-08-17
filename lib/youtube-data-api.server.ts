import "server-only";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export type YouTubeVideoResource = {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    title?: string;
    thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
  };
  contentDetails?: {
    duration?: string;
  };
  status?: {
    privacyStatus?: string;
    embeddable?: boolean;
  };
};

export type YouTubeUploadItem = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  channelId: string | null;
  channelTitle: string | null;
};

export class YouTubeDataApiError extends Error {
  constructor(
    public code: "youtube-api-key-missing" | "youtube-api-failed" | "youtube-source-missing",
    message: string,
  ) {
    super(message);
  }
}

function apiKey() {
  const value = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!value) {
    throw new YouTubeDataApiError(
      "youtube-api-key-missing",
      "Falta configurar YOUTUBE_DATA_API_KEY no ambiente server-side.",
    );
  }
  return value;
}

async function youtubeGet<T>(path: string, params: Record<string, string>) {
  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("key", apiKey());

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new YouTubeDataApiError(
      "youtube-api-failed",
      detail ? `YouTube Data API respondeu ${response.status}.` : "YouTube Data API indisponível.",
    );
  }
  return response.json() as Promise<T>;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function listYouTubeVideos(videoIds: string[]) {
  const uniqueIds = Array.from(new Set(videoIds.map((value) => value.trim()).filter(Boolean)));
  const videos: YouTubeVideoResource[] = [];

  for (const batch of chunks(uniqueIds, 50)) {
    const payload = await youtubeGet<{ items?: YouTubeVideoResource[] }>("videos", {
      part: "snippet,contentDetails,status",
      id: batch.join(","),
      maxResults: String(batch.length),
    });
    videos.push(...(payload.items ?? []));
  }

  return videos;
}

export async function resolveYouTubeUploadsPlaylists(channelIds: string[]) {
  const uniqueIds = Array.from(new Set(channelIds.map((value) => value.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const payload = await youtubeGet<{
    items?: Array<{
      id?: string;
      snippet?: { title?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  }>("channels", {
    part: "snippet,contentDetails",
    id: uniqueIds.join(","),
    maxResults: String(Math.min(uniqueIds.length, 50)),
  });

  return (payload.items ?? []).flatMap((item) => {
    const channelId = item.id?.trim();
    const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads?.trim();
    if (!channelId || !uploadsPlaylistId) return [];
    return [{
      channelId,
      channelTitle: item.snippet?.title?.trim() || channelId,
      uploadsPlaylistId,
    }];
  });
}

export async function listRecentYouTubeUploads(playlistId: string, maxResults = 50) {
  const payload = await youtubeGet<{
    items?: Array<{
      snippet?: {
        title?: string;
        publishedAt?: string;
        videoOwnerChannelId?: string;
        videoOwnerChannelTitle?: string;
        resourceId?: { videoId?: string };
      };
      contentDetails?: {
        videoId?: string;
        videoPublishedAt?: string;
      };
    }>;
  }>("playlistItems", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
  });

  return (payload.items ?? []).flatMap<YouTubeUploadItem>((item) => {
    const videoId = item.contentDetails?.videoId?.trim() || item.snippet?.resourceId?.videoId?.trim();
    if (!videoId) return [];
    return [{
      videoId,
      title: item.snippet?.title?.trim() || "",
      publishedAt: item.contentDetails?.videoPublishedAt?.trim() || item.snippet?.publishedAt?.trim() || null,
      channelId: item.snippet?.videoOwnerChannelId?.trim() || null,
      channelTitle: item.snippet?.videoOwnerChannelTitle?.trim() || null,
    }];
  });
}

export function configuredYouTubeSummaryChannelIds(competitionId: string, competitionSlug: string) {
  const raw = process.env.YOUTUBE_VIDEO_SUMMARY_SOURCES_JSON?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[competitionId] ?? parsed[competitionSlug];
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
  } catch {
    return [];
  }
}
