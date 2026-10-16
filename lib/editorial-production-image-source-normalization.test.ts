import assert from "node:assert/strict";
import test from "node:test";
import { articleImageReferences, resolveEditorialImageSource } from "./editorial-image-source.server";
import { prepareProductionImage } from "./editorial-production-image-preparation.server";

const social = "https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol";
const actual = "https://img.iol.pt/image/id/6ad13331d34e53c759c76a1a/";
const page = "https://maisfutebol.iol.pt/benfica/celtic/liga-europa-benfica-celtic-4-1-cronica";
const html = `<meta property="og:image" content="${social}"><script type="application/ld+json">${JSON.stringify({"@type":"NewsArticle",image:{"@type":"ImageObject",url:actual},publisher:{logo:"https://publisher.example/logo.jpg"}})}</script>`;

test("fixture IOL real: usa a URL literal de NewsArticle, nunca uma convenção CDN", async () => {
  const result = await resolveEditorialImageSource(social, page, async () => ({html,url:page}));
  assert.equal(result, actual); assert.ok(!result.includes("1024.jpg"));
  assert.deepEqual(articleImageReferences(html,page).article,[actual]);
});

test("o mesmo contrato funciona noutro CDN e com URLs relativas e @graph",async()=>{
  const source="https://cdn.example/social/share.png";
  const body=`<meta property="og:image" content="${source}"><script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":"/logo.png"},{"@type":"Article","image":"/photos/original.png"}]}</script>`;
  assert.equal(await resolveEditorialImageSource(source,"https://publisher.example/story",async()=>({html:body,url:"https://publisher.example/story"})),"https://publisher.example/photos/original.png");
});

test("social sem imagem inequívoca ou página é recusada; URL não é inventada",async()=>{
  await assert.rejects(resolveEditorialImageSource(social),/article-source-required/);
  await assert.rejects(resolveEditorialImageSource(social,page,async()=>({html:'<meta property="og:image" content="'+social+'">',url:page})),/unresolved/);
  await assert.rejects(resolveEditorialImageSource(social,page,async()=>({html:html.replace('"url":"'+actual+'"','"url":"http://127.0.0.1/private"'),url:page})),/unresolved/);
});

test("fotografia explicitamente escolhida mantém origem mesmo com outra imagem social na página",async()=>{
  assert.equal(await resolveEditorialImageSource("https://cdn.example/manual.jpg",page,async()=>({html,url:page})),"https://cdn.example/manual.jpg");
});

test("outra fonte que usa a mesma fotografia no artigo e em og:image continua válida",async()=>{
  const source="https://cdn.publisher.example/photo.jpg";
  const body=`<meta property="og:image" content="${source}"><script type="application/ld+json">{"@type":"NewsArticle","image":"${source}"}</script>`;
  assert.equal(await resolveEditorialImageSource(source,page,async()=>({html:body,url:page})),source);
});

test("cópia local contaminada exige aquisição; proveniência continua a coincidir com Dossiê",async()=>{
  const origin="https://local-project.supabase.co", id="00000000-0000-4000-8000-000000000002";
  const local=`${origin}/storage/v1/object/public/editorial-images/editorial/sha256/${"a".repeat(64)}.jpg`;
  let registered=false;
  const result=await prepareProductionImage({dossierId:id,imageId:id},{origin,
    async readImage(){return{id,dossier_id:id,frozen_url:local,source_url:social};},
    async latestDecision(){return null;},async registerLocal(){registered=true;},
    resolveSource:source=>resolveEditorialImageSource(source,page,async()=>({html,url:page})),
    async freeze(key,source,acquisition){
      assert.equal(source,social);assert.equal(acquisition,actual);assert.match(key,/production-image-v2/);
      return {publicUrl:local.replace(/a{64}/,"b".repeat(64)),path:"new",sha256:"b".repeat(64),byteSize:123,contentType:"image/webp"};
    },
  });
  assert.equal(registered,false);assert.notEqual(result.publicUrl,local);
});
