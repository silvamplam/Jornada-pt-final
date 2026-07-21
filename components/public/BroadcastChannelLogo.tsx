"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import { resolveBroadcastChannelLogoPresentation } from "@/lib/public-broadcast-channel-logo";
import styles from "./BroadcastChannelLogo.module.css";

type BroadcastChannelLogoProps = {
  name?: string | null;
  logoUrl?: string | null;
  variant: "compact" | "default" | "matchMeta";
};

export default function BroadcastChannelLogo({ name, logoUrl, variant }: BroadcastChannelLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const presentation = resolveBroadcastChannelLogoPresentation(name, logoUrl);

  if (presentation.kind === "hidden") return null;

  const className = `${styles.root} ${styles[variant]}`;
  if (presentation.kind === "fallback" || presentation.logoUrl === failedUrl) {
    return (
      <span className={`${className} ${styles.fallback}`} title={presentation.name}>
        {presentation.name}
      </span>
    );
  }

  const imageClassName = presentation.contrastMode === "light-logo" ? `${className} ${styles.lightLogo}` : className;
  const imageStyle = {
    "--broadcast-channel-optical-scale": presentation.opticalScale
  } as CSSProperties;

  return (
    <span className={imageClassName} style={imageStyle}>
      <img
        alt={presentation.name}
        src={presentation.logoUrl}
        title={presentation.name}
        onError={() => setFailedUrl(presentation.logoUrl)}
      />
    </span>
  );
}
