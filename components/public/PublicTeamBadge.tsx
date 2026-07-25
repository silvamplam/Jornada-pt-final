"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  classifyPublicTeamBadgeShape,
  resolvePublicTeamBadgePresentation,
  type PublicTeamBadgeContrastMode,
  type PublicTeamBadgeShape
} from "@/lib/public-team-badge";
import styles from "./PublicTeamBadge.module.css";

export type PublicTeamBadgeVariant = "compact" | "default";

type PublicTeamBadgeProps = {
  logoUrl?: string | null;
  fallbackLabel: string;
  altLabel?: string | null;
  slug?: string | null;
  variant?: PublicTeamBadgeVariant;
  visualNormalization?: "perceptual";
};

function contrastClassName(mode: PublicTeamBadgeContrastMode) {
  return mode === "light-detail" ? styles.lightDetail : "";
}

export default function PublicTeamBadge({
  logoUrl,
  fallbackLabel,
  altLabel,
  slug,
  variant = "default",
  visualNormalization
}: PublicTeamBadgeProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [logoShape, setLogoShape] = useState<PublicTeamBadgeShape>("balanced");
  const presentation = resolvePublicTeamBadgePresentation(logoUrl, slug);
  const exactAlt = altLabel?.trim() || fallbackLabel.trim();
  const showImage = presentation.kind === "image" && presentation.logoUrl !== failedUrl;
  const rootClassName = `${styles.root} ${styles[variant]}`;

  useEffect(() => {
    setFailedUrl(null);
    setLogoShape("balanced");
  }, [logoUrl, visualNormalization]);

  return (
    <span
      className={rootClassName}
      data-logo-shape={visualNormalization === "perceptual" ? logoShape : undefined}
      data-logo-url={logoUrl ?? ""}
      data-public-team-badge="true"
      data-team-slug={slug ?? ""}
    >
      {showImage ? (
        <img
          alt={exactAlt}
          title={exactAlt}
          className={`${styles.image} ${contrastClassName(presentation.contrastMode)}`}
          src={presentation.logoUrl}
          style={{ "--public-team-badge-optical-scale": presentation.opticalScale } as CSSProperties}
          onError={() => setFailedUrl(presentation.logoUrl)}
          onLoad={(event) => {
            if (visualNormalization !== "perceptual") return;
            setLogoShape(classifyPublicTeamBadgeShape(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight));
          }}
        />
      ) : (
        <span className={styles.fallback} title={exactAlt}>{fallbackLabel}</span>
      )}
    </span>
  );
}
