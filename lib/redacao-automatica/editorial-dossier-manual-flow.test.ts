import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const newsroomPage = "app/admin/editorial/redacao-automatica/page.tsx";
const dossierPage = "app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx";
const dossierRoute = "app/api/admin/editorial/redacao-automatica/dossies/route.ts";
const dossierRepository = "lib/redacao-automatica/editorial-dossier-repository.ts";
const dossierService = "lib/redacao-automatica/editorial-dossier-service.ts";
const dossierInternal = "lib/redacao-automatica/editorial-dossier-service-internal.ts";
const newsroomRepository = "lib/redacao-automatica/newsroom-article-repository.ts";

test("a Caixa de entrada permite selecionar várias fontes e criar um Dossiê", () => {
  const source = read(newsroomPage);

  assert.match(source, /id="create-editorial-dossier"/);
  assert.match(source, /name="newsroom_article_id"/);
  assert.match(source, /form="create-editorial-dossier"/);
  assert.match(source, /name={`source_priority_\$\{article\.id\}`}/);
  assert.match(source, /name={`source_role_\$\{article\.id\}`}/);
  assert.match(source, /Criar Dossiê com as fontes selecionadas/);
  assert.match(source, /listEditorialDossiers/);
});

test("a página do Dossiê permite reabrir e guardar orientações e preferências", () => {
  const source = read(dossierPage);

  assert.match(source, /getEditorialDossierById/);
  assert.match(source, /name="editorial_instructions"/);
  assert.match(source, /name="context_instructions"/);
  assert.match(source, /name="output_mode"/);
  assert.match(source, /name="output_count"/);
  assert.match(source, /name="length_mode"/);
  assert.match(source, /name="article_kind"/);
  assert.match(source, /Guardar Dossiê/);
  assert.match(source, /newsroomSnapshotId/);
});

test("os redirects do Dossiê são relativos e não dependem do host de desenvolvimento", () => {
  const source = read(dossierRoute);

  assert.match(source, /new URL\(path, "https:\/\/jornada\.local"\)/);
  assert.match(source, /headers: \{ Location: `\$\{url\.pathname\}\$\{url\.search\}` \}/);
  assert.doesNotMatch(source, /new URL\(path, request\.url\)/);
  assert.doesNotMatch(source, /NextResponse\.redirect/);
});

test("o serviço congela snapshots, preserva ordem e compensa falhas do lote", () => {
  const source = read(dossierInternal);

  assert.match(source, /newsroom_snapshot_id: candidate\.snapshot!\.id/);
  assert.match(source, /sort_order: \(index \+ 1\) \* 10/);
  assert.match(source, /await transport\.deleteDossier\(dossierId\)/);
  assert.match(source, /source_role: !hasPrimary && index === 0 \? "primary"/);
});

test("a leitura do Dossiê usa os snapshots explicitamente guardados e não os substitui pelo mais recente", () => {
  const source = read(dossierRepository);

  assert.match(source, /newsroom_snapshot_id/);
  assert.match(source, /&id=in\.\(\$\{uuidList\(snapshotIds\)\}\)/);
  assert.match(source, /frozenSnapshot\.article_id !== article\.id/);
  assert.doesNotMatch(source, /order=extracted_at\.desc[\s\S]*newsroom_editorial_dossier_sources/);
});

test("a seleção da Caixa de entrada conhece o snapshot mais recente, mas a criação revalida no servidor", () => {
  const newsroomSource = read(newsroomRepository);
  const serviceSource = read(dossierService);

  assert.match(newsroomSource, /latestSnapshotsByArticle/);
  assert.match(newsroomSource, /getNewsroomDossierSourceCandidates/);
  assert.match(serviceSource, /getNewsroomDossierSourceCandidates/);
  assert.match(serviceSource, /insertSources/);
});

test("a fase não liga IA, tradução, publicação nem artigos editoriais", () => {
  const source = [
    read(newsroomPage),
    read(dossierPage),
    read(dossierRoute),
    read(dossierRepository),
    read(dossierService),
    read(dossierInternal),
  ].join("\n");

  assert.doesNotMatch(source, /openai|anthropic|gemini|generateContent|translation_run|prompt_version/i);
  assert.doesNotMatch(source, /insert into public\.editorial_articles|status\s*:\s*"published"/i);
  assert.doesNotMatch(source, /cron|worker|webhook|http_post|net\./i);
});
