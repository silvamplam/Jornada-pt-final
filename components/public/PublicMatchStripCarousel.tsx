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
  layout?: "fixed" | "fluid-peek";
};

type CarouselEdgeGeometry = {
  completeCardCount: number;
  firstCardStart: number;
};

const EMPTY_EDGE_GEOMETRY: CarouselEdgeGeometry = {
  completeCardCount: 0,
  firstCardStart: 0
};

const PEEK_TOTAL_CARD_COUNT = 8;
const PEEK_CLEAR_CARD_COUNT = 8;
const PEEK_EDGE_FADE_WIDTH = CARD_INLINE_PADDING * 2;
const PEEK_CARD_HEIGHT = CARD_HEIGHT;
const PEEK_CONTENT_WIDTH =
  (PEEK_TOTAL_CARD_COUNT * CARD_WIDTH) +
  ((PEEK_TOTAL_CARD_COUNT - 1) * CARD_GAP);
const PEEK_VIEWPORT_WIDTH = PEEK_CONTENT_WIDTH;

type CarouselGeometryStyle = CSSProperties & {
  "--match-card-width": string;
  "--match-card-height": string;
  "--match-card-gap": string;
  "--match-card-inline-padding": string;
  "--match-card-team-column-width": string;
  "--match-carousel-arrow-zone-width": string;
  "--match-carousel-edge-fade-width": string;
  "--match-carousel-peek-content-width": string;
  "--match-carousel-peek-card-height": string;
  "--match-carousel-peek-viewport-width": string;
  "--match-carousel-shell-width": string;
  "--match-carousel-viewport-width": string;
};

export default function PublicMatchStripCarousel({
  children,
  layout = "fixed"
}: PublicMatchStripCarouselProps) {
  const availableWidthRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [visibleCardCount, setVisibleCardCount] = useState<VisibleCardCount>(1);
  const [canMoveBack, setCanMoveBack] = useState(false);
  const [canMoveForward, setCanMoveForward] = useState(false);
  const [edgeGeometry, setEdgeGeometry] = useState(EMPTY_EDGE_GEOMETRY);
  const viewportWidth = getMatchCarouselViewportWidth(visibleCardCount);
  const shellWidth = getMatchCarouselShellWidth(visibleCardCount);
  const geometryStyle = {
    "--match-card-width": `${CARD_WIDTH}px`,
    "--match-card-height": `${CARD_HEIGHT}px`,
    "--match-card-gap": `${CARD_GAP}px`,
    "--match-card-inline-padding": `${CARD_INLINE_PADDING}px`,
    "--match-card-team-column-width": `${CARD_TEAM_COLUMN_WIDTH}px`,
    "--match-carousel-arrow-zone-width": `${ARROW_ZONE_WIDTH}px`,
    "--match-carousel-edge-fade-width": `${PEEK_EDGE_FADE_WIDTH}px`,
    "--match-carousel-peek-content-width": `${PEEK_CONTENT_WIDTH}px`,
    "--match-carousel-peek-card-height": `${PEEK_CARD_HEIGHT}px`,
    "--match-carousel-peek-viewport-width": `${PEEK_VIEWPORT_WIDTH}px`,
    "--match-carousel-shell-width": layout === "fluid-peek" ? "100%" : `${shellWidth}px`,
    "--match-carousel-viewport-width": layout === "fluid-peek" ? "100%" : `${viewportWidth}px`
  } as CarouselGeometryStyle;

  const updateVisibleCardCount = useCallback(() => {
    const availableWidth = availableWidthRef.current?.getBoundingClientRect().width ?? 0;
    if (availableWidth <= 0) return;

    const nextCount = selectMatchCarouselVisibleCardCount(availableWidth);
    setVisibleCardCount((currentCount) => currentCount === nextCount ? currentCount : nextCount);
  }, []);

  useLayoutEffect(() => {
    if (layout === "fluid-peek") return;

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
  }, [layout, updateVisibleCardCount]);

  const updateNavigation = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximumScroll = Math.max(Math.round(viewport.scrollWidth - viewport.clientWidth), 0);
    const boundedScrollLeft = Math.min(Math.max(viewport.scrollLeft, 0), maximumScroll);
    if (Math.abs(viewport.scrollLeft - boundedScrollLeft) > 0.5) {
      viewport.scrollLeft = boundedScrollLeft;
    }
    const nextCanMoveBack = boundedScrollLeft > 1;
    const nextCanMoveForward = boundedScrollLeft < maximumScroll - 1;
    setCanMoveBack(nextCanMoveBack);
    setCanMoveForward(nextCanMoveForward);

    if (layout !== "fluid-peek") return;
    const viewportRect = viewport.getBoundingClientRect();
    const cards = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-public-match-card]")
    );
    const cardRects = cards.map((card) => card.getBoundingClientRect());

    const insetTolerance = 1;
    const completeCardCount = cardRects.filter((rect) => (
      rect.left >= viewportRect.left - insetTolerance &&
      rect.right <= viewportRect.right + insetTolerance
    )).length;
    const firstCardStart = cardRects[0]
      ? Math.round(cardRects[0].left - viewportRect.left)
      : 0;
    const nextGeometry = {
      completeCardCount,
      firstCardStart
    };

    setEdgeGeometry((currentGeometry) => (
      currentGeometry.completeCardCount === nextGeometry.completeCardCount &&
      currentGeometry.firstCardStart === nextGeometry.firstCardStart
        ? currentGeometry
        : nextGeometry
    ));
  }, [layout]);

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
    if (trackRef.current) observer?.observe(trackRef.current);
    return () => {
      viewport.removeEventListener("scroll", updateNavigation);
      window.removeEventListener("resize", updateNavigation);
      observer?.disconnect();
    };
  }, [children, updateNavigation]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximumScroll = Math.max(Math.round(viewport.scrollWidth - viewport.clientWidth), 0);
    const boundedScrollLeft = Math.min(Math.max(viewport.scrollLeft, 0), maximumScroll);
    const currentStep = Math.round(boundedScrollLeft / CARD_STEP);
    const targetScroll = Math.round(Math.min(
      Math.max((currentStep + direction) * CARD_STEP, 0),
      maximumScroll
    ));
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
        data-carousel-layout={layout}
        data-can-move-forward={canMoveForward ? "true" : undefined}
        data-can-move-back={canMoveBack ? "true" : undefined}
        data-complete-card-count={layout === "fluid-peek" ? edgeGeometry.completeCardCount : undefined}
        data-first-card-start={layout === "fluid-peek" ? edgeGeometry.firstCardStart : undefined}
        data-clear-card-count={layout === "fluid-peek" ? PEEK_CLEAR_CARD_COUNT : undefined}
        data-edge-fade-width={layout === "fluid-peek" ? PEEK_EDGE_FADE_WIDTH : undefined}
        data-peek-content-width={layout === "fluid-peek" ? PEEK_CONTENT_WIDTH : undefined}
        data-peek-viewport-width={layout === "fluid-peek" ? PEEK_VIEWPORT_WIDTH : undefined}
        data-visible-cards={layout === "fixed" ? visibleCardCount : undefined}
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
        <div className={styles.carouselViewport} data-public-match-carousel-viewport ref={viewportRef}>
          <div
            className={`${styles.row} public-matchday-strip`}
            data-matchday-strip
            ref={trackRef}
          >
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
