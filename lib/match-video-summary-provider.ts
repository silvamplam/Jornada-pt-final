import { vsportsEmbedUrl, youtubeVideoId } from "@/lib/public-video-embed";

export type VideoSummaryProvider = "youtube" | "vsports";

export function publishedVideoSummaryProvider(item: {
  video_url?: string | null;
  youtube_video_id?: string | null;
}): VideoSummaryProvider | null {
  if (item.youtube_video_id || youtubeVideoId(item.video_url)) return "youtube";
  if (vsportsEmbedUrl(item.video_url)) return "vsports";
  return null;
}

export function confirmedCandidateMediaPatch(candidate: {
  id: string;
  provider: VideoSummaryProvider;
  provider_video_id: string;
  canonical_url: string;
  playable_media_url: string | null;
  channel_id: string | null;
  thumbnail_url: string | null;
  is_embeddable: boolean | null;
}, duration: string | null) {
  return {
    video_url: candidate.playable_media_url ?? candidate.canonical_url,
    image_url: candidate.thumbnail_url,
    duration,
    youtube_video_id: candidate.provider === "youtube" ? candidate.provider_video_id : null,
    youtube_channel_id: candidate.provider === "youtube" ? candidate.channel_id : null,
    is_embeddable: candidate.is_embeddable,
    source_candidate_id: candidate.id,
  };
}
