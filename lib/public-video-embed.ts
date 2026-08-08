export function youtubeVideoId(value?: string | null) {
  const cleanValue = value?.trim();

  if (!cleanValue) {
    return null;
  }

  try {
    const parsed = new URL(cleanValue);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    if (hostname === "youtu.be") {
      return pathParts[0] ?? null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v") || null;
      }

      if (["embed", "shorts", "live"].includes(pathParts[0] ?? "")) {
        return pathParts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function youtubeWatchUrl(value?: string | null) {
  const videoId = youtubeVideoId(value);
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
}

export function youtubeThumbnailUrl(value?: string | null) {
  const videoId = youtubeVideoId(value);
  return videoId ? `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : null;
}
