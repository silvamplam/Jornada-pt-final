import "../../app/globals.css";
import styles from "../../app/admin/editorial/redacao-automatica/mesa/mesa.module.css";
/** Actual selection components. Only the Next router and HTTP transport are test boundaries. */
import { createRoot, type Root } from 'react-dom/client';
import { MesaPublishedArticleSelection, MesaSelectionProvider, MesaSelectionTray } from '../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client';
import { ThemeContinuityClient } from '../../app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/_theme-continuity-client';
import { NewOutputGroupingPlanner } from '../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_new-output-grouping';
import type { MesaMaterialSelection } from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
import type { MesaThemeCard } from '../../lib/redacao-automatica/newsroom-mesa-organization-internal';
import type { MesaNewOutputGrouping } from '../../lib/redacao-automatica/newsroom-mesa-new-output-groups';

declare global {
  interface Window {
    __mount: (fixture: {theme:string; themes:MesaThemeCard[];publishedChoices?:{material:MesaMaterialSelection;articles:{id:string;title:string}[]}}, mode?:string) => void;
    __mountGrouping: (grouping: MesaNewOutputGrouping) => void;
    __unmount: () => void;
    __navigations: string[];
    __http: (request: {url:string;method:string;body:string|null}) => Promise<{status:number;body:unknown;transportFailure?:boolean}>;
  }
}
let root:Root|null=null;
window.__navigations=[];
window.fetch=async(input,init)=>{
  const result=await window.__http({url:String(input),method:init?.method??'GET',body:init?.body?String(init.body):null});
  if(result.transportFailure)throw new TypeError('Resposta perdida depois da preparação — ensaio');
  return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});
};
window.__unmount=()=>{root?.unmount();root=null;};
window.__mount=(fixture,mode='selection')=>{
  window.__unmount();window.__navigations=[];
  root=createRoot(document.getElementById('root')!);
  root.render(mode==='theme'
    ? <ThemeContinuityClient themeId={fixture.theme} themeTitle="Milan / Amorim" disabled={false} autoOpen/>
    : <MesaSelectionProvider themes={fixture.themes}><section className={styles.sourceContributions} aria-label="Artigos publicados disponíveis">{fixture.publishedChoices?.articles.map(article=><div className={styles.sourceContribution} key={article.id}>
        <MesaPublishedArticleSelection material={fixture.publishedChoices!.material} articleId={article.id} title={article.title}/>
        <a href={'/admin/editorial/artigos/'+article.id+'/editar'}>{article.title}</a>
      </div>)}</section><MesaSelectionTray sourceThemeActions/></MesaSelectionProvider>);
};
window.__mountGrouping=(grouping)=>{
  window.__unmount();
  root=createRoot(document.getElementById('root')!);
  root.render(<NewOutputGroupingPlanner initialGrouping={grouping}/>);
};
