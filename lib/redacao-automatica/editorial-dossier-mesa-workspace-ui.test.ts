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

test("POR CLASSIFICAR conserva checkbox/seleção neutra mas bloqueia PREPARAR", () => {
  const unclassified = selectMesaMaterial(
    EMPTY_MESA_PREPARATION_BUFFER,
    { ...newsroomSelection, classificationKey: null },
    () => keyOne,
  );
  assert.equal(unclassified.sources.length, 1);
  assert.equal(unclassified.sources[0]?.classificationKey, null);
  assert.equal(mesaPreparationPayload(unclassified), null);

  const page = read("app/admin/editorial/redacao-automatica/mesa/page.tsx")
    + read("app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx");
  const client = read("app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx");
  assert.match(page, /<MesaSelectionToggle material=\{\{/);
  assert.match(
    client,
    /const selectionBlocked = unclassifiedCount > 0 \|\| missingSnapshotCount > 0/,
  );
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
  assert.match(page, /getEditorialDossierById\(dossierId\)/);
  assert.match(page, /listEditorialDossierArticlePlans\(dossierId\)/);
  assert.match(page, /getEditorialDossierProductionWorkspace\(dossierId\)/);
  assert.match(page, /source\.newsroomSnapshotId/);
  assert.match(page, /context\.editorialArticleId/);
  assert.match(page, /candidate\.origin === "newsroom"/);
  assert.match(page, /candidate\.origin === "published"/);
  assert.doesNotMatch(page, /sessionStorage|localStorage/);
});

test("banco comum reúne origens e upload reutiliza signer e writer da foundation", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.match(client, /image\.origin === "upload"/);
  assert.match(client, /image\.origin === "newsroom"/);
  assert.match(client, /PUBLICADA/);
  assert.match(client, /\/api\/admin\/editorial\/artigos\/upload-image\/sign/);
  assert.match(client, /method:\s*"PUT"/);
  assert.match(client, /action:\s*"register_upload_image"/);
  assert.match(route, /addEditorialDossierUploadImage/);
  assert.match(route, /storageBucket:\s*textValue\(payload\?\.bucket\)/);
});

test("Article Plans separam fontes, contextos, destino, target e decisão de imagem", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.match(client, /Fontes concretas do Dossiê/);
  assert.match(client, /A mesma fonte pode sustentar vários Article Plans/);
  assert.match(client, /PUBLICADAS usadas como contexto/);
  assert.match(client, /Esta seleção é independente do target de UPDATE/);
  assert.match(client, /UPDATE nunca é inferido/);
  assert.match(client, /MANTER IMAGEM PUBLICADA/);
  assert.match(client, /destination === "update"/);
  assert.match(route, /destination === "new" && rawTarget !== null/);
  assert.match(route, /destination === "update" && !target/);
  assert.match(route, /destination === "new" && selectedImage\.mode === "preserve_published"/);
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
      });
      return {
        ok: true,
        value: {
          articlePlanId: input.articlePlanId,
          destination: input.destination,
          updateTargetEditorialArticleId: input.updateTargetEditorialArticleId,
          publishedContextCount: input.dossierPublishedContextIds.length,
          imageChoice: input.imageChoice,
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
    /loadOperationalDeskReadModel\(\{[\s\S]*?\.\.\.mesaOperationalReadModelInput\(query\)/,
  );
  assert.match(mesaPage, /MesaSelectionProvider/);
});
