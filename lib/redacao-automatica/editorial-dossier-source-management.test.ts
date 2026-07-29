import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const dossierPage = "app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx";
const dossierRoute = "app/api/admin/editorial/redacao-automatica/dossies/route.ts";
const dossierRepository = "lib/redacao-automatica/editorial-dossier-repository.ts";
const dossierService = "lib/redacao-automatica/editorial-dossier-service.ts";
const dossierInternal = "lib/redacao-automatica/editorial-dossier-service-internal.ts";
const dossierSchema = "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-aplicar.sql";

test("o schema existente já suporta papel, ordem, nota e exclusão sem apagar proveniência", () => {
  const source = read(dossierSchema);

  assert.match(source, /source_role text not null/);
  assert.match(source, /sort_order integer not null/);
  assert.match(source, /editorial_note text/);
  assert.match(source, /included boolean not null default true/);
  assert.match(source, /unique \(dossier_id, newsroom_article_id\)/);
});

test("a página do Dossiê permite gerir fontes e acrescentar novas fontes sem sair", () => {
  const source = read(dossierPage);

  assert.match(source, /name="action" value="manage_sources"/);
  assert.match(source, /name="dossier_source_id"/);
  assert.match(source, /name={`source_priority_\$\{source\.id\}`}/);
  assert.match(source, /name={`source_role_\$\{source\.id\}`}/);
  assert.match(source, /name={`source_note_\$\{source\.id\}`}/);
  assert.match(source, /name={`source_included_\$\{source\.id\}`}/);
  assert.match(source, /name="action" value="add_sources"/);
  assert.match(source, /Acrescentar fontes selecionadas/);
  assert.match(source, /listNewsroomArticles/);
});

test("a rota distingue gestão e inclusão de novas fontes", () => {
  const source = read(dossierRoute);

  assert.match(source, /action === "manage_sources"/);
  assert.match(source, /manageEditorialDossierSources/);
  assert.match(source, /action === "add_sources"/);
  assert.match(source, /addEditorialDossierSources/);
  assert.match(source, /formData\.has\(`source_included_\$\{sourceId\}`\)/);
});

test("a gestão preserva os artigos e snapshots congelados e usa upsert atómico", () => {
  const internalSource = read(dossierInternal);
  const serviceSource = read(dossierService);

  assert.match(internalSource, /newsroom_article_id: existing\.newsroomArticleId/);
  assert.match(internalSource, /newsroom_snapshot_id: existing\.newsroomSnapshotId/);
  assert.match(internalSource, /editorial_note: edit\.editorialNote/);
  assert.match(internalSource, /included: edit\.included/);
  assert.match(serviceSource, /on_conflict=id/);
  assert.match(serviceSource, /resolution=merge-duplicates,return=representation/);
});

test("as novas fontes congelam o snapshot atual e não duplicam artigos existentes", () => {
  const source = read(dossierInternal);

  assert.match(source, /existingArticleIds\.has\(source\.newsroomArticleId\)/);
  assert.match(source, /source_already_in_dossier/);
  assert.match(source, /newsroom_snapshot_id: candidate\.snapshot\.id/);
  assert.match(source, /existingSources\.length \+ additions\.length > MAX_SOURCES/);
});

test("a leitura mostra fontes ativas antes das excluídas e não apaga linhas", () => {
  const repositorySource = read(dossierRepository);
  const combined = [
    read(dossierPage),
    read(dossierRoute),
    read(dossierService),
    read(dossierInternal),
  ].join("\n");

  assert.match(repositorySource, /order=included\.desc,sort_order\.asc,id\.asc/);
  assert.doesNotMatch(
    combined,
    /newsroom_editorial_dossier_sources[^\n]*method:\s*"DELETE"/,
  );
});

test("a gestão das fontes continua sem chamar IA, criar artigos ou publicar", () => {
  const source = [
    read(dossierRepository),
    read(dossierService),
    read(dossierInternal),
  ].join("\n");

  assert.doesNotMatch(source, /openai|anthropic|gemini|generateContent|responses\.create/i);
  assert.doesNotMatch(source, /insert into public\.editorial_articles|status\s*:\s*"published"/i);
  assert.doesNotMatch(source, /cron|worker|webhook|http_post|net\./i);
});
