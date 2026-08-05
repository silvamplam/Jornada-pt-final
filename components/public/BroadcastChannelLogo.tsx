"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import {
  getPublicBroadcastMatchMetaScale,
  resolveBroadcastChannelLogoPresentation
} from "@/lib/public-broadcast-channel-logo";
import styles from "./BroadcastChannelLogo.module.css";

type BroadcastChannelLogoProps = {
  name?: string | null;
  logoUrl?: string | null;
  variant: "compact" | "default" | "matchMeta";
};

export default function BroadcastChannelLogo({
  name,
  logoUrl,
  variant
}: BroadcastChannelLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const presentation = resolveBroadcastChannelLogoPresentation(name, logoUrl);

  if (presentation.kind === "hidden") return null;

  const matchMeta = variant === "matchMeta";
  const isCanal11 = matchMeta && presentation.name.toLocaleLowerCase("pt-PT") === "canal 11";
  const className = `${styles.root} ${styles[variant]}${matchMeta ? ` ${styles.normalizedMatchMeta}` : ""}${isCanal11 ? ` ${styles.canal11}` : ""}`;
  const matchMetaStyle = matchMeta
    ? { "--broadcast-channel-match-meta-scale": getPublicBroadcastMatchMetaScale(presentation.name) } as CSSProperties
    : undefined;
  if (presentation.kind === "fallback" || presentation.logoUrl === failedUrl) {
    return (
      <span
        className={`${className} ${styles.fallback}`}
        data-public-broadcast-logo-visual
        style={matchMetaStyle}
        title={presentation.name}
      >
        {presentation.name}
      </span>
    );
  }

  const imageClassName = presentation.contrastMode === "light-logo" ? `${className} ${styles.lightLogo}` : className;
  const matchMetaGeometry = variant === "matchMeta" ? presentation.matchMetaGeometry : undefined;
  const renderedWidth = matchMetaGeometry?.renderedWidth ?? 54 * presentation.opticalScale;
  const renderedHeight = matchMetaGeometry?.renderedHeight ?? Math.min(18, 18 * presentation.opticalScale);
  const slotWidth = Math.max(renderedWidth, presentation.slotMinWidth);
  const imageStyle = {
    "--broadcast-channel-optical-scale": presentation.opticalScale,
    "--broadcast-channel-match-meta-width": `${renderedWidth.toFixed(2)}px`,
    "--broadcast-channel-match-meta-height": `${renderedHeight.toFixed(2)}px`,
    "--broadcast-channel-match-meta-slot-width": `${slotWidth.toFixed(2)}px`,
    ...matchMetaStyle
  } as CSSProperties;

  return (
    <span className={imageClassName} style={imageStyle}>
      {matchMetaGeometry?.sourceViewport ? (
        <svg
          className={styles.alphaViewport}
          data-public-broadcast-logo-visual
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={matchMetaGeometry.sourceViewport.viewBox}
        >
          <title>{presentation.name}</title>
          <image
            height={matchMetaGeometry.sourceViewport.height}
            href={presentation.logoUrl}
            onError={() => setFailedUrl(presentation.logoUrl)}
            width={matchMetaGeometry.sourceViewport.width}
          />
        </svg>
      ) : (
        <img
          alt={presentation.name}
          data-public-broadcast-logo-visual
          src={presentation.logoUrl}
          title={presentation.name}
          onError={() => setFailedUrl(presentation.logoUrl)}
        />
      )}
    </span>
  );
}
