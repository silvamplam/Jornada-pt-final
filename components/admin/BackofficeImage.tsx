"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { editorialImagePreviewUrl, type EditorialPreviewWidth } from "@/lib/editorial-image-preview";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  previewWidth: EditorialPreviewWidth;
};

export default function BackofficeImage({ src, previewWidth, onError, ...props }: Props) {
  const preview = editorialImagePreviewUrl(src, previewWidth);
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const displayed = failedPreview === preview ? src : preview;

  return <img {...props} src={displayed} onError={(event) => {
    if (displayed !== src) {
      setFailedPreview(preview);
    } else {
      onError?.(event);
    }
  }} />;
}
