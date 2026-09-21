import assert from "node:assert/strict";
import test from "node:test";

import type { EditorialDossierImage } from "./editorial-dossier-production-workspace-repository";
import { editorialMesaContextualImages } from "./editorial-mesa-workspace-images";

const dossierId = "10000000-0000-4000-8000-000000000001";

function newsroomImage(id: string, newsroomArticleId: string): EditorialDossierImage {
  return {
    id,
    dossierId,
    origin: "newsroom",
    newsroomArticleId,
    frozenUrl: `https://example.invalid/${id}.jpg`,
    createdAt: "2026-09-21T10:00:00Z",
  };
}

const images = [
  newsroomImage("a1", "source-a1"),
  newsroomImage("a2", "source-a2"),
  newsroomImage("a3", "source-a3"),
  newsroomImage("b1", "source-b1"),
  newsroomImage("b2", "source-b2"),
  newsroomImage("c1", "source-c"),
  newsroomImage("d1", "source-d"),
] as const;

test("imagens contextuais distinguem Temas, fonte solta e grupo sem restringir o banco global", () => {
  assert.deepEqual(
    editorialMesaContextualImages(images, ["source-a1", "source-a2", "source-a3"], "unselected")
      .images.map((image) => image.id),
    ["a1", "a2", "a3"],
  );
  assert.deepEqual(
    editorialMesaContextualImages(images, ["source-b1", "source-b2"], "unselected")
      .images.map((image) => image.id),
    ["b1", "b2"],
  );
  assert.deepEqual(
    editorialMesaContextualImages(images, ["source-c"], "unselected")
      .images.map((image) => image.id),
    ["c1"],
  );
  assert.deepEqual(
    editorialMesaContextualImages(images, ["source-c", "source-d"], "unselected")
      .images.map((image) => image.id),
    ["c1", "d1"],
  );
  assert.deepEqual(
    editorialMesaContextualImages(images, ["source-b1", "source-b2"], "unselected")
      .allImages.map((image) => image.id),
    ["b1", "b2", "a1", "a2", "a3", "c1", "d1"],
    "ao expandir, as imagens relevantes continuam primeiro e todo o banco fica disponível",
  );
  assert.equal(images.length, 7, "o banco global permanece completo");
});

test("imagem escolhida no banco global permanece visível fora do conjunto contextual", () => {
  const result = editorialMesaContextualImages(
    images,
    ["source-a1", "source-a2", "source-a3"],
    "dossier_image:b2",
  );

  assert.equal(result.relevantCount, 3);
  assert.deepEqual(result.images.map((image) => image.id), ["a1", "a2", "a3", "b2"]);
  assert.equal(
    editorialMesaContextualImages(images, ["source-without-image"], "unselected").relevantCount,
    0,
  );
});

test("a projeção contextual não duplica uma imagem já relevante", () => {
  const result = editorialMesaContextualImages(
    images,
    ["source-a1", "source-a2"],
    "dossier_image:a2",
  );

  assert.deepEqual(result.images.map((image) => image.id), ["a1", "a2"]);
  assert.equal(result.relevantCount, 2);
});
