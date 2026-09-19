/** Browser choices are presentation only; the SQL preview remains authoritative. */
import { compareMesaArticleSourceCapture, parseMesaProductionIntent, type MesaArticleCaptureReceipt,
  type MesaProductionIntent, type MesaIntentIssue, type MesaIntentContext } from './newsroom-mesa-production-intents';

export type MesaIntentThemeView = Readonly<{
  themeId: string; title: string; sourceCount: number;
  articles: readonly Readonly<{ id: string; title: string; capturedAt: string | null;
    decision: 'UPDATE' | 'SEM_ALTERAÇÃO' | 'NEW' | null;
    unknown: number; newSources: number; updatedSources: number; unchangedSources: number; }>[];
}>;
export type MesaThemeChoice = Readonly<{mode:'review'|'review-new'|'new'|'defer'; newCount:number}>;
export type MesaSourceChoice = Readonly<{destination:'independent'|'theme'|'defer';themeId:string;newCount:number}>;
export type MesaSelectionChoice = Readonly<{sourceIds:readonly string[];themeIds:readonly string[];reviewArticleIds:readonly string[];newCount:number}>;
export type MesaIntentChoices = Readonly<{
  themes:Readonly<Record<string,MesaThemeChoice>>;
  sources:Readonly<Record<string,MesaSourceChoice>>;
  selection:MesaSelectionChoice|null;
}>;
export type MesaIntentUiSelection = Readonly<{
  themes:readonly Readonly<{themeId:string;title:string}>[];
  sources:readonly Readonly<{newsroomArticleId:string;title:string}>[];
}>;
export type MesaIntentSelectionView = Readonly<{
  sourceIds:readonly string[];themeIds:readonly string[];
  articles:readonly Readonly<{id:string;title:string}>[];
}>;
export const EMPTY_MESA_INTENT_CHOICES: MesaIntentChoices = {themes:{},sources:{},selection:null};
const obj=(v:unknown):Record<string,unknown>|null=>v!==null && typeof v==='object' && !Array.isArray(v)?v as Record<string,unknown>:null;
export const isMesaIntentUuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const count=(v:unknown):v is number=>Number.isSafeInteger(v) && Number(v)>=0 && Number(v)<=30;

export function mesaIntentThemeView(context:MesaIntentContext, receipts:readonly MesaArticleCaptureReceipt[]):MesaIntentThemeView {
  if (!context.themeId) throw new Error('mesa-intent-theme-required');
  const themeId=context.themeId;
  return {themeId,title:context.title,sourceCount:context.sources.length,articles:context.publishedArticles.map(article=>{
    const changes=compareMesaArticleSourceCapture(themeId,article.editorialArticleId,context.sources,receipts);
    const history=receipts.filter(r=>r.themeId===themeId && r.articleId===article.editorialArticleId).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt));
    const latest=history[0];
    const ambiguous=changes.some(s=>s.change==='UNKNOWN') || new Set(history.filter(r=>r.capturedAt===latest?.capturedAt).map(r=>r.decision)).size>1;
    return {id:article.editorialArticleId,title:article.title,capturedAt:!latest||ambiguous?null:latest.capturedAt,
      decision:!latest||ambiguous?null:latest.decision,unknown:changes.filter(s=>s.change==='UNKNOWN').length,
      newSources:changes.filter(s=>s.change==='NEW_SOURCE').length,updatedSources:changes.filter(s=>s.change==='UPDATED_SOURCE').length,
      unchangedSources:changes.filter(s=>s.change==='UNCHANGED_SOURCE').length};
  })};
}
export function parseMesaIntentThemeView(value:unknown):MesaIntentThemeView|null {
  const v=obj(value);
  if (!v || !isMesaIntentUuid(v.themeId) || typeof v.title!=='string' || !v.title.trim() || !count(v.sourceCount) || !Array.isArray(v.articles) || v.articles.length>30) return null;
  const seen=new Set<string>();
  for (const item of v.articles) {
    const a=obj(item);
    if (!a || !isMesaIntentUuid(a.id) || seen.has(a.id) || typeof a.title!=='string'
      || !(a.decision===null || ['UPDATE','SEM_ALTERAÇÃO','NEW'].includes(String(a.decision)))
      || !(a.capturedAt===null || typeof a.capturedAt==='string' && Number.isFinite(Date.parse(a.capturedAt)))
      || ![a.unknown,a.newSources,a.updatedSources,a.unchangedSources].every(count)
      || Number(a.unknown)+Number(a.newSources)+Number(a.updatedSources)+Number(a.unchangedSources)!==v.sourceCount) return null;
    seen.add(a.id);
  }
  return value as MesaIntentThemeView;
}
/** Missing or corrupted saved source choices never imply an independent NEW. */
export function parseMesaIntentChoices(value:unknown):MesaIntentChoices {
  const v=obj(value),themes=obj(v?.themes),sources=obj(v?.sources);
  if (!themes || !sources || Object.keys(themes).length>20 || Object.keys(sources).length>200) return EMPTY_MESA_INTENT_CHOICES;
  const result:{themes:Record<string,MesaThemeChoice>;sources:Record<string,MesaSourceChoice>;selection:MesaSelectionChoice|null}={themes:{},sources:{},selection:null};
  for(const [id,item] of Object.entries(themes)) {
    const c=obj(item);
    if(isMesaIntentUuid(id) && c && ['review','review-new','new','defer'].includes(String(c.mode)) && count(c.newCount)) result.themes[id]={mode:c.mode as MesaThemeChoice['mode'],newCount:c.newCount};
  }
  for(const [id,item] of Object.entries(sources)) {
    const c=obj(item);
    if(isMesaIntentUuid(id) && c && ['independent','theme','defer'].includes(String(c.destination)) && count(c.newCount)
      && typeof c.themeId==='string' && (!c.themeId || isMesaIntentUuid(c.themeId))) result.sources[id]={destination:c.destination as MesaSourceChoice['destination'],themeId:c.themeId,newCount:c.newCount};
  }
  const sc=obj(v?.selection);
  if(sc && Array.isArray(sc.sourceIds) && sc.sourceIds.length<=20
    && sc.sourceIds.every(isMesaIntentUuid) && new Set(sc.sourceIds).size===sc.sourceIds.length
    && Array.isArray(sc.themeIds) && sc.themeIds.length<=20 && sc.themeIds.every(isMesaIntentUuid)
    && new Set(sc.themeIds).size===sc.themeIds.length && sc.sourceIds.length+sc.themeIds.length>=1
    && Array.isArray(sc.reviewArticleIds) && sc.reviewArticleIds.length<=30
    && sc.reviewArticleIds.every(isMesaIntentUuid) && new Set(sc.reviewArticleIds).size===sc.reviewArticleIds.length
    && count(sc.newCount)) {
    result.selection={sourceIds:[...sc.sourceIds].sort(),themeIds:[...sc.themeIds].sort(),
      reviewArticleIds:[...sc.reviewArticleIds].sort(),newCount:sc.newCount};
  }
  return result;
}
export function parseMesaIntentSelectionView(value:unknown):MesaIntentSelectionView|null {
  const v=obj(value);
  if(!v||!Array.isArray(v.sourceIds)||v.sourceIds.length>20||!v.sourceIds.every(isMesaIntentUuid)
    ||new Set(v.sourceIds).size!==v.sourceIds.length||!Array.isArray(v.themeIds)||v.themeIds.length>20||!v.themeIds.every(isMesaIntentUuid)
    ||new Set(v.themeIds).size!==v.themeIds.length||v.sourceIds.length+v.themeIds.length<1
    ||!Array.isArray(v.articles)||v.articles.length>200)return null;
  const seen=new Set<string>();
  for(const raw of v.articles){const a=obj(raw);if(!a||!isMesaIntentUuid(a.id)||seen.has(a.id)||typeof a.title!=='string'||!a.title.trim())return null;seen.add(a.id);}
  return {sourceIds:[...v.sourceIds].sort(),themeIds:[...v.themeIds].sort(),
    articles:(v.articles as {id:string;title:string}[]).map(a=>({id:a.id,title:a.title.trim()})).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function buildMesaIntentUiRequest(selection:MesaIntentUiSelection, choices:MesaIntentChoices,
  views:Readonly<Record<string,MesaIntentThemeView>>,title:string,preparationKey:string,
  selectionView:MesaIntentSelectionView|null=null,combineSelectedMaterial=false
):{ok:true;request:MesaProductionIntent;reviews:number;newArticles:number}|{ok:false;issues:readonly MesaIntentIssue[]} {
  const issues:MesaIntentIssue[]=[],themes:MesaProductionIntent['themes'][number][]=[],sources:MesaProductionIntent['sources'][number][]=[];
  let reviews=0,newArticles=0;
  const fail=(contextKey:string|null,message:string)=>issues.push({code:'intent_choice_required',contextKey,message});
  if(combineSelectedMaterial){
    const sourceIds=selection.sources.map(s=>s.newsroomArticleId).sort(),themeIds=selection.themes.map(t=>t.themeId).sort();
    const key=`selection:${preparationKey}`,choice=choices.selection;
    if(!selectionView||JSON.stringify(selectionView.sourceIds)!==JSON.stringify(sourceIds)
      ||JSON.stringify(selectionView.themeIds)!==JSON.stringify(themeIds)) fail(key,'Não foi possível confirmar os artigos Jornada relacionados com a seleção completa.');
    else if(!choice||JSON.stringify(choice.sourceIds)!==JSON.stringify(sourceIds)
      ||JSON.stringify(choice.themeIds)!==JSON.stringify(themeIds)) fail(key,'Confirma o trabalho pretendido para o material selecionado.');
    else{
      const candidateIds=selectionView.articles.map(a=>a.id).sort(),candidateSet=new Set(candidateIds);
      if(choice.reviewArticleIds.some(id=>!candidateSet.has(id))) fail(key,'Um artigo escolhido para revisão deixou de corresponder à seleção.');
      else if(!count(choice.newCount)||choice.reviewArticleIds.length+choice.newCount<1) fail(key,'Escolhe pelo menos um artigo publicado para rever ou indica artigos novos.');
      else{
        if(!title.trim()) fail(null,'Indica um título de trabalho para a Produção.');
        if(choice.reviewArticleIds.length+choice.newCount>30) fail(null,'A Produção ultrapassa 30 resultados. Reduz os novos ou as revisões.');
        if(issues.length)return {ok:false as const,issues};
        const parsed=parseMesaProductionIntent({version:1,preparationKey,title,themes:[],sources:[],selection:{
          sourceIds,themeIds,candidateArticleIds:candidateIds,reviewArticleIds:[...choice.reviewArticleIds].sort(),newArticleCount:choice.newCount,
        }});
        return parsed.ok?{ok:true as const,request:parsed.value,reviews:choice.reviewArticleIds.length,newArticles:choice.newCount}:parsed;
      }
    }
    if(!title.trim())fail(null,'Indica um título de trabalho para a Produção.');
    return {ok:false as const,issues};
  }
  for(const theme of selection.themes) {
    const c=choices.themes[theme.themeId],v=views[theme.themeId],key=`theme:${theme.themeId}`;
    if(c?.mode==='defer') {themes.push({themeId:theme.themeId,action:'defer'});continue;}
    if(!v || !c) {fail(key,'Não foi possível confirmar os publicados deste Tema. Relê o Tema ou deixa-o para depois.');continue;}
    const review=c.mode==='review'||c.mode==='review-new',fresh=c.mode==='review'?0:c.newCount;
    if(review && !v.articles.length) {fail(key,'Este Tema não tem artigos Jornada publicados para rever. Escolhe apenas novos.');continue;}
    if(!count(fresh)||c.mode!=='review' && fresh<1) {fail(key,'Indica entre 1 e 30 artigos novos, ou deixa o Tema para depois.');continue;}
    themes.push({themeId:theme.themeId,action:'prepare',reviewPublished:review,newArticleCount:fresh});reviews+=review?v.articles.length:0;newArticles+=fresh;
  }
  let selectionIntent:MesaProductionIntent['selection'];
  if(selection.sources.length){
    const ids=selection.sources.map(s=>s.newsroomArticleId).sort(),key=`selection:${preparationKey}`,c=choices.selection;
    if(!selectionView||JSON.stringify(selectionView.sourceIds)!==JSON.stringify(ids)) fail(key,'Não foi possível confirmar os artigos Jornada relacionados com esta seleção.');
    else if(!c||JSON.stringify(c.sourceIds)!==JSON.stringify(ids)) fail(key,'Confirma o trabalho pretendido para o conjunto de fontes selecionadas.');
    else{
      const candidates=new Set(selectionView.articles.map(a=>a.id));
      if(c.reviewArticleIds.some(id=>!candidates.has(id))) fail(key,'Um artigo escolhido para revisão deixou de corresponder à seleção.');
      else if(!count(c.newCount)||c.reviewArticleIds.length+c.newCount<1) fail(key,'Escolhe pelo menos um artigo publicado para rever ou indica artigos novos.');
      else{
        selectionIntent={sourceIds:ids,reviewArticleIds:[...c.reviewArticleIds].sort(),newArticleCount:c.newCount};
        reviews+=c.reviewArticleIds.length;newArticles+=c.newCount;
      }
    }
  }
  if(!title.trim()) fail(null,'Indica um título de trabalho para a Produção.');
  if(!issues.length && reviews+newArticles===0) fail(null,'Tudo ficou para depois. Não foi pedido trabalho para esta Produção.');
  if(reviews+newArticles>30) fail(null,'A Produção ultrapassa 30 resultados. Reduz os novos ou deixa um contexto para depois; nada será truncado.');
  if(issues.length)return {ok:false,issues};
  const result=parseMesaProductionIntent({version:1,preparationKey,title,themes,sources,...(selectionIntent?{selection:selectionIntent}:{})});
  return result.ok?{ok:true,request:result.value,reviews,newArticles}:result;
}
