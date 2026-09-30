"use client";

import { useEffect, useState } from "react";
import { editorialImageOriginalPath } from "@/lib/editorial-image-authority";
import {
  createProductionImagePreparer, productionImageError,
  type PreparedImageChoice, type ProductionCandidate,
} from "@/lib/editorial-production-image-choice";

const prepare = createProductionImagePreparer(async (dossierId, imageId, revisionKey) => {
  const response = await fetch("/api/admin/editorial/images/freeze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepare: true, confirm: false, dossierId, dossierImageId: imageId, revisionKey }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? "image-preparation-failed");
  if (!editorialImageOriginalPath(result.image?.publicUrl)) throw new Error("image-materialization-required");
  return result.image as PreparedImageChoice;
});

export function useProductionImagePreparation(dossierId: string, candidate: ProductionCandidate | null, enabled: boolean) {
  const [results, setResults] = useState<Record<string, PreparedImageChoice>>({});
  const [attempt, setAttempt] = useState<{ count: number; identity?: string; revisionKey?: string }>({ count: 0 });
  const [status, setStatus] = useState<{ identity: string; busy: boolean; error: string }>({ identity: "", busy: false, error: "" });
  const identity = candidate ? JSON.stringify([candidate.id, candidate.frozenUrl]) : "";
  const id = candidate?.id;
  const url = candidate?.frozenUrl;
  const result = results[identity];
  const revisionKey = attempt.identity === identity ? attempt.revisionKey : undefined;
  const needsPreparation = enabled && Boolean(candidate);
  useEffect(() => {
    if (!enabled || !id || !url) return;
    let current = true;
    setStatus({ identity, busy: true, error: "" });
    prepare(dossierId, { id, frozenUrl: url }, revisionKey).then(image => {
      if (current) {
        setResults(previous => ({ ...previous, [identity]: image }));
        setStatus({ identity, busy: false, error: "" });
      }
    }).catch(error => {
      if (current) setStatus({ identity, busy: false, error: productionImageError(error instanceof Error ? error.message : "") });
    });
    return () => { current = false; };
  }, [dossierId, enabled, id, url, identity, needsPreparation, attempt, revisionKey]);
  return {
    result,
    busy: enabled && (status.identity === identity ? status.busy : needsPreparation && !result),
    error: status.identity === identity ? status.error : "",
    retry: () => setAttempt(previous => ({ ...previous, count: previous.count + 1 })),
    reacquire: () => setAttempt(previous => ({ count: previous.count + 1, identity, revisionKey: crypto.randomUUID() })),
  };
}
