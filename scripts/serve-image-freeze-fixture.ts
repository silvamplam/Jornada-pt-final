// Local UI + real materialization/preview pipeline, with an in-memory DB/Storage.
import { createServer } from "node:http";
import { build } from "esbuild";
import sharp from "sharp";
import { freezeEditorialImage, type ImageDecision, type ImageFreezeTransport } from "../lib/editorial-image-freeze.server";
async function main() {
  const origin="http://localhost:3034",objects=new Map<string,Uint8Array>(),decisions=new Map<string,ImageDecision>();
  let source=await sharp({create:{width:1400,height:900,channels:3,background:"#ac361d"}}).jpeg().toBuffer(),downloads=0;
  const transport:ImageFreezeTransport={origin,async claim(key,sourceUrl){const old=decisions.get(key);if(old)return{owned:false,decision:old};const decision:ImageDecision={key,sourceUrl,state:"acquiring",image:null};decisions.set(key,decision);return{owned:true,decision};},
    async bind(key,image){Object.assign(decisions.get(key)!,{image,state:"candidate"});},async finish(key,image){Object.assign(decisions.get(key)!,{image,state:"ready"});},
    async download(){downloads++;return{bytes:source,contentType:"image/jpeg"};},async originalExists(p){return objects.has(p);},
    async writeOriginal(image,bytes){if(objects.has(image.path))return"exists";objects.set(image.path,bytes);return"created";},
    previews:{async exists(p){return objects.has(p);},async readOriginal(p){return objects.get(p)!;},async writePreview(p,bytes){if(objects.has(p))return"exists";objects.set(p,bytes);return"created";},async list(){return[];}},};
  const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Freeze from './components/admin/FreezeEditorialImage';createRoot(document.getElementById('root')).render(<Freeze sourceUrl="https://source.example/image.jpg" onConfirm={url=>document.getElementById('confirmed').textContent=url}/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,jsx:"automatic",define:{"process.env.NEXT_PUBLIC_SUPABASE_URL":JSON.stringify(origin)}});
  const importBundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Import from './app/admin/editorial/artigos/_externalArticleImport';import{storedEditorialExternalArticle,EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY}from'./lib/redacao-automatica/editorial-external-article-import';localStorage.setItem(EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,JSON.stringify(storedEditorialExternalArticle({title:'Title',body:'Body',anteTitle:'Label',postTitle:'Subtitle'},Date.now(),{sourcePackage:{year:'2026',month:'09',packageId:'11111111-1111-4111-8111-111111111111'},imageCandidates:[{position:1,sourceCode:'fixture',articleTitle:'Source',imageUrl:'${origin}/source.jpg'}]})));createRoot(document.getElementById('root')).render(<Import/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,jsx:"automatic"});
  createServer(async(req,res)=>{
    try{
      if(req.url==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<title>Congelamento editorial — teste local</title><style>body{font:16px system-ui;margin:30px}img{display:block;max-width:640px;width:100%}button{margin:8px;padding:12px}code{display:block;overflow-wrap:anywhere}</style><h1>Rever imagem congelada</h1><div id="root"></div><p id="confirmed"></p><script src="/app.js"></script>');return;}
      if(req.url==="/app.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle.outputFiles[0].contents);return;}
      if(req.url?.startsWith('/import?')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>Import fixture</title><style>body{font:16px system-ui;margin:24px}img{max-width:360px}button{padding:12px;margin:8px}</style><form><input name="image_url" aria-label="image_url"><input name="title"><input name="label"><input name="subtitle"><textarea name="body"></textarea><div id="root"></div></form><script src="/import.js"></script>');return;}
      if(req.url==='/import.js'){res.setHeader('Content-Type','application/javascript');res.end(importBundle.outputFiles[0].contents);return;}
      if(req.url==='/source.jpg'){res.setHeader('Content-Type','image/jpeg');res.end(source);return;}
      if(req.url==="/stats"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({downloads,objects:objects.size,decisions:[...decisions.values()]}));return;}
      if(req.url==="/change-source"){source=await sharp({create:{width:1400,height:900,channels:3,background:"#1547ae"}}).jpeg().toBuffer();res.end('changed');return;}
      if(req.url?.startsWith('/storage/v1/object/public/editorial-images/')){const p=req.url.split('/editorial-images/')[1],bytes=objects.get(p);res.statusCode=bytes?200:404;res.setHeader('Content-Type',p.endsWith('.webp')?'image/webp':'image/jpeg');res.end(bytes);return;}
      if(req.url==='/api/admin/editorial/images/freeze'){const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString());const image=await freezeEditorialImage(body.decisionKey,body.sourceUrl,transport);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,image}));return;}
      if(req.url==='/api/admin/editorial/artigos/import-source-image'){const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString());const image=await freezeEditorialImage(`package:${body.packageId}:${body.position}${body.acquisitionId?':'+body.acquisitionId:''}`,'https://source.example/image.jpg',transport);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,publicUrl:image.publicUrl,sha256:image.sha256}));return;}
      if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
      res.statusCode=404;res.end();
    }catch{res.statusCode=500;res.end(JSON.stringify({ok:false}));}
  }).listen(3034,"127.0.0.1",()=>console.log(origin));
}
void main();
