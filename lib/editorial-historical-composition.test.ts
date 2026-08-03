import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const compositionPageSource = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
const compositionRouteSource = source("app/api/admin/editorial/composicao/route.ts");
const automaticBankSqlSource = source("supabase/steps/73-composicao-historica-banco-automatico-apply.sql");
const deletedSourceCleanupSqlSource = source("supabase/steps/85-composicao-historica-limpeza-total-origem-eliminada-apply.sql");
const articleRouteSource = source("app/api/admin/editorial/artigos/route.ts");
const newsroomArticleDeleteSqlSource = source("supabase/steps/81-editorial-artigos-eliminacao-desvincular-redacao-automatica-apply.sql");

test("o banco histórico apresenta um fluxo único, filtrável e sem origem editorial visível", () => {
  assert.match(compositionPageSource, /Banco histórico da jornada/);
  assert.match(compositionPageSource, /Sincronizar notícias em falta/);
  assert.match(compositionPageSource, /Todas[\s\S]*Disponíveis[\s\S]*Em uso[\s\S]*Arquivadas/);
  assert.match(compositionPageSource, /Adicionar à zona…/);
  assert.doesNotMatch(compositionPageSource, /GUARDAR ESTADO ATUAL DA PÁGINA/);
  assert.doesNotMatch(compositionPageSource, /Candidatos antigos \/ diagnostico/);
  assert.doesNotMatch(compositionPageSource, /Origem:/);
});

test("os itens do banco sem imagem não reservam a coluna da miniatura", () => {
  assert.match(compositionPageSource, /const hasImage = Boolean\(textOrEmpty\(item\.image_url\)\)/);
  assert.match(compositionPageSource, /composition-admin-bank-item \$\{hasImage \? "has-image" : "no-image"\}/);
  assert.match(compositionPageSource, /\.composition-admin-bank-item\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(170px, 0\.48fr\);/);
  assert.match(compositionPageSource, /\.composition-admin-bank-item\.has-image\s*\{\s*grid-template-columns: 88px minmax\(0, 1fr\) minmax\(170px, 0\.48fr\);/);
});

test("a composição histórica permite mover, ordenar, retirar e publicar com confirmação", () => {
  assert.match(compositionPageSource, /Composição histórica da jornada/);
  assert.match(compositionPageSource, /MoveCompositionItemForm/);
  assert.match(compositionPageSource, /ReorderCompositionItemForm/);
  assert.match(compositionPageSource, /Retirar devolve a notícia ao estado Disponível no banco/);
  assert.match(compositionPageSource, /Publicar composição histórica/);
  assert.match(compositionPageSource, /name="confirm_publish" value="yes" required/);
});

test("a sincronização manual inclui todas as publicações editoriais associadas à jornada", () => {
  assert.match(compositionRouteSource, /editorial_articles\?select=[^`]+matchday_id=eq\./);
  assert.match(compositionRouteSource, /editorial_contents\?select=[^`]+matchday_id=eq\./);
  assert.match(compositionRouteSource, /sourceType:\s*"editorial_article"/);
  assert.match(compositionRouteSource, /sourceType:\s*"editorial_content"/);
  assert.match(compositionRouteSource, /bank_updated=/);
});

test("qualquer notícia do banco pode ocupar uma zona e as zonas singulares são substituídas com segurança", () => {
  assert.match(compositionRouteSource, /const bankCompositionSlotTypes = new Set\(\["headline", "complement", "side_block", "highlight", "important_item", "editorial_line_item"\]\)/);
  assert.match(compositionRouteSource, /const singleBankCompositionSlotTypes = new Set\(\["headline", "complement", "side_block"\]\)/);
  assert.match(compositionRouteSource, /source_type:\s*"matchday_editorial_bank_item"/);
  assert.match(compositionRouteSource, /actionType === "reorder_composition_item"/);
  assert.match(compositionRouteSource, /confirm_publish/);
});

test("a base de dados automatiza artigos e conteúdos publicados, reconcilia duplicados e preserva arquivo", () => {
  assert.match(automaticBankSqlSource, /create or replace function public\.upsert_matchday_editorial_bank_publication/);
  assert.match(automaticBankSqlSource, /sync_published_editorial_article_to_matchday_bank/);
  assert.match(automaticBankSqlSource, /sync_published_editorial_content_to_matchday_bank/);
  assert.match(automaticBankSqlSource, /matchday_editorial_bank_items_automatic_source_unique_idx/);
  assert.match(automaticBankSqlSource, /source_type = 'matchday_editorial_bank_item'/);
  assert.doesNotMatch(automaticBankSqlSource, /set status = 'active'/i);
});


test("eliminar uma origem limpa as composições internas e remove definitivamente a entrada do banco", () => {
  assert.match(deletedSourceCleanupSqlSource, /after delete on public\.editorial_articles/);
  assert.match(deletedSourceCleanupSqlSource, /after delete on public\.editorial_contents/);
  assert.match(deletedSourceCleanupSqlSource, /delete from public\.matchday_reference_composition_items/);
  assert.match(deletedSourceCleanupSqlSource, /composition_item\.source_id = bank\.id/);
  assert.match(deletedSourceCleanupSqlSource, /delete from public\.matchday_editorial_bank_items bank/);
  assert.match(deletedSourceCleanupSqlSource, /not exists[\s\S]*public\.editorial_articles/);
  assert.match(deletedSourceCleanupSqlSource, /not exists[\s\S]*public\.editorial_contents/);
});


test("eliminar um artigo sem vínculos públicos limpa dependências internas sem destruir o plano", () => {
  assert.match(articleRouteSource, /articleHasActiveLinks/);
  assert.match(articleRouteSource, /matchday_reference_composition_items/);
  assert.match(articleRouteSource, /throw new ArticleAdminError\("article-has-links"\)/);
  assert.match(newsroomArticleDeleteSqlSource, /on delete set null/i);
  assert.match(newsroomArticleDeleteSqlSource, /newsroom_editorial_plan_generations_article_fkey[\s\S]*on delete cascade/i);
  assert.match(newsroomArticleDeleteSqlSource, /newsroom_editorial_compose_requests_article_fkey[\s\S]*on delete cascade/i);
  assert.match(newsroomArticleDeleteSqlSource, /pg_catalog\.pg_constraint/);
  assert.match(newsroomArticleDeleteSqlSource, /constraint_row\.conkey = array\[source_attribute\.attnum\]/i);
  assert.match(newsroomArticleDeleteSqlSource, /newsroom_reject_editorial_generation_mutation/);
  assert.match(newsroomArticleDeleteSqlSource, /tg_op = 'DELETE'/i);
  assert.match(newsroomArticleDeleteSqlSource, /not exists[\s\S]*public\.editorial_articles/i);
  assert.match(newsroomArticleDeleteSqlSource, /editorial_generation_immutable/);
  assert.doesNotMatch(newsroomArticleDeleteSqlSource, /delete from public\.matchday_reference_composition_items/i);
});
