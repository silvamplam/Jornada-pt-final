import assert from "node:assert/strict";
import test from "node:test";

import {
  addEditorialDossierUploadImageService,
  prepareEditorialDossierWorkspaceService,
  saveEditorialDossierArticlePlanStateService,
  type AddEditorialDossierUploadImageRpcInput,
  type EditorialDossierProductionWorkspaceTransport,
  type PrepareEditorialDossierWorkspaceRpcInput,
  type SaveEditorialDossierArticlePlanStateRpcInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";

const dossierId = "00000000-0000-4000-8000-000000000001";
const planId = "00000000-0000-4000-8000-000000000002";
const sourceOneId = "00000000-0000-4000-8000-000000000011";
const snapshotOneId = "00000000-0000-4000-8000-000000000012";
const sourceTwoId = "00000000-0000-4000-8000-000000000013";
const snapshotTwoId = "00000000-0000-4000-8000-000000000014";
const publishedOneId = "00000000-0000-4000-8000-000000000021";
const publishedTwoId = "00000000-0000-4000-8000-000000000022";
const contextOneId = "00000000-0000-4000-8000-000000000031";
const contextTwoId = "00000000-0000-4000-8000-000000000032";
const imageId = "00000000-0000-4000-8000-000000000041";
const preparationKey = "00000000-0000-4000-8000-000000000051";
const supabaseUrl = "https://project.supabase.co";

function fakeTransport() {
  const preparePayloads: PrepareEditorialDossierWorkspaceRpcInput[] = [];
  const planPayloads: SaveEditorialDossierArticlePlanStateRpcInput[] = [];
  const uploadPayloads: AddEditorialDossierUploadImageRpcInput[] = [];
  const transport: EditorialDossierProductionWorkspaceTransport = {
    configuration: () => ({ supabaseUrl }),
    prepareWorkspace: async (payload) => {
      preparePayloads.push(payload);
      return {
        dossierId,
        preparationAction: "created",
        sourceCount: payload.p_newsroom_article_ids.length,
        publishedContextCount: payload.p_published_context_article_ids.length,
        imageCount: 3,
      };
    },
    saveArticlePlanState: async (payload) => {
      planPayloads.push(payload);
      return {
        articlePlanId: payload.p_article_plan_id,
        destination: payload.p_destination,
        updateTargetEditorialArticleId: payload.p_update_target_editorial_article_id,
        publishedContextCount: payload.p_published_context_ids.length,
        imageChoice: payload.p_image_choice === "dossier_image" && payload.p_dossier_image_id
          ? { mode: "dossier_image", dossierImageId: payload.p_dossier_image_id }
          : payload.p_image_choice === "preserve_published"
            ? { mode: "preserve_published" }
            : { mode: "unselected" },
      };
    },
    addUploadImage: async (payload) => {
      uploadPayloads.push(payload);
      return {
        dossierImageId: imageId,
        imageAction: "created",
        frozenUrl: payload.p_frozen_url,
      };
    },
  };
  return { transport, preparePayloads, planPayloads, uploadPayloads };
}

test("PREPARAR envia pares artigo/snapshot explícitos e PUBLICADAS pela ordem recebida", async () => {
  const fake = fakeTransport();
  const prepare = prepareEditorialDossierWorkspaceService(fake.transport);
  const result = await prepare({
    preparationKey,
    title: "  Dossiê preparado  ",
    sources: [
      { newsroomArticleId: sourceOneId, newsroomSnapshotId: snapshotOneId },
      { newsroomArticleId: sourceTwoId, newsroomSnapshotId: snapshotTwoId },
    ],
    publishedContextArticleIds: [publishedTwoId, publishedOneId],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(fake.preparePayloads, [{
    p_preparation_key: preparationKey,
    p_title: "Dossiê preparado",
    p_newsroom_article_ids: [sourceOneId, sourceTwoId],
    p_newsroom_snapshot_ids: [snapshotOneId, snapshotTwoId],
    p_published_context_article_ids: [publishedTwoId, publishedOneId],
  }]);
});

test("PREPARAR aceita só PUBLICADAS e rejeita vazio ou artigo repetido", async () => {
  const fake = fakeTransport();
  const prepare = prepareEditorialDossierWorkspaceService(fake.transport);
  const publishedOnly = await prepare({
    preparationKey,
    title: "Contexto publicado",
    sources: [],
    publishedContextArticleIds: [publishedOneId],
  });
  assert.equal(publishedOnly.ok, true);

  const empty = await prepare({
    preparationKey,
    title: "Sem material",
    sources: [],
    publishedContextArticleIds: [],
  });
  assert.equal(empty.ok, false);

  const duplicateSource = await prepare({
    preparationKey,
    title: "Fonte repetida",
    sources: [
      { newsroomArticleId: sourceOneId, newsroomSnapshotId: snapshotOneId },
      { newsroomArticleId: sourceOneId, newsroomSnapshotId: snapshotTwoId },
    ],
    publishedContextArticleIds: [],
  });
  assert.equal(duplicateSource.ok, false);
  assert.equal(fake.preparePayloads.length, 1);
});

test("PREPARAR expõe conflito quando a mesma chave representa outro pedido", async () => {
  const { transport } = fakeTransport();
  transport.prepareWorkspace = async () => {
    throw new Error("production_workspace_prepare_idempotency_conflict");
  };
  const service = prepareEditorialDossierWorkspaceService(transport);

  const result = await service({
    preparationKey,
    title: "Operação persistente",
    sources: [{ newsroomArticleId: sourceOneId, newsroomSnapshotId: snapshotOneId }],
    publishedContextArticleIds: [publishedOneId],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "preparation_conflict");
  }
});

test("plano UPDATE transporta target, 0/N contextos e uma imagem do Dossiê", async () => {
  const fake = fakeTransport();
  const save = saveEditorialDossierArticlePlanStateService(fake.transport);
  const result = await save({
    dossierId,
    articlePlanId: planId,
    destination: "update",
    updateTargetEditorialArticleId: publishedOneId,
    dossierPublishedContextIds: [contextOneId, contextTwoId],
    imageChoice: { mode: "dossier_image", dossierImageId: imageId },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(fake.planPayloads, [{
    p_dossier_id: dossierId,
    p_article_plan_id: planId,
    p_destination: "update",
    p_update_target_editorial_article_id: publishedOneId,
    p_published_context_ids: [contextOneId, contextTwoId],
    p_image_choice: "dossier_image",
    p_dossier_image_id: imageId,
  }]);
});

test("plano NEW não aceita target nem preserve_published", async () => {
  const fake = fakeTransport();
  const save = saveEditorialDossierArticlePlanStateService(fake.transport);
  const withTarget = await save({
    dossierId,
    articlePlanId: planId,
    destination: "new",
    updateTargetEditorialArticleId: publishedOneId,
    dossierPublishedContextIds: [],
    imageChoice: { mode: "unselected" },
  });
  const preserve = await save({
    dossierId,
    articlePlanId: planId,
    destination: "new",
    updateTargetEditorialArticleId: null,
    dossierPublishedContextIds: [],
    imageChoice: { mode: "preserve_published" },
  });

  assert.equal(withTarget.ok, false);
  assert.equal(preserve.ok, false);
  assert.equal(fake.planPayloads.length, 0);
});

test("plano UPDATE exige target e contextos não podem repetir", async () => {
  const fake = fakeTransport();
  const save = saveEditorialDossierArticlePlanStateService(fake.transport);
  const withoutTarget = await save({
    dossierId,
    articlePlanId: planId,
    destination: "update",
    updateTargetEditorialArticleId: null,
    dossierPublishedContextIds: [],
    imageChoice: { mode: "unselected" },
  });
  const duplicateContext = await save({
    dossierId,
    articlePlanId: planId,
    destination: "update",
    updateTargetEditorialArticleId: publishedOneId,
    dossierPublishedContextIds: [contextOneId, contextOneId],
    imageChoice: { mode: "preserve_published" },
  });

  assert.equal(withoutTarget.ok, false);
  assert.equal(duplicateContext.ok, false);
  assert.equal(fake.planPayloads.length, 0);
});

test("resposta real do signer guarda publicUrl e identidade sem atribuir a plano", async () => {
  const fake = fakeTransport();
  const addUpload = addEditorialDossierUploadImageService(fake.transport);
  const signerResponse = {
    bucket: "editorial-images",
    path: "editorial/2026/09/image.jpg",
    publicUrl: `${supabaseUrl}/storage/v1/object/public/editorial-images/editorial/2026/09/image.jpg`,
  };
  const result = await addUpload({
    dossierId,
    frozenUrl: ` ${signerResponse.publicUrl} `,
    storageBucket: ` ${signerResponse.bucket} `,
    storagePath: ` ${signerResponse.path} `,
    fileName: " image.jpg ",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(fake.uploadPayloads, [{
    p_dossier_id: dossierId,
    p_frozen_url: signerResponse.publicUrl,
    p_storage_bucket: "editorial-images",
    p_storage_path: signerResponse.path,
    p_file_name: "image.jpg",
  }]);
});

test("upload rejeita bucket diferente do signer oficial", async () => {
  const fake = fakeTransport();
  const result = await addEditorialDossierUploadImageService(fake.transport)({
    dossierId,
    frozenUrl: `${supabaseUrl}/storage/v1/object/public/outro-bucket/editorial/image.jpg`,
    storageBucket: "outro-bucket",
    storagePath: "editorial/image.jpg",
    fileName: "image.jpg",
  });

  assert.equal(result.ok, false);
  assert.equal(fake.uploadPayloads.length, 0);
});

test("upload rejeita publicUrl incompatível com bucket e path", async () => {
  const fake = fakeTransport();
  const result = await addEditorialDossierUploadImageService(fake.transport)({
    dossierId,
    frozenUrl: `${supabaseUrl}/storage/v1/object/public/editorial-images/editorial/outra.jpg`,
    storageBucket: "editorial-images",
    storagePath: "editorial/image.jpg",
    fileName: "image.jpg",
  });

  assert.equal(result.ok, false);
  assert.equal(fake.uploadPayloads.length, 0);
});

test("serviço indisponível não executa qualquer writer", async () => {
  const fake = fakeTransport();
  fake.transport.configuration = () => null;
  const result = await prepareEditorialDossierWorkspaceService(fake.transport)({
    preparationKey,
    title: "Dossiê",
    sources: [{ newsroomArticleId: sourceOneId, newsroomSnapshotId: snapshotOneId }],
    publishedContextArticleIds: [],
  });

  assert.equal(result.ok, false);
  assert.equal(fake.preparePayloads.length, 0);
  assert.equal(fake.planPayloads.length, 0);
  assert.equal(fake.uploadPayloads.length, 0);
});
