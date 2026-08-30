import type { ReactNode } from "react";

import styles from "./PublicMatchdayEditorialSectionFrame.module.css";

type PublicMatchdayEditorialSectionFrameProps = {
  children: ReactNode;
  kind: "zone" | "latest";
};

export default function PublicMatchdayEditorialSectionFrame({
  children,
  kind,
}: PublicMatchdayEditorialSectionFrameProps) {
  return (
    <div
      className={styles.frame}
      data-public-editorial-section-frame={kind}
    >
      {children}
    </div>
  );
}
