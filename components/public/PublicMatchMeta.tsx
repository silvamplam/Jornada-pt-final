import type { ReactNode } from "react";

import BroadcastChannelLogo from "@/components/public/BroadcastChannelLogo";
import styles from "./PublicMatchMeta.module.css";

type PublicMatchMetaProps = {
  dateTime: ReactNode;
  channelName?: string | null;
  channelLogoUrl?: string | null;
};

export default function PublicMatchMeta({ dateTime, channelName, channelLogoUrl }: PublicMatchMetaProps) {
  const hasChannel = Boolean(channelName?.trim());

  return (
    <span className={styles.matchMeta}>
      <span className={styles.dateTime}>{dateTime}</span>
      {hasChannel ? (
        <span className={styles.channel}>
          <BroadcastChannelLogo logoUrl={channelLogoUrl} name={channelName} variant="matchMeta" />
        </span>
      ) : null}
    </span>
  );
}
