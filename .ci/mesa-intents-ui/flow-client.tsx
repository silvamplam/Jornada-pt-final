/** Page trees come from the actual server page functions. Only Next transport is doubled. */
import "../../app/globals.css";
import "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/workspace.module.css";
import "../../app/admin/editorial/redacao-automatica/publicacao-lote/publicacao-lote.module.css";
import { createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MesaSelectionProvider, MesaSelectionTray } from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client";
import { ThemeContinuityClient } from "../../app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/_theme-continuity-client";
import { MesaProductionWorkspaceClient } from "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client";
import BatchPreflightClient from "../../app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient";
import type { MesaThemeCard } from "../../lib/redacao-automatica/newsroom-mesa-organization-internal";

type Tree = null | string | number | Tree[] | {tag?:string;component?:string;props:Record<string,unknown>;children:Tree};
type Fixture = {theme:string;themes:MesaThemeCard[]};
declare global { interface Window {
  __flowPage:(path:string)=>Promise<Tree>;
  __flowMount:(fixture:Fixture)=>void;
  __flowNavigate:(path:string)=>Promise<void>;
  __flowReady:string;
  __flowRequests:Array<{url:string;method:string;status:number}>;
  __flowFixture:Fixture;
} }
let root:Root|null=null;
function render(element:ReactNode){
  root ??= createRoot(document.getElementById("root")!);
  root.render(element);
}
function element(tree:Tree):ReactNode {
  if(tree===null||typeof tree==='string'||typeof tree==='number')return tree;
  if(Array.isArray(tree))return tree.map((node,i)=>createElement(Fragment,{key:i},element(node)));
  if(tree.component==='workspace')return createElement(MesaProductionWorkspaceClient,tree.props as unknown as Parameters<typeof MesaProductionWorkspaceClient>[0]);
  if(tree.component==='batch')return createElement(BatchPreflightClient,tree.props as unknown as Parameters<typeof BatchPreflightClient>[0]);
  return createElement(tree.tag!,tree.props,element(tree.children));
}
window.__flowRequests=[];window.__navigations=[];
window.fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';
  const requestBody=init?.body instanceof FormData
    ? JSON.stringify({format:'form',entries:[...init.body.entries()]})
    : init?.body?String(init.body):null;
  const result=await window.__http({url,method,body:requestBody}) as {status:number;body:unknown;text?:string;transportFailure?:boolean};
  window.__flowRequests.push({url,method,status:result.status});
  if(result.transportFailure)throw new TypeError('Resposta perdida — ensaio');
  return new Response(result.text??JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':result.text===undefined?'application/json':'text/plain'}});
};
window.__flowNavigate=async(path)=>{
  window.__navigations.push(path);window.__flowReady='loading';
  if(path.includes('/mesa/temas/')) {
    render(<ThemeContinuityClient themeId={path.split('/').pop()!} themeTitle="Milan / Amorim" disabled={false} autoOpen/>);
  }else render(element(await window.__flowPage(path)));
  window.__flowReady=path;
};
window.__flowMount=(fixture)=>{
  window.__flowFixture=fixture;window.__navigations=[];window.__flowReady='selection';
  render(<MesaSelectionProvider themes={fixture.themes}><MesaSelectionTray sourceThemeActions/></MesaSelectionProvider>);
};
document.addEventListener('click',(event)=>{
  const link=(event.target as Element)?.closest('a');const href=link?.getAttribute('href');
  if(href?.startsWith('/admin/editorial/redacao-automatica/')){event.preventDefault();void window.__flowNavigate(href);}
});
