import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EMPTY_MESA_PREPARATION_BUFFER,
  changeMesaPreparationTitle,
  clearMesaPreparationBuffer,
  mesaPreparationPayload,
  readMesaPreparationBuffer,
  removeMesaMaterial,
  selectMesaMaterial,
  writeMesaPreparationBuffer,
  type MesaSourceSelection,
} from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
import {
  saveEditorialDossierArticlePlanService,
  type EditorialDossierArticlePlanTransport,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service-internal";
import {
  saveEditorialDossierWorkspaceArticlePlanService,
  type EditorialDossierWorkspaceArticlePlanTransport,
  type SaveEditorialDossierWorkspaceArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-editor-service-internal";
import { preflightEditorialArticleBatchForSourcePackage } from "@/lib/redacao-automatica/editorial-batch-transfer";

const dossierId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const snapshotId = "00000000-0000-4000-8000-000000000003";
const publishedId = "00000000-0000-4000-8000-000000000004";
const publishedSourceId = "00000000-0000-4000-8000-000000000014";
const publishedSnapshotId = "00000000-0000-4000-8000-000000000015";
const contextId = "00000000-0000-4000-8000-000000000005";
const imageId = "00000000-0000-4000-8000-000000000006";
const planOneId = "00000000-0000-4000-8000-000000000007";
const planTwoId = "00000000-0000-4000-8000-000000000008";
const keyOne = "00000000-0000-4000-8000-000000000011";
const keyTwo = "00000000-0000-4000-8000-000000000012";
const keyThree = "00000000-0000-4000-8000-000000000013";

const newsroomSelection: MesaSourceSelection = {
  kind: "source",
  lifecycle: "new",
  newsroomArticleId: sourceId,
  newsroomSnapshotId: snapshotId,
  classificationKey: "benfica",
  title: "Fonte concreta",
  sourceLabel: "Record",
  imageUrl: "https://example.test/source.jpg",
};

const publishedSelection: MesaSourceSelection = {
  kind: "source",
  lifecycle: "published",
  newsroomArticleId: publishedSourceId,
  newsroomSnapshotId: publishedSnapshotId,
  classificationKey: "sporting",
  title: "Fonte que já contribuiu",
  sourceLabel: "A Bola",
  imageUrl: "https://example.test/published.jpg",
};

function read(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

test("uma NOVA selecionada conserva o par artigo/snapshot concreto", () => {
  const selected = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    newsroomSelection,
    () => keyOne,
  );

  assert.equal(selected.sources.length, 1);
  assert.equal(selected.sources[0]?.newsroomArticleId, sourceId);
  assert.equal(selected.sources[0]?.newsroomSnapshotId, snapshotId);
  assert.equal(selected.preparationKey, keyOne);
  assert.equal(selected.title, newsroomSelection.title);
});

test("PUBLICADA continua a ser uma fonte e a seleção sobrevive entre tabs por sessionStorage", () => {
  const withNew = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    newsroomSelection,
    () => keyOne,
  );
  const acrossTabs = selectMesaMaterial(withNew, publishedSelection, () => keyTwo);
  const restored = readMesaPreparationBuffer(writeMesaPreparationBuffer(acrossTabs));

  assert.deepEqual(restored.sources, [newsroomSelection, publishedSelection]);
  assert.equal(restored.sources[1]?.newsroomArticleId, publishedSourceId);
  assert.equal(restored.sources[1]?.newsroomSnapshotId, publishedSnapshotId);
  assert.equal(restored.preparationKey, keyTwo);
});

test("PREPARAR vazio é recusado e NOVAS/PUBLICADAS enviam os snapshots das fontes", () => {
  assert.equal(mesaPreparationPayload(EMPTY_MESA_PREPARATION_BUFFER), null);

  const newOnly = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    newsroomSelection,
    () => keyOne,
  );
  const publishedOnly = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    publishedSelection,
    () => keyOne,
  );
  const mixed = selectMesaMaterial(newOnly, publishedSelection, () => keyTwo);

  assert.deepEqual(mesaPreparationPayload(newOnly)?.sources, [{
    newsroomArticleId: sourceId,
    newsroomSnapshotId: snapshotId,
  }]);
  assert.deepEqual(mesaPreparationPayload(newOnly)?.publishedContextArticleIds, []);
  assert.deepEqual(mesaPreparationPayload(publishedOnly)?.sources, [{
    newsroomArticleId: publishedSourceId,
    newsroomSnapshotId: publishedSnapshotId,
  }]);
  assert.deepEqual(mesaPreparationPayload(publishedOnly)?.publishedContextArticleIds, []);
  assert.equal(mesaPreparationPayload(mixed)?.sources[0]?.newsroomSnapshotId, snapshotId);
  assert.equal(mesaPreparationPayload(mixed)?.sources[1]?.newsroomSnapshotId, publishedSnapshotId);
  assert.deepEqual(mesaPreparationPayload(mixed)?.publishedContextArticleIds, []);
});

test("POR CLASSIFICAR conserva checkbox/seleção neutra e pode seguir para o Article Plan", () => {
  const unclassified = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    { ...newsroomSelection, classificationKey: null },
    () => keyOne,
  );
  assert.equal(unclassified.sources.length, 1);
  assert.equal(unclassified.sources[0]?.classificationKey, null);
  assert.equal(
    mesaPreparationPayload(unclassified)?.sources[0]?.newsroomArticleId,
    sourceId,
  );

  const page = read("app/admin/editorial/redacao-automatica/mesa/page.tsx")
    + read("app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx");
  assert.match(page, /MesaSourceItem|MesaSelectionToggle/);
  assert.match(
    client,
    /const selectionBlocked = missingSnapshotCount > 0 \|\| !payload/,
  );
  assert.doesNotMatch(client, /Resolve as fontes POR CLASSIFICAR antes de preparar/);
  assert.match(client, /\|\| selectionBlocked/);
});

test("fonte incompleta conserva checkbox neutra e só bloqueia o payload de produção", () => {
  const incomplete = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    { ...newsroomSelection, newsroomSnapshotId: null },
    () => keyOne,
  );
  assert.equal(incomplete.sources.length, 1);
  assert.equal(incomplete.sources[0]?.newsroomSnapshotId, null);
  assert.equal(mesaPreparationPayload(incomplete), null);
  const enriched = selectMesaMaterial(incomplete, newsroomSelection, () => keyTwo);
  assert.equal(enriched.preparationKey, keyTwo);
  assert.equal(mesaPreparationPayload(enriched)?.sources[0]?.newsroomSnapshotId, snapshotId);

  const page = read("app/admin/editorial/redacao-automatica/mesa/page.tsx")
    + read("app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx");
  assert.match(page, /newsroomSnapshotId: usableSnapshot\?\.id \?\? null/);
  assert.match(client, /missingSnapshotCount > 0/);
  assert.match(client, /sem snapshot elegível/);
});

test("retry sem mutação mantém key; título, seleção e remoção criam payload novo", () => {
  const selected = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    newsroomSelection,
    () => keyOne,
  );
  const firstAttempt = mesaPreparationPayload(selected);
  const retry = mesaPreparationPayload(selected);
  assert.equal(retry?.preparationKey, firstAttempt?.preparationKey);

  const retitled = changeMesaPreparationTitle(selected, "Outro título", () => keyTwo);
  assert.equal(retitled.preparationKey, keyTwo);

  const mixed = selectMesaMaterial(retitled, publishedSelection, () => keyThree);
  assert.equal(mixed.preparationKey, keyThree);

  const removed = removeMesaMaterial(
    mixed,
    publishedSourceId,
    () => keyOne,
  );
  assert.equal(removed.preparationKey, keyOne);
});

test("buffer só é limpo explicitamente depois do sucesso", () => {
  const selected = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    newsroomSelection,
    () => keyOne,
  );
  assert.equal(selected.sources.length, 1);
  assert.deepEqual(clearMesaPreparationBuffer(), EMPTY_MESA_PREPARATION_BUFFER);

  const client = read("app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx");
  const prepare = client.slice(
    client.indexOf("async function prepare()"),
    client.indexOf("return (", client.indexOf("async function prepare()")),
  );
  const failedResponse = prepare.indexOf("if (!response.ok");
  const clearAfterSuccess = prepare.indexOf("window.sessionStorage.removeItem");
  const errorHandler = prepare.indexOf("} catch (error)");
  assert.ok(failedResponse >= 0 && failedResponse < clearAfterSuccess);
  assert.ok(clearAfterSuccess < errorHandler);
  assert.doesNotMatch(prepare.slice(errorHandler), /sessionStorage\.removeItem/);
});

test("PREPARAR chama só o serviço foundation com snapshot explícito e expõe conflito", () => {
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts");
  assert.match(route, /prepareEditorialDossierWorkspace\(input\)/);
  assert.match(route, /newsroomSnapshotId/);
  assert.match(route, /preparation_conflict/);
  assert.match(route, /status:\s*errorStatus/);
  assert.doesNotMatch(route, /latest|createEditorialDossierArticlePlan|editorial_article|Source Package|OpenAI|generation/i);
});

test("workspace recompõe material, PUBLICADAS, planos e imagens só por readers persistentes", () => {
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.match(page, /loadEditorialDossierProduction\(dossierId/);
  assert.doesNotMatch(page, /getEditorialDossierById|listEditorialDossierArticlePlans|getEditorialDossierProductionWorkspace/);
  assert.match(route, /newsroomSnapshotId:\s*source\.newsroomSnapshotId/);
  assert.match(page, /if \(!productionResult\.ok\) return <ReadError/);
  assert.match(route, /loadEditorialDossierProduction\(dossierId/);
  assert.match(page, /images=\{production\.images\}/);
  assert.match(page, /publishedContexts=\{production\.publishedContexts\}/);
  assert.doesNotMatch(page, /sessionStorage|localStorage/);
});

test("Produção mantém o total global e limita cada output 2C ao contexto escolhido", () => {
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");

  assert.match(page, /context\?\.selectionPayload/);
  assert.match(client, /Artigos a produzir/);
  assert.match(client, /aria-label="Número total de artigos a produzir"/);
  assert.doesNotMatch(client, /Distribuição da produção|NucleusIdentity|nucleusId|Artigos para /);
  assert.doesNotMatch(page, /buildNuclei|WorkspaceNucleus/);
  assert.match(client, /action:\s*"save_article_plans_batch"/);
  assert.match(client, /const outputs = visibleCards\.map/);
  assert.doesNotMatch(client, /action:\s*"update_output_count"/);
  assert.doesNotMatch(client, />Prioridade</);
  assert.match(client, /priority:\s*card\.position/);
  assert.match(route, /workingTitle,\s*status:\s*"planned"/);
  assert.match(route, /status:\s*"planned"/);
  assert.match(route, /priority:\s*index \+ 1/);
  assert.match(route, /const technicalSources = productionContext/);
  assert.match(route, /articleGroup:\s*1/);
  assert.match(route, /sourceArticlePosition:\s*1/);
  assert.match(route, /sourceScope:\s*"workspace"/);
  assert.match(route, /sourceScope:\s*"context"/);
  assert.match(route, /contextSourceIds:\s*productionContext\.sources\.map/);
  assert.match(route, /synchronizeEditorialMesaSharedOutputs/);
  assert.doesNotMatch(route, /setEditorialMesaOutputOrigin|newsroom_mesa_output_origins/);
  assert.doesNotMatch(client, /activePlanCount\s*<\s*4/);
});

test("defaults visuais derivam da seleção sem voltar a distribuir fontes por output", () => {
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const defaults = read("lib/redacao-automatica/editorial-mesa-workspace-defaults.ts");

  assert.match(defaults, /const selectedNucleusCount = selectedSourceCount \+ selectedMaterialCount/);
  assert.match(page, /initialOutputCount:\s*production\.contextMode === "contexts"[\s\S]*?production\.productionContexts\.length[\s\S]*?editorialMesaWorkspaceInitialOutputCount\(/);
  assert.match(page, /visualSourceOrder=\{editorialMesaWorkspaceVisualSourceOrder\(/);
  assert.match(client, /activePlanCount > 0[\s\S]*?dossier\.initialOutputCount/);
  assert.match(client, /image\.origin === "newsroom"/);
  assert.match(client, /image\.frozenUrl\.trim\(\)/);
  assert.match(client, /newsroomImageByArticleId\.get\(source\.newsroomArticleId\)/);
  assert.match(client, /editorialMesaContextVisualSeedAssignments\(/);
  assert.match(client, /baseCards\.slice\(0, effectiveOutputCount\)/);
  assert.match(client, /productionContextId:\s*card\.productionContextId/);
  assert.match(client, /contextVisualSeedByOutputKey\.get\(card\.key\)/);
  assert.match(client, /: historicalVisualSeeds\[index\] \?\? null/);
  assert.doesNotMatch(client, /contextVisualSeedByOutputKey[\s\S]{0,400}visualSourceOrder/);
  assert.match(client, /Ponto de partida visual/);
  assert.match(client, /setEditableCardCapacity\(\(current\) => Math\.max\(current, next\)\)/);
  assert.match(client, /hidden=\{card\.position > effectiveOutputCount\}/);
  assert.doesNotMatch(client, /Distribuição da produção|quantidade por fonte|Artigos para /i);
  assert.match(route, /sources:\s*technicalSources\.map/);
  assert.match(route, /sourceScope:\s*"workspace"/);
  assert.match(route, /sourceScope:\s*"context"/);
  assert.match(route, /editorialMesaWorkspaceStartingPointSourceIds\(/);
  assert.match(route, /startingPointSourceId:\s*startingPointSourceIds\[index\]/);
  assert.doesNotMatch(route, /startingPointSourceId:\s*selectedSourceImage/);
});

test("defaults textuais seguem o ponto de partida sem dar nome editorial ao lote", () => {
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const publication = read("app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");

  assert.match(route, /const focusStartingPointSourceId = continuitySlot && "focusSourceIds" in continuitySlot/);
  assert.match(route, /const startingPointSourceId = focusStartingPointSourceId \?\? defaultStartingPointSourceIds\[priority - 1\]/);
  assert.match(route, /editorialMesaWorkspaceOutputWorkingTitle\(\s*priority,\s*startingPointSourceId/);
  assert.match(route, /context\?\.materialRefs,[\s\S]*?technicalSources\.map[\s\S]*?\),\s*priority,\s*\)/);
  assert.match(route, /editorialMesaWorkspaceOutputWorkingTitle\(\s*index \+ 1,\s*startingPointSourceIds\[index\]/);
  assert.match(route, /focus:\s*\(plan\.editorialInstructions \|\| outputWorkingTitle\)/);
  assert.match(route, /workingTitle:\s*outputWorkingTitle/);
  assert.match(route, /suggestedTitle:\s*workspaceContractVersion === 2 \? null : dossier\.title/);
  assert.match(route, /sources:\s*technicalSources\.map/);
  assert.doesNotMatch(page, /<small>\{dossier\.title\}<\/small>/);
  assert.doesNotMatch(
    page + client + publication,
    /Nome do lote|Título da produção|<input[^>]+\bname=["'][^"']*(?:batch|production)[^"']*title/i,
  );
});

test("colar resposta Mesa v2 usa o package real, fica ready e abre Publicação em lote", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const publicationClient = read("app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx");
  const outputIds = [planOneId, planTwoId];
  const sourceIds = [sourceId, publishedSourceId];
  const sourcePackage = {
    year: "2026",
    month: "09",
    packageId: dossierId,
    batchContract: {
      manifestVersion: 5 as const,
      provenanceContract: "mesa-v2" as const,
      workspaceContractVersion: 2 as const,
      outputIds,
      sourceIds,
    },
  };
  const article = (position: number) => `[JORNADA_ARTIGO_V1]
OUTPUT_ID
${outputIds[position - 1]}
FONTES_UTILIZADAS
${sourceIds[position - 1]}
ANTETÍTULO
Liga Portugal
TÍTULO
Artigo ${position}
PÓS-TÍTULO
Pós-título ${position}.
CORPO
Corpo ${position}.
[/JORNADA_ARTIGO_V1]`;
  const valid = `${article(1)}\n${article(2)}`;

  const preflight = preflightEditorialArticleBatchForSourcePackage(valid, sourcePackage);
  assert.equal(preflight.ready, true);
  assert.equal(preflight.total, 2);
  assert.deepEqual(preflight.articles.map((item) => item.outputId), outputIds);
  assert.equal(
    preflightEditorialArticleBatchForSourcePackage(
      valid.replace(`OUTPUT_ID\n${outputIds[0]}\n`, ""),
      sourcePackage,
    ).ready,
    false,
  );
  assert.equal(
    preflightEditorialArticleBatchForSourcePackage(
      valid.replace(`FONTES_UTILIZADAS\n${sourceIds[0]}\n`, ""),
      sourcePackage,
    ).ready,
    false,
  );

  const importStart = client.indexOf("  async function importText(text: string)");
  const importEnd = client.indexOf("\n  function importPastedResponse", importStart);
  const importSource = client.slice(importStart, importEnd);
  assert.ok(importStart >= 0 && importEnd > importStart);
  assert.match(importSource, /const value = await ensurePackage\(\)/);
  assert.match(importSource, /preflightEditorialArticleBatchForSourcePackage\(\s*text,\s*value\.sourcePackage/);
  assert.match(importSource, /if \(!preflight\.ready\)/);
  assert.match(importSource, /EDITORIAL_BATCH_TRANSFER_STORAGE_KEY/);
  assert.match(importSource, /window\.location\.assign\("\/admin\/editorial\/redacao-automatica\/publicacao-lote"\)/);
  assert.match(route, /editorialMesaPackageBatchContract\(manifest\)/);
  assert.match(route, /batchContract:\s*packageBatchContract\.value/);
  assert.match(publicationClient, /preflightEditorialArticleBatchForSourcePackage\(articleText, sourcePackage\)/);
});

test("Produção herda a tipografia da Jornada e não introduz gradientes", () => {
  const css = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/workspace.module.css");
  assert.doesNotMatch(css, /linear-gradient\(/);
  assert.doesNotMatch(css, /font-family:\s*Arial|Helvetica/);
});

test("Mesa apresenta apenas TEMAS e uniformiza NOVAS/PUBLICADAS no desktop", () => {
  const organization = read("app/admin/editorial/redacao-automatica/mesa/_mesa-organization-client.tsx");
  const theme = read("app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/page.tsx");
  const css = read("app/admin/editorial/redacao-automatica/mesa/mesa.module.css");
  assert.match(organization, />TEMAS<\/button>/);
  assert.doesNotMatch(organization, />DOSSIÊS<\/button>/);
  assert.doesNotMatch(organization + theme, /PRODUÇÕES|preparedProductions|Produção preparada/);
  assert.match(
    css,
    /\.sourcePanel:is\(\[data-lifecycle="new"\], \[data-lifecycle="published"\], \[data-lifecycle="archive"\]\) \.sourceGrid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 1260px\)[\s\S]*?\.sourcePanel:is\(\[data-lifecycle="new"\], \[data-lifecycle="published"\], \[data-lifecycle="archive"\]\) \.sourceGrid \{\s*grid-template-columns: 1fr/,
  );
});

test("layout compacto conserva o histórico, acrescenta Contexto e tem breakpoint para 390 px", () => {
  const css = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/workspace.module.css");
  assert.match(css, /\.planEditor \{[\s\S]*?grid-template-columns: minmax\(360px, 1\.6fr\) minmax\(390px, 1fr\)/);
  assert.match(css, /\.planEditor \.planFields \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(130px, 1fr\)\)/);
  assert.match(css, /\.planEditor \.planFields\[data-context-mode="contexts"\] \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(90px, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 440px\)[\s\S]*?\.planEditor \.planFields \{\s*grid-template-columns: 1fr/);
});

test("banco comum reúne origens e upload reutiliza signer e writer da foundation", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const imageBank = read("app/admin/editorial/redacao-automatica/_dossierImageBank.tsx");
  const imageChoice = read("app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.match(client, /image\.origin === "upload"/);
  assert.match(client, /image\.origin === "newsroom"/);
  assert.match(client, /PUBLICADA/);
  assert.match(client, /\/api\/admin\/editorial\/artigos\/upload-image\/sign/);
  assert.match(imageBank, /method:\s*"PUT"/);
  assert.match(imageBank, /action:\s*"register_upload_image"/);
  assert.match(route, /addEditorialDossierUploadImage/);
  assert.match(route, /const storageBucket = textValue\(payload\?\.bucket\)/);
  assert.match(route, /image:\s*\{[\s\S]*?origin:\s*"upload"/);
  assert.match(imageBank, /onRegisteredImage\(await registerUpload\(registration\)\)/);
  assert.doesNotMatch(client, /router\.refresh\(\)/);
  assert.match(imageBank, /function openDossierImageBank\(panelId: string\)/);
  assert.match(imageBank, /panel\.open = true/);
  assert.match(imageBank, /if \(input && !input\.disabled\) input\.click\(\)/);
  assert.match(imageBank, /<details id=\{panelId\} className=\{styles\.imageBankPanel\}>/);
  assert.match(
    imageChoice,
    /<button[\s\S]*?className=\{styles\.addImageChoice\}[\s\S]*?type="button"[\s\S]*?aria-controls=\{addImageControls\}[\s\S]*?onClick=\{onAddImage\}/,
  );
  assert.doesNotMatch(client, /<a className=\{styles\.addImageChoice\} href="#workspace-images-title">/);
});

test("slots congelados são a autoridade imediata da contagem depois da materialização", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");

  assert.match(client, /const effectiveOutputCount = frozenSlots\?\.length \?\? editableOutputCount/);
  assert.match(client, /const effectiveCardCapacity = frozenSlots\?\.length \?\? editableCardCapacity/);
  assert.match(client, /Array\.from\(\{ length: effectiveCardCapacity \}/);
  assert.match(client, /const visibleCards = cards\.slice\(0, effectiveOutputCount\)/);
  assert.match(client, /value=\{effectiveOutputCount\}/);
  assert.match(client, /outputCount: effectiveOutputCount/);
  assert.match(client, /articleCount=\{effectiveOutputCount\}/);
  assert.doesNotMatch(client, /useEffect\([\s\S]{0,300}setEditableOutputCount/);
});

test("cada cartão prioriza imagens do seu ponto de partida sem fechar o banco global", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const imageChoice = read("app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx");

  assert.match(client, /"focusSourceIds" in continuitySlot/);
  assert.match(client, /editorialMesaContextualImages\(images, focusSourceIds, selectedImage\)/);
  assert.match(client, /legend="Imagens deste artigo"/);
  assert.match(client, /images=\{displayedImages\.map/);
  assert.match(client, /Não há imagens diretamente ligadas ao ponto de partida deste artigo\./);
  assert.match(client, /"Ver todas as imagens"/);
  assert.match(client, /"Mostrar imagens deste artigo"/);
  assert.match(client, /allowPreservePublished=\{destination === "update"\}/);
  assert.match(client, /images=\{workspaceImages\.map/);
  assert.match(imageChoice, /legend = "Imagem"/);
  assert.match(imageChoice, /<legend>\{legend\}<\/legend>/);
});

test("Article Plans aceitam apenas uma sugestão opcional antes da decisão final", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const imageChoice = read("app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.doesNotMatch(client, /Mais opções|Título de trabalho|Fontes concretas do Dossiê|PUBLICADAS usadas como contexto/);
  assert.doesNotMatch(client, /name=\{planField\(cardKey, "status"\)\}|name=\{planField\(cardKey, "source"\)\}/);
  assert.match(client, /Foco editorial/);
  assert.match(client, /Género/);
  assert.match(client, /Extensão/);
  assert.match(client, /Destino/);
  assert.match(client, /Sugestão de classificação \(opcional\)/);
  assert.match(client, /A classificação final é confirmada na Publicação em lote\./);
  assert.match(client, /Limpar sugestão/);
  assert.match(client, /ARTICLE_CLASSIFICATIONS\.map/);
  assert.match(client, /name=\{planField\(cardKey, "classification_key"\)\}/);
  assert.doesNotMatch(client, /classificationTouchedRef|articlePlanClassificationDefault/);
  assert.match(client, /<option value="update" disabled=\{eligibleTargets\.length === 0\}>/);
  assert.match(client, /Record<"new" \| "update", string \| null>/);
  assert.match(client, /editorialMesaResolvedVisualImageChoice\(\s*imageChoices\[destination\]/);
  assert.match(client, /imageChoices\[destination\] === null/);
  assert.match(imageChoice, /MANTER IMAGEM PUBLICADA/);
  assert.match(client, /destination === "update"/);
  assert.match(route, /const contexts = workspace\.publishedContexts\.filter/);
  assert.match(route, /sources:\s*technicalSources\.map/);
  assert.match(route, /destination === "new" && rawTarget !== null/);
  assert.match(route, /destination === "update" && !target/);
  assert.match(route, /destination === "new" && selectedImage\.mode === "preserve_published"/);
});

test("Produção não mostra material/contexto técnico e permite abandono ao nível do workspace", () => {
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.doesNotMatch(page + client, /MATERIAL E CONTEXTO DA PRODUÇÃO/);
  assert.match(client, /Abandonar produção/);
  assert.match(route, /action === "preview_abandon" \|\| action === "abandon_production"/);
  assert.match(route, /newsroom_preview_abandon_mesa_production_v2/);
  assert.match(route, /newsroom_abandon_mesa_production_v2/);
});

test("guardar plano não chama circuito legacy de draft, IA ou Package", () => {
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const service = read("lib/redacao-automatica/editorial-dossier-workspace-editor-service.ts");
  const combined = `${route}\n${service}`;
  assert.match(combined, /saveEditorialDossierArticlePlan/);
  assert.match(combined, /saveEditorialDossierArticlePlanState/);
  assert.doesNotMatch(combined, /createEditorialDossierArticlePlanDraft|generateEditorialDossierArticlePlanDraftBody|prepareEditorialCompose|Source Package|OpenAI|generation/i);
});

function workspacePlanInput(planId: string | null): SaveEditorialDossierWorkspaceArticlePlanInput {
  return {
    plan: {
      dossierId,
      articlePlanId: planId,
      workingTitle: "Plano coerente",
      status: "planned",
      priority: 1,
      articleKind: "news",
      lengthMode: "standard",
      editorialInstructions: "",
      sources: [{ dossierSourceId: sourceId, priority: 1 }],
    },
    production: {
      destination: "update",
      updateTargetEditorialArticleId: publishedId,
      dossierPublishedContextIds: [contextId],
      imageChoice: { mode: "dossier_image", dossierImageId: imageId },
      classificationKey: "benfica",
    },
  };
}

test("writer controla ordem das duas famílias e torna falha parcial explícita", async () => {
  const calls: string[] = [];
  const transport: EditorialDossierWorkspaceArticlePlanTransport = {
    savePlan: async () => {
      calls.push("plan");
      return {
        ok: true,
        value: {
          dossierId,
          articlePlanId: planOneId,
          created: true,
          status: "planned",
          previousStatus: null,
          sourceCount: 1,
        },
      };
    },
    saveProductionState: async () => {
      calls.push("production");
      return {
        ok: false,
        error: {
          code: "article_plan_state_save_failed",
          message: "Falhou o estado de produção.",
        },
      };
    },
  };

  const result = await saveEditorialDossierWorkspaceArticlePlanService(transport)(
    workspacePlanInput(null),
  );
  assert.deepEqual(calls, ["plan", "production"]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.partialPersistence, true);
    assert.equal(result.error.articlePlanId, planOneId);
  }
});

test("mesma dossier image pode ser escolhida por dois planos sem consumo", async () => {
  const savedStates: SaveEditorialDossierWorkspaceArticlePlanInput["production"][] = [];
  const transport: EditorialDossierWorkspaceArticlePlanTransport = {
    savePlan: async (input) => ({
      ok: true,
      value: {
        dossierId,
        articlePlanId: input.articlePlanId!,
        created: false,
        status: input.status,
        previousStatus: input.status,
        sourceCount: input.sources.length,
      },
    }),
    saveProductionState: async (input) => {
      savedStates.push({
        destination: input.destination,
        updateTargetEditorialArticleId: input.updateTargetEditorialArticleId,
        dossierPublishedContextIds: input.dossierPublishedContextIds,
        imageChoice: input.imageChoice,
        classificationKey: input.classificationKey,
      });
      return {
        ok: true,
        value: {
          articlePlanId: input.articlePlanId,
          destination: input.destination,
          updateTargetEditorialArticleId: input.updateTargetEditorialArticleId,
          publishedContextCount: input.dossierPublishedContextIds.length,
          imageChoice: input.imageChoice,
          classificationKey: input.classificationKey,
        },
      };
    },
  };
  const save = saveEditorialDossierWorkspaceArticlePlanService(transport);

  const first = await save(workspacePlanInput(planOneId));
  const second = await save(workspacePlanInput(planTwoId));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(savedStates.map((state) => state.imageChoice), [
    { mode: "dossier_image", dossierImageId: imageId },
    { mode: "dossier_image", dossierImageId: imageId },
  ]);
});

test("uma fonte já usada por um plano permanece disponível para outro", async () => {
  const payloads: string[][] = [];
  const transport: EditorialDossierArticlePlanTransport = {
    isConfigured: () => true,
    readDossierState: async () => ({
      dossierId,
      sources: [{ id: sourceId, included: true }],
      plans: [{
        id: planOneId,
        status: "planned",
        editorialArticleId: null,
        sources: [{ dossierSourceId: sourceId, sortOrder: 10 }],
      }],
    }),
    saveArticlePlan: async (payload) => {
      payloads.push([...payload.p_dossier_source_ids]);
      return planTwoId;
    },
  };

  const result = await saveEditorialDossierArticlePlanService(transport)({
    ...workspacePlanInput(null).plan,
    articlePlanId: null,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(payloads, [[sourceId]]);
});

test("reader do Dossiê usa snapshot e título congelados; refresh não depende do browser", () => {
  const repository = read("lib/redacao-automatica/editorial-dossier-repository.ts");
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  assert.match(repository, /title_snapshot,published_at_snapshot/);
  assert.match(repository, /frozenSnapshot\.article_id !== article\.id/);
  assert.match(repository, /snapshotBody:\s*readonly ArticleBodyBlock\[\]/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /window\.|sessionStorage|localStorage/);
});

test("rotas legacy continuam presentes e separadas do workspace da Mesa", () => {
  const legacyPage = read("app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx");
  const legacyRoute = read("app/api/admin/editorial/redacao-automatica/dossies/route.ts");
  const mesaPage = read("app/admin/editorial/redacao-automatica/mesa/page.tsx");
  assert.match(legacyPage, /save_article_plan/);
  assert.match(legacyRoute, /create_article_plan_draft/);
  assert.match(
    mesaPage,
    /loadMesaPageReadModel\(mesaPageReadModelInput\(query\)\)/,
  );
  assert.doesNotMatch(mesaPage, /loadOperationalDeskReadModel/);
  assert.match(mesaPage, /MesaSelectionProvider/);
});

test("package e publicação continuam a transportar a imagem persistida do respetivo output", () => {
  const workspaceRoute = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const packageInternal = read("lib/redacao-automatica/editorial-source-package-internal.ts");
  const publicationClient = read("app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx");
  const imageSelection = read("lib/redacao-automatica/editorial-batch-image-selection.ts");
  const publicationRoute = read("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");

  assert.match(workspaceRoute, /const selectedImage = plan\.imageChoice\.mode === "dossier_image"/);
  assert.match(workspaceRoute, /imageNewsroomArticleId:\s*selectedSourceImage/);
  assert.match(workspaceRoute, /externalImage \? \{ externalImage \} : \{\}/);
  assert.match(workspaceRoute, /image\.origin === "newsroom"[\s\S]*?newsroomArticleId: image\.newsroomArticleId/);
  assert.match(packageInternal, /outputs\.flatMap\([\s\S]*?output\.position[\s\S]*?output\.imageNewsroomArticleId/);
  assert.match(publicationClient, /editorialBatchOutputImage\(sourcePackage, article\.outputId\)/);
  assert.match(imageSelection, /image\.outputId === outputId[\s\S]*?image\.position === position \+ 1/);
  assert.match(publicationClient, /const imageByKey = new Map\(imagePreflight\.articles\.map/);
  assert.match(publicationClient, /publishPlannedItem\(planItem, article, imageUrl\)/);
  assert.match(publicationRoute, /const imageUrl = cleanText\(payload\.imageUrl\)/);
  assert.match(publicationRoute, /imageUrl:\s*imageUrl \|\| existing\?\.image_url \|\| null/);
});
