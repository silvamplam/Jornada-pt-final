"use client";

import { useEffect, useRef } from "react";

export default function PublicContextPostTitle({
  text,
  constrainToMainColumn = false,
}: {
  text: string;
  constrainToMainColumn?: boolean;
}) {
  const paragraphRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph || !constrainToMainColumn) return;

    const grid = paragraph.closest(".public-matchday-lead-grid");
    const mainColumn = grid?.querySelector<HTMLElement>(".public-matchday-main-column");
    const editorialBoundary = mainColumn?.querySelector<HTMLElement>(
      '[data-editorial-slot="destaques-da-manchete"]',
    );

    if (!editorialBoundary) return;

    const resetClamp = () => {
      paragraph.style.removeProperty("-webkit-line-clamp");
    };

    const syncClamp = () => {
      if (window.matchMedia("(max-width: 1180px)").matches) {
        resetClamp();
        return;
      }

      const computed = window.getComputedStyle(paragraph);
      const parsedLineHeight = Number.parseFloat(computed.lineHeight);
      const parsedFontSize = Number.parseFloat(computed.fontSize);
      const lineHeight = Number.isFinite(parsedLineHeight)
        ? parsedLineHeight
        : (Number.isFinite(parsedFontSize) ? parsedFontSize * 1.48 : 19);
      const availableHeight = Math.max(
        0,
        editorialBoundary.getBoundingClientRect().bottom - paragraph.getBoundingClientRect().top,
      );
      const visibleLines = Math.max(1, Math.floor((availableHeight + 0.5) / lineHeight));
      paragraph.style.setProperty("-webkit-line-clamp", String(visibleLines));
    };

    const observer = new ResizeObserver(syncClamp);
    observer.observe(editorialBoundary);
    window.addEventListener("resize", syncClamp);
    syncClamp();

    if (document.fonts?.ready) {
      void document.fonts.ready.then(syncClamp);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncClamp);
      resetClamp();
    };
  }, [constrainToMainColumn, text]);

  return <p ref={paragraphRef}>{text}</p>;
}
