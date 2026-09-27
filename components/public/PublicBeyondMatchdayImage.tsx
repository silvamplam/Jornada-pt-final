"use client";

import { useState, type ComponentProps } from "react";
import PublicEditorialImage from "./PublicEditorialImage";

const FALLBACK_IMAGE = "/assets/jornada-logo-original.png";

export default function PublicBeyondMatchdayImage({
  src,
  ...props
}: Omit<ComponentProps<typeof PublicEditorialImage>, "onError">) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const useFallback = !src || failedSource === src;

  return (
    <PublicEditorialImage
      {...props}
      src={useFallback ? FALLBACK_IMAGE : src}
      data-editorial-image-fallback={useFallback}
      onError={useFallback ? undefined : () => setFailedSource(src)}
    />
  );
}
