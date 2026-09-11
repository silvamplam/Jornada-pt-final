import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildMesaOrganization, type MesaOrganizationRecords } from "./newsroom-mesa-organization-internal";
import { mesaSelectedSources, type MesaMaterialVersion, type MesaSourceRef } from "./newsroom-mesa-editorial-groups";
import { EMPTY_MESA_PREPARATION_BUFFER, selectMesaDossierMaterial, selectMesaMaterial,
  mesaPreparationPayload, readMesaPreparationBuffer, writeMesaPreparationBuffer, removeMesaDossierMaterial,
  type MesaSourceSelection } from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const ref = (n: number): MesaSourceRef => ({ newsroomArticleId: id(n), newsroomSnapshotId: id(100+n) });
const key = `package:${id(20)}:1`;
const material = { key, versionId: id(50), sources: [ref(1),ref(2)] };
const selection = { ...material, title: "Assunto A", classificationKey: "sporting" as const };
const source = (n: number): MesaSourceSelection => ({ kind: "source", lifecycle: "new", ...ref(n), classificationKey:"sporting",title:`Fonte ${n}`,sourceLabel:"Record",imageUrl:null });
const version = (n: number, overrides: Partial<MesaMaterialVersion> = {}): MesaMaterialVersion => ({ id:id(n),material_key:key,title:"Assunto A",source_refs:[ref(1),ref(2)],article_ids:[id(201)],revision:n,production_dossier_id:null,publication_event_id:null,...overrides });
const records = (): MesaOrganizationRecords => ({ themes: [10,11].map(n=>({ id:id(n),title:`Tema ${n}`,classification_key:"sporting",status:"open",updated_at:"2026-09-11T12:00:00Z" })),
  dossiers:[],dossierSources:[],publishedLinks:[],themeDossiers:[],themeSources:[],themeArticles:[],
  materialVersions:[version(50)],themeMaterials:[10,11].map(n=>({theme_id:id(n),material_key:key,version_id:id(50)})) });

test("o mesmo Dossiê associa-se a dois Temas, sem uma relação exclusiva",()=>{
  const data=records();const before=JSON.stringify(data);const org=buildMesaOrganization(data,[]);
  assert.equal(org.themes[0].dossiers.length,1);assert.equal(org.themes[1].dossiers.length,1);
  assert.deepEqual(org.availableDossiers?.[0].themeIds,[id(10),id(11)]);assert.equal(JSON.stringify(data),before);
});
test("publicar no Tema A avança só a sua revisão; Tema B não recebe a fonte nova",()=>{
  const data=records(); const org=buildMesaOrganization({...data,materialVersions:[version(50),version(51,{source_refs:[ref(1),ref(2),ref(3)],article_ids:[id(201),id(202)],publication_event_id:id(90),production_dossier_id:id(70)})],
    themeMaterials:[{theme_id:id(10),material_key:key,version_id:id(51)},{theme_id:id(11),material_key:key,version_id:id(50)}]},[]);
  assert.equal(org.themes[0].sourceCount,3);assert.equal(org.themes[0].articleCount,2);
  assert.equal(org.themes[1].sourceCount,2);assert.equal(org.themes[1].articleCount,1);
  assert.deepEqual(org.themes[1].dossiers[0].material?.sources,[ref(1),ref(2)]);
});
test("preparar Tema B utiliza o Dossiê congelado e a sua fonte, não a fonte exclusiva de A",()=>{
  assert.deepEqual(mesaSelectedSources([ref(4)],[material]),[ref(1),ref(2),ref(4)]);
});
test("uma consolidação com vários Dossiês de origem aparece uma vez, conservando associações",()=>{
  const refs=[ref(1),ref(2),ref(3)]; const common={source_refs:refs,publication_event_id:id(90),production_dossier_id:id(70)};
  const otherKey=`package:${id(20)}:2`; const ownKey=`dossier:${id(70)}`;
  const org=buildMesaOrganization({...records(), materialVersions:[version(51,common),version(52,{...common,material_key:otherKey,article_ids:[id(202)]}),version(53,{...common,material_key:ownKey})],
    themeMaterials:[{theme_id:id(10),material_key:key,version_id:id(51)},{theme_id:id(10),material_key:otherKey,version_id:id(52)},{theme_id:id(10),material_key:ownKey,version_id:id(53)}]},[]);
  assert.equal(org.availableDossiers?.length,1);assert.equal(org.themes[0].dossiers.length,1);
  assert.equal(org.themes[0].dossiers[0].material?.key,ownKey);assert.equal(org.themes[0].dossiers[0].articleCount,2);
});
test("uma referência-base capturada mais tarde não substitui a revisão consolidada",()=>{
  const org=buildMesaOrganization({...records(),materialVersions:[version(50),version(51,{publication_event_id:id(90),source_refs:[ref(1),ref(2),ref(3)]}),version(52)]},[]);
  assert.equal(org.availableDossiers?.[0].sourceCount,3);assert.equal(org.themes[1].sourceCount,2);
});
test("publicação parcial de uma nova produção não aparece como Dossiê consolidado",()=>{
  const org=buildMesaOrganization({...records(),materialVersions:[],themeMaterials:[],
    dossiers:[{id:id(70),title:"Preparada",status:"draft",created_at:"2026-09-11",updated_at:"2026-09-11"}],
    dossierSources:[1,2].map(n=>({dossier_id:id(70),newsroom_article_id:id(n),newsroom_snapshot_id:id(100+n),included:true})),
    publishedLinks:[{dossier_id:id(70),editorial_article_id:id(201)}],
    productionContexts:[{dossier_id:id(70),theme_id:id(10),material_refs:[]}],completedProductionIds:[]},[]);
  assert.equal(org.availableDossiers?.length,0);assert.equal(org.preparedProductions?.length,1);
});
test("seleção mista sobrevive ao armazenamento sem alterar snapshots ou chave",()=>{
  const one=selectMesaDossierMaterial(EMPTY_MESA_PREPARATION_BUFFER,selection,()=>id(90));
  const two=selectMesaMaterial(one,source(3),()=>id(91));
  const restored=readMesaPreparationBuffer(writeMesaPreparationBuffer(two));assert.deepEqual(restored,two);
  const payload=mesaPreparationPayload(restored)!;assert.equal(payload.preparationKey,id(91));
  assert.deepEqual(mesaSelectedSources(payload.sources,payload.materials??[]),[ref(1),ref(2),ref(3)]);
});
test("uma revisão nova no ecrã não substitui silenciosamente um Dossiê selecionado",()=>{
  const one=selectMesaDossierMaterial(EMPTY_MESA_PREPARATION_BUFFER,selection,()=>id(90));
  const newer=selectMesaDossierMaterial(one,{...selection,versionId:id(51),sources:[ref(1),ref(2),ref(3)]},()=>id(91));
  assert.equal(newer,one);assert.equal(newer.preparationKey,id(90));
  const explicit=selectMesaDossierMaterial(removeMesaDossierMaterial(one,key,()=>id(92)),{...selection,versionId:id(51),sources:[ref(1),ref(2),ref(3)]},()=>id(93));
  assert.equal(explicit.dossiers?.[0].versionId,id(51));assert.equal(explicit.preparationKey,id(93));
});
test("seleção fonte avulsa + Dossiê incompatível permanece, mas não prepara",()=>{
  const one=selectMesaDossierMaterial(EMPTY_MESA_PREPARATION_BUFFER,selection,()=>id(90));
  const two=selectMesaMaterial(one,{...source(1),newsroomSnapshotId:id(999)},()=>id(91));
  assert.equal(mesaPreparationPayload(two),null);assert.equal(two.dossiers?.length,1);assert.equal(two.sources.length,1);
});
test("mais de vinte fontes não divide um Dossiê nem corta o buffer",()=>{
  const one=selectMesaDossierMaterial(EMPTY_MESA_PREPARATION_BUFFER,{...selection,sources:Array.from({length:21},(_,n)=>ref(n+1))},()=>id(90));
  assert.equal(mesaPreparationPayload(one),null);assert.equal(one.dossiers?.[0].sources.length,21);
  assert.deepEqual(readMesaPreparationBuffer(writeMesaPreparationBuffer(one)),one);
});
test("buffer anterior sem Dossiês mantém a chave, título e pares originais",()=>{
  const legacy=selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER,source(1),()=>id(90));
  assert.deepEqual(readMesaPreparationBuffer(JSON.stringify(legacy)),legacy);
});
test("SQL novo não reescreve histórico aplicado nem produções ou conteúdo original",()=>{
  const sql=readFileSync("supabase/sql/jornada-mesa-grupos-temas-v2-aplicar.sql","utf8");
  assert.doesNotMatch(sql,/(?:update|delete from|alter table)\s+public\.(?:editorial_articles|newsroom_editorial_dossiers|newsroom_editorial_dossier_sources|newsroom_editorial_source_packages)\b/i);
  assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+supabase_migrations/i);
  assert.match(sql,/primary key\(theme_id, material_key\)/);
  assert.match(sql,/v_refs is distinct from v_context\.source_refs/);
  assert.match(sql,/where m\.theme_id=v_context\.theme_id.*m\.version_id=v_origin\.id/);
  assert.match(sql,/deferrable initially deferred/);
  assert.match(sql,/mesa-material-prepared-before-v2/);
  assert.match(sql,/a\.id is null or a\.status<>'published'/);
});
