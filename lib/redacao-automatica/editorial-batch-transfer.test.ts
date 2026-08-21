import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEditorialBatchTransferSourcePackage,
} from "./editorial-batch-transfer";

const PACKAGE_ID = "91000000-0000-4000-8000-000000000001";

test("transferências antigas do Dossiê continuam legíveis", () => {
  assert.deepEqual(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
    })),
    {
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
    },
  );
});

test("a transferência preserva uma imagem final independente por output", () => {
  const outputImages = [
    {
      position: 1,
      imageUrl: "https://assets.example.invalid/a.jpg",
      label: "Fonte A",
    },
    {
      position: 2,
      imageUrl: "https://assets.example.invalid/a.jpg",
      label: "Fonte A repetida",
    },
    {
      position: 3,
      imageUrl: "https://project.supabase.co/storage/v1/object/public/editorial-images/editorial/2026/08/c.webp",
      label: "externa-c.webp",
    },
  ];

  assert.deepEqual(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      outputImages,
    }))?.outputImages,
    outputImages,
  );
});

test("a transferência rejeita posições de imagem duplicadas", () => {
  assert.equal(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      outputImages: [
        { position: 1, imageUrl: "https://assets.example.invalid/a.jpg", label: "A" },
        { position: 1, imageUrl: "https://assets.example.invalid/b.jpg", label: "B" },
      ],
    })),
    null,
  );
});
