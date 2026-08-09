"use client";

import { useEffect, useRef } from "react";

export type PublicLatestNewsItem = {
  id: string;
  timeLabel?: string | null;
  timeLabelColor?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
};

type PublicLatestNewsBlockProps = {
  items: PublicLatestNewsItem[];
  title?: string;
  titleColor?: string | null;
  constrainToMainColumn?: boolean;
};

export default function PublicLatestNewsBlock({
  items,
  title,
  titleColor,
  constrainToMainColumn = false,
}: PublicLatestNewsBlockProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const visibleTitle = title?.trim() ?? "";

  useEffect(() => {
    const root = rootRef.current;

    if (!root || !constrainToMainColumn) {
      return;
    }

    const grid = root.closest(".public-matchday-lead-grid");
    const mainColumn = grid?.querySelector<HTMLElement>(".public-matchday-main-column");
    const editorialBoundary = mainColumn?.querySelector<HTMLElement>(
      '[data-editorial-slot="destaques-da-manchete"]',
    ) ?? mainColumn?.lastElementChild as HTMLElement | null;
    const list = root.querySelector<HTMLElement>(".public-news-list");

    if (!mainColumn || !editorialBoundary || !list) {
      return;
    }

    let frameId = 0;

    const resetItems = () => {
      list.querySelectorAll<HTMLElement>(".public-news-item").forEach((item) => {
        item.style.removeProperty("display");
      });
    };

    const syncHeightAndVisibleItems = () => {
      window.cancelAnimationFrame(frameId);

      if (window.matchMedia("(max-width: 1180px)").matches) {
        root.style.removeProperty("height");
        root.style.removeProperty("max-height");
        resetItems();
        return;
      }

      const rootTop = root.getBoundingClientRect().top;
      const editorialBottom = editorialBoundary.getBoundingClientRect().bottom;
      const availableHeight = Math.max(0, Math.floor(editorialBottom - rootTop));
      root.style.height = `${availableHeight}px`;
      root.style.maxHeight = `${availableHeight}px`;
      resetItems();

      frameId = window.requestAnimationFrame(() => {
        const limit = editorialBoundary.getBoundingClientRect().bottom + 0.5;
        let hideFollowing = false;

        list.querySelectorAll<HTMLElement>(".public-news-item").forEach((item) => {
          if (hideFollowing || item.getBoundingClientRect().bottom > limit) {
            hideFollowing = true;
            item.style.display = "none";
          }
        });
      });
    };

    const observer = new ResizeObserver(syncHeightAndVisibleItems);
    observer.observe(editorialBoundary);
    window.addEventListener("resize", syncHeightAndVisibleItems);
    syncHeightAndVisibleItems();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", syncHeightAndVisibleItems);
      root.style.removeProperty("height");
      root.style.removeProperty("max-height");
      resetItems();
    };
  }, [constrainToMainColumn, items, visibleTitle]);

  return (
    <aside className="public-matchday-news" aria-label={visibleTitle || "Notícias"} ref={rootRef}>
      {visibleTitle ? <h3 style={titleColor ? { color: titleColor } : undefined}>{visibleTitle}</h3> : null}
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
