import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("Por rever permite selecionar e desselecionar todo o bloco", () => {
  const page = read(
    "app/admin/editorial/redacao-automatica/page.tsx",
  );
  const bulk = read(
    "app/admin/editorial/redacao-automatica/_inboxBulkActions.tsx",
  );

  assert.match(
    page,
    /view === "pending" \|\| view === "working"[\s\S]*?<InboxBulkActions view=\{view\}/,
  );
  assert.match(bulk, /Selecionar tudo/);
  assert.match(bulk, /Desselecionar tudo/);
  assert.match(bulk, /data-inbox-bulk-item/);
  assert.match(bulk, /value="working"/);
  assert.match(bulk, /value="dismissed"/);
});

test("Em trabalho continua sem seleção total", () => {
  const page = read(
    "app/admin/editorial/redacao-automatica/page.tsx",
  );

  assert.doesNotMatch(
    page,
    /data-source-package-select-all/,
  );
  assert.doesNotMatch(
    page,
    /data-source-package-clear-all/,
  );
  assert.match(page, /<span>Dossiê<\/span>/);
  assert.match(page, /name="newsroom_article_id"/);
});

test("Reutilizar Dossiê é uma ação visual principal", () => {
  const component = read(
    "app/admin/editorial/redacao-automatica/_usedDossierList.tsx",
  );
  const styles = read(
    "app/admin/editorial/redacao-automatica/redacao-automatica.module.css",
  );

  assert.match(component, /Reutilizar Dossiê/);
  assert.match(component, /usedDossierReuseButton/);
  assert.match(styles, /\.usedDossierReuseButton/);
  assert.match(styles, /background: #111827/);
});

test("Utilizadas permite selecionar vários Dossiês", () => {
  const component = read(
    "app/admin/editorial/redacao-automatica/_usedDossierList.tsx",
  );
  const bulk = read(
    "app/admin/editorial/redacao-automatica/_usedDossierBulkActions.tsx",
  );

  assert.match(component, /name="dossier_ref"/);
  assert.match(component, /data-used-dossier-select/);
  assert.match(component, /UsedDossierBulkActions/);

  assert.match(bulk, /Juntar Dossiês/);
  assert.match(bulk, /canonical_dossier_ref/);
  assert.match(bulk, /Artigo publicado principal/);
  assert.match(
    bulk,
    /formAction="\/api\/admin\/editorial\/redacao-automatica\/juntar-dossies"/,
  );
});

test("Juntar Dossiês é determinístico e não usa IA", () => {
  const route = read(
    "app/api/admin/editorial/redacao-automatica/juntar-dossies/route.ts",
  );

  assert.match(route, /readEditorialSourcePackage/);
  assert.match(route, /normalizeEditorialSourcePackageSelections/);
  assert.match(route, /createEditorialSourcePackage/);
  assert.match(route, /markEditorialSourcePackageArticleUsed/);
  assert.match(route, /publishedArticleId/);
  assert.match(route, /canonical_dossier_ref/);

  assert.doesNotMatch(
    route,
    /OpenAI|generateEditorial|embedding|semantic/i,
  );
});

test("a união preserva o limite e elimina fontes repetidas", () => {
  const route = read(
    "app/api/admin/editorial/redacao-automatica/juntar-dossies/route.ts",
  );

  assert.match(route, /new Map<string, SourceCandidate>/);
  assert.match(route, /candidates\.get\(newsroomArticleId\)/);
  assert.match(
    route,
    /EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES/,
  );
  assert.match(route, /source_limit_exceeded/);
});

test("os Dossiês em Utilizadas começam fechados e permitem abrir as fontes", () => {
  const component = read(
    "app/admin/editorial/redacao-automatica/_usedDossierList.tsx",
  );
  const styles = read(
    "app/admin/editorial/redacao-automatica/redacao-automatica.module.css",
  );

  assert.match(component, /<details className=\{styles\.usedDossierDetails\}>/);
  assert.doesNotMatch(
    component,
    /<details className=\{styles\.usedDossierDetails\} open/,
  );
  assert.match(component, /<summary className=\{styles\.usedDossierToggle\}>/);
  assert.match(component, /Ver \{group\.articles\.length\}/);
  assert.match(component, /Fechar \{group\.articles\.length\}/);

  assert.match(styles, /\.usedDossierDetails/);
  assert.match(styles, /\.usedDossierDetails\[open\]/);
});

test("Utilizadas mantém o histórico e separa o snapshot atual já utilizado", () => {
  const inbox = read(
    "lib/redacao-automatica/newsroom-editorial-inbox.ts",
  );

  assert.match(inbox, /readAllHistoricalUsedStates/);
  assert.match(inbox, /historicalUsedItems/);
  assert.match(inbox, /currentSnapshotUsedByArticleId/);
  assert.match(inbox, /currentSnapshotUsedIds/);
  assert.match(inbox, /items = historicalUsedItems/);
  assert.doesNotMatch(
    inbox,
    /article\.latestSnapshotId !== usedState\.snapshotId\) \{\s*return null/,
  );
});

test("um Dossiê agrega e conta fontes com atualização disponível", () => {
  const component = read(
    "app/admin/editorial/redacao-automatica/_usedDossierList.tsx",
  );
  const styles = read(
    "app/admin/editorial/redacao-automatica/redacao-automatica.module.css",
  );

  assert.match(component, /const key = dossier\?\.key/);
  assert.match(component, /usageBySource/);
  assert.match(component, /updates\.every\(Boolean\)/);
  assert.match(component, /ATUALIZAÇÃO DISPONÍVEL/);
  assert.match(component, /ATUALIZAÇÕES DISPONÍVEIS/);
  assert.match(component, /group\.updateAvailableCount/);
  assert.match(styles, /\.usedDossierUpdateBadge/);
});

test("Reutilizar Dossiê transporta fontes e alvo, mas não transporta usedAt", () => {
  const route = read(
    "app/api/admin/editorial/redacao-automatica/source-package/route.ts",
  );
  const reuseStart = route.indexOf("if (reuseRequested)");
  const reuseEnd = route.indexOf("const packageId", reuseStart);
  const reuse = route.slice(reuseStart, reuseEnd);

  assert.ok(reuseStart >= 0 && reuseEnd > reuseStart);
  assert.match(reuse, /\.\.\.previousSelections/);
  assert.match(reuse, /\.\.\.newSelections/);
  assert.match(reuse, /output\.publishedArticleId/);
  assert.match(reuse, /output\.publishedSlug/);
  assert.doesNotMatch(reuse, /usedAt/);
});
