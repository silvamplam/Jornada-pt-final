/** Injectable RPC boundary; production supplies the existing admin transport.
 * Tests supply a Unix-socket PostgreSQL transport, not production credentials.
 */
import { parseMesaProductionIntent, type MesaProductionIntent } from "./newsroom-mesa-production-intents";
import {
  parseMesaProductionIntents, parseMesaProductionIntentsPreview, parseMesaIntentLatestReceipts,
  parseMesaIntentLatestArticleReceipts, sameMesaIntentJson, type MesaProductionIntentsFrozen,
} from "./newsroom-mesa-production-intents-contract";

export type MesaIntentRpcTransport = Readonly<{
  post: (name: string, args: Readonly<Record<string, unknown>>) => Promise<readonly unknown[]>;
  get: (name: string, args: Readonly<Record<string, string>>) => Promise<readonly unknown[]>;
}>;
export type MesaIntentPublicationArticle = Readonly<{
  id: string; slug: string; label: string; title: string; subtitle: string; body: string;
  imageUrl: string | null; author: string; publishedAt: string; matchdayId: string | null;
  mode: "create" | "update";
}>;
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const id = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
function single(rows: readonly unknown[]) { return rows.length === 1 ? object(rows[0]) : null; }
function frozen(value: unknown) {
  const plan=parseMesaProductionIntents(value);
  if (!plan) throw new Error("mesa-intent-plan-invalid");
  return plan;
}
function normalizeRequest(input: MesaProductionIntent): MesaProductionIntent {
  return { ...input, themes: [...input.themes].sort((a,b) => a.themeId.localeCompare(b.themeId)),
    sources: [...input.sources].sort((a,b) => a.sourceId.localeCompare(b.sourceId)),
    ...(input.selection ? { selection: { ...input.selection,
      sourceIds: [...input.selection.sourceIds].sort(), reviewArticleIds: [...input.selection.reviewArticleIds].sort() } } : {}) };
}
export function mesaProductionIntentsService(transport: MesaIntentRpcTransport) {
  return {
    async preview(request: unknown) {
      const input=parseMesaProductionIntent(request);
      if (!input.ok) throw new Error(input.issues[0].code);
      const normalized=normalizeRequest(input.value);
      const row=single(await transport.post("newsroom_mesa_preview_intents_v1", {p_request: normalized}));
      const plan=parseMesaProductionIntentsPreview(row?.plan);
      if (!plan || !sameMesaIntentJson(plan.request,normalized)) throw new Error("mesa-intent-preview-result-invalid");
      return plan;
    },
    async prepare(request: unknown, authorityFingerprint: string) {
      const input=parseMesaProductionIntent(request);
      if (!input.ok || !/^[0-9a-f]{64}$/.test(authorityFingerprint)) throw new Error("mesa-intent-preparation-input-invalid");
      const normalized=normalizeRequest(input.value);
      const row=single(await transport.post("newsroom_prepare_mesa_intents_v1", {
        p_request:normalized,p_expected_authority_fingerprint:authorityFingerprint,
      }));
      const result=object(row?.result), plan=parseMesaProductionIntents(result?.plan);
      if (!result || !plan || result.dossierId !== plan.dossierId
        || !["created","reused"].includes(String(result.preparationAction))
        || plan.authorityFingerprint !== authorityFingerprint || !sameMesaIntentJson(plan.request,normalized)) {
        throw new Error("mesa-intent-preparation-result-invalid");
      }
      return {dossierId:plan.dossierId,preparationAction:result.preparationAction as "created" | "reused",plan};
    },
    async publish(input: Readonly<{
      plan: MesaProductionIntentsFrozen; packageId: string; outputId: string;
      dossierSourceIds: readonly string[]; article: MesaIntentPublicationArticle;
    }>) {
      const p=frozen(input.plan), a=input.article, o=p.outputs.find((o) => o.outputId === input.outputId);
      if (!o || !id(input.packageId) || !id(a.id) || !input.dossierSourceIds.length || input.dossierSourceIds.length>20
        || !input.dossierSourceIds.every(id) || new Set(input.dossierSourceIds).size !== input.dossierSourceIds.length
        || (o.kind === "existing" ? a.mode !== "update" || a.id !== o.target!.editorialArticleId
          || a.slug !== o.target!.slug || a.matchdayId !== o.target!.matchdayId : a.mode !== "create" || !id(a.matchdayId))) {
        throw new Error("mesa-intent-publication-input-invalid");
      }
      const row=single(await transport.post("newsroom_publish_mesa_intent_output_v1", {
        p_dossier_id:p.dossierId,p_output_id:o.outputId,p_package_id:input.packageId,
        p_dossier_source_ids:input.dossierSourceIds,p_article:a,
      }));
      if (!row || row.editorial_article_id !== a.id || row.article_slug !== a.slug
        || !["created","updated","reused"].includes(String(row.publication_action)) || typeof row.consolidated !== "boolean") {
        throw new Error("mesa-intent-publication-result-invalid");
      }
      return {articleId:a.id,slug:a.slug,action:row.publication_action as "created" | "updated" | "reused",consolidated:row.consolidated};
    },
    async placeLatest(input: Readonly<{plan: MesaProductionIntentsFrozen; packageId: string; articleIds: readonly string[]}>) {
      const p=frozen(input.plan), ids=input.articleIds;
      if (!id(input.packageId) || !ids.length || ids.length>30 || !ids.every(id) || new Set(ids).size!==ids.length
        || ids.some((articleId) => !p.outputs.some((o) => o.kind==="existing" ? o.target!.matchdayId!==null && o.target!.editorialArticleId===articleId : o.outputId===articleId))) {
        throw new Error("mesa-intent-latest-input-invalid");
      }
      const row=single(await transport.post("newsroom_place_mesa_intent_latest_v1", {
        p_dossier_id:p.dossierId,p_package_id:input.packageId,p_article_ids:ids,
      }));
      const r=object(row?.result);
      if (!r || !["placed","reused"].includes(String(r.action)) || r.articleCount!==ids.length
        || !Number.isInteger(r.matchdayCount) || Number(r.matchdayCount)<1 || Number(r.matchdayCount)>ids.length) {
        throw new Error("mesa-intent-latest-result-invalid");
      }
      return {action:r.action as "placed" | "reused",articleCount:ids.length,matchdayCount:r.matchdayCount as number};
    },
    async finalize(input: Readonly<{plan: MesaProductionIntentsFrozen; packageId: string; noChangeOutputIds: readonly string[]}>) {
      const p=frozen(input.plan), ids=input.noChangeOutputIds;
      if (!id(input.packageId) || ids.length>30 || new Set(ids).size !== ids.length
        || ids.some((id) => !p.outputs.some((o) => o.outputId===id && o.kind==="existing"))) throw new Error("mesa-intent-finalization-input-invalid");
      const row=single(await transport.post("newsroom_finalize_mesa_intents_v1", {
        p_dossier_id:p.dossierId,p_package_id:input.packageId,p_no_change_output_ids:ids,
      }));
      const r=object(row?.result);
      if (!r || !["consolidated","reused"].includes(String(r.action)) || !id(r.publicationEventId)
        || r.noChangeCount !== ids.length || r.newCount !== p.totals.newArticles
        || r.updatedCount !== p.totals.reviews-ids.length) throw new Error("mesa-intent-finalization-result-invalid");
      return {action:r.action as "consolidated" | "reused",publicationEventId:r.publicationEventId,
        updatedCount:r.updatedCount as number,newCount:r.newCount as number,noChangeCount:r.noChangeCount as number};
    },
    async readGlobalCandidates(sourceIds: readonly string[]) {
      if (!sourceIds.length || sourceIds.length>20 || !sourceIds.every(id) || new Set(sourceIds).size!==sourceIds.length) {
        throw new Error("mesa-intent-global-candidates-input-invalid");
      }
      const normalized=[...sourceIds].sort();
      const row=single(await transport.post("newsroom_mesa_global_article_candidates_v1", {
        p_source_ids:normalized,p_theme_ids:[],
      }));
      if (!Array.isArray(row?.candidates) || row.candidates.length>200) {
        throw new Error("mesa-intent-global-candidates-result-invalid");
      }
      const result:{id:string;title:string}[]=[];
      const seen=new Set<string>();
      for (const raw of row.candidates) {
        const candidate=object(raw);
        if (!candidate || !id(candidate.editorialArticleId) || seen.has(candidate.editorialArticleId)
          || typeof candidate.title!=="string" || !candidate.title.trim()) {
          throw new Error("mesa-intent-global-candidates-result-invalid");
        }
        seen.add(candidate.editorialArticleId);
        result.push({id:candidate.editorialArticleId,title:candidate.title.trim()});
      }
      return result.sort((a,b)=>a.id.localeCompare(b.id));
    },
    async readReceipts(themeId: string) {
      if (!id(themeId)) throw new Error("mesa-intent-receipts-input-invalid");
      const row=single(await transport.get("newsroom_mesa_intent_latest_receipts_v1", {p_theme_id:themeId}));
      const receipts=parseMesaIntentLatestReceipts(row?.receipts,themeId);
      if (!receipts) throw new Error("mesa-intent-receipts-result-invalid");
      return receipts;
    },
    async readArticleReceipts(articleIds: readonly string[]) {
      if (!articleIds.length || articleIds.length>30 || !articleIds.every(id) || new Set(articleIds).size!==articleIds.length) {
        throw new Error("mesa-intent-article-receipts-input-invalid");
      }
      const normalized=[...articleIds].sort();
      const row=single(await transport.post("newsroom_mesa_intent_latest_article_receipts_v2", {p_article_ids:normalized}));
      const receipts=parseMesaIntentLatestArticleReceipts(row?.receipts,normalized);
      if (!receipts) throw new Error("mesa-intent-article-receipts-result-invalid");
      return receipts;
    },
  };
}
