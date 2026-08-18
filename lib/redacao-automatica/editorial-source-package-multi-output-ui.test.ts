import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test(
  "o Dossiê expõe planeamento de várias saídas com imagem própria",
  () => {
    const page = read(
      "app/admin/editorial/redacao-automatica/pacotes/[year]/[month]/[id]/page.tsx",
    );

    const planner = read(
      "app/admin/editorial/redacao-automatica/_sourcePackageOutputPlanner.tsx",
    );

    const route = read(
      "app/api/admin/editorial/redacao-automatica/source-package/[year]/[month]/[id]/route.ts",
    );

    const service = read(
      "lib/redacao-automatica/editorial-source-package.ts",
    );

    const publish = read(
      "app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts",
    );

    assert.match(
      page,
      /SourcePackageOutputPlanner/,
    );

    assert.match(
      page,
      /manifest.outputs/,
    );

    assert.match(
      planner,
      /Artigos a produzir/,
    );

    assert.match(
      planner,
      /output_count/,
    );

    assert.match(
      planner,
      /output_focus_/,
    );

    assert.match(
      planner,
      /output_image_/,
    );

    assert.match(
      planner,
      /Guardar artigos e imagens/,
    );

    assert.match(
      route,
      /updateEditorialSourcePackageOutputs/,
    );

    assert.match(
      route,
      /package_outputs_updated/,
    );

    assert.match(
      service,
      /outputs_locked/,
    );

    assert.match(
      service,
      /publishedArticleId:\s*normalizedArticleId/,
    );

    assert.match(
      publish,
      /output.sourceArticlePosition/,
    );

    assert.match(
      publish,
      /publishedAtByArticle\.set\(\s*output\.position,\s*sourcePublishedAt,\s*\)/,
    );
  },
);
