"use client";
import {useState} from "react";
import {MesaIntentPreparationClient} from "../../_mesa-intent-preparation-client";
import styles from "../../mesa.module.css";
export function ThemeContinuityClient({themeId,themeTitle="Tema",disabled,autoOpen=false}:Readonly<{
  themeId:string;themeTitle?:string;disabled:boolean;autoOpen?:boolean;
}>) {
  const [expanded,setExpanded]=useState(autoOpen),[busy,setBusy]=useState(false);
  return <section className={styles.continuityPanel} aria-labelledby="theme-continuity-title">
    <div className={styles.continuityLead}><div><p className={styles.eyebrow}>Tema vivo</p><h2 id="theme-continuity-title">Continuidade editorial</h2>
      <p>Prepara este Tema com as capturas mais recentes já guardadas. A revisão dos publicados e o número de novos são escolhas separadas.</p>
    </div><button type="button" disabled={disabled||busy} onClick={()=>setExpanded(v=>!v)}>{expanded?"Fechar preparação":"Voltar a levar à Produção"}</button></div>
    {expanded?<MesaIntentPreparationClient selection={{themes:[{themeId,title:themeTitle}],sources:[]}} title={themeTitle}
      storageKey={`jornada.mesa.tema.${themeId}.whole-theme`} disabled={disabled} onBusyChange={setBusy}/>:null}
  </section>;
}
