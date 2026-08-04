import type { ReactNode } from "react";

import BroadcastChannelLogo from "@/components/public/BroadcastChannelLogo";
import { isSportTvBroadcastChannel } from "@/lib/public-broadcast-channel-logo";
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
  const isSportTvChannel = isSportTvBroadcastChannel(channelName);
  const channel = hasChannel ? (
    <span className={styles.channel}>
      <BroadcastChannelLogo
        logoUrl={channelLogoUrl}
        name={channelName}
        variant="matchMeta"
      />
    </span>
  ) : null;
  const variantClassName = variant === "compact" ? `${styles.matchMeta} ${styles.compact}` : styles.matchMeta;
  const className = hasChannel ? variantClassName : `${variantClassName} ${styles.withoutChannel}`;

  return (
    <span
      className={className}
      data-public-match-channel-family={isSportTvChannel ? "sport-tv" : undefined}
      data-public-match-meta
    >
      <span className={styles.dateTime}>{dateTime}</span>
      {channel}
    </span>
  );
}
