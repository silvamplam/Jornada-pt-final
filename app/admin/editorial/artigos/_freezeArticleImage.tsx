"use client";
import { useRef, useState } from "react";
import FreezeEditorialImage from "@/components/admin/FreezeEditorialImage";

export default function FreezeArticleImage() {
  const root = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState("");
  return <div ref={root} className="article-admin-full">
    <button type="button" onClick={() => {
      const input = root.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="image_url"]');
      setSource(input?.value.trim() ?? "");
    }}>Rever e congelar imagem por URL</button>
    {source ? <FreezeEditorialImage key={source} sourceUrl={source} onConfirm={(url) => {
      const input = root.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="image_url"]');
      if (input) { input.value = url; input.dispatchEvent(new Event("input", { bubbles: true })); }
      setSource("");
    }} /> : null}
  </div>;
}
