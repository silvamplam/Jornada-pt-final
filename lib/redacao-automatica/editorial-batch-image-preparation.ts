import { editorialImageOriginalPath } from "../editorial-image-authority";
import {
  editorialBatchDossierImages, withEditorialBatchMaterializedImage, withEditorialBatchOutputImageChoice,
} from "./editorial-batch-image-selection";
import type { EditorialBatchTransferSourcePackage } from "./editorial-batch-transfer";

export type BatchImagePreparation = { imageId: string; status: "pending" | "error" };
export type BatchImageCandidate = { id: string; imageUrl: string; dossierImageId: string | null; dossierId?: string };

/** The click is the editorial confirmation. Acquisition remains in the existing
 * server freeze pipeline; this client never fetches the external original. */
export function createBatchImagePreparer(transport: {
  fetch: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem">;
  uuid: () => string;
  origin?: string;
}) {
  return async (image: BatchImageCandidate, retry: boolean): Promise<string> => {
    if (editorialImageOriginalPath(image.imageUrl, transport.origin)) return image.imageUrl;
    const cacheKey = `jornada:image-decision:${image.dossierImageId ?? image.imageUrl}`;
    let decisionKey = transport.storage.getItem(cacheKey) ?? (image.dossierImageId ? "" : transport.uuid());
    if (!image.dossierImageId) transport.storage.setItem(cacheKey, decisionKey);
    const request = (revisionKey?: string) => transport.fetch("/api/admin/editorial/images/freeze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ select: true, confirm: true, sourceUrl: image.imageUrl,
        ...(image.dossierImageId
          ? { dossierImageId: image.dossierImageId, dossierId: image.dossierId, revisionKey,
              ...(decisionKey ? { decisionKey } : {}) }
          : { decisionKey }),
      }),
    });
    let response = await request();
    let result = await response.json();
    // Only an explicit retry AND a server-confirmed acquisition without durable
    // bytes may start a revision. Preview/confirmation/network retries reuse it.
    if (!response.ok && result?.error === "image-acquisition-incomplete" && retry) {
      decisionKey = transport.uuid();
      if (!image.dossierImageId) transport.storage.setItem(cacheKey, decisionKey);
      response = await request(decisionKey);
      result = await response.json();
    }
    if (!response.ok || !result?.ok || !editorialImageOriginalPath(result.image?.publicUrl, transport.origin)) {
      throw new Error(result?.error ?? "image-preparation-failed");
    }
    return result.image.publicUrl;
  };
}

/** One pending choice per output; one acquisition per shared candidate. */
export function createBatchImageSelector(ports: {
  read: () => EditorialBatchTransferSourcePackage | null;
  write: (value: EditorialBatchTransferSourcePackage) => void;
  state: (outputId: string, state: BatchImagePreparation | null) => void;
  prepare: (image: BatchImageCandidate, retry: boolean) => Promise<string>;
  origin?: string;
}) {
  const latest = new Map<string, symbol>();
  const states = new Map<string, BatchImagePreparation>();
  const requests = new Map<string, Promise<string>>();
  const setState = (outputId: string, state: BatchImagePreparation | null) => {
    if (state) states.set(outputId, state); else states.delete(outputId);
    ports.state(outputId, state);
  };
  const cancel = (outputId: string) => { latest.set(outputId, Symbol()); setState(outputId, null); };
  return {
    cancel,
    isPreparing: (outputIds: readonly string[]) => outputIds.some(id => states.get(id)?.status === "pending"),
    async select(outputId: string, value: string) {
      const source = ports.read();
      if (!source?.batchContract?.outputIds.includes(outputId)) return;
      const imageId = value.startsWith("dossier_image:") ? value.slice("dossier_image:".length) : null;
      const image = editorialBatchDossierImages(source).find(item => item.id === imageId);
      if (imageId && !image) return;
      const token = Symbol();
      latest.set(outputId, token);
      if (!image || editorialImageOriginalPath(image.imageUrl, ports.origin)) {
        ports.write(withEditorialBatchOutputImageChoice(source, outputId, imageId));
        setState(outputId, null);
        return;
      }
      const retry = states.get(outputId)?.status === "error" && states.get(outputId)?.imageId === image.id;
      setState(outputId, { imageId: image.id, status: "pending" });
      const key = JSON.stringify([source.packageId, image.id, image.imageUrl]);
      const isCurrent = () => latest.get(outputId) === token && ports.read()?.packageId === source.packageId;
      try {
        if (!requests.has(key)) {
          const dossierImageId = image.freezeDossierImageId !== undefined ? image.freezeDossierImageId
            : image.id;
          const pending = ports.prepare({ ...image, dossierImageId, dossierId: source.dossierId }, retry)
            .catch(error => { requests.delete(key); throw error; });
          requests.set(key, pending);
        }
        const url = await requests.get(key)!;
        if (!editorialImageOriginalPath(url, ports.origin)) throw new Error("image-materialization-required");
        if (!isCurrent()) return;
        ports.write(withEditorialBatchOutputImageChoice(
          withEditorialBatchMaterializedImage(ports.read()!, image.id, url), outputId, image.id,
        ));
        setState(outputId, null);
      } catch {
        if (isCurrent()) setState(outputId, { imageId: image.id, status: "error" });
      }
    },
  };
}
