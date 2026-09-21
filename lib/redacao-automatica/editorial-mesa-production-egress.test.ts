import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  editorialArticleBodyHasContent,
  editorialArticleBodyPresencePostgrestFilter,
} from "./editorial-article-body-presence";

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("read-model da Produção não transporta bodies integrais", () => {
  const dossierRepository = read("lib/redacao-automatica/editorial-dossier-repository.ts");
  const planRepository = read("lib/redacao-automatica/editorial-dossier-article-plan-repository.ts");
  const productionReaderStart = dossierRepository.indexOf(
    "export async function getEditorialDossierForProduction",
  );
  assert.ok(productionReaderStart >= 0);
  const productionDossierReader = dossierRepository.slice(productionReaderStart);

  assert.match(productionDossierReader, /newsroom_article_snapshots\?select=id,article_id/);
  assert.doesNotMatch(productionDossierReader, /snapshotBody|body,extracted_at|select=[^\n"]*body/);
  assert.match(planRepository, /editorial_articles\?select=id,status"/);
  assert.match(planRepository, /editorialArticleBodyPresencePostgrestFilter\(\)/);
  assert.doesNotMatch(planRepository, /editorial_articles\?select=id,status,body/);

  assert.equal(editorialArticleBodyPresencePostgrestFilter(), "body=match.%5B%5E%5B%3Aspace%3A%5D%5D");
  assert.equal(editorialArticleBodyHasContent(null), false);
  assert.equal(editorialArticleBodyHasContent(""), false);
  assert.equal(editorialArticleBodyHasContent(" \t\r\n"), false);
  assert.equal(editorialArticleBodyHasContent(" corpo "), true);
});

test("loader único partilha relações e a página não recompõe três readers", () => {
  const page = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page.tsx");
  const loader = read("lib/redacao-automatica/editorial-dossier-production-loader.ts");
  const session = read("lib/redacao-automatica/editorial-dossier-production-read-session.ts");

  assert.match(page, /await loadEditorialDossierProduction\(dossierId/);
  assert.doesNotMatch(page, /getEditorialDossierById|listEditorialDossierArticlePlans|getEditorialDossierProductionWorkspace/);
  assert.match(loader, /createEditorialDossierProductionReadSession\(dossierId\)/);
  assert.match(loader, /getEditorialDossierForProduction\(dossierId, readSession\)/);
  assert.match(loader, /listEditorialDossierProductionArticlePlans\(dossierId, readSession\)/);
  assert.match(loader, /getEditorialDossierProductionWorkspace\(dossierId, \{[\s\S]*?readSession/);
  assert.match(session, /function once<T>/);
  assert.equal((session.match(/newsroom_editorial_dossier_sources"/g) ?? []).length, 1);
  assert.equal((session.match(/newsroom_editorial_dossier_article_plans"/g) ?? []).length, 1);
  assert.equal((session.match(/newsroom_mesa_production_contexts"/g) ?? []).length, 1);
  assert.match(loader, /detail: options\.workspaceDetail \?\? "page"/);
});

test("packages separam manifest e markdown sem alterar a leitura completa histórica", () => {
  const repository = read("lib/redacao-automatica/editorial-source-package.ts");
  const manifestReader = section(
    repository,
    "export async function readEditorialSourcePackageManifest",
    "export async function readEditorialSourcePackageMarkdown",
  );
  const markdownReader = section(
    repository,
    "export async function readEditorialSourcePackageMarkdown",
    "export async function readEditorialSourcePackage(",
  );
  const fullReader = section(
    repository,
    "export async function readEditorialSourcePackage(",
    "export async function markEditorialSourcePackageArticleUsed",
  );
  const contentRoute = read("app/api/admin/editorial/redacao-automatica/source-package/[year]/[month]/[id]/route.ts");
  const imagesRoute = read("app/api/admin/editorial/redacao-automatica/source-package/[year]/[month]/[id]/images/route.ts");
  const workspaceRoute = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const manifestOnlyConsumers = [
    "app/admin/editorial/redacao-automatica/page.tsx",
    "app/api/admin/editorial/artigos/import-source-image/route.ts",
    "app/api/admin/editorial/redacao-automatica/juntar-dossies/route.ts",
    "app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts",
    "app/api/admin/editorial/redacao-automatica/source-package/route.ts",
  ].map(read);

  assert.match(manifestReader, /select=id,package_year,package_month,manifest"/);
  assert.doesNotMatch(manifestReader, /,markdown"/);
  assert.match(markdownReader, /select=id,package_year,package_month,markdown"/);
  assert.doesNotMatch(markdownReader, /,manifest"/);
  assert.match(fullReader, /select=id,package_year,package_month,manifest,markdown"/);
  assert.match(contentRoute, /readEditorialSourcePackageMarkdown\(location\)/);
  assert.match(imagesRoute, /readEditorialSourcePackageManifest/);
  assert.match(workspaceRoute, /readEditorialSourcePackageManifest\(location\)/);
  manifestOnlyConsumers.forEach((consumer) => {
    assert.match(consumer, /readEditorialSourcePackageManifest/);
  });
  assert.match(repository, /newsroom_article_snapshots[\s\S]*?select=id,article_id,body,source_metadata/);
});

test("upload e save atualizam o estado local sem refresh integral", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const batchService = read("lib/redacao-automatica/editorial-dossier-workspace-batch-service.ts");
  const batchHandler = section(
    route,
    'if (action === "save_article_plans_batch")',
    'if (action === "save_article_plan")',
  );

  assert.doesNotMatch(client, /router\.refresh\(\)/);
  assert.match(client, /onRegisteredImage\(await registerUpload\(registration\)\)/);
  assert.match(client, /onRegisteredImage\(await registerUpload\(pendingRegistration\)\)/);
  assert.match(client, /setWorkspaceImages\(\(current\)/);
  assert.match(client, /existing\s*\? current\.map/);
  assert.match(client, /setPersistedOutputCount\(result\.outputCount\)/);
  assert.match(client, /\(frozenSlots \? frozenSlots\.length : persistedOutputCount\) !== effectiveOutputCount/);
  assert.match(client, /action:\s*"save_article_plans_batch"/);
  assert.doesNotMatch(client, /action:\s*"update_output_count"/);
  assert.match(route, /image:\s*\{[\s\S]*?dossierImageId[\s\S]*?storageBucket[\s\S]*?storagePath[\s\S]*?fileName/);
  assert.match(route, /imageAction:\s*result\.value\.imageAction/);
  assert.match(route, /result\.value\.imageAction === "created" \? 201 : 200/);
  assert.match(batchHandler, /saveEditorialDossierWorkspaceBatch\(input\)/);
  assert.doesNotMatch(batchHandler, /fetchSupabaseAdminTable|newsroom_editorial_dossiers\?select=id/);
  assert.match(batchService, /includePlans:\s*false/);
  assert.match(batchService, /openArticlePlanSession:\s*createEditorialDossierArticlePlanBatchSession/);
  assert.match(batchService, /synchronizeOutputs:\s*synchronizeEditorialMesaSharedOutputs/);
});

test("batch save mantém uma carga de Produção e uma leitura de Dossier state para N outputs", () => {
  const client = read("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx");
  const batchService = read("lib/redacao-automatica/editorial-dossier-workspace-batch-service.ts");
  const batchInternal = read("lib/redacao-automatica/editorial-dossier-workspace-batch-service-internal.ts");
  const articlePlanService = read("lib/redacao-automatica/editorial-dossier-article-plan-service.ts");
  const saveClient = section(client, "async function saveProduction", "  return (");
  const articlePlanSession = section(
    articlePlanService,
    "export async function createEditorialDossierArticlePlanBatchSession",
    "export async function setEditorialMesaOutputOrigin",
  );

  assert.equal((saveClient.match(/fetch\(WORKSPACE_ROUTE/g) ?? []).length, 1);
  assert.match(saveClient, /action:\s*"save_article_plans_batch"/);
  assert.doesNotMatch(saveClient, /action:\s*"save_article_plan"|action:\s*"update_output_count"/);
  assert.match(saveClient, /const persistedOutputs = result\?\.ok \? result\.outputs : result\?\.savedOutputs/);
  assert.match(saveClient, /savingProductionRef\.current = true/);
  assert.match(saveClient, /savingProductionRef\.current = false/);
  assert.equal((batchService.match(/loadEditorialDossierProduction\(/g) ?? []).length, 1);
  assert.equal((batchService.match(/createEditorialDossierArticlePlanBatchSession/g) ?? []).length, 2);
  assert.equal((articlePlanSession.match(/await readDossierState\(/g) ?? []).length, 1);
  assert.match(articlePlanSession, /currentState = stateAfterPlanSave/);
  assert.match(batchInternal, /for \(const output of batch\.outputs\)/);
  assert.doesNotMatch(batchInternal, /Promise\.all/);
});

test("loader mantém fail-closed 2C e separa leitura leve de factual", () => {
  const loader = read("lib/redacao-automatica/editorial-dossier-production-loader.ts");
  const workspaceRepository = read("lib/redacao-automatica/editorial-dossier-production-workspace-repository.ts");
  const workspaceRoute = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");

  assert.match(loader, /if \(!workspaceResult\.ok\) return workspaceResult/);
  assert.match(workspaceRepository, /context_contract_invalid/);
  assert.match(workspaceRepository, /hasContextMarker !== \(productionContextRows\.length > 0\)/);
  assert.match(workspaceRoute, /workspaceDetail:\s*"context"/);
  assert.match(workspaceRoute, /const productionResult = await loadEditorialDossierProduction\(dossierId\)/);
  assert.doesNotMatch(workspaceRoute, /getEditorialDossierById\(dossierId\)/);
});
