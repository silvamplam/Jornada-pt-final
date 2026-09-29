import { createHash } from "node:crypto";
import { safeEditorialSourceUrl, validateEditorialImageBytes } from "./editorial-image-download.server";
import { frozenImageForBytes } from "./editorial-image-freeze.server";
import { ensureEditorialImagePreviews } from "./editorial-image-preview-generation.server";
import { editorialPreviewPath, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";

export type ReplacementInput = {
  articleId: string; expectedCurrentImageUrl: string; decisionKey: string;
  sourceUrl: string; sha256: string; reviewer: string; localFile: string;
};
export type ReplacementSnapshot = {
  origin: string;
  articles: { id: string; status: string; image_url: string }[];
  assets: { public_url: string; storage_path: string; sha256: string; byte_size: number; content_type: string }[];
  objects: { name: string; metadata: { size: number; mimetype: string } }[];
  decisions: { decision_key: string; source_url: string; state: string; image: unknown }[];
};

/** Offline preparation only. No source fetch, Storage read, upload or RPC invocation. */
export async function prepareImageReplacement(input: ReplacementInput, bytes: Uint8Array, snapshot: ReplacementSnapshot) {
  if (!input.decisionKey.startsWith(`replacement:${input.articleId}:`) ||
    !/^[a-zA-Z0-9:_.-]{1,200}$/.test(input.decisionKey) || !input.reviewer.trim()) throw new Error("replacement-invalid-input");
  safeEditorialSourceUrl(input.sourceUrl);
  const article = snapshot.articles.find(a => a.id === input.articleId);
  if (!article || article.status !== "published" || article.image_url !== input.expectedCurrentImageUrl) throw new Error("replacement-reference-conflict");
  if (createHash("sha256").update(bytes).digest("hex") !== input.sha256) throw new Error("replacement-hash-conflict");
  const extension = await validateEditorialImageBytes(bytes);
  const image = frozenImageForBytes(bytes, extension, snapshot.origin);
  const asset = snapshot.assets.find(a => a.public_url === image.publicUrl || a.storage_path === image.path);
  if (asset && (asset.public_url !== image.publicUrl || asset.storage_path !== image.path || asset.sha256 !== image.sha256 ||
    asset.byte_size !== image.byteSize || asset.content_type !== image.contentType)) throw new Error("replacement-asset-conflict");
  const decision = snapshot.decisions.find(d => d.decision_key === input.decisionKey);
  if (decision && (decision.source_url !== input.sourceUrl || decision.state !== "ready" ||
    JSON.stringify(Object.entries(decision.image as object).sort()) !== JSON.stringify(Object.entries(image).sort()))) throw new Error("replacement-decision-conflict");
  const paths = [image.path, ...PUBLIC_EDITORIAL_PREVIEW_WIDTHS.map(w => editorialPreviewPath(image.path, w)!)];
  const uploads: { path: string; bytes: Uint8Array; contentType: string; headers: Record<string, string> }[] = [];
  const validateObject = (path: string, size?: number) => {
    const object = snapshot.objects.find(o => o.name === path);
    if (object && (!(object.metadata.size > 0) || (size !== undefined && object.metadata.size !== size) ||
      object.metadata.mimetype !== (path === image.path ? image.contentType : "image/webp"))) throw new Error("replacement-object-conflict");
    return object;
  };
  if (asset) {
    for (const path of paths) if (!validateObject(path, path === image.path ? bytes.byteLength : undefined)) throw new Error("replacement-objects-incomplete");
  } else {
    const generated = new Map<string, Uint8Array>([[image.path, bytes]]);
    const result = await ensureEditorialImagePreviews(image.path, {
      exists: async () => false,
      readOriginal: async () => { throw new Error("replacement-storage-read-forbidden"); },
      writePreview: async (path, data) => { generated.set(path, data); return "created"; },
      list: async () => [],
    }, bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
    if (!result.ok || generated.size !== 5) throw new Error("replacement-preview-failed");
    for (const [path, data] of generated) if (!validateObject(path, data.byteLength)) uploads.push({ path, bytes: data,
      contentType: path === image.path ? image.contentType : "image/webp",
      headers: { "x-upsert": "false", "Cache-Control": "max-age=31536000" } });
  }
  return { image, existingAsset: !!asset, uploads,
    registration: { p_article_id: input.articleId, p_expected_current_image_url: input.expectedCurrentImageUrl,
      p_replacement_decision_key: input.decisionKey, p_source_url: input.sourceUrl, p_candidate_url: image.publicUrl },
    promotion: { p_article_id: input.articleId, p_expected_current_image_url: input.expectedCurrentImageUrl,
      p_replacement_decision_key: input.decisionKey, p_reviewer: input.reviewer },
    articlePatch: { image_url: image.publicUrl },
  };
}
