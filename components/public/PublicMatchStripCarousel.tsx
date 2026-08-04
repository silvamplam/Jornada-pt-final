"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  ARROW_ZONE_WIDTH,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_INLINE_PADDING,
  CARD_STEP,
  CARD_TEAM_COLUMN_WIDTH,
  CARD_WIDTH,
  getMatchCarouselShellWidth,
  getMatchCarouselViewportWidth,
  selectMatchCarouselVisibleCardCount,
  type VisibleCardCount
} from "@/lib/public-match-strip-carousel-geometry";
import styles from "./PublicMatchStrip.module.css";

type PublicMatchStripCarouselProps = {
  children: ReactNode;
};

type CarouselGeometryStyle = CSSProperties & {
  "--match-card-width": string;
  "--match-card-height": string;
  "--match-card-gap": string;
  "--match-card-inline-padding": string;
  "--match-card-team-column-width": string;
  "--match-carousel-arrow-zone-width": string;
  "--match-carousel-shell-width": string;
  "--match-carousel-viewport-width": string;
};

export default function PublicMatchStripCarousel({ children }: PublicMatchStripCarouselProps) {
  const availableWidthRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [visibleCardCount, setVisibleCardCount] = useState<VisibleCardCount>(1);
  const [canMoveBack, setCanMoveBack] = useState(false);
  const [canMoveForward, setCanMoveForward] = useState(false);
  const viewportWidth = getMatchCarouselViewportWidth(visibleCardCount);
  const shellWidth = getMatchCarouselShellWidth(visibleCardCount);
  const geometryStyle = {
    "--match-card-width": `${CARD_WIDTH}px`,
    "--match-card-height": `${CARD_HEIGHT}px`,
    "--match-card-gap": `${CARD_GAP}px`,
    "--match-card-inline-padding": `${CARD_INLINE_PADDING}px`,
    "--match-card-team-column-width": `${CARD_TEAM_COLUMN_WIDTH}px`,
    "--match-carousel-arrow-zone-width": `${ARROW_ZONE_WIDTH}px`,
    "--match-carousel-shell-width": `${shellWidth}px`,
    "--match-carousel-viewport-width": `${viewportWidth}px`
  } as CarouselGeometryStyle;

  const updateVisibleCardCount = useCallback(() => {
    const availableWidth = availableWidthRef.current?.getBoundingClientRect().width ?? 0;
    if (availableWidth <= 0) return;

    const nextCount = selectMatchCarouselVisibleCardCount(availableWidth);
    setVisibleCardCount((currentCount) => currentCount === nextCount ? currentCount : nextCount);
  }, []);

  useLayoutEffect(() => {
    const availableWidthElement = availableWidthRef.current;
    if (!availableWidthElement) return;

    updateVisibleCardCount();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateVisibleCardCount);
    observer?.observe(availableWidthElement);

    if (!observer) {
      window.addEventListener("resize", updateVisibleCardCount);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateVisibleCardCount);
    };
  }, [updateVisibleCardCount]);

  const updateNavigation = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximumScroll = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
    setCanMoveBack(viewport.scrollLeft > 1);
    setCanMoveForward(viewport.scrollLeft < maximumScroll - 1);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const focusedCard = viewport.querySelector<HTMLElement>("[data-live-focus='true']");
    if (focusedCard) {
      const cardLeft = focusedCard.offsetLeft;
      const cardRight = cardLeft + focusedCard.offsetWidth;
      const viewportRight = viewport.scrollLeft + viewport.clientWidth;

      if (cardLeft < viewport.scrollLeft || cardRight > viewportRight) {
        viewport.scrollLeft = Math.max(Math.round(cardLeft / CARD_STEP) * CARD_STEP, 0);
      }
    }

    updateNavigation();
    viewport.addEventListener("scroll", updateNavigation, { passive: true });
    window.addEventListener("resize", updateNavigation);

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateNavigation);
    observer?.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", updateNavigation);
      window.removeEventListener("resize", updateNavigation);
      observer?.disconnect();
    };
  }, [children, updateNavigation]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximumScroll = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
    const currentStep = Math.round(viewport.scrollLeft / CARD_STEP);
    const targetScroll = Math.min(
      Math.max((currentStep + direction) * CARD_STEP, 0),
      maximumScroll
    );
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    viewport.scrollTo({
      left: targetScroll,
      behavior: reducedMotion ? "auto" : "smooth"
    });
  };

  return (
    <div className={styles.carouselMeasure} data-public-match-carousel-measure ref={availableWidthRef}>
      <div
        className={styles.carousel}
        data-public-match-carousel
        data-visible-cards={visibleCardCount}
        style={geometryStyle}
      >
        <button
          aria-label="Ver jogo anterior"
          className={`${styles.carouselButton} ${styles.carouselButtonBack}`}
          disabled={!canMoveBack}
          onClick={() => move(-1)}
          type="button"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div className={styles.carouselViewport} ref={viewportRef}>
          <div className={`${styles.row} public-matchday-strip`} data-matchday-strip>
            {children}
          </div>
        </div>
        <button
          aria-label="Ver jogo seguinte"
          className={`${styles.carouselButton} ${styles.carouselButtonForward}`}
          disabled={!canMoveForward}
          onClick={() => move(1)}
          type="button"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
