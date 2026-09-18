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
export type MesaIntentChoices = Readonly<{themes:Readonly<Record<string,MesaThemeChoice>>;sources:Readonly<Record<string,MesaSourceChoice>>}>;
export type MesaIntentUiSelection = Readonly<{
  themes:readonly Readonly<{themeId:string;title:string}>[];
  sources:readonly Readonly<{newsroomArticleId:string;title:string}>[];
}>;
export const EMPTY_MESA_INTENT_CHOICES: MesaIntentChoices = {themes:{},sources:{}};
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
  const result:{themes:Record<string,MesaThemeChoice>;sources:Record<string,MesaSourceChoice>}={themes:{},sources:{}};
  for(const [id,item] of Object.entries(themes)) {
    const c=obj(item);
    if(isMesaIntentUuid(id) && c && ['review','review-new','new','defer'].includes(String(c.mode)) && count(c.newCount)) result.themes[id]={mode:c.mode as MesaThemeChoice['mode'],newCount:c.newCount};
  }
  for(const [id,item] of Object.entries(sources)) {
    const c=obj(item);
    if(isMesaIntentUuid(id) && c && ['independent','theme','defer'].includes(String(c.destination)) && count(c.newCount)
      && typeof c.themeId==='string' && (!c.themeId || isMesaIntentUuid(c.themeId))) result.sources[id]={destination:c.destination as MesaSourceChoice['destination'],themeId:c.themeId,newCount:c.newCount};
  }
  return result;
}
export function buildMesaIntentUiRequest(selection:MesaIntentUiSelection, choices:MesaIntentChoices,
  views:Readonly<Record<string,MesaIntentThemeView>>,title:string,preparationKey:string
):{ok:true;request:MesaProductionIntent;reviews:number;newArticles:number}|{ok:false;issues:readonly MesaIntentIssue[]} {
  const issues:MesaIntentIssue[]=[],themes:MesaProductionIntent['themes'][number][]=[],sources:MesaProductionIntent['sources'][number][]=[];
  let reviews=0,newArticles=0;
  const fail=(contextKey:string|null,message:string)=>issues.push({code:'intent_choice_required',contextKey,message});
  for(const theme of selection.themes) {
    const c=choices.themes[theme.themeId],v=views[theme.themeId],key=`theme:${theme.themeId}`;
    if(c?.mode==='defer') {themes.push({themeId:theme.themeId,action:'defer'});continue;}
    if(!v || !c) {fail(key,'Não foi possível confirmar os publicados deste Tema. Relê o Tema ou deixa-o para depois.');continue;}
    const review=c.mode==='review'||c.mode==='review-new',fresh=c.mode==='review'?0:c.newCount;
    if(review && !v.articles.length) {fail(key,'Este Tema não tem artigos Jornada publicados para rever. Escolhe apenas novos.');continue;}
    if(!count(fresh)||c.mode!=='review' && fresh<1) {fail(key,'Indica entre 1 e 30 artigos novos, ou deixa o Tema para depois.');continue;}
    themes.push({themeId:theme.themeId,action:'prepare',reviewPublished:review,newArticleCount:fresh});reviews+=review?v.articles.length:0;newArticles+=fresh;
  }
  for(const source of selection.sources) {
    const c=choices.sources[source.newsroomArticleId],key=`source:${source.newsroomArticleId}`;
    if(!c) {fail(key,'Escolhe o destino desta fonte: Tema, trabalho independente ou deixar para depois.');continue;}
    if(c.destination==='defer') sources.push({sourceId:source.newsroomArticleId,destination:'defer'});
    else if(c.destination==='theme') {
      if(!themes.some(t=>t.themeId===c.themeId&&t.action==='prepare')) fail(key,'Escolhe um Tema ativo nesta preparação, ou deixa a fonte para depois.');
      else sources.push({sourceId:source.newsroomArticleId,destination:'theme',themeId:c.themeId});
    } else if(!count(c.newCount)||c.newCount<1) fail(key,'Indica entre 1 e 30 novos para o trabalho independente.');
    else {sources.push({sourceId:source.newsroomArticleId,destination:'independent',newArticleCount:c.newCount});newArticles+=c.newCount;}
  }
  if(!title.trim()) fail(null,'Indica um título de trabalho para a Produção.');
  if(!issues.length && reviews+newArticles===0) fail(null,'Tudo ficou para depois. Não foi pedido trabalho para esta Produção.');
  if(reviews+newArticles>30) fail(null,'A Produção ultrapassa 30 resultados. Reduz os novos ou deixa um contexto para depois; nada será truncado.');
  if(issues.length)return {ok:false,issues};
  const result=parseMesaProductionIntent({version:1,preparationKey,title,themes,sources});
  return result.ok?{ok:true,request:result.value,reviews,newArticles}:result;
}
