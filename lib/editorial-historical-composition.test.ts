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
