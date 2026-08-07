import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a Home limita toda a regiÃ£o editorial sem alterar o carrossel de jogos", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");

  const regionStart = page.indexOf('<div className="public-home-editorial-region">');
  const editorialStart = page.indexOf("<PublicEditorialLayout", regionStart);
  const horizontalStart = page.indexOf("<PublicHorizontalNewsStrip", editorialStart);
  const regionEnd = page.indexOf("</div>", horizontalStart);
  const matchStripStart = page.indexOf("<PublicMatchStrip");

  assert.ok(matchStripStart >= 0);
  assert.ok(regionStart > matchStripStart);
  assert.ok(editorialStart > regionStart);
  assert.ok(horizontalStart > editorialStart);
  assert.ok(regionEnd > horizontalStart);
  const editorialWidth = styles.match(/--public-home-editorial-max-width:\s*(\d+)px/)?.[1];
  assert.equal(editorialWidth, "1200");
  assert.ok(Number(editorialWidth) < 1208);
  assert.match(styles, /\.public-home-editorial-region > \.public-matchday-panel \{[\s\S]*?max-width:\s*none;/);
  assert.match(page, /titleTag:\s*"h1"/);
  assert.match(page, /title="A acompanhar"/);
});

test("a abertura coloca manchete e destaques, Ãºltimas e contexto em trÃªs colunas", () => {
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");
  const functionStart = layout.indexOf("export function PublicEditorialLayout");
  const source = layout.slice(functionStart);

  const leadGridIndex = source.indexOf('<div className="public-matchday-lead-grid">');
  const mainColumnIndex = source.indexOf('<div className="public-matchday-main-column">', leadGridIndex);
  const headlineIndex = source.indexOf("<PublicHeadlineBlock", mainColumnIndex);
  const highlightsIndex = source.indexOf("<PublicHighlightsSection", headlineIndex);
  const latestIndex = source.indexOf("<PublicLatestNewsBlock", highlightsIndex);
  const contextIndex = source.indexOf("<PublicSideBlock", latestIndex);
  const depthIndex = source.indexOf("public-matchday-depth-row", contextIndex);

  assert.ok(leadGridIndex >= 0);
  assert.ok(mainColumnIndex > leadGridIndex);
  assert.ok(headlineIndex > mainColumnIndex);
  assert.ok(highlightsIndex > headlineIndex);
  assert.ok(latestIndex > highlightsIndex);
  assert.ok(contextIndex > latestIndex);
  assert.ok(depthIndex > contextIndex);
  assert.doesNotMatch(source, /public-matchday-latest-row/);
  assert.match(source, /ariaLabel="Leitura editorial do tema principal"/);
  assert.doesNotMatch(source, /sectionTitle="Em contexto"/);
  assert.doesNotMatch(source, /sectionTitle="O que fica"/);
  assert.match(source, /sectionTitle=\{belowHeadline\.complementary\.label \?\? undefined\}/);
  assert.match(source, /<PublicRoundupSummary[\s\S]*?<PublicComplementaryBlock/);
});

test("a manchete reduz apenas a imagem e transfere essa largura para o texto", () => {
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");
  const functionStart = layout.indexOf("export function PublicHeadlineBlock");
  const functionEnd = layout.indexOf("function PublicHighlightCard", functionStart);
  const source = layout.slice(functionStart, functionEnd);

  const copyIndex = source.indexOf("{copy}");
  const mediaIndex = source.indexOf("{media}", copyIndex);

  assert.ok(copyIndex >= 0);
  assert.ok(mediaIndex > copyIndex);
  assert.match(styles, /grid-template-columns:\s*minmax\(250px, 1fr\) minmax\(0, 420px\)/);
  assert.match(styles, /grid-template-areas:\s*"copy media"/);
  assert.match(styles, /\.public-editorial-main-image \{[\s\S]*?height:\s*300px;[\s\S]*?max-height:\s*300px;/);
  assert.match(styles, /text-transform:\s*none/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*?grid-template-areas:\s*"copy"\s*"media"/);
});

test("a grelha mantÃ©m Ãºltimas e contexto nas posiÃ§Ãµes atuais e preserva os restantes blocos", () => {
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");

  assert.match(
    styles,
    /\.public-matchday-lead-grid \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(220px, 235px\) minmax\(190px, 205px\)/
  );
  assert.match(styles, /grid-template-areas:\s*"main latest context"/);
  assert.match(styles, /\.public-matchday-lead-grid > \.public-matchday-news \{[\s\S]*?grid-area:\s*latest/);
  assert.match(styles, /\.public-matchday-lead-grid > \.public-side-editorial-block \{[\s\S]*?grid-area:\s*context/);
  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(210px, 230px\)[\s\S]*?grid-template-areas:\s*"main context"\s*"latest latest"/
  );
  assert.match(
    styles,
    /@media \(max-width: 840px\)[\s\S]*?grid-template-areas:\s*"main"\s*"latest"\s*"context"/
  );
  assert.match(layout, /<PublicRoundupSummary[\s\S]*?<PublicComplementaryBlock/);
  assert.match(
    styles,
    /\.public-matchday-depth-row \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.72fr\) minmax\(280px, 0\.78fr\)/
  );
  assert.doesNotMatch(styles, /public-matchday-latest-row/);
  assert.match(styles, /overflow-wrap:\s*break-word/);

  const headlineTitleStart = styles.indexOf(".public-matchday-editorial h1,");
  const headlineTitleEnd = styles.indexOf(".public-cover-headline {", headlineTitleStart);
  const headlineSummaryStart = styles.indexOf(".public-cover-headline p {");
  const headlineSummaryEnd = styles.indexOf(".public-matchday-main-lower", headlineSummaryStart);

  assert.match(styles, /\.public-matchday-editorial h1 \{[\s\S]*?-webkit-line-clamp:\s*5;/);
  assert.match(styles, /\.public-cover-headline p \{[\s\S]*?-webkit-line-clamp:\s*6;/);
});

test("destaques da manchete e resumo da jornada podem ser ativados de forma independente", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const admin = readFileSync("app/admin/editorial/home/page.tsx", "utf8");

  assert.match(page, /const belowHeadlineMode = editorial\?\.below_headline_mode === "roundup" \? "roundup" : "highlights";/);
  assert.match(page, /const highlightsAreActive = belowHeadlineMode === "highlights";/);
  assert.match(page, /const complementaryMode = editorial\?\.complementary_mode \?\? "none";/);
  assert.match(page, /const roundupIsActive = complementaryMode === "roundup_video";/);
  assert.match(page, /const visibleHighlights = highlightsAreActive/);
  assert.match(page, /const visibleRoundupItems = roundupIsActive \? validRoundupItems : \[\];/);
  assert.match(page, /const hasRoundupVideoBlock = roundupIsActive && visibleRoundupItems\.length > 0;/);
  assert.doesNotMatch(page, /belowHeadlineMode === "roundup" \|\| complementaryMode === "roundup_video"/);

  assert.match(
    admin,
    /const complementaryMode =\s*editorial\?\.complementary_mode === "roundup_video" \? "roundup_video" : "complementary_story";/
  );
  assert.match(admin, /name="below_headline_mode"[\s\S]*?<option value="highlights">Ativos<\/option>[\s\S]*?<option value="roundup">Inativos<\/option>/);
  assert.match(admin, /name="complementary_mode"[\s\S]*?<option value="roundup_video">Ativo<\/option>[\s\S]*?<option value="complementary_story">Inativo<\/option>/);
  assert.doesNotMatch(admin, /expectedComplementMode/);
  assert.doesNotMatch(admin, /syncComposition/);
  assert.doesNotMatch(admin, /data-home-below-section/);
  assert.doesNotMatch(admin, /data-home-complement-section/);

  assert.match(page, /roundupHeading:\s*editorial\?\.roundup_video_heading \?\? null/);
  assert.match(page, /const finalZoneTitle = cleanText\(editorial\?\.final_zone_title\);/);
  assert.match(page, /latestNewsTitle=\{finalZoneTitle \?\? ""\}/);
  assert.match(page, /highlightHeading:\s*belowHeadlineHeading/);
  assert.match(page, /title="A acompanhar"/);

  assert.match(admin, /<section className="home-admin-composition-card" id="home-highlights">/);
  assert.match(admin, /<section className="home-admin-composition-card" id="home-roundup">/);
  assert.match(admin, /<section className="home-admin-composition-card" id="home-complement">/);
  assert.match(admin, /Estado dos destaques/);
  assert.match(admin, /Estado do resumo de video/);
  assert.match(admin, /Estado do complemento/);
  assert.match(admin, /Guardar zona de destaques/);
  assert.match(admin, /Guardar zona de resumo/);
  assert.match(admin, /Guardar zona de complemento/);
  assert.doesNotMatch(admin, /<h3>Zona abaixo da manchete<\/h3>/);
});


test("o cabeÃ§alho das Ãšltimas fica vazio quando o campo do backoffice estÃ¡ vazio", () => {
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");

  assert.match(layout, /const visibleTitle = title\?\.trim\(\) \?\? "";/);
  assert.match(layout, /\{visibleTitle \? <h3>\{visibleTitle\}<\/h3> : null\}/);
  assert.match(layout, /<PublicLatestNewsBlock items=\{latestNews\} title=\{latestNewsTitle\} \/>/);
  assert.doesNotMatch(layout, /latestNewsTitle \|\| "Ãšltimas"/);
  assert.doesNotMatch(layout, /title = "Ãšltimas notÃ­cias"/);
});

test("os cabeÃ§alhos editoriais deixam de usar barras horizontais", () => {
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");

  assert.match(
    styles,
    /\.public-context-title,\s*\.public-editorial-section-title \{[\s\S]*?padding-top:\s*0;[\s\S]*?border-top:\s*0;/
  );
  assert.match(
    styles,
    /\.public-cover-support h4,\s*\.public-editorial-block-head,\s*\.public-matchday-news h3 \{[\s\S]*?padding-top:\s*0;[\s\S]*?border-top:\s*0;/
  );
  assert.match(
    styles,
    /\.public-editorial-highlights-section \.public-editorial-block-head \{[\s\S]*?padding-top:\s*0;[\s\S]*?border-top:\s*0;/
  );
});

test("as zonas publicas nao criam texto quando os campos editoriais estao vazios", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");
  const roundup = readFileSync("components/public/RoundupVideoSwitcher.tsx", "utf8");

  assert.match(page, /const belowHeadlineHeading = cleanText\(editorial\?\.below_headline_heading\) \?\? "";/);
  assert.doesNotMatch(page, /"Resumo da Jornada" : "Destaques"/);
  assert.doesNotMatch(layout, /sectionTitle="O que fica"/);
  assert.doesNotMatch(layout, /fallbackTitle: string;[\s\S]*?fallbackText: string;/);
  assert.match(layout, /if \(!hasVisibleContent\) \{\s*return null;\s*\}/);
  assert.match(layout, /heading=\{data\.roundupHeading\}/);
  assert.match(layout, /data\.highlightHeading\.trim\(\) \?/);
  assert.doesNotMatch(roundup, /Resumo da Jornada por definir/);
  assert.doesNotMatch(roundup, /Video por definir/);
  assert.doesNotMatch(roundup, /Video da jornada<\/strong>/);
});

test("as linhas verticais editoriais ficam removidas sem alterar a grelha", () => {
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");

  assert.match(layout, /const publicEditorialLayoutPolishStyles = `/);
  assert.match(
    layout,
    /public-matchday-lead-grid > \.public-matchday-news,[\s\S]*?public-roundup-video-panel \{[\s\S]*?border-left:\s*0 !important;[\s\S]*?border-right:\s*0 !important;/
  );
  assert.match(layout, /<style>\{publicEditorialLayoutPolishStyles\}<\/style>/);
});
test("o titulo da zona de video fica no fluxo normal e a linha superior do bloco desaparece", () => {
  const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");
  const roundup = readFileSync("components/public/RoundupVideoSwitcher.tsx", "utf8");

  assert.match(layout, /public-matchday-panel \.public-matchday-depth-row \{[\s\S]*?border-top:\s*0 !important;/);
  assert.match(roundup, /\{headingText \? \([\s\S]*?<h3 className="public-roundup-zone-heading"[\s\S]*?\{headingText\}[\s\S]*?<\/h3>/);
  assert.doesNotMatch(roundup, /\.public-roundup-video-layout \.public-roundup-zone-heading \{\s*position:\s*absolute;/);
  assert.doesNotMatch(roundup, /public-roundup-inline-head-spacer/);
  assert.doesNotMatch(roundup, /splitHeadingLines/);
});

test("o resumo de video e o complemento usam o mesmo nivel e a mesma tipografia", () => {
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");
  const roundup = readFileSync("components/public/RoundupVideoSwitcher.tsx", "utf8");

  assert.match(styles, /\.public-matchday-cover \{[\s\S]*?gap:\s*20px;/);
  assert.match(styles, /\.public-matchday-depth-row \{[\s\S]*?padding-top:\s*0;/);
  assert.match(
    roundup,
    /\.public-roundup-video-layout \.public-roundup-zone-heading \{[\s\S]*?font-family:\s*Arial, Helvetica, sans-serif;[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*900;[\s\S]*?line-height:\s*1;[\s\S]*?text-transform:\s*uppercase;/
  );
  assert.match(roundup, /\.public-roundup-video-layout \.public-matchday-roundup \{[\s\S]*?gap:\s*12px;/);
  assert.match(roundup, /\.public-roundup-video-layout \.public-roundup-video-panel \{[\s\S]*?padding-top:\s*26px;/);
});


test("o resumo de video encosta a esquerda dos Destaques e abre espaco antes do Complemento", () => {
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");

  assert.match(
    styles,
    /\.public-roundup-video-layout \{[\s\S]*?justify-content:\s*start;[\s\S]*?gap:\s*24px;/
  );
  assert.match(
    styles,
    /\.public-roundup-video-layout > \.public-matchday-roundup \{[\s\S]*?justify-self:\s*start;[\s\S]*?margin-left:\s*0;/
  );
  assert.match(
    styles,
    /\.public-matchday-main-lower:has\(\.public-roundup-video-panel\) \.public-matchday-roundup \{[\s\S]*?justify-self:\s*start;[\s\S]*?margin-left:\s*0;[\s\S]*?padding:\s*var\(--public-roundup-top-align\) 0 0 0;/
  );
});

test("o traco do video ativo entra no alinhamento dos Destaques e o espaco morto antes do Complemento desaparece", () => {
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");
  const roundup = readFileSync("components/public/RoundupVideoSwitcher.tsx", "utf8");

  assert.match(
    roundup,
    /\.public-roundup-video-layout \.public-roundup-scroll-window \{[\s\S]*?margin-left:\s*0;[\s\S]*?padding-left:\s*34px;/
  );
  assert.match(
    styles,
    /\.public-roundup-video-layout \{[\s\S]*?grid-template-columns:\s*minmax\(0, 340px\) minmax\(0, 1fr\);/
  );
  assert.match(
    styles,
    /\.public-matchday-main-lower:has\(\.public-roundup-video-panel\) \.public-roundup-video-panel \{[\s\S]*?justify-self:\s*stretch;[\s\S]*?width:\s*100%;/
  );
});
