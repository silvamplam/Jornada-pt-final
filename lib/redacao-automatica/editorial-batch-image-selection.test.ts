import assert from "node:assert/strict";
import test from "node:test";

import { preflightEditorialBatchImages } from "./editorial-batch-image-preflight";
import {
  editorialBatchInitialImageChoice,
  editorialBatchDossierImages,
  editorialBatchOutputImage,
  withEditorialBatchOutputImageChoice,
} from "./editorial-batch-image-selection";
import { editorialMesaContextualImages } from "./editorial-mesa-workspace-images";
import {
  parseEditorialBatchTransferSourcePackage,
  type EditorialBatchTransferSourcePackage,
} from "./editorial-batch-transfer";

const OUTPUT_1 = "11111111-1111-4111-8111-111111111111";
const OUTPUT_2 = "22222222-2222-4222-8222-222222222222";
const SOURCE_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IMAGE_X = "33333333-3333-4333-8333-333333333333";
const IMAGE_Y = "44444444-4444-4444-8444-444444444444";
const IMAGE_Z = "55555555-5555-4555-8555-555555555555";
const SOURCE_A_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const SOURCE_A_3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac";
const SOURCE_B_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const SOURCE_B_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const SOURCE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOURCE_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function sourcePackage(): EditorialBatchTransferSourcePackage {
  return {
    year: "2026",
    month: "09",
    packageId: "66666666-6666-4666-8666-666666666666",
    dossierId: "77777777-7777-4777-8777-777777777777",
    batchContract: {
      manifestVersion: 5,
      provenanceContract: "mesa-v2",
      workspaceContractVersion: 2,
      outputIds: [OUTPUT_1, OUTPUT_2],
      sourceIds: [SOURCE_1],
      sourceIdsByOutput: { [OUTPUT_1]: [SOURCE_1], [OUTPUT_2]: [SOURCE_1] },
    },
    dossierImages: [
      { id: IMAGE_X, imageUrl: "https://images.example/x.jpg", label: "Imagem X" },
      { id: IMAGE_Y, imageUrl: "https://images.example/y.jpg", label: "Imagem Y" },
      { id: IMAGE_Z, imageUrl: "https://images.example/z.jpg", label: "Imagem Z" },
    ],
    outputImages: [
      {
        position: 1,
        outputId: OUTPUT_1,
        dossierImageId: IMAGE_X,
        imageUrl: "https://images.example/x.jpg",
        label: "Imagem X",
      },
      {
        position: 2,
        outputId: OUTPUT_2,
        dossierImageId: IMAGE_Y,
        imageUrl: "https://images.example/y.jpg",
        label: "Imagem Y",
      },
    ],
  };
}

test("a imagem escolhida na Produção chega selecionada por outputId e entra no preflight sem interação", () => {
  const transferred = parseEditorialBatchTransferSourcePackage(JSON.stringify(sourcePackage()));
  assert.ok(transferred);
  assert.equal(
    editorialBatchInitialImageChoice(transferred, OUTPUT_1, false),
    `dossier_image:${IMAGE_X}`,
  );

  const imageX = editorialBatchOutputImage(transferred, OUTPUT_1);
  const imageY = editorialBatchOutputImage(transferred, OUTPUT_2);
  const preflight = preflightEditorialBatchImages(
    ["NEW_01", "NEW_02"],
    [],
    [
      { key: "NEW_01", imageUrl: imageX!.imageUrl, fileName: imageX!.label },
      { key: "NEW_02", imageUrl: imageY!.imageUrl, fileName: imageY!.label },
    ],
    [],
  );
  assert.equal(preflight.ready, true);
  assert.equal(preflight.articles[0]?.imageUrl, "https://images.example/x.jpg");

  const changed = withEditorialBatchOutputImageChoice(transferred, OUTPUT_2, IMAGE_Z);
  assert.equal(editorialBatchOutputImage(changed, OUTPUT_1)?.dossierImageId, IMAGE_X);
  assert.equal(editorialBatchOutputImage(changed, OUTPUT_1)?.imageUrl, "https://images.example/x.jpg");
  assert.equal(editorialBatchOutputImage(changed, OUTPUT_2)?.dossierImageId, IMAGE_Z);
});

test("seis artigos de três contextos mantêm escolhas independentes por outputId", () => {
  const outputIds = Array.from({ length: 6 }, (_, index) => (
    `${index + 1}0000000-0000-4000-8000-00000000000${index + 1}`
  ));
  const imageIds = Array.from({ length: 9 }, (_, index) => (
    `${index + 1}9999999-9999-4999-8999-99999999999${index + 1}`
  ));
  const transfer: EditorialBatchTransferSourcePackage = {
    ...sourcePackage(),
    batchContract: {
      ...sourcePackage().batchContract!,
      outputIds,
      sourceIdsByOutput: Object.fromEntries(outputIds.map((outputId) => [outputId, [SOURCE_1]])),
    },
    dossierImages: imageIds.map((id, index) => ({
      id,
      imageUrl: `https://images.example/${index + 1}.jpg`,
      label: `Imagem ${index + 1}`,
    })),
    outputImages: outputIds.map((outputId, index) => ({
      position: index + 1,
      outputId,
      dossierImageId: imageIds[index],
      imageUrl: `https://images.example/${index + 1}.jpg`,
      label: `Imagem ${index + 1}`,
    })),
  };

  const changed1 = withEditorialBatchOutputImageChoice(transfer, outputIds[0], imageIds[6]);
  const changed3 = withEditorialBatchOutputImageChoice(changed1, outputIds[2], imageIds[7]);
  const changed6 = withEditorialBatchOutputImageChoice(changed3, outputIds[5], imageIds[8]);
  const expected = [7, 2, 8, 4, 5, 9].map((number) => `https://images.example/${number}.jpg`);
  assert.deepEqual(
    outputIds.map((outputId) => editorialBatchOutputImage(changed6, outputId)?.imageUrl),
    expected,
  );

  const preflight = preflightEditorialBatchImages(
    outputIds.map((_, index) => `NEW_0${index + 1}`),
    [],
    outputIds.map((outputId, index) => {
      const image = editorialBatchOutputImage(changed6, outputId)!;
      return { key: `NEW_0${index + 1}`, imageUrl: image.imageUrl, fileName: image.label };
    }),
    [],
  );
  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.articles.map((article) => article.imageUrl), expected);
  assert.deepEqual(
    parseEditorialBatchTransferSourcePackage(JSON.stringify(changed6))?.outputImages?.map((image) => image.outputId),
    outputIds,
  );
});

test("Publicação em lote contextualiza Tema A, Tema B, solto e grupo sem restringir o banco", () => {
  const contextual = [
    ["a1", SOURCE_1],
    ["a2", SOURCE_A_2],
    ["a3", SOURCE_A_3],
    ["b1", SOURCE_B_1],
    ["b2", SOURCE_B_2],
    ["c1", SOURCE_C],
    ["d1", SOURCE_D],
  ].map(([suffix, newsroomArticleId], index) => ({
    id: `${index + 1}6000000-0000-4000-8000-00000000000${index + 1}`,
    imageUrl: `https://images.example/${suffix}.jpg`,
    label: `Imagem ${suffix}`,
    newsroomArticleId,
  }));
  const transfer: EditorialBatchTransferSourcePackage = {
    ...sourcePackage(),
    dossierImages: contextual,
  };
  const images = editorialBatchDossierImages(transfer);

  assert.deepEqual(
    editorialMesaContextualImages(images, [SOURCE_1, SOURCE_A_2, SOURCE_A_3], "unselected")
      .images.map((image) => image.label),
    ["Imagem a1", "Imagem a2", "Imagem a3"],
  );
  assert.deepEqual(
    editorialMesaContextualImages(images, [SOURCE_B_1, SOURCE_B_2], "unselected")
      .images.map((image) => image.label),
    ["Imagem b1", "Imagem b2"],
  );
  assert.deepEqual(
    editorialMesaContextualImages(images, [SOURCE_C], "unselected")
      .images.map((image) => image.label),
    ["Imagem c1"],
  );
  const grouped = editorialMesaContextualImages(images, [SOURCE_C, SOURCE_D], "unselected");
  assert.deepEqual(grouped.images.map((image) => image.label), ["Imagem c1", "Imagem d1"]);
  assert.equal(grouped.allImages.length, 7, "Ver todas conserva A+B+C+D");
});

test("imagem global escolhida permanece visível, selecionada e estável após reload do pacote", () => {
  const transfer: EditorialBatchTransferSourcePackage = {
    ...sourcePackage(),
    dossierImages: [
      { ...sourcePackage().dossierImages![0], newsroomArticleId: SOURCE_1 },
      { ...sourcePackage().dossierImages![1], newsroomArticleId: SOURCE_B_2 },
    ],
  };
  const changed = withEditorialBatchOutputImageChoice(transfer, OUTPUT_1, IMAGE_Y);
  const reloaded = parseEditorialBatchTransferSourcePackage(JSON.stringify(changed));
  assert.ok(reloaded);
  const selectedChoice = editorialBatchInitialImageChoice(reloaded, OUTPUT_1, false);
  const result = editorialMesaContextualImages(
    editorialBatchDossierImages(reloaded),
    [SOURCE_1],
    selectedChoice,
  );

  assert.equal(selectedChoice, `dossier_image:${IMAGE_Y}`);
  assert.deepEqual(result.images.map((image) => image.id), [IMAGE_X, IMAGE_Y]);
  assert.equal(result.relevantCount, 1);
});

test("sem correspondência contextual o banco não é apresentado como equivalente, mas continua acessível", () => {
  const images = editorialBatchDossierImages(sourcePackage());
  const result = editorialMesaContextualImages(images, [SOURCE_D], "unselected");

  assert.equal(result.relevantCount, 0);
  assert.deepEqual(result.images, []);
  assert.equal(result.allImages.length, images.length);
  assert.equal(editorialBatchInitialImageChoice(sourcePackage(), OUTPUT_1, true), `dossier_image:${IMAGE_X}`);
  assert.equal(editorialBatchInitialImageChoice({ ...sourcePackage(), outputImages: [] }, OUTPUT_1, true), "preserve_published");
});
