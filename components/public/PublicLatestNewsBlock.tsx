"use client";

import PublicEditorialImage from "./PublicEditorialImage";

import { useEffect, useRef } from "react";
import { editorialImageFramingProps } from "@/lib/editorial-image-framing";

// One responsive policy for every public placement of the shared latest feed.
// Hide its layout owners too; adjacent editorial content and ads remain visible.
export const publicLatestNewsMobileStyles = `
  @media (max-width: 760px) {
    .public-matchday-news[data-public-latest-news],
    .public-latest-companion-news:has(> [data-public-latest-news]),
    .public-four-news-latest-column:has([data-public-latest-news]) {
      display: none;
    }

    .public-editorial-layout-panel .public-matchday-lead-grid:has(> [data-public-latest-news]) {
      grid-template-areas: none;
    }

    .public-matchday-lead-grid:has(> [data-public-latest-news]:only-child),
    .public-editorial-layout-panel:has(> .public-matchday-cover > .public-matchday-lead-grid:only-child > [data-public-latest-news]:only-child),
    [data-public-editorial-section-frame="latest"]:has(> .public-thematic-latest-only-layout):not(:has(.public-thematic-latest-only-ad-column)) {
      display: none;
    }

    .public-latest-companion-grid:has(.public-latest-companion-news) > .public-latest-companion-ad,
    .public-four-news-latest-grid:has(.public-four-news-latest-column) > .public-four-news-ad-column {
      grid-column: 1 / -1;
    }

    /* A latest-only frame can still contain an active advertisement. */
    [data-public-editorial-section-frame="latest"]:has(> .public-thematic-latest-only-layout) {
      margin-top: 0;
      padding-top: 0;
    }

    [data-public-editorial-section-frame="latest"]:has(> .public-thematic-latest-only-layout)::before {
      display: none;
    }

    .public-thematic-latest-only-ad-column {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
  }
`;

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
  constrainToFourNewsGrid?: boolean;
  constrainToCompanionZone?: boolean;
};

export default function PublicLatestNewsBlock({
  items,
  title,
  titleColor,
  constrainToMainColumn = false,
  constrainToFourNewsGrid = false,
  constrainToCompanionZone = false,
}: PublicLatestNewsBlockProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const visibleTitle = title?.trim() ?? "";

  useEffect(() => {
    const root = rootRef.current;

    if (
      !root ||
      (!constrainToMainColumn && !constrainToFourNewsGrid && !constrainToCompanionZone)
    ) {
      return;
    }

    const grid = constrainToCompanionZone
      ? root.closest(".public-latest-companion-grid")
      : constrainToFourNewsGrid
        ? root.closest(".public-four-news-latest-grid")
        : root.closest(".public-matchday-lead-grid");

    const mainColumn = constrainToFourNewsGrid || constrainToCompanionZone
      ? null
      : grid?.querySelector<HTMLElement>(
          ".public-matchday-main-column",
        );

    const editorialBoundary = constrainToCompanionZone
      ? (
          grid?.querySelector<HTMLElement>(
            ".public-latest-companion-zone",
          ) ?? null
        )
      : constrainToFourNewsGrid
      ? (
          grid?.querySelector<HTMLElement>(
            ".public-four-news-grid",
          ) ?? null
        )
      : (
          mainColumn?.querySelector<HTMLElement>(
            '[data-editorial-slot="destaques-da-manchete"]',
          ) ??
          (mainColumn?.lastElementChild as HTMLElement | null)
        );

    const list = root.querySelector<HTMLElement>(
      ".public-news-list",
    );

    if (!editorialBoundary || !list) {
      return;
    }

    const collapseBreakpoint = constrainToCompanionZone
      ? "(max-width: 1100px)"
      : constrainToFourNewsGrid
      ? "(max-width: 1100px)"
      : "(max-width: 1180px)";

    let frameId = 0;

    const resetItems = () => {
      list
        .querySelectorAll<HTMLElement>(".public-news-item")
        .forEach((item) => {
          item.style.removeProperty("display");
        });
    };

    const syncHeightAndVisibleItems = () => {
      window.cancelAnimationFrame(frameId);

      if (window.matchMedia(collapseBreakpoint).matches) {
        root.style.removeProperty("height");
        root.style.removeProperty("max-height");
        resetItems();
        return;
      }

      const rootTop = root.getBoundingClientRect().top;
      const editorialBottom =
        editorialBoundary.getBoundingClientRect().bottom;

      const availableHeight = Math.max(
        0,
        Math.floor(editorialBottom - rootTop),
      );

      root.style.height = `${availableHeight}px`;
      root.style.maxHeight = `${availableHeight}px`;

      resetItems();

      frameId = window.requestAnimationFrame(() => {
        const limit =
          editorialBoundary.getBoundingClientRect().bottom + 0.5;

        let hideFollowing = false;

        list
          .querySelectorAll<HTMLElement>(".public-news-item")
          .forEach((item) => {
            if (
              hideFollowing ||
              item.getBoundingClientRect().bottom > limit
            ) {
              hideFollowing = true;
              item.style.display = "none";
            }
          });
      });
    };

    const observer = new ResizeObserver(
      syncHeightAndVisibleItems,
    );

    observer.observe(editorialBoundary);

    window.addEventListener(
      "resize",
      syncHeightAndVisibleItems,
    );

    syncHeightAndVisibleItems();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();

      window.removeEventListener(
        "resize",
        syncHeightAndVisibleItems,
      );

      root.style.removeProperty("height");
      root.style.removeProperty("max-height");

      resetItems();
    };
  }, [
    constrainToMainColumn,
    constrainToFourNewsGrid,
    constrainToCompanionZone,
    items,
    visibleTitle,
  ]);

  return (
    <aside
      className="public-matchday-news"
      data-public-latest-news
      aria-label={visibleTitle || "Notícias"}
      ref={rootRef}
    >
      <style>{publicLatestNewsMobileStyles}</style>
      {visibleTitle ? (
        <h3
          style={
            titleColor
              ? { color: titleColor }
              : undefined
          }
        >
          {visibleTitle}
        </h3>
      ) : null}

      <ul className="public-news-list">
        {items.map((item) => (
          <li
            className="public-news-item"
            key={item.id}
          >
            {item.imageUrl ? (
              <div className="public-news-thumb">
                <PublicEditorialImage imageSize="latest"
                  {...editorialImageFramingProps("wide")}
                  alt=""
                  src={item.imageUrl}
                />
              </div>
            ) : null}

            <div className="public-news-copy">
              {item.timeLabel ? (
                <time
                  dateTime={item.timeLabel}
                  style={
                    item.timeLabelColor
                      ? { color: item.timeLabelColor }
                      : undefined
                  }
                >
                  {item.timeLabel}
                </time>
              ) : null}

              {item.linkUrl ? (
                <a
                  className="public-news-title"
                  href={item.linkUrl}
                >
                  {item.title}
                </a>
              ) : (
                <span className="public-news-title">
                  {item.title}
                </span>
              )}

              {item.subtitle ? (
                <p className="public-news-subtitle">
                  {item.subtitle}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
