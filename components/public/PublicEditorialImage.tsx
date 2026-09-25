"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { publicEditorialImageSources, type PublicEditorialImageSize } from "@/lib/public-editorial-image";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes"> & {
  src: string;
  imageSize: PublicEditorialImageSize;
};

export default function PublicEditorialImage({ src, imageSize, onError, ...props }: Props) {
  const [failedOriginal, setFailedOriginal] = useState<string | null>(null);
  const sources = failedOriginal === src
    ? { src, srcSet: undefined, sizes: undefined }
    : publicEditorialImageSources(src, imageSize, props.loading === "lazy");

  function retryOriginal(element: HTMLImageElement) {
    if (sources.src !== src && element.getAttribute("src") !== src) {
      // Clear the whole candidate set, then try the canonical URL once. Doing
      // this in the same event also covers an error before React commits state.
      element.removeAttribute("srcset");
      element.removeAttribute("sizes");
      element.src = src;
      setFailedOriginal(src);
      return true;
    }
    return false;
  }

  return <img {...props} {...sources} ref={(element) => {
    // The SSR image may have failed before hydration attached onError.
    if (element?.complete && element.currentSrc && element.naturalWidth === 0) retryOriginal(element);
  }} onError={(event) => {
    if (!retryOriginal(event.currentTarget)) onError?.(event);
  }} />;
}
