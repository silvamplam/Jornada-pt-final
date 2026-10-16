import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { freezeEditorialImage, type FrozenImage, type ImageDecision, type ImageFreezeTransport } from "./editorial-image-freeze.server";
import { assertEditorialImageAuthority, editorialImageOriginalPath } from "./editorial-image-authority";
import { safeEditorialSourceUrl, isPublicImageAddress, validateEditorialImageBytes, downloadFrozenEditorialImage, type EditorialImageNetwork } from "./editorial-image-download.server";
import { editorialPreviewPath, isEditorialPreviewOriginalPath, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";
import { publicEditorialImageSources } from "./public-editorial-image";
import { imagePromotionPlan, imageMigrationSummary, imageReviewHtml } from "./editorial-image-migration";
import { createImageFreezeStorage } from "./editorial-image-freeze-storage.server";

const origin="https://local-project.supabase.co", source="https://source.example/image.jpg";
const picture=(color:string)=>sharp({create:{width:1400,height:900,channels:3,background:color}}).jpeg().toBuffer();
async function fixture() {
  const decisions=new Map<string,ImageDecision>(), objects=new Map<string,Uint8Array>();
  const state={downloads:0,reads:0,writes:0,failFinish:false,failPreview:0,bytes:await picture("red")};
  const transport:ImageFreezeTransport={origin,
    async claim(key,sourceUrl){const old=decisions.get(key);if(old)return{owned:false,decision:old};const decision:ImageDecision={key,sourceUrl,state:"acquiring",image:null};decisions.set(key,decision);return{owned:true,decision};},
    async bind(key,image){Object.assign(decisions.get(key)!,{state:"candidate",image});},
    async finish(key,image){if(state.failFinish)throw new Error("persistence-failed");Object.assign(decisions.get(key)!,{state:"ready",image});},
    async download(){state.downloads++;return{bytes:state.bytes,contentType:"image/jpeg"};},
    async originalExists(p){return objects.has(p);},
    async writeOriginal(image,bytes){if(objects.has(image.path))return"exists";objects.set(image.path,bytes);state.writes++;return"created";},
    previews:{async exists(p){return objects.has(p);},async readOriginal(p){state.reads++;const bytes=objects.get(p);if(!bytes)throw new Error("missing");return bytes;},
      async writePreview(p,bytes){if(p.endsWith(`w${state.failPreview}.webp`))throw new Error("preview-failed");if(objects.has(p))return"exists";objects.set(p,bytes);state.writes++;return"created";},async list(){return[];}},
  };
  return{state,transport,decisions,objects};
}
test("A -> source B -> same decision retry stays A; explicit new decision creates B at another path",async()=>{
  const f=await fixture(), A=await freezeEditorialImage("decision-A",source,f.transport);
  const originalA=Buffer.from(f.objects.get(A.path)!);
  f.state.bytes=await picture("blue");
  const retry=await freezeEditorialImage("decision-A",source,f.transport);
  assert.deepEqual(retry,A);assert.equal(f.state.downloads,1);assert.equal(f.state.writes,5);assert.equal(f.state.reads,0);
  assert.deepEqual(f.objects.get(A.path),originalA);
  const B=await freezeEditorialImage("explicit-new-decision",source,f.transport);
  assert.notEqual(B.sha256,A.sha256);assert.notEqual(B.path,A.path);assert.equal(f.state.downloads,2);
  assert.equal(f.decisions.get("decision-A")!.sourceUrl,source);
  assert.equal(createHash("sha256").update(f.objects.get(A.path)!).digest("hex"),A.sha256);
});
test("upload -> persistence failure recovers exact candidate without rereading origin or original",async()=>{
  const f=await fixture();f.state.failFinish=true;
  await assert.rejects(freezeEditorialImage("recover",source,f.transport),/persistence/);
  const image=f.decisions.get("recover")!.image!;
  f.state.bytes=await picture("blue");f.state.failFinish=false;
  assert.deepEqual(await freezeEditorialImage("recover",source,f.transport),image);
  assert.equal(f.state.downloads,1);assert.equal(f.state.reads,0);assert.equal(f.state.writes,5);
});
test("partial preview failure preserves original and retries missing previews from hash-verified local candidate",async()=>{
  const f=await fixture();f.state.failPreview=960;
  await assert.rejects(freezeEditorialImage("partial",source,f.transport),/previews-incomplete/);
  const A=f.decisions.get("partial")!.image!;assert.deepEqual(f.objects.get(A.path),f.state.bytes);
  f.state.bytes=await picture("blue");f.state.failPreview=0;
  assert.deepEqual(await freezeEditorialImage("partial",source,f.transport),A);
  assert.equal(f.state.downloads,1);assert.equal(f.state.reads,1);assert.equal(f.state.writes,5);
});
test("claim without durable bytes refuses retry acquisition and source substitution",async()=>{
  const f=await fixture();f.transport.download=async()=>{f.state.downloads++;throw new Error("network");};
  await assert.rejects(freezeEditorialImage("lost",source,f.transport),/network/);
  await assert.rejects(freezeEditorialImage("lost",source,f.transport),/acquisition-incomplete/);
  await assert.rejects(freezeEditorialImage("lost","https://different.example/x",f.transport),/source-conflict/);
  assert.equal(f.state.downloads,1);
});
test("historical upload recovery reuses durable cache A and rejects changed cache B",async()=>{
  const f=await fixture(),write=f.transport.writeOriginal,cache=Buffer.from(f.state.bytes);
  f.transport.writeOriginal=async()=>{throw new Error("upload-failed");};
  await assert.rejects(freezeEditorialImage("cached",source,f.transport),/upload-failed/);
  const A=f.decisions.get("cached")!.image!;
  f.state.bytes=await picture("blue");f.transport.writeOriginal=write;
  f.transport.recoverCandidateBytes=async()=>f.state.bytes;
  await assert.rejects(freezeEditorialImage("cached",source,f.transport),/hash-mismatch/);
  assert.equal(f.objects.size,0);
  f.transport.recoverCandidateBytes=async()=>cache;
  assert.deepEqual(await freezeEditorialImage("cached",source,f.transport),A);
  assert.equal(f.state.downloads,1);assert.equal(f.state.reads,0);assert.equal(f.state.writes,5);
});
test("identical bytes share objects but retain independent source provenance",async()=>{
  const f=await fixture();const A=await freezeEditorialImage("one",source,f.transport);
  const B=await freezeEditorialImage("two","https://other.example/image.jpg",f.transport);
  assert.deepEqual(A,B);assert.equal(f.state.writes,5);assert.equal(f.decisions.size,2);
});
test("NEW external blocked, materialized accepted, UPDATE preserve is identity-bound",async()=>{
  const f=await fixture(), A=await freezeEditorialImage("authority",source,f.transport);
  assert.throws(()=>assertEditorialImageAuthority(source,null,origin),/materialization/);
  assert.doesNotThrow(()=>assertEditorialImageAuthority(A.publicUrl,null,origin));
  assert.doesNotThrow(()=>assertEditorialImageAuthority(source,{status:"published",image_url:source},origin));
  assert.throws(()=>assertEditorialImageAuthority("https://other.example/image.jpg",{status:"published",image_url:source},origin));
  assert.throws(()=>assertEditorialImageAuthority(source,{status:"draft",image_url:source},origin));
});
test("four WebP derivatives, public naming and actual width contract",async()=>{
  const f=await fixture(), A=await freezeEditorialImage("widths",source,f.transport);
  assert.ok(isEditorialPreviewOriginalPath(A.path));assert.equal(editorialImageOriginalPath(A.publicUrl,origin),A.path);
  for(const width of PUBLIC_EDITORIAL_PREVIEW_WIDTHS){const meta=await sharp(f.objects.get(editorialPreviewPath(A.path,width)!)!).metadata();assert.equal(meta.width,width);assert.equal(meta.format,"webp");}
  const rendered=publicEditorialImageSources(A.publicUrl,"article",false,origin);
  assert.ok(JSON.stringify(rendered).includes("w640.webp"));assert.ok(JSON.stringify(rendered).includes("w1280.webp"));
});
test("SSRF URLs, private, mapped and metadata addresses refused",()=>{
  for(const url of ["http://localhost/x","http://127.1/x","http://2130706433/x","http://[::1]/x","https://user:pass@example.com/a","file:///x","data:image/png,x","javascript:alert(1)","http://x.local/a","https://example.com:444/a"]){assert.throws(()=>safeEditorialSourceUrl(url),url);}
  for(const ip of ["127.0.0.1","10.1.2.3","172.16.1.1","192.168.1.2","169.254.169.254","100.64.0.1","::ffff:127.0.0.1","::1","fc00::1","fe80::1","2001:db8::1"]){assert.equal(isPublicImageAddress(ip),false,ip);}
  assert.equal(isPublicImageAddress("1.1.1.1"),true);
});
test("fake image, content-type mismatch and oversized bytes refused",async()=>{
  await assert.rejects(validateEditorialImageBytes(Buffer.from("<html>not image</html>"),"image/jpeg"));
  await assert.rejects(validateEditorialImageBytes(await picture("red"),"image/png"));
  await assert.rejects(validateEditorialImageBytes(new Uint8Array(8*1024*1024+1)),/byte-size/);
});
test("download pins validated DNS, revalidates redirects and bounds streamed bytes",async()=>{
  const bytes=await picture("red"),hosts:string[]=[];
  let sends=0,mode="image";
  const network:EditorialImageNetwork={
    async resolve(host){hosts.push(host);return [{address:host==="private.example"?"169.254.169.254":"1.1.1.1",family:4}];},
    request:((url:URL,options:any,callback:any)=>{
      sends++;
      options.lookup(url.hostname,{},(error:unknown,address:string,family:number)=>{assert.equal(error,null);assert.equal(address,"1.1.1.1");assert.equal(family,4);});
      assert.equal(options.agent,false);assert.ok(options.signal instanceof AbortSignal);
      const req=new EventEmitter() as EventEmitter & {end():void};
      req.end=()=>{const response=Object.assign(new PassThrough(),{statusCode:200,headers:{"content-type":"image/jpeg"} as Record<string,string>});
        if(mode==="redirect-private"||mode==="loop"){response.statusCode=302;response.headers.location=mode==="loop"?"/loop":"https://private.example/x";}
        if(mode==="mime")response.headers["content-type"]="text/html";
        if(mode==="status")response.statusCode=404;
        callback(response);
        if(!response.destroyed)response.end(mode==="large"?Buffer.alloc(8*1024*1024+1):bytes);
      };return req;
    }) as EditorialImageNetwork["request"],
  };
  assert.deepEqual((await downloadFrozenEditorialImage(source,network)).bytes,bytes);
  mode="redirect-private";const before=sends;
  await assert.rejects(downloadFrozenEditorialImage(source,network),/unsafe-address/);
  assert.equal(sends,before+1);assert.equal(hosts.at(-1),"private.example");
  mode="loop";const loops=sends;
  await assert.rejects(downloadFrozenEditorialImage(source,network),/too-many-redirects/);assert.equal(sends,loops+4);
  mode="large";await assert.rejects(downloadFrozenEditorialImage(source,network),/byte-size/);
  for(mode of ["mime","status"])await assert.rejects(downloadFrozenEditorialImage(source,network),/response-invalid/);
});
test("original Storage upload uses year-long cache and never overwrites a duplicate path",async()=>{
  const calls: RequestInit[]=[];
  const storage=createImageFreezeStorage({url:origin,serviceRoleKey:"test-key"},async(_url,init)=>{
    calls.push(init!);return calls.length===1?new Response('{}',{status:200}):new Response(JSON.stringify({error:"Duplicate"}),{status:409});
  });
  const f=await fixture(),image=await freezeEditorialImage("headers",source,f.transport);
  assert.equal(await storage.transport.writeOriginal(image,f.state.bytes),"created");
  assert.equal(await storage.transport.writeOriginal(image,f.state.bytes),"exists");
  for(const call of calls){const headers=new Headers(call.headers);assert.equal(headers.get("Cache-Control"),"max-age=31536000");assert.equal(headers.get("x-upsert"),"false");assert.equal(call.method,"POST");assert.equal(call.redirect,"error");assert.deepEqual(call.body,new Uint8Array(f.state.bytes));}
});
test("migration promotion requires unique explicit review bound to article, original URL and SHA",async()=>{
  const f=await fixture(), image=await freezeEditorialImage("migration",source,f.transport);
  const articles=[{id:"a",slug:"slug",title:"Title <unsafe>",image_url:source}];
  const candidate={sourceUrl:source,decisionKey:"migration",state:"ready" as const,image};
  const review={articleId:"a",sourceUrl:source,sha256:image.sha256,decision:"approved" as const,reviewer:"Editor"};
  const original=structuredClone(articles);
  assert.equal(imagePromotionPlan(articles,[candidate],[])[0].action,"review");
  assert.equal(imagePromotionPlan(articles,[candidate],[review])[0].action,"promote");
  for(const decision of ["rejected","uncertain"] as const)assert.equal(imagePromotionPlan(articles,[candidate],[{...review,decision}])[0].action,"review");
  assert.equal(imagePromotionPlan(articles,[candidate],[{...review,sha256:"changed"}])[0].action,"review");
  assert.equal(imagePromotionPlan(articles,[candidate],[review,review])[0].action,"review");
  assert.deepEqual(articles,original);assert.equal(imageMigrationSummary(articles,[candidate]).proposedObjects,5);
  assert.ok(imageReviewHtml(articles,[candidate]).includes("Title &lt;unsafe&gt;"));
  const invalid=[{...articles[0],image_url:"javascript:alert(1)"}];
  assert.equal(imageMigrationSummary(invalid,[]).hosts["invalid-url"],1);
  assert.doesNotMatch(imageReviewHtml(invalid,[]),/href="javascript:/);
});

test("image/jpg JPEG alias is accepted and canonicalized; fake or mismatched bytes still fail",async()=>{
  const bytes=await picture("red");
  assert.equal(await validateEditorialImageBytes(bytes,"image/jpg"),"jpg");
  await assert.rejects(validateEditorialImageBytes(await sharp(bytes).png().toBuffer(),"image/jpg"),/invalid-format/);
  await assert.rejects(validateEditorialImageBytes(Buffer.from("<html>bad</html>"),"image/jpg"));
});

test("failed acquisition becomes terminal; explicit revision works, stale claim expires, live claim cannot be stolen",async()=>{
  const f=await fixture();const download=f.transport.download;
  f.transport.fail=async(key)=>{const d=f.decisions.get(key)!;if(d.state==="acquiring"&&!d.image)d.state="failed";};
  f.transport.download=async()=>{throw Error("network");};
  await assert.rejects(freezeEditorialImage("failed",source,f.transport),/network/);
  assert.equal(f.decisions.get("failed")?.state,"failed");
  await assert.rejects(freezeEditorialImage("failed",source,f.transport),/acquisition-incomplete/);
  f.transport.download=download;
  await freezeEditorialImage("explicit-revision",source,f.transport);
  assert.equal(f.decisions.get("explicit-revision")?.state,"ready");
  f.decisions.set("stale",{key:"stale",sourceUrl:source,state:"acquiring",image:null,createdAt:new Date(Date.now()-180000).toISOString()});
  await assert.rejects(freezeEditorialImage("stale",source,f.transport),/acquisition-incomplete/);
  assert.equal(f.decisions.get("stale")?.state,"failed");
  f.decisions.set("live",{key:"live",sourceUrl:source,state:"acquiring",image:null,createdAt:new Date().toISOString()});
  await assert.rejects(freezeEditorialImage("live",source,f.transport),/acquisition-in-progress/);
  assert.equal(f.decisions.get("live")?.state,"acquiring");
});

test("ready receipt must still have original and all four previews; missing preview recovers exact bytes",async()=>{
  const f=await fixture();const image=await freezeEditorialImage("checked",source,f.transport);
  f.objects.delete(editorialPreviewPath(image.path,960)!);
  await freezeEditorialImage("checked",source,f.transport);
  assert.equal(f.state.downloads,1);assert.ok(f.objects.has(editorialPreviewPath(image.path,960)!));
  f.objects.delete(image.path);
  await assert.rejects(freezeEditorialImage("checked",source,f.transport),/acquisition-incomplete/);
  assert.equal(f.state.downloads,1);
});

test("Storage existence/receipt cannot rehabilitate a local copy with known social provenance",async()=>{
  const local=`${origin}/storage/v1/object/public/editorial-images/editorial/sha256/${"a".repeat(64)}.jpg`;
  let calls=0;
  const storage=createImageFreezeStorage({url:origin,serviceRoleKey:"test-key"},async input=>{
    calls++;assert.match(String(input),/editorial_image_decisions/);
    return Response.json([{source_url:"https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol",image:{publicUrl:local}}]);
  });
  await assert.rejects(storage.registerLocal(local),/image-social-provenance/);
  assert.equal(calls,1);
});

test("ready social decision without a separately resolved acquisition cannot become authority",async()=>{
  const f=await fixture();const image=await freezeEditorialImage("original",source,f.transport);
  const social="https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol";
  f.decisions.set("old-social",{key:"old-social",sourceUrl:social,state:"ready",image});
  await assert.rejects(freezeEditorialImage("old-social",social,f.transport),/image-social-provenance/);
  assert.equal(f.decisions.get("old-social")?.state,"ready");assert.ok(f.objects.has(image.path));
  await assert.rejects(freezeEditorialImage("new-social",social,f.transport),/image-social-provenance/);
});
