'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {buildMesaIntentUiRequest,parseMesaIntentChoices,parseMesaIntentThemeView,isMesaIntentUuid,
  EMPTY_MESA_INTENT_CHOICES,type MesaIntentChoices,type MesaIntentThemeView,type MesaIntentUiSelection,
  type MesaThemeChoice,type MesaSourceChoice} from '@/lib/redacao-automatica/newsroom-mesa-production-intents-ui';
import type {MesaIntentIssue,MesaProductionIntent} from '@/lib/redacao-automatica/newsroom-mesa-production-intents';
import styles from './mesa.module.css';
const ROUTE='/api/admin/editorial/redacao-automatica/mesa/preparar';
const quantity=(n:number,singular:string,plural:string)=>`${n} ${n===1?singular:plural}`;
const CHECK_KEY='f0000000-0000-4000-8000-000000000001';
type Attempt={signature:string;preparationKey:string;authorityFingerprint:string|null};
type Reply={ok?:boolean;code?:string;message?:string;contextKey?:string|null;authorityFingerprint?:string;workspaceUrl?:string};
export function MesaIntentArticleReceipts({view}:Readonly<{view:MesaIntentThemeView}>) {
  if(!view.articles.length)return <p>Ainda não há artigos Jornada publicados neste Tema. Rascunhos e produções preparadas não contam.</p>;
  return <details className={styles.selectionDetails}><summary>Artigos Jornada e continuidade ({view.articles.length})</summary>
    <ul>{view.articles.map(a=><li key={a.id}><span><strong>{a.title}</strong>
      <small>{a.decision===null?'Não revisto — sem referência de revisão verificável.':a.decision==='NEW'?'Publicação inicial — não é uma revisão dos artigos anteriores.':a.decision==='UPDATE'?'Revisão concluída: UPDATE.':'Revisão concluída: SEM ALTERAÇÃO.'}</small>
      <small>{a.unknown>0?`${a.unknown} fontes sem comparação de revisão conhecida.`:`${a.newSources} fontes novas · ${a.updatedSources} capturas alteradas · ${a.unchangedSources} capturas coincidentes com o recibo.`}</small>
      {a.capturedAt?<small>Captura de referência: <time dateTime={a.capturedAt}>{new Date(a.capturedAt).toLocaleString('pt-PT')}</time></small>:null}
    </span></li>)}</ul></details>;
}
export function MesaIntentPreparationClient({selection,title,storageKey,fixtureMode=false,disabled=false,onPrepared,onBusyChange}:Readonly<{
  selection:MesaIntentUiSelection;title:string;storageKey:string;fixtureMode?:boolean;disabled?:boolean;
  onPrepared?:(request:MesaProductionIntent,url:string)=>void;onBusyChange?:(busy:boolean)=>void;
}>) {
  const router=useRouter();
  const [choices,setChoices]=useState<MesaIntentChoices>(EMPTY_MESA_INTENT_CHOICES),[views,setViews]=useState<Record<string,MesaIntentThemeView>>({});
  const [loadErrors,setLoadErrors]=useState<Record<string,string>>({}),[issues,setIssues]=useState<readonly MesaIntentIssue[]>([]);
  const [message,setMessage]=useState(''),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  const attempt=useRef<Attempt|null>(null),locked=useRef(false),savedChoices=useRef(choices),selectionRef=useRef(selection),busyRef=useRef(onBusyChange);
  selectionRef.current=selection;busyRef.current=onBusyChange;
  const key=`${storageKey}.intents.v1`,themeIds=selection.themes.map(t=>t.themeId).sort().join(',');
  function save(c:MesaIntentChoices,a:Attempt|null=attempt.current) {
    savedChoices.current=c;
    const themes=Object.fromEntries(Object.entries(c.themes).filter(([id])=>selectionRef.current.themes.some(t=>t.themeId===id)));
    const sources=Object.fromEntries(Object.entries(c.sources).filter(([id])=>selectionRef.current.sources.some(s=>s.newsroomArticleId===id)));
    try{sessionStorage.setItem(key,JSON.stringify({version:1,choices:{themes,sources},attempt:a}));}
    catch{setMessage('As escolhas estão apenas nesta janela: o armazenamento local está indisponível.');}
  }
  useEffect(()=>{
    try{
      const stored=JSON.parse(sessionStorage.getItem(key)||'null'),next=parseMesaIntentChoices(stored?.choices),a=stored?.attempt;
      setChoices(next);savedChoices.current=next;
      attempt.current=a&&typeof a.signature==='string'&&a.signature.length<100000&&isMesaIntentUuid(a.preparationKey)
        &&(a.authorityFingerprint===null||/^[0-9a-f]{64}$/.test(a.authorityFingerprint))?a:null;
    }catch{attempt.current=null;}
    setLoaded(true);
  },[key]);
  useEffect(()=>{
    if(!loaded||fixtureMode)return;
    const controller=new AbortController();
    for(const themeId of themeIds.split(',').filter(Boolean))void(async()=>{
      try{
        const response=await fetch(`${ROUTE}?themeId=${encodeURIComponent(themeId)}`,{cache:'no-store',signal:controller.signal});
        const reply=await response.json(),view=parseMesaIntentThemeView(reply?.theme);
        if(!response.ok||!reply?.ok||!view||view.themeId!==themeId)throw new Error(reply?.message||'Não foi possível ler os publicados e os recibos deste Tema.');
        if(controller.signal.aborted)return;
        setViews(v=>({...v,[themeId]:view}));setLoadErrors(v=>{const next={...v};delete next[themeId];return next;});
        setChoices(c=>c.themes[themeId]?c:{...c,themes:{...c.themes,[themeId]:{mode:view.articles.length?'review':'new',newCount:1}}});
      }catch(e){if(!controller.signal.aborted)setLoadErrors(v=>({...v,[themeId]:e instanceof Error?e.message:'Leitura indisponível.'}));}
    })();
    return ()=>controller.abort();
  },[themeIds,loaded,fixtureMode,refresh]);
  useEffect(()=>{if(loaded)save(choices);},[choices,loaded,key]);
  function chooseTheme(id:string,patch:Partial<MesaThemeChoice>){setChoices(c=>({...c,themes:{...c.themes,[id]:{...(c.themes[id]??{mode:'new',newCount:1}),...patch}}}));setIssues([]);setMessage('');}
  function chooseSource(id:string,patch:Partial<MesaSourceChoice>){setChoices(c=>({...c,sources:{...c.sources,[id]:{...(c.sources[id]??{destination:'defer',themeId:'',newCount:1}),...patch}}}));setIssues([]);setMessage('');}
  const validViews=Object.fromEntries(Object.entries(views).filter(([id])=>!loadErrors[id]));
  const built=buildMesaIntentUiRequest(selection,choices,validViews,title,CHECK_KEY);
  const errors=(contextKey:string)=>issues.filter(i=>i.contextKey===contextKey).map((i,n)=><p key={n} role="alert" className={styles.continuityError}>{i.message}</p>);
  async function post(body:Record<string,unknown>){
    const response=await fetch(ROUTE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mesaVersion:4,...body})});
    const reply=await response.json().catch(()=>null) as Reply|null;
    if(!response.ok||!reply?.ok){
      if(reply?.contextKey)setIssues([{code:reply.code||'prepare_failed',contextKey:reply.contextKey,message:reply.message||'Preparação não concluída.'}]);
      if(reply?.code==='intent_stale'){attempt.current=null;save(savedChoices.current,null);setViews({});setRefresh(n=>n+1);}
      throw new Error(reply?.message||'A resposta não confirmou a preparação. Repete com as mesmas escolhas; não será duplicada.');
    }return reply;
  }
  async function prepare(event:FormEvent){
    event.preventDefault();if(locked.current||disabled||!loaded)return;
    if(!built.ok){setIssues(built.issues);return;}
    if(fixtureMode){setMessage('Fixture visual: nenhuma produção foi enviada.');return;}
    const signature=JSON.stringify({...built.request,preparationKey:undefined});
    if(attempt.current?.signature!==signature)attempt.current={signature,preparationKey:crypto.randomUUID(),authorityFingerprint:null};
    const active=attempt.current,request={...built.request,preparationKey:active.preparationKey};
    save(choices,active);locked.current=true;setBusy(true);busyRef.current?.(true);setIssues([]);setMessage('A preparar a Produção…');
    try{
      if(!active.authorityFingerprint){
        const expectedPublishedArticleIds=Object.fromEntries(request.themes.filter(t=>t.action==='prepare').map(t=>[t.themeId,validViews[t.themeId].articles.map(a=>a.id)]));
        const preview=await post({action:'preview_intents',productionIntents:request,expectedPublishedArticleIds});
        if(!preview.authorityFingerprint||!/^[0-9a-f]{64}$/.test(preview.authorityFingerprint))throw new Error('A leitura da preparação não devolveu uma referência válida.');
        active.authorityFingerprint=preview.authorityFingerprint;save(choices,active);
      }
      const result=await post({action:'prepare_intents',productionIntents:request,authorityFingerprint:active.authorityFingerprint});
      if(!result.workspaceUrl||!/^\/admin\/editorial\/redacao-automatica\/mesa\/producao\/[0-9a-f-]{36}$/.test(result.workspaceUrl))throw new Error('A preparação não devolveu um destino válido.');
      // Confirmed success ends the attempt; a later production is a new cycle.
      attempt.current=null;save(choices,null);setMessage('Produção preparada. A abrir…');
      if(onPrepared)onPrepared(request,result.workspaceUrl);else router.push(result.workspaceUrl);
    }catch(e){setMessage(e instanceof Error?e.message:'Preparação não concluída. As escolhas foram preservadas.');}
    finally{locked.current=false;setBusy(false);busyRef.current?.(false);}
  }
  const blocked=disabled||busy||!loaded;
  return <form aria-label="Escolhas de Produção" className={styles.continuityBody} onSubmit={prepare}>
    <p>Escolhe o trabalho de cada contexto. A preparação usa as capturas mais recentes já guardadas; não volta a recolher os sites externos.</p>
    <div aria-label="Contextos desta Produção" style={{maxHeight:"min(42dvh, 420px)",overflowY:"auto"}}>
    {selection.themes.map(t=>{const view=views[t.themeId],c=choices.themes[t.themeId],published=Boolean(view?.articles.length),staleReview=!published&&(c?.mode==='review'||c?.mode==='review-new');return <section key={t.themeId} aria-label={`Produção do Tema ${t.title}`} className={styles.continuityPanel}>
      <h3>{t.title}</h3><div className={styles.continuityPrepare}>
        <label>Trabalho do Tema<select aria-label={`Trabalho do Tema ${t.title}`} value={staleReview?'':c?.mode||''} disabled={blocked} onChange={e=>chooseTheme(t.themeId,{mode:e.currentTarget.value as MesaThemeChoice['mode']})}>
          {!c||staleReview?<option value="" disabled>{view?'Escolhe o trabalho — não há publicados':'A confirmar publicados…'}</option>:null}
          {published?<><option value="review">Só revisão — zero novos</option><option value="review-new">Revisão e novos</option></>:null}
          <option value="new">Apenas novos</option><option value="defer">Deixar para depois</option></select></label>
        {c&&(c.mode==='new'||c.mode==='review-new')?<label>Novos artigos do Tema<input aria-label={`Novos artigos do Tema ${t.title}`} type="number" min={1} max={30} step={1} value={Number.isNaN(c.newCount)?'':c.newCount} disabled={blocked} onChange={e=>chooseTheme(t.themeId,{newCount:e.currentTarget.valueAsNumber})}/></label>:null}
        {view?<span>{quantity(view.articles.length,"artigo Jornada publicado","artigos Jornada publicados")} · {quantity(view.sourceCount,"fonte","fontes")}</span>:null}
      </div>
      {loadErrors[t.themeId]?<p role="alert" className={styles.continuityError}>{loadErrors[t.themeId]} <button type="button" disabled={blocked} onClick={()=>{setViews({});setRefresh(n=>n+1);}}>Reler Temas</button></p>:!view?<p role="status">A confirmar o histórico publicado…</p>:null}
      {c?.mode==='review'||c?.mode==='review-new'?<p>Todos os publicados deste Tema terminam em UPDATE ou SEM ALTERAÇÃO.</p>:c?.mode==='new'?<p>Os publicados ficam apenas como referência, sem tarefas UPDATE nem registos de revisão.</p>:c?.mode==='defer'?<p>Este Tema não entra nesta Produção.</p>:null}
      {view?<MesaIntentArticleReceipts view={view}/>:null}{errors(`theme:${t.themeId}`)}
    </section>;})}
    {selection.sources.map(s=>{const c=choices.sources[s.newsroomArticleId];return <section key={s.newsroomArticleId} aria-label={`Produção da fonte ${s.title}`} className={styles.continuityPanel}><h3>Fonte: {s.title}</h3>
      <div className={styles.continuityPrepare}><label>Destino desta fonte<select aria-label={`Destino da fonte ${s.title}`} value={!c?'':c.destination==='theme'?`theme:${c.themeId}`:c.destination} disabled={blocked} onChange={e=>{const v=e.currentTarget.value;chooseSource(s.newsroomArticleId,v.startsWith('theme:')?{destination:'theme',themeId:v.slice(6)}:{destination:v as 'independent'|'defer',themeId:''});}}>
        <option value="" disabled>Escolher destino</option><option value="independent">Trabalhar independentemente</option>
        {selection.themes.map(t=><option key={t.themeId} value={`theme:${t.themeId}`} disabled={choices.themes[t.themeId]?.mode==='defer'}>Incorporar no Tema: {t.title}</option>)}<option value="defer">Deixar para depois</option>
      </select></label>{c?.destination==='independent'?<label>Novos independentes<input aria-label={`Novos independentes de ${s.title}`} type="number" min={1} max={30} step={1} value={Number.isNaN(c.newCount)?'':c.newCount} disabled={blocked} onChange={e=>chooseSource(s.newsroomArticleId,{newCount:e.currentTarget.valueAsNumber})}/></label>:null}</div>
      {c?.destination==='theme'?<p>Esta fonte passa a pertencer ao Tema escolhido. Não acrescenta automaticamente um artigo novo.</p>:null}{errors(`source:${s.newsroomArticleId}`)}</section>;})}
    {issues.filter(i=>i.contextKey===null).map((i,n)=><p key={n} role="alert" className={styles.continuityError}>{i.message}</p>)}
    </div>
    <div className={styles.continuityPrepare}><p>{built.ok?`${quantity(built.reviews,"artigo Jornada a avaliar","artigos Jornada a avaliar")} · ${quantity(built.newArticles,"novo","novos")}. Fontes e histórico separados por contexto.`:'Completa as escolhas de cada contexto para preparar.'}</p>
      <button type="submit" className={styles.prepareButton} disabled={blocked}>{busy?'A preparar…':'PREPARAR PRODUÇÃO'}</button></div>
    {message?<p className={styles.selectionMessage} role="status">{message}</p>:null}
  </form>;
}
