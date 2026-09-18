import "../../app/globals.css";
/** Actual selection components. Only the Next router and HTTP transport are test boundaries. */
import { createRoot, type Root } from 'react-dom/client';
import { MesaSelectionProvider, MesaSelectionTray } from '../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client';
import { ThemeContinuityClient } from '../../app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/_theme-continuity-client';
import type { MesaThemeCard } from '../../lib/redacao-automatica/newsroom-mesa-organization-internal';

declare global {
  interface Window {
    __mount: (fixture: {theme:string; themes:MesaThemeCard[]}, mode?:string) => void;
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
    : <MesaSelectionProvider themes={fixture.themes}><MesaSelectionTray sourceThemeActions/></MesaSelectionProvider>);
};
