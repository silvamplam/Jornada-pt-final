"use client";

import BackofficeImage from "@/components/admin/BackofficeImage";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MesaArchiveSourceItem,
} from "@/lib/redacao-automatica/newsroom-mesa-archive-read-model";
import { articleClassificationBadgeColors } from "@/lib/editorial-classifications";
import { classificationLabel } from "./_mesa-query";
import styles from "./mesa.module.css";

function formatDate(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}

export function MesaArchiveSourceItemView({
  item,
}: Readonly<{ item: MesaArchiveSourceItem }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dateValue = item.publishedAt ?? item.lastDetectedAt;
  const formattedDate = formatDate(dateValue);

  async function reopen() {
    if (busy || !item.cycleEligible || !item.newsroomSnapshotId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/editorial/redacao-automatica/mesa/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reopen",
          newsroomArticleId: item.newsroomArticleId,
          newsroomSnapshotId: item.newsroomSnapshotId,
        }),
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Não foi possível voltar a rever esta fonte.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível voltar a rever esta fonte.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.sourceRow} data-lifecycle="archive">
      <div className={styles.sourceSelection} aria-hidden="true" />
      <div className={styles.sourceThumb}>
        {item.imageCandidateUrl ? (
          <BackofficeImage previewWidth={320} src={item.imageCandidateUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : <span>Sem imagem</span>}
      </div>
      <article className={styles.sourceBody}>
        <div className={styles.sourceMeta}>
          <span className={styles.lifecycleBadge} data-lifecycle="archive">
            {item.archiveLabel === "dismissed" ? "SEM INTERESSE" : "ARQUIVO"}
          </span>
          {formattedDate ? <time dateTime={dateValue}>{formattedDate}</time> : null}
          <span>{item.sourceName}</span>
          <span
            className={styles.classificationBadge}
            data-tone={item.classificationKey ?? "unclassified"}
            style={articleClassificationBadgeColors(item.classificationKey ?? "unclassified")}
          >
            {item.classificationKey ? classificationLabel(item.classificationKey) : "POR CLASSIFICAR"}
          </span>
        </div>
        <h2>{item.title}</h2>
        {item.subtitle || item.summary ? <p>{item.subtitle ?? item.summary}</p> : null}
        <div className={styles.sourceTools}>
          {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">Abrir fonte</a> : <span>URL indisponível</span>}
          {item.cycleEligible ? (
            <button type="button" disabled={busy || !item.newsroomSnapshotId} onClick={() => void reopen()}>
              {busy ? "A repor…" : "Voltar a rever"}
            </button>
          ) : <span>Fora do ciclo atual</span>}
          {message ? <small role="alert">{message}</small> : null}
        </div>
      </article>
    </li>
  );
}
