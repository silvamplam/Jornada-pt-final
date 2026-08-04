"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./PublicMatchStrip.module.css";

type PublicMatchStripCarouselProps = {
  children: ReactNode;
};

export default function PublicMatchStripCarousel({ children }: PublicMatchStripCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canMoveBack, setCanMoveBack] = useState(false);
  const [canMoveForward, setCanMoveForward] = useState(false);

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
        viewport.scrollLeft = Math.max(cardLeft - 4, 0);
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
    const row = viewport?.querySelector<HTMLElement>("[data-matchday-strip]");
    const firstCard = row?.querySelector<HTMLElement>("[data-public-match-card]");

    if (!viewport || !row || !firstCard) return;

    const rowStyles = window.getComputedStyle(row);
    const gap = Number.parseFloat(rowStyles.columnGap || rowStyles.gap) || 0;
    const distance = firstCard.getBoundingClientRect().width + gap;

    viewport.scrollBy({
      left: direction * distance,
      behavior: "smooth"
    });
  };

  return (
    <div className={styles.carousel} data-public-match-carousel>
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
  );
}
