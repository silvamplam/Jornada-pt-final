"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { youtubeThumbnailUrl, youtubeVideoId, youtubeWatchUrl } from "@/lib/public-video-embed";

type YouTubePlayer = {
  destroy: () => void;
};

type YouTubePlayerApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
};

type YouTubeWindow = Window & {
  YT?: YouTubePlayerApi;
};

type YouTubeEmbedWithFallbackProps = {
  embedUrl?: string | null;
  videoUrl?: string | null;
  posterUrl?: string | null;
  title?: string | null;
};

let youtubeApiPromise: Promise<YouTubePlayerApi> | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API indisponível no servidor."));
  }

  const currentWindow = window as YouTubeWindow;

  if (currentWindow.YT?.Player) {
    return Promise.resolve(currentWindow.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise<YouTubePlayerApi>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existingScript ?? document.createElement("script");
    let settled = false;

    const cleanup = () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      script.removeEventListener("error", onScriptError);
    };

    const resolveWhenReady = () => {
      const api = (window as YouTubeWindow).YT;

      if (!api?.Player || settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(api);
    };

    const onScriptError = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      youtubeApiPromise = null;
      reject(new Error("Não foi possível carregar a YouTube IFrame API."));
    };

    const intervalId = window.setInterval(resolveWhenReady, 50);
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      youtubeApiPromise = null;
      reject(new Error("Tempo esgotado ao carregar a YouTube IFrame API."));
    }, 10000);

    script.addEventListener("error", onScriptError, { once: true });

    if (!existingScript) {
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    resolveWhenReady();
  });

  return youtubeApiPromise;
}

const youtubeFallbackStyles = `
  .public-video-embed-root {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #111820;
  }

  .public-video-embed-root > iframe,
  .public-video-embed-player,
  .public-video-embed-player iframe {
    position: absolute;
    inset: 0;
    display: block;
    width: 100% !important;
    height: 100% !important;
    border: 0;
  }

  .public-video-embed-poster,
  .public-video-embed-fallback img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-video-embed-fallback {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    color: #ffffff;
    text-decoration: none;
    background: #111820;
  }

  .public-video-embed-fallback::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(5, 8, 12, 0.02) 42%, rgba(5, 8, 12, 0.7) 100%);
  }

  .public-video-embed-fallback-play {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 50px;
    height: 50px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.94);
    color: #d71920;
    transform: translate(-50%, -50%);
    box-shadow: 0 4px 18px rgba(5, 8, 12, 0.24);
  }

  .public-video-embed-fallback-play::before {
    content: "";
    width: 0;
    height: 0;
    margin-left: 4px;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-left: 13px solid currentColor;
  }

  .public-video-embed-fallback-label {
    position: absolute;
    right: 12px;
    bottom: 10px;
    left: 12px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 3px;
    background: rgba(5, 8, 12, 0.82);
    color: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
    text-align: center;
    text-transform: uppercase;
  }
`;

export default function YouTubeEmbedWithFallback({
  embedUrl,
  videoUrl,
  posterUrl,
  title,
}: YouTubeEmbedWithFallbackProps) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [fallbackToYouTube, setFallbackToYouTube] = useState(false);
  const cleanVideoUrl = videoUrl?.trim() || "";
  const cleanEmbedUrl = embedUrl?.trim() || "";
  const youtubeSource = useMemo(() => {
    if (youtubeVideoId(cleanVideoUrl)) {
      return cleanVideoUrl;
    }

    return youtubeVideoId(cleanEmbedUrl) ? cleanEmbedUrl : "";
  }, [cleanEmbedUrl, cleanVideoUrl]);
  const youtubeId = useMemo(() => youtubeVideoId(youtubeSource), [youtubeSource]);
  const watchUrl = useMemo(() => youtubeWatchUrl(youtubeSource), [youtubeSource]);
  const fallbackPoster = posterUrl?.trim() || youtubeThumbnailUrl(youtubeSource) || "";
  const cleanTitle = title?.trim() || "Vídeo";

  useEffect(() => {
    setFallbackToYouTube(false);

    if (!youtubeId) {
      return;
    }

    let cancelled = false;

    loadYouTubeIframeApi()
      .then((api) => {
        if (cancelled || !playerHostRef.current) {
          return;
        }

        playerRef.current?.destroy();
        playerRef.current = new api.Player(playerHostRef.current, {
          videoId: youtubeId,
          playerVars: {
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onError: () => {
              if (cancelled) {
                return;
              }

              playerRef.current?.destroy();
              playerRef.current = null;
              setFallbackToYouTube(true);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackToYouTube(true);
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [youtubeId]);

  if (!youtubeId) {
    return cleanEmbedUrl ? (
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        src={cleanEmbedUrl}
        title={cleanTitle}
      />
    ) : null;
  }

  return (
    <div className="public-video-embed-root" data-youtube-fallback={fallbackToYouTube ? "true" : "false"}>
      <style>{youtubeFallbackStyles}</style>
      {fallbackPoster ? <img alt="" className="public-video-embed-poster" src={fallbackPoster} /> : null}

      {fallbackToYouTube && watchUrl ? (
        <a
          aria-label={`Ver ${cleanTitle} no YouTube`}
          className="public-video-embed-fallback"
          href={watchUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {fallbackPoster ? <img alt="" src={fallbackPoster} /> : null}
          <span aria-hidden="true" className="public-video-embed-fallback-play" />
          <span className="public-video-embed-fallback-label">Ver vídeo no YouTube</span>
        </a>
      ) : (
        <div className="public-video-embed-player" ref={playerHostRef} />
      )}
    </div>
  );
}
