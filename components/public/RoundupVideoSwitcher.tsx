"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { youtubeThumbnailUrl, youtubeVideoId } from "@/lib/public-video-embed";

import YouTubeEmbedWithFallback from "./YouTubeEmbedWithFallback";

export type RoundupVideoItem = {
  id?: string | null;
  label?: string | null;
  title?: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  duration?: string | null;
  is_embeddable?: boolean | null;
  type?: string | null;
  status?: string | null;
  sort_order?: number | null;
};

type RoundupVideoSwitcherProps = {
  items: RoundupVideoItem[];
  initialItemId?: string | null;
  matchdayNumber?: number | null;
  heading?: string | null;
  headingColor?: string | null;
  reserveHeadingSpace?: boolean;
};

const roundupVideoListPolishStyles = `
  .public-roundup-video-layout {
    position: relative;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 12px;
    width: 100%;
    min-width: 0;
  }

  .public-roundup-video-layout .public-roundup-zone-heading {
    box-sizing: border-box;
    height: 14px;
    min-height: 14px;
    margin: 0;
    padding: 0;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
  }

  .public-roundup-video-content {
    display: grid;
    grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    width: 100%;
    min-width: 0;
  }

  .public-roundup-video-content > .public-matchday-roundup {
    grid-column: auto !important;
    grid-row: auto !important;
    justify-self: start !important;
    width: min(100%, 340px) !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    gap: 12px;
  }

  .public-roundup-video-content > .public-roundup-video-panel {
    grid-column: auto !important;
    grid-row: auto !important;
    align-self: start !important;
    justify-self: stretch !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .public-roundup-video-layout .public-roundup-zone-heading.public-depth-zone-heading-placeholder {
    visibility: hidden;
    pointer-events: none;
  }

  .public-roundup-video-layout .public-roundup-active-body strong,
  .public-roundup-video-layout .public-roundup-active-body p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 840px) {
    .public-roundup-video-content {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-roundup-video-content > .public-matchday-roundup {
      width: 100% !important;
    }
  }

  .public-roundup-video-layout .public-matchday-roundup,
  .public-roundup-video-layout .public-roundup-scroll-frame,
  .public-roundup-video-layout .public-roundup-scroll-window,
  .public-roundup-video-layout .public-cover-story-strip {
    border-color: transparent !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .public-roundup-video-layout .public-roundup-scroll-frame {
    border-top: 0 !important;
    border-bottom: 0 !important;
  }

  .public-roundup-video-layout .public-roundup-compact-list .public-roundup-scroll-frame {
    height: auto !important;
    min-height: 0 !important;
  }

  .public-roundup-video-layout .public-roundup-compact-list .public-roundup-scroll-window {
    height: auto !important;
    max-height: none !important;
    min-height: 0 !important;
    align-content: start !important;
    grid-auto-rows: auto;
    overflow-y: visible;
  }

  .public-roundup-video-layout .public-roundup-scroll-window {
    margin-left: 0;
    padding-left: 34px;
    overflow-x: visible !important;
  }

  .public-roundup-video-layout .public-roundup-switch-item {
    position: relative;
    border-radius: 0;
    background: #ffffff;
    box-shadow: none;
  }

  .public-roundup-video-layout .public-roundup-switch-item:hover {
    background: #fbfcfd;
  }

  .public-roundup-video-layout .public-roundup-switch-item[data-active="true"],
  .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] {
    background: #ffffff;
    outline: 0;
    box-shadow: none;
  }

  .public-roundup-video-layout .public-matchday-roundup .public-roundup-switch-item {
    grid-template-columns: 30px minmax(0, 1fr) auto auto;
    gap: 3px 21px;
  }

  .public-roundup-video-layout .public-roundup-switch-select {
    display: contents;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .public-roundup-video-layout .public-matchday-roundup .public-roundup-switch-thumb {
    position: relative;
    display: block;
    grid-column: 1 / 2;
    grid-row: 1 / 4;
    align-self: center;
    justify-self: start;
    width: 26px;
    height: 18px;
    min-width: 26px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid #e5eaf0;
    background: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(215, 25, 32, 0.08);
  }

  .public-roundup-video-layout .public-matchday-roundup .public-roundup-switch-play,
  .public-roundup-video-layout .public-matchday-roundup .public-roundup-switch-thumb::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    margin-left: 1px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 8px solid #d71920;
    transform: translate(-50%, -50%);
  }

  .public-roundup-video-layout .public-roundup-meta {
    gap: 12px !important;
    justify-content: space-between !important;
    width: 100%;
  }

  .public-roundup-video-layout .public-roundup-switch-item[data-active="true"]::before,
  .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"]::before {
    content: "";
    position: absolute;
    top: 50%;
    left: -34px;
    width: 22px;
    height: 1px;
    background: #0b1f3a;
    opacity: 0.66;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .public-roundup-video-layout .public-roundup-active-media-link {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    color: inherit;
    text-decoration: none;
  }

  .public-roundup-video-layout .public-roundup-active-media-link img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .public-roundup-video-layout .public-roundup-active-media-link .public-media-play {
    width: 30px;
    height: 30px;
  }

  .public-roundup-video-layout .public-roundup-scroll-button {
    background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.96) 18%, rgba(255, 255, 255, 0.96) 82%, rgba(255, 255, 255, 0));
    color: #526174;
  }

  .public-roundup-video-layout .public-roundup-scroll-button-top,
  .public-roundup-video-layout .public-roundup-scroll-button-bottom {
    border-color: #eef2f6;
  }


  /* Jornada p├║blica: tratamento editorial do resumo em v├¡deo sem alterar a Home. */
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout {
    row-gap: 12px;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-zone-heading {
    height: 20px;
    min-height: 20px;
    color: #526174 !important;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 18px;
    font-weight: 800;
    line-height: 20px;
    text-transform: uppercase;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-content {
    container-type: inline-size;
    --public-roundup-media-height: calc(56.25cqw - 162px);
    --public-roundup-list-height: min(310px, var(--public-roundup-media-height));
    grid-template-columns: minmax(0, 268px) minmax(0, 1fr);
    gap: 20px;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-content > .public-matchday-roundup {
    --public-roundup-visible-list-height: var(--public-roundup-list-height);
    width: min(100%, 268px) !important;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-block {
    width: 100%;
    max-width: none;
    margin-left: 0;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-panel .public-complement-media {
    width: 100%;
    max-height: none;
    aspect-ratio: 16 / 9;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-scroll-window {
    display: flex !important;
    flex-direction: column;
    height: var(--public-roundup-list-height);
    max-height: var(--public-roundup-list-height);
    padding-left: 24px;
    scrollbar-width: thin;
    scrollbar-color: #c7d0da transparent;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-scroll-window::-webkit-scrollbar {
    width: 4px;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-scroll-window::-webkit-scrollbar-track {
    background: transparent;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-scroll-window::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #c7d0da;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-scroll-button {
    display: none;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"],
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] {
    background: #f5f7f9;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"]::before,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"]::before {
    left: -18px;
    width: 3px;
    height: 34px;
    border-radius: 999px;
    background: #526174;
    opacity: 1;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-matchday-roundup .public-roundup-switch-item {
    box-sizing: border-box;
    grid-template-columns: 26px minmax(0, 1fr) auto;
    gap: 2px 10px;
    flex: 0 0 20%;
    height: auto;
    min-height: 0;
    padding: 4px 0;
    overflow: hidden;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-matchday-roundup .public-roundup-switch-thumb {
    width: 22px;
    height: 17px;
    min-width: 22px;
    border-color: #e3e8ee;
    box-shadow: none;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"] .public-roundup-switch-thumb,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] .public-roundup-switch-thumb {
    border-color: #526174;
    background: #526174;
    box-shadow: none;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"] .public-roundup-switch-thumb::after,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] .public-roundup-switch-thumb::after {
    border-left-color: #ffffff;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-meta {
    gap: 8px !important;
    color: #526174;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-meta > span:first-child,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-duration {
    color: #526174;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 10px;
    font-weight: 700;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-matchday-roundup .public-cover-story strong {
    grid-column: 2 / 4;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.1;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-matchday-roundup .public-cover-story small {
    grid-column: 2 / 4;
    color: #6b7786;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.12;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"] .public-roundup-meta,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] .public-roundup-meta {
    color: #33465d;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"] .public-roundup-meta > span,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] .public-roundup-meta > span {
    color: #33465d;
    font-weight: 800;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"] strong,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] strong {
    color: #10151b;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[data-active="true"] small,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-switch-item[aria-pressed="true"] small {
    color: #526174;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-panel .public-complement-media {
    border-radius: 4px;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-active-meta {
    padding-bottom: 3px;
    border-bottom: 0;
    color: #526174;
    font-size: 10.5px;
    font-weight: 700;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-active-meta .public-complement-label,
  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-active-meta span:last-child {
    color: #526174;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-panel .public-complement-body {
    gap: 5px;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-panel .public-complement-body strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 21px;
    font-weight: 700;
    line-height: 1.1;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-panel .public-complement-body p {
    color: #526174;
    font-size: 13px;
    line-height: 1.3;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-panel .public-video-embed-fallback-label {
    right: auto;
    bottom: 10px;
    left: 10px;
    width: auto;
    min-height: 26px;
    padding: 0 9px;
    border-radius: 2px;
    background: rgba(5, 8, 12, 0.72);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-depth-row-single .public-roundup-video-layout {
    width: min(100%, 920px);
    margin-inline: auto;
  }

  @media (max-width: 840px) {
    .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-content {
      --public-roundup-media-height: 56.25cqw;
      --public-roundup-list-height: min(310px, var(--public-roundup-media-height));
      grid-template-columns: minmax(0, 1fr);
    }

    .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-roundup-video-layout .public-roundup-video-content > .public-matchday-roundup {
      width: 100% !important;
    }
  }
`;

function videoThumbnailUrl(item?: RoundupVideoItem | null) {
  const imageUrl = item?.image_url?.trim();

  if (imageUrl) {
    return imageUrl;
  }

  return youtubeThumbnailUrl(item?.video_url);
}

function videoEmbedUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  const youtubeId = youtubeVideoId(value);

  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}`;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, "");

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      return null;
    }

    if (hostname === "youtu.be") {
      return null;
    }

    if (hostname === "vimeo.com" || hostname === "player.vimeo.com") {
      const videoId = parsed.pathname.split("/").filter(Boolean).at(-1);
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function roundupItemKey(item: RoundupVideoItem, index: number) {
  const id = item.id?.trim();

  if (id) {
    return id;
  }

  return `roundup-${item.sort_order ?? index + 1}-${item.title?.trim() ?? "item"}`;
}

export default function RoundupVideoSwitcher({ items, initialItemId, heading, headingColor, reserveHeadingSpace = false }: RoundupVideoSwitcherProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemEntries = useMemo(
    () => items.map((item, index) => ({ item, key: roundupItemKey(item, index) })),
    [items]
  );
  const initialItemEntry = useMemo(
    () => itemEntries.find((entry) => initialItemId && entry.item.id === initialItemId) ?? itemEntries[0] ?? null,
    [initialItemId, itemEntries]
  );
  const [activeItemKey, setActiveItemKey] = useState(initialItemEntry?.key ?? null);
  const activeItemEntry = itemEntries.find((entry) => entry.key === activeItemKey) ?? initialItemEntry;
  const activeItem = activeItemEntry?.item ?? null;
  const embedUrl = activeItem?.is_embeddable === false ? null : videoEmbedUrl(activeItem?.video_url);
  const activeVideoUrl = activeItem?.video_url?.trim() || null;
  const activePreviewImageUrl = videoThumbnailUrl(activeItem);
  const hasScrollControls = items.length > 5;
  const [scrollState, setScrollState] = useState({
    canScrollDown: hasScrollControls,
    canScrollUp: false
  });
  const headingText = heading?.trim() ?? "";
  const headingStyle = headingColor?.trim() ? { color: headingColor.trim() } : undefined;
  const compactListClass = items.length > 0 && items.length < 5 ? " public-roundup-compact-list" : "";

  const updateScrollState = useCallback(() => {
    const list = listRef.current;

    if (!list || !hasScrollControls) {
      setScrollState({ canScrollDown: false, canScrollUp: false });
      return;
    }

    const maxScrollTop = list.scrollHeight - list.clientHeight;
    const nextState = {
      canScrollDown: list.scrollTop < maxScrollTop - 1,
      canScrollUp: list.scrollTop > 1
    };

    setScrollState((currentState) =>
      currentState.canScrollDown === nextState.canScrollDown && currentState.canScrollUp === nextState.canScrollUp
        ? currentState
        : nextState
    );
  }, [hasScrollControls]);

  function scrollRoundupList(direction: -1 | 1) {
    const list = listRef.current;

    if (!list) {
      return;
    }

    list.scrollBy({
      top: direction * Math.max(72, Math.round(list.clientHeight * 0.82)),
      behavior: "smooth"
    });
  }

  useEffect(() => {
    updateScrollState();
    const list = listRef.current;

    if (!list) {
      return;
    }

    list.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      list.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [items.length, updateScrollState]);

  useEffect(() => {
    if (activeItemKey && itemEntries.some((entry) => entry.key === activeItemKey)) {
      return;
    }

    setActiveItemKey(initialItemEntry?.key ?? null);
  }, [activeItemKey, initialItemEntry?.key, itemEntries]);

  return (
    <div className="public-roundup-video-layout">
      <style>{roundupVideoListPolishStyles}</style>
      {headingText ? (
        <h3 className="public-roundup-zone-heading" style={headingStyle}>
          {headingText}
        </h3>
      ) : reserveHeadingSpace ? (
        <h3 aria-hidden="true" className="public-roundup-zone-heading public-depth-zone-heading-placeholder">
          V├¡deo
        </h3>
      ) : null}
      <div className="public-roundup-video-content">
        <section
          className={`public-matchday-roundup public-below-headline-roundup public-editorial-flex-block${hasScrollControls ? " public-roundup-has-scroll" : ""}${compactListClass}`}
          data-editorial-slot="resumo-ou-noticias"
        >
          <div className="public-roundup-scroll-frame">
          {hasScrollControls && scrollState.canScrollUp ? (
            <button className="public-roundup-scroll-button public-roundup-scroll-button-top" onClick={() => scrollRoundupList(-1)} type="button" aria-label="Ver itens anteriores">
              &uarr;
            </button>
          ) : null}
          <div className="public-cover-story-strip public-roundup-scroll-window" ref={listRef} aria-label="Resumos e videos da jornada">
            {itemEntries.length > 0 ? (
              itemEntries.map(({ item, key }) => {
                const isActive = key === activeItemEntry?.key;
                const itemLabel = item.label?.trim();
                const itemDuration = item.duration?.trim();

                return (
                  <article
                    className="public-cover-story public-roundup-switch-item"
                    data-active={isActive ? "true" : "false"}
                    key={key}
                  >
                    <button
                      aria-pressed={isActive}
                      className="public-roundup-switch-select"
                      onClick={() => setActiveItemKey(key)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="public-roundup-switch-thumb"
                      />
                      <span className="public-roundup-meta">
                        {itemLabel ? <span>{itemLabel}</span> : <span aria-hidden="true" />}
                        {itemDuration ? <span className="public-roundup-duration">{itemDuration}</span> : null}
                      </span>
                      {item.title ? <strong>{item.title}</strong> : null}
                      {item.subtitle ? <small>{item.subtitle}</small> : null}
                    </button>
                  </article>
                );
              })
            ) : null}
          </div>
          {hasScrollControls && scrollState.canScrollDown ? (
            <button className="public-roundup-scroll-button public-roundup-scroll-button-bottom" onClick={() => scrollRoundupList(1)} type="button" aria-label="Ver itens seguintes">
              &darr;
            </button>
          ) : null}
        </div>
      </section>

      <aside
        aria-label="Video do Resumo da Jornada"
        className="public-matchday-cover-side public-editorial-flex-block public-roundup-video-panel"
        data-editorial-slot="video-ou-imagem-noticia"
      >
        {activeItem ? (
          <div className="public-roundup-video-block">
            <div className="public-complement-media">
              {embedUrl ? (
                <YouTubeEmbedWithFallback
                  embedUrl={embedUrl}
                  posterUrl={activePreviewImageUrl}
                  title={activeItem.title ?? "V├¡deo da jornada"}
                  videoUrl={activeVideoUrl}
                />
              ) : activePreviewImageUrl ? (
                activeVideoUrl ? (
                  <a
                    aria-label={`Abrir ${activeItem.title ?? "video da jornada"}`}
                    className="public-roundup-active-media-link"
                    href={activeVideoUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <img alt="" src={activePreviewImageUrl} />
                    <span aria-hidden="true" className="public-media-play public-media-play-icon-only" />
                  </a>
                ) : (
                  <img alt="" src={activePreviewImageUrl} />
                )
              ) : (
                <span aria-hidden="true" className="public-media-play public-media-play-icon-only" />
              )}
            </div>
            <div className="public-complement-body public-roundup-active-body">
              <span className="public-roundup-active-meta">
                {activeItem.label ? <span className="public-complement-label">{activeItem.label}</span> : <span aria-hidden="true" />}
                {activeItem.duration ? <span>{activeItem.duration}</span> : null}
              </span>
              {activeItem.title ? <strong>{activeItem.title}</strong> : null}
              {activeItem.subtitle ? <p>{activeItem.subtitle}</p> : null}
            </div>
          </div>
        ) : null}
        </aside>
      </div>
    </div>
  );
}
