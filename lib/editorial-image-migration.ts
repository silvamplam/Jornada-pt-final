import type { FrozenImage } from "./editorial-image-freeze.server";
export type HistoricalImageArticle = { id: string; slug: string; title: string; image_url: string };
export type HistoricalImageCandidate = {
  sourceUrl: string; decisionKey: string; state: "acquiring" | "ready" | "failed";
  image?: FrozenImage; files?: Record<string, string>; sizes?: Record<string, number>; error?: string;
};
export type ImageReview = { articleId: string; sourceUrl: string; sha256: string; decision: "approved" | "rejected" | "uncertain"; reviewer: string };
function sourceHost(value: string) { try { return new URL(value).hostname || "invalid-url"; } catch { return "invalid-url"; } }
export function imagePromotionPlan(articles: readonly HistoricalImageArticle[], candidates: readonly HistoricalImageCandidate[], reviews: readonly ImageReview[]) {
  return articles.map(article => {
    const candidate = candidates.find(c => c.sourceUrl === article.image_url);
    const matching = reviews.filter(r => r.articleId === article.id);
    const review = matching.length === 1 ? matching[0] : null;
    const approved = candidate?.state === "ready" && candidate.image && review?.decision === "approved"
      && review.sourceUrl === article.image_url && review.sha256 === candidate.image.sha256 && Boolean(review.reviewer?.trim());
    return { article, candidate, review, action: approved ? "promote" as const : "review" as const };
  });
}
export function imageMigrationSummary(articles: readonly HistoricalImageArticle[], candidates: readonly HistoricalImageCandidate[]) {
  const hosts: Record<string, number> = {};
  for (const a of articles) { const host = sourceHost(a.image_url); hosts[host] = (hosts[host] ?? 0) + 1; }
  const unique = new Map(candidates.filter(c => c.state === "ready" && c.image).map(c => [c.image!.sha256, c]));
  return { articles: articles.length, hosts, uniqueUrls: new Set(articles.map(a => a.image_url)).size,
    repeatedReferences: articles.length - new Set(articles.map(a => a.image_url)).size,
    readyUrls: candidates.filter(c => c.state === "ready").length,
    failures: candidates.filter(c => c.state !== "ready").map(c => ({ url: c.sourceUrl, error: c.error ?? c.state })),
    uniqueContents: unique.size,
    duplicateContents: candidates.filter(c => c.state === "ready").length - unique.size,
    proposedObjects: unique.size * 5,
    proposedStorageBytes: [...unique.values()].reduce((n,c) => n + Object.values(c.sizes ?? {}).reduce((a,b) => a+b,0),0),
    externalBytesCached: candidates.reduce((n,c) => n + (c.image?.byteSize ?? 0),0),
  };
}
function html(value: string) { return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!); }
export function imageReviewHtml(articles: readonly HistoricalImageArticle[], candidates: readonly HistoricalImageCandidate[]) {
  return `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Revisão de imagens Jornada.pt</title>
<style>body{font:16px system-ui;margin:24px;background:#f5f5f3;color:#202520}header{position:sticky;top:0;background:#fff;padding:16px;border-bottom:2px solid #172}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:18px}article{background:white;padding:16px}img{width:100%;height:220px;object-fit:contain;background:#eee}a{overflow-wrap:anywhere}select,input,button{font:inherit;padding:8px;max-width:100%}code{overflow-wrap:anywhere;font-size:11px}</style>
<header><h1>Rever cópias congeladas</h1><p>Nenhuma imagem foi aprovada automaticamente. Reveja a cópia e exporte as decisões. Exportar não altera a produção.</p><label>Revisor <input id="reviewer" required></label> <button id="export">Exportar decisões JSON</button> <label>Filtrar título/domínio <input id="filter" type="search"></label></header><main>
${articles.map(a => {
    const c = candidates.find(c => c.sourceUrl === a.image_url);
    const image = c?.image;
    return `<article data-id="${html(a.id)}" data-source="${html(a.image_url)}" data-sha="${html(image?.sha256 ?? "")}">
${c?.files?.["640"] ? `<img loading="lazy" src="${html(c.files["640"])}" alt="Cópia congelada">` : '<p>Imagem indisponível</p>'}
${c?.files?.original ? `<p><a target="_blank" href="${html(c.files.original)}">Ver original congelado</a></p>` : ''}
<h2>${html(a.title)}</h2><p>${html(a.slug)}</p><b>${html(sourceHost(a.image_url))}</b><p>${/^https?:\/\//i.test(a.image_url) ? `<a target="_blank" rel="noreferrer" href="${html(a.image_url)}">${html(a.image_url)}</a>` : html(a.image_url)}</p>
<p>Estado: ${html(c?.state === "ready" ? "Por rever" : c?.error ?? "Por obter")}</p><code>${html(image?.sha256 ?? "")}</code>
<p><select aria-label="Decisão de revisão" ${c?.state !== "ready" ? "disabled" : ""}><option value="uncertain">Por rever / duvidosa</option><option value="approved">Aprovada visualmente</option><option value="rejected">Contaminada / recusada</option></select></p></article>`;
  }).join("\n")}</main><script>
document.getElementById('export').onclick=()=>{const reviewer=document.getElementById('reviewer').value.trim();if(!reviewer){alert('Identifique o revisor.');return;}
const reviews=[...document.querySelectorAll('article')].map(a=>({articleId:a.dataset.id,sourceUrl:a.dataset.source,sha256:a.dataset.sha,decision:a.querySelector('select').value,reviewer}));
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(reviews,null,2)],{type:'application/json'}));a.download='image-reviews.json';a.click();URL.revokeObjectURL(a.href);};
document.getElementById('filter').oninput=e=>{const term=e.target.value.toLowerCase();for(const a of document.querySelectorAll('article'))a.hidden=!a.innerText.toLowerCase().includes(term);};
</script></html>`;
}
