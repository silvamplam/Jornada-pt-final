/** Opt-in handlers share the existing protected admin preparation route. */
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { mesaIntentService } from './newsroom-mesa-production-intents-service';
import { isMesaIntentUuid, mesaIntentThemeView } from './newsroom-mesa-production-intents-ui';
import { parseMesaProductionIntent } from './newsroom-mesa-production-intents';
const options=(status=200)=>({status,headers:{'Cache-Control':'private, no-store'}});
const error=(message:string,code='intent_invalid',status=400,contextKey:string|null=null)=>NextResponse.json({ok:false,code,message,contextKey},options(status));
function failure(e:unknown) {
  const detail=e instanceof Error?e.message:'';
  const cases:readonly [RegExp,string][]=[
    [/nothing-to-review/,'O Tema já não tem artigos publicados para rever. Relê o Tema e confirma o modo.'],
    [/source-unusable|source-unavailable/,'Há uma fonte sem captura guardada utilizável. Deixa esse contexto para depois ou resolve a captura.'],
    [/classification/,'Há fontes por classificar. Classifica-as ou deixa esse contexto para depois.'],
    [/theme-unavailable/,'Um Tema deixou de estar disponível. A seleção foi preservada; podes deixá-lo para depois.'],
    [/limit|too-many/,'A seleção ultrapassa os limites da Produção. Nenhum histórico ou fonte foi truncado.'],
    [/stale/,'O material ou os publicados mudaram antes da gravação. Relê os Temas e confirma as escolhas; nada foi preparado.'],
    [/conflict/,'Esta tentativa não corresponde à preparação guardada. A seleção foi preservada.'],
  ];
  const match=cases.find(([pattern])=>pattern.test(detail));
  return error(match?.[1]??'Não foi possível preparar a Produção. A seleção e a tentativa foram preservadas para repetir.',/stale/.test(detail)?'intent_stale':match?'intent_conflict':'intent_unavailable',match?409:503);
}
export async function readMesaIntentThemeHttp(request:Request) {
  const themeId=new URL(request.url).searchParams.get('themeId');
  if(!isMesaIntentUuid(themeId))return error('O Tema indicado não é válido.');
  try {
    // No preparation/write: this obtains all published targets, also null-jornada
    // articles that the old single-context continuity reader cannot represent.
    const [preview,receipts]=await Promise.all([
      mesaIntentService.preview({version:1,preparationKey:randomUUID(),title:'Leitura do Tema',themes:[{themeId,action:'prepare',reviewPublished:false,newArticleCount:1}],sources:[]}),
      mesaIntentService.readReceipts(themeId),
    ]);
    return NextResponse.json({ok:true,theme:mesaIntentThemeView(preview.contexts[0],receipts)},options());
  }catch(e){return failure(e);}
}
export async function prepareMesaIntentsHttp(payload:Record<string,unknown>) {
  const parsed=parseMesaProductionIntent(payload.productionIntents);
  if(!parsed.ok)return NextResponse.json({ok:false,...parsed.issues[0],issues:parsed.issues},options(400));
  try {
    if(payload.action==='preview_intents') {
      const plan=await mesaIntentService.preview(parsed.value),expected=payload.expectedPublishedArticleIds;
      if(!expected||typeof expected!=='object'||Array.isArray(expected))return error('Falta confirmar os publicados selecionados.');
      for(const context of plan.contexts.filter(c=>c.themeId)) {
        const ids=(expected as Record<string,unknown>)[context.themeId!],actual=context.publishedArticles.map(a=>a.editorialArticleId);
        if(!Array.isArray(ids)||ids.length!==actual.length||new Set(ids).size!==ids.length||!ids.every(id=>typeof id==='string'&&actual.includes(id)))
          return error(`Os publicados de «${context.title}» mudaram. Relê o Tema e confirma o trabalho.`,'intent_stale',409,context.key);
      }
      return NextResponse.json({ok:true,authorityFingerprint:plan.authorityFingerprint,totals:plan.totals},options());
    }
    if(payload.action!=='prepare_intents'||typeof payload.authorityFingerprint!=='string'||!/^[0-9a-f]{64}$/.test(payload.authorityFingerprint))return error('A tentativa de preparação não é válida.');
    const result=await mesaIntentService.prepare(parsed.value,payload.authorityFingerprint);
    return NextResponse.json({ok:true,dossierId:result.dossierId,preparationAction:result.preparationAction,
      workspaceUrl:`/admin/editorial/redacao-automatica/mesa/producao/${result.dossierId}`,totals:result.plan.totals},options(result.preparationAction==='created'?201:200));
  }catch(e){return failure(e);}
}
