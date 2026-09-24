"use client";

import React, { useState, type CSSProperties } from "react";
import { ARTICLE_CLASSIFICATIONS, articleClassificationBadgeColors } from "@/lib/editorial-classifications";
import {
  resolveArticlePlanClassification,
  type ArticlePlanClassificationDecision,
  type ArticlePlanClassificationMode,
  type ArticlePlanClassificationSource,
} from "@/lib/redacao-automatica/article-plan-classification";
import type { ArticleClassificationKey } from "@/lib/editorial-classifications";

export function ArticlePlanClassificationEditor({
  fieldPrefix, persisted, assignedSourceIds, sources, disabled, className, onDecision,
}: Readonly<{
  fieldPrefix: string;
  persisted: Readonly<{
    classificationKey: ArticleClassificationKey | null;
    classificationMode?: ArticlePlanClassificationMode | null;
  }> | null;
  assignedSourceIds: readonly string[];
  sources: readonly ArticlePlanClassificationSource[];
  disabled: boolean;
  className?: string;
  onDecision: () => void;
}>) {
  // Local edits survive image changes, saves and refreshed server props. The parent
  // keys this editor by plan/output identity, so a reorder cannot transfer a choice.
  const [editorDecision, setEditorDecision] = useState<ArticlePlanClassificationDecision | null>(null);
  const decision = resolveArticlePlanClassification(persisted, assignedSourceIds, sources, editorDecision);
  function choose(next: ArticlePlanClassificationDecision) {
    setEditorDecision(next);
    onDecision();
  }
  return (
    <fieldset className={className} data-classification-mode={decision.classificationMode ?? "unset"}>
      <legend>Sugestão de classificação (opcional)</legend>
      <input type="hidden" name={`${fieldPrefix}classification_key`} value={decision.classificationKey ?? ""} />
      <input type="hidden" name={`${fieldPrefix}classification_mode`} value={decision.classificationMode ?? ""} />
      <div>
        {ARTICLE_CLASSIFICATIONS.map((classification) => {
          const badgeColors = articleClassificationBadgeColors(classification.key);
          return (
            <label
              key={classification.key}
              data-classification={classification.key}
              style={{
                "--classification-accent": badgeColors.backgroundColor,
                "--classification-foreground": badgeColors.color,
              } as CSSProperties}
            >
              <input
                name={`${fieldPrefix}classification_control`}
                checked={decision.classificationKey === classification.key}
                disabled={disabled}
                onChange={() => choose({ classificationKey: classification.key, classificationMode: "manual" })}
                onClick={() => {
                  if (decision.classificationKey === classification.key && decision.classificationMode !== "manual") {
                    choose({ classificationKey: classification.key, classificationMode: "manual" });
                  }
                }}
                type="radio"
                value={classification.key}
              />
              <span>{classification.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
