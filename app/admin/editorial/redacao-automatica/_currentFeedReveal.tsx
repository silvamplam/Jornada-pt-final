"use client";

import { useEffect, useState } from "react";

import styles from "./redacao-automatica.module.css";

const PAGE_SIZE = 24;

export default function CurrentFeedReveal({ total }: Readonly<{ total: number }>) {
  const [visible, setVisible] = useState(Math.min(PAGE_SIZE, total));

  useEffect(() => {
    const list = document.querySelector<HTMLOListElement>("[data-current-feed-list]");
    if (!list) {
      return;
    }

    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-current-feed-item]"));
    items.forEach((item, index) => {
      item.hidden = index >= visible;
    });
  }, [visible, total]);

  if (visible >= total) {
    return null;
  }

  return (
    <div className={styles.currentFeedMore}>
      <button type="button" onClick={() => setVisible((current) => Math.min(current + PAGE_SIZE, total))}>
        Mostrar mais
      </button>
    </div>
  );
}
