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
    assert.match(page, /sourceGroupCount > 0/);
    assert.match(page, /sourceArticlePositions={sourceGroupPositions}/);

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

    assert.match(planner, /Adicionar outra imagem/);
    assert.match(planner, /Substituir/);
    assert.match(planner, /Remover/);
    assert.match(planner, /image\/jpeg,image\/png,image\/webp/);
    assert.match(planner, /\/api\/admin\/editorial\/artigos\/upload-image\/sign/);
    assert.match(planner, /output_external_image_url_/);
    assert.match(planner, /output_external_image_name_/);
    assert.match(planner, /externalImage/);
    assert.match(planner, /Dossiê de fontes/);
    assert.match(planner, /candidate\.sourceArticlePosition === sourceArticlePosition/);
    assert.doesNotMatch(planner, /usedImage|availableImages|disabled=.*newsroomArticleId/);

    assert.match(
      route,
      /updateEditorialSourcePackageOutputs/,
    );

    assert.match(
      route,
      /package_outputs_updated/,
    );

    assert.match(route, /output_external_image_url_/);
    assert.match(route, /output_external_image_name_/);
    assert.match(route, /EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS/);
    assert.match(route, /outputCountBySourceGroup/);
    assert.match(route, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(route, /isEditorialStorageImageUrl/);

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

    assert.match(page, /outputImages: articleImages\.map/);
  },
);
