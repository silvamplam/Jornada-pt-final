"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  resolvePublicTeamBadgePresentation,
  type PublicTeamBadgeContrastMode
} from "@/lib/public-team-badge";
import styles from "./PublicTeamBadge.module.css";

export type PublicTeamBadgeVariant = "compact" | "default";

type PublicTeamBadgeProps = {
  logoUrl?: string | null;
  fallbackLabel: string;
  altLabel?: string | null;
  slug?: string | null;
  variant?: PublicTeamBadgeVariant;
};

function contrastClassName(mode: PublicTeamBadgeContrastMode) {
  return mode === "light-detail" ? styles.lightDetail : "";
}

export default function PublicTeamBadge({
  logoUrl,
  fallbackLabel,
  altLabel,
  slug,
  variant = "default"
}: PublicTeamBadgeProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const presentation = resolvePublicTeamBadgePresentation(logoUrl, slug);
  const exactAlt = altLabel?.trim() || fallbackLabel.trim();
  const showImage = presentation.kind === "image" && presentation.logoUrl !== failedUrl;
  const rootClassName = `${styles.root} ${styles[variant]}`;

  useEffect(() => {
    setFailedUrl(null);
  }, [logoUrl]);

  return (
    <span className={rootClassName} data-public-team-badge="true" data-logo-url={logoUrl ?? ""} data-team-slug={slug ?? ""}>
      {showImage ? (
        <img
          alt={exactAlt}
          title={exactAlt}
          className={`${styles.image} ${contrastClassName(presentation.contrastMode)}`}
          src={presentation.logoUrl}
          style={{ "--public-team-badge-optical-scale": presentation.opticalScale } as CSSProperties}
          onError={() => setFailedUrl(presentation.logoUrl)}
        />
      ) : (
        <span className={styles.fallback} title={exactAlt}>{fallbackLabel}</span>
      )}
    </span>
  );
}
