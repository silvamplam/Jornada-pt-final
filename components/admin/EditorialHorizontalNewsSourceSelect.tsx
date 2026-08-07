"use client";

import type { ChangeEvent } from "react";

type EditorialHorizontalNewsSourceOption = {
  key: string;
  optionLabel: string;
  label: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
};

const sourceFields = [
  ["label", "label"],
  ["title", "title"],
  ["subtitle", "subtitle"],
  ["image_url", "imageUrl"],
  ["link_url", "linkUrl"]
] as const;

export default function EditorialHorizontalNewsSourceSelect({
  sources
}: {
  sources: EditorialHorizontalNewsSourceOption[];
}) {
  function handleSourceChange(event: ChangeEvent<HTMLSelectElement>) {
    const select = event.currentTarget;
    const source = sources.find((candidate) => candidate.key === select.value);
    const card = select.closest<HTMLElement>("[data-horizontal-news-card]");

    if (!source || !card) {
      return;
    }

    for (const [fieldName, sourceKey] of sourceFields) {
      const field = card.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-horizontal-news-field="${fieldName}"]`
      );

      if (!field) {
        continue;
      }

      field.value = source[sourceKey];
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    select.value = "";
  }

  return (
    <select data-horizontal-news-source defaultValue="" onChange={handleSourceChange}>
      <option value="">Escolher fonte publicada</option>
      {sources.map((source) => (
        <option key={source.key} value={source.key}>
          {source.optionLabel}
        </option>
      ))}
    </select>
  );
}
