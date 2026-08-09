import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

test("a paleta editorial oferece cores principais sem retirar a entrada hexadecimal", () => {
  const presets = source("components/admin/EditorialColorPresets.tsx");
  const home = source("app/admin/editorial/home/page.tsx");
  const jornada = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  const horizontal = source("components/admin/EditorialHorizontalNewsEditor.tsx");

  for (const label of [
    "Liga Portugal",
    "Premier League",
    "LaLiga",
    "Benfica",
    "FC Porto",
    "Sporting",
    "Braga",
  ]) {
    assert.ok(presets.includes(label), label);
  }

  assert.match(presets, /aria-label="Cores principais"/);
  assert.match(presets, /Cores principais…/);
  assert.match(presets, /setValue\(event\.target\.value\)/);
  assert.match(home, /<EditorialColorInput/);
  assert.match(jornada, /<EditorialColorInput/g);
  assert.match(horizontal, /name="horizontal_news_label_color"/);
  assert.match(horizontal, /<EditorialColorInput/);
});

test("Redação automática aparece nas navegações principais existentes sem refatorar os menus", () => {
  for (const relativePath of [
    "app/admin/page.tsx",
    "app/admin/gestor/page.tsx",
    "app/admin/editorial/home/page.tsx",
    "app/admin/editorial/artigos/page.tsx",
    "app/admin/editorial/jornada/page.tsx",
    "app/admin/editorial/jornada/[matchdayId]/page.tsx",
    "app/admin/editorial/composicao/page.tsx",
    "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  ]) {
    assert.ok(
      source(relativePath).includes('/admin/editorial/redacao-automatica'),
      relativePath,
    );
  }
});

test("o botão da Redação Automática explicita que lê o clipboard e o paste mantém o caminho privilegiado do browser", () => {
  const actions = source("app/admin/editorial/redacao-automatica/_sourcePackageActions.tsx");

  assert.match(actions, /Ler clipboard e abrir Artigos/);
  assert.match(actions, /navigator\.clipboard\.readText\(\)/);
  assert.match(actions, /event\.clipboardData\.getData\("text"\)/);
  assert.match(actions, /window\.location\.assign\(articlesUrl\(\)\)/);
  assert.doesNotMatch(actions, /window\.open\("about:blank"/);
  assert.match(actions, /O botão principal tenta ler o clipboard; se o navegador bloquear, cola aqui/);
});

test("Últimas usa o fundo real dos três destaques, esconde apenas itens inteiros e liberta o limite fora do desktop", () => {
  const styles = source("components/public/publicEditorialStyles.ts");
  const matchdayPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
  const latestBlock = source("components/public/PublicLatestNewsBlock.tsx");
  const layout = source("components/public/PublicEditorialLayout.tsx");

  assert.match(layout, /constrainToMainColumn=\{scope === "matchday"\}/);
  assert.match(latestBlock, /querySelector<HTMLElement>\("\.public-matchday-main-column"\)/);
  assert.match(latestBlock, /data-editorial-slot="destaques-da-manchete"/);
  assert.match(latestBlock, /editorialBoundary\.getBoundingClientRect\(\)\.bottom/);
  assert.match(latestBlock, /availableHeight = Math\.max\(0, Math\.floor\(editorialBottom - rootTop\)\)/);
  assert.match(latestBlock, /observer\.observe\(editorialBoundary\)/);
  assert.match(latestBlock, /item\.getBoundingClientRect\(\)\.bottom > limit/);
  assert.match(latestBlock, /item\.style\.display = "none"/);
  assert.match(latestBlock, /window\.matchMedia\("\(max-width: 1180px\)"\)/);
  assert.match(styles, /\.public-news-list time \{[\s\S]*?line-height:\s*1\.2;/);
  assert.match(matchdayPage, /\.public-news-list time \{[\s\S]*?line-height:\s*1\.2;/);
  assert.match(
    styles,
    /\.public-editorial-layout-panel\[data-editorial-scope="matchday"\] \.public-matchday-lead-grid > \.public-matchday-news\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?contain:\s*size;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?height:\s*auto !important;[\s\S]*?max-height:\s*none !important;[\s\S]*?contain:\s*none;/,
  );
});
