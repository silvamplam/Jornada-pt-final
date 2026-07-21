"use client";

import { useState } from "react";

import { resolveBroadcastChannelLogoPresentation } from "@/lib/public-broadcast-channel-logo";
import styles from "./BroadcastChannelLogo.module.css";

type BroadcastChannelLogoProps = {
  name?: string | null;
  logoUrl?: string | null;
  variant: "compact" | "default";
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

  return (
    <span className={className}>
      <img
        alt={presentation.name}
        src={presentation.logoUrl}
        title={presentation.name}
        onError={() => setFailedUrl(presentation.logoUrl)}
      />
    </span>
  );
}
