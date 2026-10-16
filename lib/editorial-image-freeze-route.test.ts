import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import dns from "node:dns/promises";
import https from "node:https";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { POST } from "../app/api/admin/editorial/images/freeze/route";
import { createAdminSession, ADMIN_SESSION_COOKIE } from "./admin-session";
import { editorialPreviewPath, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";
import { preflightEditorialBatchImages } from "./redacao-automatica/editorial-batch-image-preflight";
import { productionImageSelection } from "./editorial-production-image-choice";
import { assertEditorialImageAuthority } from "./editorial-image-authority";

const origin="https://isolated-fixture.supabase.co";
const id="1d9db9c3-d3a3-4e91-b4de-dc835ae17997", dossier="43bf4529-fe83-4629-819b-6d9ad5d46df2";
const social="https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol";
const actual="https://img.iol.pt/image/id/6ad13331d34e53c759c76a1a/";
const page="https://maisfutebol.iol.pt/benfica/celtic/liga-europa-benfica-celtic-4-1-cronica";

test("route freeze: old real dossier shape -> source page -> validated bytes -> ready -> confirmation -> batch preflight",async t=>{
  const oldEnv={...process.env};
  process.env.NEXT_PUBLIC_SUPABASE_URL=origin;
  process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test-key";
  process.env.ADMIN_SESSION_SECRET="isolated-route-test-secret";
  const real=process.env.IMAGE_CONTRACT_REAL_FIXTURE === "1";
  const bytes=real ? readFileSync("out/image-contract/article.jpg") : await sharp({create:{width:1280,height:720,channels:3,background:"#127f53"}}).webp().toBuffer();
  const html=real ? readFileSync("out/image-contract/source.html","utf8") : `<meta property="og:image" content="${social}"><script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"${actual}"}}</script>`;
  let downloads=0, pages=0, failDownload=false;
  t.mock.method(dns,"lookup",async()=>[{address:"1.1.1.1",family:4}]);
  t.mock.method(https,"request",(url:URL,options:any,callback:any)=>{
    assert.ok([page,actual].includes(url.href),`Unexpected network URL: ${url.href}`);
    options.lookup(url.hostname,{},(_error:unknown,address:string)=>assert.equal(address,"1.1.1.1"));
    const req=Object.assign(new EventEmitter(),{end(){
      const isPage=url.href===page;
      if(isPage)pages++;else downloads++;
      const response=Object.assign(new PassThrough(),{statusCode:!isPage&&failDownload?503:200,headers:{"content-type":isPage?"text/html":"image/webp"}});
      callback(response);if(!response.destroyed)response.end(isPage?html:bytes);
    }});return req;
  });
  const decisions=new Map<string,any>(), assets=new Map<string,any>(),objects=new Map<string,Uint8Array>();
  let row:any={id,dossier_id:dossier,newsroom_article_id:"3139820f-40ce-4a2b-ad4a-2e4badd09486",frozen_url:social,source_url:null};
  t.mock.method(globalThis,"fetch",async(input:any,init:RequestInit={})=>{
    const url=new URL(String(input));assert.equal(url.origin,origin,"No production requests allowed");
    const method=init.method??"GET", body=typeof init.body==="string"?JSON.parse(init.body):null;
    if(url.pathname.startsWith("/storage/v1/object/")){
      const path=url.pathname.replace(/^\/storage\/v1\/object\/(?:public\/)?editorial-images\//,"");
      if(method==="POST"){assert.equal(new Headers(init.headers).get("x-upsert"),"false");if(objects.has(path))return Response.json({error:"Duplicate"},{status:409});objects.set(path,new Uint8Array(init.body as Uint8Array));return Response.json({});}
      if(!objects.has(path))return new Response(null,{status:404});
      return new Response(method==="HEAD"?null:new Uint8Array(objects.get(path)!),{headers:{"content-type":path.endsWith(".webp")?"image/webp":"image/jpeg"}});
    }
    if(url.pathname.endsWith("/newsroom_editorial_dossier_images"))return Response.json([row]);
    if(url.pathname.endsWith("/newsroom_articles"))return Response.json([{original_url:page,image_url:social}]);
    if(url.pathname.endsWith("/editorial_image_decisions")){
      if(method==="POST"){
        if(decisions.has(body.decision_key))return Response.json([]);
        const d={...body,state:"acquiring",image:null,created_at:new Date().toISOString()};decisions.set(d.decision_key,d);return Response.json([d]);
      }
      const rows=[...decisions.values()].filter(d=>[...url.searchParams].every(([k,v])=>{
        if(["order","limit","select"].includes(k))return true;
        if(v.startsWith("eq."))return (k==="image->>publicUrl"?d.image?.publicUrl:d[k])===v.slice(3);
        if(v==="is.null")return d[k]===null;
        if(v.startsWith("like."))return d[k].startsWith(v.slice(5,-1));
        if(v.startsWith("lt."))return d[k]<v.slice(3);
        throw Error(`Unexpected filter ${k}=${v}`);
      }));
      if(method==="PATCH")rows.forEach(d=>Object.assign(d,body));
      return Response.json(url.searchParams.has("limit")?rows.reverse().slice(0,1):rows);
    }
    if(url.pathname.endsWith("/editorial_image_assets")){
      if(method==="POST"){assets.set(body.public_url,body);return Response.json({});}
      return Response.json([...assets.values()].filter(a=>a.public_url===url.searchParams.get("public_url")?.slice(3)));
    }
    if(url.pathname.endsWith("/rpc/editorial_confirm_dossier_image_v1")){
      const d=decisions.get(body.p_decision_key);
      assert.equal(d.state,"ready");assert.equal(d.source_url,row.source_url??row.frozen_url);
      assert.ok(assets.has(d.image.publicUrl));
      row={...row,source_url:row.source_url??row.frozen_url,frozen_url:d.image.publicUrl};
      return new Response(null,{status:204});
    }
    throw Error(`Unexpected REST path ${url.pathname}`);
  });
  const cookie=`${ADMIN_SESSION_COOKIE}=${await createAdminSession()}`;
  const call=async(payload:Record<string,unknown>)=>{
    const response=await POST(new NextRequest("https://www.jornada.pt/api/admin/editorial/images/freeze",{method:"POST",headers:{origin:"https://www.jornada.pt",cookie,"Content-Type":"application/json"},body:JSON.stringify(payload)}));
    return {status:response.status,body:await response.json()};
  };
  try{
    for(const localCopy of [false,true,"missing-provenance"]){
      decisions.clear();assets.clear();objects.clear();downloads=0;pages=0;
      const contaminatedBytes=real ? readFileSync("out/image-contract/social.jpg") : await sharp(bytes).jpeg().toBuffer();
      const contaminatedPath=`editorial/sha256/${createHash("sha256").update(contaminatedBytes).digest("hex")}.jpg`;
      row={...row,frozen_url:localCopy?`${origin}/storage/v1/object/public/editorial-images/${contaminatedPath}`:social,
        source_url:localCopy===true?social:null};
      if(localCopy){objects.set(contaminatedPath,contaminatedBytes);assets.set(row.frozen_url,{public_url:row.frozen_url,storage_path:contaminatedPath});}
      const oldVisual=row.frozen_url;
      const prepared=await call({prepare:true,confirm:false,dossierId:dossier,dossierImageId:id});
      assert.equal(prepared.status,200,JSON.stringify(prepared.body));
      const d=decisions.get(prepared.body.image.decisionKey);
      assert.equal(d.state,"ready");assert.equal(d.source_url,localCopy==="missing-provenance"?oldVisual:social);
      assert.equal(d.image.acquisitionUrl,actual);assert.notEqual(d.image.publicUrl,oldVisual);
      assert.ok(objects.has(d.image.path));assert.ok(assets.has(d.image.publicUrl));
      for(const width of PUBLIC_EDITORIAL_PREVIEW_WIDTHS){
        const preview=objects.get(editorialPreviewPath(d.image.path,width)!)!;assert.ok(preview);
        const meta=await sharp(preview).metadata();assert.equal(meta.width,width);assert.equal(meta.format,"webp");
      }
      const confirmed=await call({select:true,confirm:true,dossierId:dossier,dossierImageId:id});
      assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));assert.equal(row.frozen_url,d.image.publicUrl);
      assert.equal(downloads,1);assert.equal(pages,1);
      const selection=productionImageSelection({candidate:{id,frozenUrl:row.frozen_url},explicitChoice:`dossier_image:${id}`,destination:"new",prepared:prepared.body.image,origin});
      assert.equal(selection.publicUrl,d.image.publicUrl);
      assert.equal(preflightEditorialBatchImages(["01"],[],[{key:"01",imageUrl:row.frozen_url,fileName:"01-frozen.webp"}]).ready,true);
      assert.doesNotThrow(()=>assertEditorialImageAuthority(row.frozen_url,null,origin));
      assert.throws(()=>assertEditorialImageAuthority(social,null,origin));
      // Repeat and reload preserve exact bytes without external network.
      assert.equal((await call({prepare:true,confirm:false,dossierId:dossier,dossierImageId:id})).status,200);
      assert.equal(downloads,1);assert.equal(pages,1);
      console.log(JSON.stringify({case:localCopy||"legacy-external",fixture:real?"real-observed-bytes":"generated-bytes",state:d.state,sha256:d.image.sha256,originalBytes:objects.get(d.image.path)!.length,previews:PUBLIC_EDITORIAL_PREVIEW_WIDTHS,preflight:true,downloads}));
    }
    decisions.clear();row={...row,frozen_url:social,source_url:null};failDownload=true;
    assert.equal((await call({prepare:true,confirm:false,dossierId:dossier,dossierImageId:id})).status,422);
    assert.equal([...decisions.values()][0].state,"failed");failDownload=false;
    const retry=await call({prepare:true,confirm:false,dossierId:dossier,dossierImageId:id});
    assert.equal(retry.body.error,"image-acquisition-incomplete");
    assert.equal((await call({prepare:true,confirm:false,dossierId:dossier,dossierImageId:id,revisionKey:"12345678-0000-4000-8000-000000000001"})).status,200);
    const ready=[...decisions.values()].find(d=>d.state==="ready")!.image;
    row={...row,newsroom_article_id:null,frozen_url:ready.publicUrl,source_url:null};
    const before=downloads;
    const upload=await call({select:true,confirm:true,dossierId:dossier,dossierImageId:id});
    assert.equal(upload.status,200);assert.equal(upload.body.image.publicUrl,ready.publicUrl);
    assert.equal(upload.body.image.decisionKey,null);assert.equal(downloads,before);
  }finally{
    for(const key of ["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","ADMIN_SESSION_SECRET"])if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key];
  }
});
