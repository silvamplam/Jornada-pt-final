import type { ReactNode } from "react";

import BroadcastChannelLogo from "@/components/public/BroadcastChannelLogo";
import styles from "./PublicMatchMeta.module.css";

type PublicMatchMetaProps = {
  dateTime: ReactNode;
  channelName?: string | null;
  channelLogoUrl?: string | null;
  variant?: "default" | "compact";
};

export default function PublicMatchMeta({
  dateTime,
  channelName,
  channelLogoUrl,
  variant = "default"
}: PublicMatchMetaProps) {
  const hasChannel = Boolean(channelName?.trim());
  const channel = hasChannel ? (
    <span className={styles.channel}>
      <BroadcastChannelLogo
        logoUrl={channelLogoUrl}
        name={channelName}
        variant="matchMeta"
      />
    </span>
  ) : null;
  const className = variant === "compact" ? `${styles.matchMeta} ${styles.compact}` : styles.matchMeta;

  return (
    <span className={className} data-public-match-meta>
      <span className={styles.dateTime}>{dateTime}</span>
      {channel}
    </span>
  );
}
