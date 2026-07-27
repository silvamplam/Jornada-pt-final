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
  classificationHref
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
    <nav className={styles.navigation} aria-label="Navegação pública">
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
