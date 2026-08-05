"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  resolveActivePublicCompetition,
  resolvePublicCompetitionLogoPresentation
} from "@/lib/public-competition-navigation";
import type { PublicCompetitionMenuItem } from "@/lib/public-competition-menu";

import styles from "./PublicCompetitionNavigation.module.css";

type PublicCompetitionNavigationProps = {
  competitions: PublicCompetitionMenuItem[];
  activeCompetitionSlug?: string | null;
  classificationHref?: string | null;
  showMessageTicker?: boolean;
};

function isCurrentClassificationHash(href: string | null | undefined) {
  if (!href || typeof window === "undefined") {
    return false;
  }

  const target = new URL(href, window.location.href);
  return (
    target.pathname === window.location.pathname &&
    target.search === window.location.search &&
    target.hash === "#classificacao" &&
    window.location.hash === target.hash
  );
}

export default function PublicCompetitionNavigation({
  competitions,
  activeCompetitionSlug,
  classificationHref,
  showMessageTicker = true
}: PublicCompetitionNavigationProps) {
  const [classificationHashIsActive, setClassificationHashIsActive] = useState(false);

  useEffect(() => {
    const syncClassificationHash = () => {
      setClassificationHashIsActive(isCurrentClassificationHash(classificationHref));
    };

    syncClassificationHash();
    window.addEventListener("hashchange", syncClassificationHash);
    window.addEventListener("popstate", syncClassificationHash);

    return () => {
      window.removeEventListener("hashchange", syncClassificationHash);
      window.removeEventListener("popstate", syncClassificationHash);
    };
  }, [classificationHref]);

  const activeCompetition = resolveActivePublicCompetition(
    competitions,
    activeCompetitionSlug
  );
  const activeCompetitionLogo =
    resolvePublicCompetitionLogoPresentation(activeCompetition);

  return (
    <nav
      aria-label="Navegação pública"
      className={styles.navigation}
      data-message-ticker={showMessageTicker ? "true" : "false"}
    >
      <span
        className={styles.competitionGroup}
        role="group"
        aria-label="Competições"
      >
        {competitions.map((competition) => (
          <Link
            className={`${styles.link} ${styles.competitionLink}`}
            aria-current={
              competition.slug === activeCompetitionSlug ? "page" : undefined
            }
            href={competition.href}
            key={competition.slug}
          >
            {competition.label}
          </Link>
        ))}
      </span>
      {showMessageTicker ? (
        <>
          {/* JORNADA-LED-TICKER-INICIO */}
          <div
            aria-label={"Toda a informa\u00e7\u00e3o. Qualquer competi\u00e7\u00e3o. Qualquer momento."}
            className={styles.messageTicker}
            role="note"
          >
            <div aria-hidden="true" className={styles.messageViewport}>
              <div className={styles.messageTrack}>
                <span className={styles.messageText}>
                  {"TODA A INFORMA\u00c7\u00c3O. QUALQUER COMPETI\u00c7\u00c3O. QUALQUER MOMENTO."}
                </span>
                <span className={styles.messageText}>
                  {"TODA A INFORMA\u00c7\u00c3O. QUALQUER COMPETI\u00c7\u00c3O. QUALQUER MOMENTO."}
                </span>
              </div>
            </div>
          </div>
          {/* JORNADA-LED-TICKER-FIM */}
        </>
      ) : null}
      {classificationHref && activeCompetition ? (
        <Link
          aria-current={classificationHashIsActive ? "page" : undefined}
          aria-label={`Classificação da ${activeCompetition.label}`}
          className={`${styles.link} ${styles.classificationLink}`}
          href={classificationHref}
        >
          {activeCompetitionLogo ? (
            <img
              alt=""
              aria-hidden="true"
              className={styles.competitionEmblem}
              data-variant={activeCompetitionLogo.variant}
              decoding="async"
              height={activeCompetitionLogo.intrinsicHeight}
              key={activeCompetitionLogo.logoUrl}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
              src={activeCompetitionLogo.logoUrl}
              width={activeCompetitionLogo.intrinsicWidth}
            />
          ) : null}
          <span>Classificação</span>
        </Link>
      ) : null}
    </nav>
  );
}
