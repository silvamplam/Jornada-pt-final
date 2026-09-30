import { editorialImageOriginalPath } from "./editorial-image-authority";

export type ProductionCandidate = { id: string; frozenUrl: string; newsroomArticleId?: string | null };
export type PreparedImageChoice = { publicUrl: string; decisionKey: string | null; sha256: string | null };
export type ProductionImageSelection = { value: string; decisionKey: string | null; automatic: boolean; publicUrl: string | null };
export type ProductionImageConfirmation = { value: string; decisionKey: string | null; destination: "new" | "update" };

export function productionSaveDisabled(
  saving: boolean, visibleCards: readonly { key: string }[], preparingByCard: Readonly<Record<string, boolean>>,
) {
  return saving || visibleCards.some(card => preparingByCard[card.key] === true);
}

export function productionImageNeedsSave(selection: ProductionImageSelection, confirmed: ProductionImageConfirmation | null) {
  return !confirmed || selection.value !== confirmed.value || selection.decisionKey !== confirmed.decisionKey;
}

/** Eligibility is per output, using its effective sources; never the bank size. */
export function productionImageCandidate<T extends ProductionCandidate>(
  images: readonly T[], sourceIds: readonly string[], explicitChoice: string | null, destination: "new" | "update",
): T | null {
  if (explicitChoice !== null) {
    return explicitChoice.startsWith("dossier_image:")
      ? images.find(image => image.id === explicitChoice.slice("dossier_image:".length)) ?? null : null;
  }
  if (destination === "update") return null;
  const sources = new Set(sourceIds);
  const candidates = images.filter(image => image.newsroomArticleId && sources.has(image.newsroomArticleId));
  return candidates.length === 1 ? candidates[0] : null;
}

export function productionImageSelection(input: {
  candidate: ProductionCandidate | null; explicitChoice: string | null;
  destination: "new" | "update"; prepared?: PreparedImageChoice; origin?: string;
  fallback?: ProductionImageSelection;
}): ProductionImageSelection {
  const { candidate, explicitChoice, destination, prepared, origin } = input;
  if (candidate && editorialImageOriginalPath(prepared?.publicUrl ?? candidate.frozenUrl, origin)) {
    return { value: `dossier_image:${candidate.id}`, decisionKey: prepared?.decisionKey ?? null,
      automatic: explicitChoice === null, publicUrl: prepared?.publicUrl ?? candidate.frozenUrl };
  }
  // A failed replacement must retain the last usable choice, including a
  // previously chosen upload or 'Sem imagem'. Never persist the external URL.
  if (candidate && explicitChoice?.startsWith("dossier_image:") && input.fallback) return input.fallback;
  return { value: explicitChoice === "preserve_published" || (explicitChoice === null && destination === "update")
    ? "preserve_published" : "unselected", decisionKey: null, automatic: false, publicUrl: null };
}

export function productionImageError(code: string) {
  if (/unsafe|private|blocked|invalid-url|source-conflict|redirect/.test(code)) return "A origem desta imagem não é permitida.";
  if (/bytes|content-type|unsupported|too-large|invalid-image/.test(code)) return "O ficheiro não é uma imagem válida.";
  if (/incomplete/.test(code)) return "A imagem não ficou pronta. Podes tentar novamente ou obter uma nova revisão.";
  return "Não foi possível preparar esta imagem. Podes tentar novamente ou escolher outra.";
}

/** Coalesce simultaneous cards sharing one image, without coupling other outputs. */
export function createProductionImagePreparer(request: (dossierId: string, imageId: string, revisionKey?: string) => Promise<PreparedImageChoice>) {
  const requests = new Map<string, Promise<PreparedImageChoice>>();
  return (dossierId: string, image: ProductionCandidate, revisionKey?: string) => {
    const key = JSON.stringify([dossierId, image.id, image.frozenUrl, revisionKey ?? null]);
    if (!requests.has(key)) {
      const promise = request(dossierId, image.id, revisionKey).catch(error => {
        requests.delete(key);
        throw error;
      });
      requests.set(key, promise);
    }
    return requests.get(key)!;
  };
}
