"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import styles from "./PublicMatchdayEditorialSectionFrame.module.css";

type PublicMatchdayEditorialSectionFrameProps = {
  children: ReactNode;
  kind: "zone" | "latest" | "video" | "faixa";
};

export default function PublicMatchdayEditorialSectionFrame({
  children,
  kind,
}: PublicMatchdayEditorialSectionFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const isLive = Boolean(frame.closest('[data-public-editorial-authority="editorial_snapshot"]'));
    const headings = Array.from(frame.querySelectorAll<HTMLElement>(
      'h2, .public-roundup-zone-heading, .public-editorial-section-title, [data-public-latest-news] > h3',
    )).filter((element) => !element.closest('article, [aria-hidden="true"]') &&
      element.closest('[data-public-editorial-section-frame]') === frame &&
      element.textContent?.trim());
    if (!headings.length) return;

    const entries = headings.map((title) => {
      const header = title.closest("header") ?? title;
      let content = header.nextElementSibling;
      while (content?.matches("style, script")) content = content.nextElementSibling;
      return { title, header, content, adjusted: false, reservedSpace: 0,
        latest: title.closest<HTMLElement>('[data-public-latest-news]'),
        previousMargin: header.style.getPropertyValue("margin-bottom"),
        previousPriority: header.style.getPropertyPriority("margin-bottom") };
    });
    const restoreMargin = (entry: typeof entries[number]) => {
      if (!entry.adjusted) return;
      if (entry.previousMargin) entry.header.style.setProperty("margin-bottom", entry.previousMargin, entry.previousPriority);
      else entry.header.style.removeProperty("margin-bottom");
      entry.adjusted = false;
      entry.reservedSpace = 0;
    };

    const positionRule = () => {
      const heading = headings.find((title) => title.getClientRects().length > 0);
      if (!heading) return;
      const frameStyle = getComputedStyle(frame);
      const above = parseFloat(frameStyle.getPropertyValue("--public-editorial-section-title-rule-gap"));
      const below = parseFloat(frameStyle.getPropertyValue("--public-editorial-section-rule-content-gap"));
      const ruleHeight = parseFloat(getComputedStyle(frame, "::before").height);
      const headingRect = heading.getBoundingClientRect();
      // Live headings share clearance below the tallest title on their row.
      const rowBottom = isLive
        ? Math.max(...headings.filter((title) => title.getClientRects().length > 0)
          .map((title) => title.getBoundingClientRect())
          .filter((rect) => Math.abs(rect.top - headingRect.top) <= 1)
          .map((rect) => rect.bottom))
        : headingRect.bottom;
      for (const entry of entries) {
        // Only headings on this separator's row share its content clearance.
        if (!entry.title.getClientRects().length ||
          Math.abs(entry.title.getBoundingClientRect().top - headingRect.top) > 1) {
          restoreMargin(entry);
          continue;
        }
        if (!entry.content) continue;
        const gap = entry.content.getBoundingClientRect().top - rowBottom;
        const adjustment = above + ruleHeight + below - gap;
        if (Math.abs(adjustment) > 0.1) {
          const margin = parseFloat(getComputedStyle(entry.header).marginBottom);
          entry.header.style.setProperty("margin-bottom", `${margin + adjustment}px`, "important");
          entry.adjusted = true;
          entry.reservedSpace += adjustment;
        }
      }
      for (const entry of entries) {
        if (!entry.latest) continue;
        if (entry.adjusted) {
          // Preserve the list's height budget when its header needs more room than the main header.
          const mainReserve = entries.find((entry) => entry.title === heading)?.reservedSpace ?? 0;
          const reserve = Math.max(0, entry.reservedSpace - mainReserve);
          entry.latest.style.setProperty("--public-latest-header-reserve", `${reserve}px`);
        } else entry.latest.style.removeProperty("--public-latest-header-reserve");
      }
      const bottom = (isLive ? rowBottom : heading.getBoundingClientRect().bottom) - frame.getBoundingClientRect().top;
      frame.style.setProperty("--public-editorial-section-rule-top", `${bottom + above}px`);
    };
    positionRule();
    const observer = new ResizeObserver(positionRule);
    observer.observe(frame, { box: "border-box" });
    headings.forEach((title) => observer.observe(title));
    window.addEventListener("resize", positionRule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionRule);
      frame.style.removeProperty("--public-editorial-section-rule-top");
      entries.forEach((entry) => {
        restoreMargin(entry);
        entry.latest?.style.removeProperty("--public-latest-header-reserve");
      });
    };
  }, [children]);

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      data-public-editorial-section-frame={kind}
    >
      {children}
    </div>
  );
}
