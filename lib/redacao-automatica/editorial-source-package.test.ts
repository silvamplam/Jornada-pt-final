import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH,
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
  EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH,
  buildEditorialSourcePackageMarkdown,
  editorialSourceAnteTitle,
  editorialSourcePackageArticleImageSources,
  editorialSourcePackageFileName,
  editorialSourcePackageImagesFileName,
  editorialSourcePackagePrompt,
  editorialSourcePackageUsedSourceRefs,
  isEditorialSourcePackageLocation,
  normalizeEditorialSourcePackageEditorialInput,
  normalizeEditorialSourcePackageSelections,
  updateEditorialSourcePackageMarkdown,
} from "./editorial-source-package-internal";

const ARTICLE_ID = "91000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "91000000-0000-4000-8000-000000000002";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("o pacote de publicação automática produz apenas artigos para o fluxo de Últimas", () => {
  const prompt = editorialSourcePackagePrompt("news");

  assert.doesNotMatch(prompt, /DESTINO EDITORIAL/);
  assert.doesNotMatch(prompt, /zona editorial Contexto/i);
  assert.match(prompt, /um bloco \[JORNADA_ARTIGO_V1\] por grupo/i);
  assert.match(prompt, /quatro campos são obrigatórios neste fluxo de publicação/i);
});

test("normaliza entre uma e vinte seleções e rejeita duplicados", () => {
  assert.deepEqual(
    normalizeEditorialSourcePackageSelections([{
      newsroomArticleId: ` ${ARTICLE_ID.toUpperCase()} `,
      newsroomSnapshotId: ` ${SNAPSHOT_ID.toUpperCase()} `,
    }]),
    [{
      newsroomArticleId: ARTICLE_ID,
      newsroomSnapshotId: SNAPSHOT_ID,
      articleGroup: 1,
    }],
  );

  assert.equal(normalizeEditorialSourcePackageSelections([]), null);
  assert.equal(
    normalizeEditorialSourcePackageSelections(
      Array.from({ length: EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES + 1 }, (_, index) => ({
        newsroomArticleId: `91000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        newsroomSnapshotId: `92000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      })),
    ),
    null,
  );
  assert.equal(
    normalizeEditorialSourcePackageSelections([
      { newsroomArticleId: ARTICLE_ID, newsroomSnapshotId: SNAPSHOT_ID },
      { newsroomArticleId: ARTICLE_ID, newsroomSnapshotId: "91000000-0000-4000-8000-000000000003" },
    ]),
    null,
  );
});

test("normaliza grupos de fontes pela ordem do primeiro artigo", () => {
  const secondArticleId = "91000000-0000-4000-8000-000000000011";
  const secondSnapshotId = "91000000-0000-4000-8000-000000000012";
  const thirdArticleId = "91000000-0000-4000-8000-000000000021";
  const thirdSnapshotId = "91000000-0000-4000-8000-000000000022";

  assert.deepEqual(
    normalizeEditorialSourcePackageSelections([
      { newsroomArticleId: ARTICLE_ID, newsroomSnapshotId: SNAPSHOT_ID, articleGroup: 8 },
      { newsroomArticleId: secondArticleId, newsroomSnapshotId: secondSnapshotId, articleGroup: 8 },
      { newsroomArticleId: thirdArticleId, newsroomSnapshotId: thirdSnapshotId, articleGroup: 3 },
    ]),
    [
      { newsroomArticleId: ARTICLE_ID, newsroomSnapshotId: SNAPSHOT_ID, articleGroup: 1 },
      { newsroomArticleId: secondArticleId, newsroomSnapshotId: secondSnapshotId, articleGroup: 1 },
      { newsroomArticleId: thirdArticleId, newsroomSnapshotId: thirdSnapshotId, articleGroup: 2 },
    ],
  );
});

test("aceita uma única imagem preferida por artigo e rejeita duas preferências no mesmo grupo", () => {
  const secondArticleId = "91000000-0000-4000-8000-000000000021";
  const secondSnapshotId = "91000000-0000-4000-8000-000000000022";

  assert.deepEqual(normalizeEditorialSourcePackageSelections([
    {
      newsroomArticleId: ARTICLE_ID,
      newsroomSnapshotId: SNAPSHOT_ID,
      articleGroup: 1,
      imagePreferred: true,
    },
    {
      newsroomArticleId: secondArticleId,
      newsroomSnapshotId: secondSnapshotId,
      articleGroup: 1,
    },
  ]), [
    {
      newsroomArticleId: ARTICLE_ID,
      newsroomSnapshotId: SNAPSHOT_ID,
      articleGroup: 1,
      imagePreferred: true,
    },
    {
      newsroomArticleId: secondArticleId,
      newsroomSnapshotId: secondSnapshotId,
      articleGroup: 1,
    },
  ]);

  assert.equal(normalizeEditorialSourcePackageSelections([
    {
      newsroomArticleId: ARTICLE_ID,
      newsroomSnapshotId: SNAPSHOT_ID,
      articleGroup: 1,
      imagePreferred: true,
    },
    {
      newsroomArticleId: secondArticleId,
      newsroomSnapshotId: secondSnapshotId,
      articleGroup: 1,
      imagePreferred: true,
    },
  ]), null);
});

test("normaliza o género e os campos editoriais com limites explícitos", () => {
  assert.deepEqual(
    normalizeEditorialSourcePackageEditorialInput({
      genre: "analysis",
      suggestedTitle: "  Uma análise sugerida  ",
      additionalInstructions: "  Dar prioridade ao contexto.\r\nEvitar listas.  ",
    }),
    {
      genre: "analysis",
      genreLabel: "Análise",
      suggestedTitle: "Uma análise sugerida",
      additionalInstructions: "Dar prioridade ao contexto.\nEvitar listas.",
    },
  );

  assert.equal(
    normalizeEditorialSourcePackageEditorialInput({
      genre: "unknown",
      suggestedTitle: "",
      additionalInstructions: "",
    }),
    null,
  );
  assert.equal(
    normalizeEditorialSourcePackageEditorialInput({
      genre: "news",
      suggestedTitle: "x".repeat(EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH + 1),
      additionalInstructions: "",
    }),
    null,
  );
  assert.equal(
    normalizeEditorialSourcePackageEditorialInput({
      genre: "news",
      suggestedTitle: "",
      additionalInstructions: "x".repeat(EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH + 1),
    }),
    null,
  );
});

test("define um ficheiro e uma instrução diferentes para cada género", () => {
  assert.equal(editorialSourcePackageFileName("news"), "fontes-selecionadas-noticia.md");
  assert.equal(editorialSourcePackageFileName("brief"), "fontes-selecionadas-breve.md");
  assert.equal(editorialSourcePackageFileName("analysis"), "fontes-selecionadas-analise.md");
  assert.equal(editorialSourcePackageFileName("editorial"), "fontes-selecionadas-editorial.md");
  assert.equal(editorialSourcePackageImagesFileName("news"), "imagens-fontes-noticia.zip");
  assert.equal(editorialSourcePackageImagesFileName("brief"), "imagens-fontes-breve.zip");
  assert.equal(editorialSourcePackageImagesFileName("analysis"), "imagens-fontes-analise.zip");
  assert.equal(editorialSourcePackageImagesFileName("editorial"), "imagens-fontes-editorial.zip");
  assert.equal(
    editorialSourcePackageFileName(
      "news",
      "Doumbia prepara a estreia do Sporting na Liga",
    ),
    "fontes-doumbia-prepara-a-estreia-do-sporting-na-liga.md",
  );
  assert.equal(
    editorialSourcePackageImagesFileName(
      "news",
      "Doumbia prepara a estreia do Sporting na Liga",
    ),
    "imagens-doumbia-prepara-a-estreia-do-sporting-na-liga.zip",
  );
  assert.equal(
    editorialSourcePackageImagesFileName("analysis", "  João Félix: decisão & futuro!  "),
    "imagens-joao-felix-decisao-futuro.zip",
  );
  assert.equal(
    editorialSourcePackageImagesFileName("brief", "⚽️"),
    "imagens-fontes-breve.zip",
  );
  assert.equal(
    editorialSourcePackageImagesFileName("editorial", "A".repeat(100)),
    `imagens-${"a".repeat(70)}.zip`,
  );

  assert.match(editorialSourcePackagePrompt("news"), /notícia jornalística desenvolvida/i);
  assert.match(editorialSourcePackagePrompt("brief"), /entre 100 e 180 palavras/i);
  assert.match(editorialSourcePackagePrompt("analysis"), /análise jornalística/i);
  assert.match(editorialSourcePackagePrompt("editorial"), /posição clara, institucional e argumentada/i);

  for (const genre of ["news", "brief", "analysis", "editorial"] as const) {
    const prompt = editorialSourcePackagePrompt(genre);
    assert.match(prompt, /Leia integralmente e considere todas as fontes/);
    assert.match(prompt, /pesquise sempre fontes externas atuais e credíveis/i);
    assert.match(prompt, /um bloco \[JORNADA_ARTIGO_V1\] por grupo/i);
    assert.match(prompt, /Melhore-o ou substitua-o/);
    assert.match(prompt, /Não invente factos/);
    assert.match(prompt, /\[JORNADA_ARTIGO_V1\]/);
    assert.match(prompt, /\[\/JORNADA_ARTIGO_V1\]/);
    assert.match(prompt, /Publicação em lote da Jornada\.pt/i);
  }
});

test("identifica antetítulo apenas quando foi explicitamente preservado nos metadados", () => {
  assert.equal(editorialSourceAnteTitle({ anteTitle: "Liga dos Campeões" }), "Liga dos Campeões");
  assert.equal(editorialSourceAnteTitle({ kicker: "Mercado" }), "Mercado");
  assert.equal(editorialSourceAnteTitle({ category: "Futebol" }), null);
});

test("gera Markdown com tarefa editorial antes das fontes integrais", () => {
  const markdown = buildEditorialSourcePackageMarkdown({
    createdAt: "2026-08-01T07:30:00.000Z",
    editorial: {
      genre: "news",
      genreLabel: "Notícia",
      suggestedTitle: "FC Porto e Sporting chegam à Supertaça sob pressão",
      additionalInstructions: "Dar prioridade aos elementos que condicionam o jogo.",
    },
    entries: [
      {
        position: 1,
        articlePosition: 1,
        status: "prepared",
        sourceCode: "record",
        sourceName: "Record",
        sourceUrl: "https://www.record.pt/noticia-1",
        author: "Autor Um",
        publishedAt: "2026-08-01T06:00:00+01:00",
        anteTitle: "Mercado",
        title: "Primeiro título",
        postTitle: "Primeiro pós-título",
        body: [
          { type: "paragraph", text: "Primeiro parágrafo integral." },
          { type: "heading", text: "Intertítulo original" },
          { type: "paragraph", text: "Segundo parágrafo integral." },
        ],
        imageUrl: "https://assets.example.invalid/one.jpg",
      },
      {
        position: 2,
        articlePosition: 2,
        status: "prepared",
        sourceCode: "abola",
        sourceName: "A Bola",
        sourceUrl: "https://www.abola.pt/noticia-2",
        author: null,
        publishedAt: null,
        anteTitle: null,
        title: "Segundo título",
        postTitle: null,
        body: [{ type: "paragraph", text: "Corpo integral da segunda notícia." }],
        imageUrl: null,
      },
    ],
  });

  assert.match(markdown, /^# TAREFA EDITORIAL/);
  assert.ok(markdown.indexOf("# TAREFA EDITORIAL") < markdown.indexOf("# FONTES INTEGRAIS"));
  assert.match(markdown, /## GÉNERO JORNALÍSTICO[\s\S]*Notícia/);
  assert.match(markdown, /## TÍTULO SUGERIDO PELO EDITOR[\s\S]*FC Porto e Sporting/);
  assert.match(markdown, /## INSTRUÇÕES ADICIONAIS DO EDITOR[\s\S]*condicionam o jogo/);
  assert.match(markdown, /## INSTRUÇÃO DE REDAÇÃO[\s\S]*notícia jornalística desenvolvida/i);
  assert.match(markdown, /\*\*FONTES SELECIONADAS:\*\* 2/);
  assert.match(markdown, /\*\*ARTIGOS FINAIS:\*\* 2/);
  assert.match(markdown, /# ARTIGO 01 DE 02/);
  assert.match(markdown, /## FONTE 01 DE 01/);
  assert.match(markdown, /## ANTETÍTULO[\s\S]*Mercado/);
  assert.match(markdown, /## TÍTULO[\s\S]*Primeiro título/);
  assert.match(markdown, /## PÓS-TÍTULO[\s\S]*Primeiro pós-título/);
  assert.match(markdown, /### Intertítulo original/);
  assert.match(markdown, /# ARTIGO 02 DE 02/);
  assert.doesNotMatch(
    markdown.slice(markdown.indexOf("# ARTIGO 02 DE 02")),
    /### ANTETÍTULO|### PÓS-TÍTULO/,
  );
  assert.match(markdown, /Não foram resumidos nem reescritos por IA/);
});

test("agrupa várias fontes num único artigo e escolhe uma imagem por artigo", () => {
  const entries = [
    {
      position: 1,
      articlePosition: 1,
      status: "prepared" as const,
      sourceCode: "record",
      sourceName: "Record",
      sourceUrl: "https://www.record.pt/a",
      author: null,
      publishedAt: null,
      anteTitle: null,
      title: "Fonte A",
      postTitle: null,
      body: [{ type: "paragraph" as const, text: "Corpo A." }],
      imageUrl: "https://assets.example.invalid/first.jpg",
    },
    {
      position: 2,
      articlePosition: 1,
      status: "prepared" as const,
      sourceCode: "abola",
      sourceName: "A Bola",
      sourceUrl: "https://www.abola.pt/b",
      author: null,
      publishedAt: null,
      anteTitle: null,
      title: "Fonte B",
      postTitle: null,
      body: [{ type: "paragraph" as const, text: "Corpo B." }],
      imageUrl: "https://assets.example.invalid/group.jpg",
      imagePreferred: true,
    },
    {
      position: 3,
      articlePosition: 2,
      status: "prepared" as const,
      sourceCode: "maisfutebol",
      sourceName: "Maisfutebol",
      sourceUrl: "https://maisfutebol.iol.pt/c",
      author: null,
      publishedAt: null,
      anteTitle: null,
      title: "Fonte C",
      postTitle: null,
      body: [{ type: "paragraph" as const, text: "Corpo C." }],
      imageUrl: "https://assets.example.invalid/group.jpg",
    },
  ];

  const markdown = buildEditorialSourcePackageMarkdown({
    createdAt: "2026-08-14T15:00:00.000Z",
    editorial: {
      genre: "news",
      genreLabel: "Notícia",
      suggestedTitle: null,
      additionalInstructions: null,
    },
    entries,
  });

  assert.match(markdown, /# ARTIGO 01 DE 02[\s\S]*## FONTE 01 DE 02[\s\S]*## FONTE 02 DE 02/);
  assert.match(markdown, /# ARTIGO 02 DE 02[\s\S]*## FONTE 01 DE 01/);
  assert.deepEqual(editorialSourcePackageArticleImageSources(entries), [
    {
      position: 1,
      sourceCode: "abola",
      articleTitle: "Fonte B",
      imageUrl: "https://assets.example.invalid/group.jpg",
    },
    {
      position: 2,
      sourceCode: "maisfutebol",
      articleTitle: "Fonte C",
      imageUrl: "https://assets.example.invalid/group.jpg",
    },
  ]);
});

test("extrai apenas fontes efetivamente utilizadas de manifestos persistidos", () => {
  assert.deepEqual(editorialSourcePackageUsedSourceRefs({
    entries: [
      {
        newsroomArticleId: ARTICLE_ID,
        newsroomSnapshotId: SNAPSHOT_ID,
        usedAt: "2026-08-14T15:00:00.000Z",
      },
      {
        newsroomArticleId: "91000000-0000-4000-8000-000000000011",
        newsroomSnapshotId: "91000000-0000-4000-8000-000000000012",
        usedAt: null,
      },
    ],
  }), [{
    newsroomArticleId: ARTICLE_ID,
    newsroomSnapshotId: SNAPSHOT_ID,
    usedAt: "2026-08-14T15:00:00.000Z",
  }]);
});

test("atualiza título e instruções sem alterar as fontes integrais", () => {
  const original = buildEditorialSourcePackageMarkdown({
    createdAt: "2026-08-01T07:30:00.000Z",
    editorial: {
      genre: "analysis",
      genreLabel: "Análise",
      suggestedTitle: "Título inicial",
      additionalInstructions: "Instrução inicial.",
    },
    entries: [{
      position: 1,
      articlePosition: 1,
      status: "prepared",
      sourceCode: "record",
      sourceName: "Record",
      sourceUrl: "https://www.record.pt/noticia",
      author: "Autor",
      publishedAt: "2026-08-01T06:00:00+01:00",
      anteTitle: null,
      title: "Título integral da fonte",
      postTitle: null,
      body: [{ type: "paragraph", text: "Corpo integral que não pode ser alterado." }],
      imageUrl: null,
    }],
  });
  const sourcesIndex = original.indexOf("# FONTES INTEGRAIS");
  const originalSources = original.slice(sourcesIndex);

  const updated = updateEditorialSourcePackageMarkdown({
    markdown: original,
    editorial: {
      genre: "analysis",
      genreLabel: "Análise",
      suggestedTitle: "Título corrigido",
      additionalInstructions: "Acrescentar o precedente destes acontecimentos.",
    },
  });

  assert.ok(updated);
  assert.match(updated, /Título corrigido/);
  assert.match(updated, /Acrescentar o precedente/);
  assert.doesNotMatch(updated, /Título inicial|Instrução inicial/);
  assert.equal(updated.slice(updated.indexOf("# FONTES INTEGRAIS")), originalSources);
  assert.equal(updateEditorialSourcePackageMarkdown({
    markdown: "# TAREFA EDITORIAL\nSem fontes",
    editorial: {
      genre: "analysis",
      genreLabel: "Análise",
      suggestedTitle: null,
      additionalInstructions: null,
    },
  }), null);
});

test("mantém no ficheiro as notícias que falharam", () => {
  const markdown = buildEditorialSourcePackageMarkdown({
    createdAt: "2026-08-01T07:30:00.000Z",
    editorial: {
      genre: "brief",
      genreLabel: "Breve",
      suggestedTitle: null,
      additionalInstructions: null,
    },
    entries: [{
      position: 1,
      articlePosition: 1,
      status: "failed",
      sourceCode: "record",
      sourceName: "Record",
      sourceUrl: "https://www.record.pt/noticia",
      title: "Notícia identificada",
      errorCode: "snapshot_not_found",
      errorMessage: "O snapshot selecionado já não está disponível.",
    }],
  });

  assert.match(markdown, /Não indicado/);
  assert.match(markdown, /Sem instruções adicionais/);
  assert.match(markdown, /\*\*COM FALHA:\*\* 1/);
  assert.match(markdown, /Não foi possível preparar integralmente esta fonte/);
  assert.match(markdown, /snapshot_not_found/);
});

test("valida a localização local sem aceitar travessia de diretórios", () => {
  assert.equal(isEditorialSourcePackageLocation({
    year: "2026",
    month: "08",
    packageId: ARTICLE_ID,
  }), true);
  assert.equal(isEditorialSourcePackageLocation({
    year: "../2026",
    month: "08",
    packageId: ARTICLE_ID,
  }), false);
  assert.equal(isEditorialSourcePackageLocation({
    year: "2026",
    month: "13",
    packageId: ARTICLE_ID,
  }), false);
});

test("a interface recolhe género, título e instruções e expõe as ações finais", () => {
  const mainPage = read("app/admin/editorial/redacao-automatica/page.tsx");
  const page = read(
    "app/admin/editorial/redacao-automatica/pacotes/[year]/[month]/[id]/page.tsx",
  );
  const actions = read(
    "app/admin/editorial/redacao-automatica/_sourcePackageActions.tsx",
  );
  const submitEnhancer = read(
    "app/admin/editorial/redacao-automatica/_sourcePackageSubmitEnhancer.tsx",
  );
  const styles = read(
    "app/admin/editorial/redacao-automatica/redacao-automatica.module.css",
  );
  const internal = read(
    "lib/redacao-automatica/editorial-source-package-internal.ts",
  );
  const route = read(
    "app/api/admin/editorial/redacao-automatica/source-package/route.ts",
  );
  const contentRoute = read(
    "app/api/admin/editorial/redacao-automatica/source-package/[year]/[month]/[id]/route.ts",
  );
  const imagesRoute = read(
    "app/api/admin/editorial/redacao-automatica/source-package/[year]/[month]/[id]/images/route.ts",
  );

  assert.match(mainPage, /name="editorial_genre"/);
  assert.match(mainPage, /name="suggested_title"/);
  assert.match(mainPage, /name="editorial_instructions"/);
  assert.match(mainPage, /data-source-package-group-control/);
  assert.match(mainPage, /data-source-package-group/);
  assert.match(mainPage, /source_group_/);
  assert.match(mainPage, /data-source-package-suggested-title/);
  assert.match(submitEnhancer, /NEW_ARTICLE_VALUE/);
  assert.match(submitEnhancer, /Separar para novo Dossiê/);
  assert.match(submitEnhancer, /selected\.length < 2/);
  assert.match(submitEnhancer, /groupBySource/);
  assert.match(submitEnhancer, /data-source-package-use-image/);
  assert.match(submitEnhancer, /Imagem escolhida/);
  assert.match(mainPage, /data-source-package-image-preference/);
  assert.match(mainPage, /data-source-package-image-summary/);
  assert.match(mainPage, /data-source-package-image-summary-list/);
  assert.doesNotMatch(mainPage, /data-source-package-image-control/);
  assert.doesNotMatch(mainPage, />Usar esta imagem</);
  assert.match(submitEnhancer, /Dossiês/);
  assert.match(submitEnhancer, /renderImageSummary/);
  assert.match(submitEnhancer, /Usar esta imagem/);
  assert.match(submitEnhancer, /suggestedTitleField\.hidden = !titleApplies/);
  assert.match(styles, /sourcePackageEditorialFields > label\[hidden\]/);
  assert.match(styles, /sourcePackageArticleImages\[hidden\]/);
  assert.match(mainPage, /EDITORIAL_SOURCE_PACKAGE_GENRES\.map/);
  assert.match(internal, /label: "Notícia"/);
  assert.match(internal, /label: "Breve"/);
  assert.match(internal, /label: "Análise"/);
  assert.match(internal, /label: "Editorial"/);
  assert.doesNotMatch(actions, /Descarregar \.md —/);
  assert.match(actions, /Descarregar imagens \(\.zip\) —/);
  assert.match(actions, /Copiar pacote para ChatGPT —/);
  assert.doesNotMatch(actions, /Ler clipboard e abrir Artigos/);
  assert.doesNotMatch(actions, /Abrir Artigos com o texto colado/);
  assert.doesNotMatch(actions, /navigator\.clipboard\?\.readText/);
  assert.match(actions, /Colar resposta do ChatGPT/);
  assert.match(actions, /onPaste=\{importPastedResponse\}/);
  assert.match(actions, /Ctrl\+Enter/);
  assert.match(actions, /preflightEditorialArticleBatch/);
  assert.match(actions, /EDITORIAL_BATCH_TRANSFER_STORAGE_KEY/);
  assert.match(actions, /EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY/);
  assert.match(actions, /window\.sessionStorage\.setItem/);
  assert.match(actions, /publicacao-lote/);
  assert.doesNotMatch(actions, /window\.open\("about:blank"/);
  assert.doesNotMatch(actions, /import_external=1/);
  assert.doesNotMatch(actions, /parseEditorialExternalArticleResponse/);
  assert.match(page, /manifest\.genreLabel/);
  assert.match(page, /manifest\.articleCount/);
  assert.match(page, /articleCount=\{manifest\.articleCount\}/);
  assert.match(page, /manifest\.suggestedTitle/);
  assert.match(page, /manifest\.additionalInstructions/);
  assert.match(page, /Ajustar antes de copiar/);
  assert.match(page, /name="suggested_title"/);
  assert.match(page, /name="editorial_instructions"/);
  assert.match(page, /Atualizar assunto e instruções/);
  assert.match(page, /Atualizar instruções/);
  assert.match(page, /sem voltar a recolher as fontes nem as imagens/i);
  assert.match(page, /package_updated/);
  assert.match(page, /package_update_error/);
  assert.match(page, /Imagens para artigos/);
  assert.match(page, /imageSourceCount/);
  assert.match(page, /Imagens locais/);
  assert.match(page, /manifest\.localDirectory/);
  assert.match(page, /pacote permanece acessível para copiar/);
  assert.match(route, /editorial_genre/);
  assert.match(route, /suggested_title/);
  assert.match(route, /editorial_instructions/);
  assert.match(route, /source_snapshot_/);
  assert.match(route, /source_group_/);
  assert.match(route, /source_image_preferred_/);
  assert.match(route, /createEditorialSourcePackage/);
  assert.match(contentRoute, /text\/markdown; charset=utf-8/);
  assert.match(contentRoute, /editorialSourcePackageFileName/);
  assert.match(contentRoute, /manifest\.suggestedTitle/);
  assert.match(contentRoute, /Content-Disposition/);
  assert.match(contentRoute, /export async function POST/);
  assert.match(contentRoute, /updateEditorialSourcePackageEditorial/);
  assert.match(contentRoute, /package_updated/);
  assert.match(contentRoute, /package_update_error/);
  assert.match(imagesRoute, /application\/zip/);
  assert.match(imagesRoute, /buildEditorialSourceImagesZip/);
  assert.match(imagesRoute, /editorialSourcePackageArticleImageSources/);
  assert.match(imagesRoute, /X-Jornada-Images-Downloaded/);
  assert.match(imagesRoute, /manifest\.suggestedTitle/);

  const packageService = read(
    "lib/redacao-automatica/editorial-source-package.ts",
  );
  assert.match(packageService, /writeSupabaseAdminReturning/);
  assert.match(packageService, /newsroom_editorial_source_packages/);
  assert.match(packageService, /updateEditorialSourcePackageMarkdown/);
  assert.match(packageService, /suggestedTitle: editorial\.suggestedTitle/);
  assert.match(packageService, /markdownFileName: editorialSourcePackageFileName/);
  assert.match(packageService, /additionalInstructions: editorial\.additionalInstructions/);
  assert.match(packageService, /imageUrl: entry\.status === "prepared"/);
  assert.match(packageService, /publishedAt: entry\.status === "prepared" \? entry\.publishedAt : null/);
  assert.match(packageService, /publishedAtPrecisionFromSourceMetadata\(snapshot\.source_metadata\)/);
  assert.match(packageService, /entry\.publishedAtPrecision \?\? null/);
  assert.match(packageService, /version: 2/);
  assert.match(packageService, /articleCount/);
  assert.match(packageService, /effectiveEditorial/);
  assert.match(packageService, /markEditorialSourcePackageArticleUsed/);
  assert.match(packageService, /publishedArticleId/);
  assert.match(packageService, /usedAt/);

  const articleForm = read("app/admin/editorial/artigos/_articleForm.tsx");
  const articleImporter = read("app/admin/editorial/artigos/_externalArticleImport.tsx");
  const articleImageImportRoute = read(
    "app/api/admin/editorial/artigos/import-source-image/route.ts",
  );
  assert.match(articleForm, /<ExternalArticleImport \/>/);
  assert.match(articleImporter, /Preencher a partir do clipboard/);
  assert.match(articleImporter, /Resposta da IA/);
  assert.match(articleImporter, /onPaste=\{importPastedResponse\}/);
  assert.match(articleImporter, /Ao colar, os campos são preenchidos imediatamente/);
  assert.match(articleImporter, /Preencher com o texto colado/);
  assert.match(articleImporter, /formField\(form, "label"\)/);
  assert.match(articleImporter, /formField\(form, "title"\)/);
  assert.match(articleImporter, /formField\(form, "subtitle"\)/);
  assert.match(articleImporter, /formField\(form, "editorial_destination"\)/);
  assert.match(articleImporter, /article\.editorialDestination/);
  assert.match(articleImporter, /formField\(form, "body"\)/);
  assert.match(articleImporter, /formField\(form, "image_url"\)/);
  assert.match(articleImporter, /parseStoredEditorialExternalArticleTransfer/);
  assert.match(articleImporter, /transfer\.imageCandidates\.length === 1/);
  assert.match(articleImporter, /Nenhuma é selecionada arbitrariamente/);
  assert.match(articleImporter, /\/api\/admin\/editorial\/artigos\/import-source-image/);
  assert.match(articleImporter, /setFieldValue\(formField\(form, "image_url"\), payload\.publicUrl\)/);
  assert.match(articleImporter, /Imagem do pacote/);
  assert.match(articleImporter, /Nada é guardado ou publicado automaticamente/);
  assert.match(articleForm, /article-admin-external-images-grid/);
  assert.match(articleImageImportRoute, /readEditorialSourcePackage/);
  assert.match(articleImageImportRoute, /downloadEditorialSourceImage/);
  assert.match(articleImageImportRoute, /const BUCKET = "editorial-images"/);
  assert.match(articleImageImportRoute, /storage\/v1\/object/);
  assert.match(articleImageImportRoute, /publicUrl/);
});

test("o Markdown persiste no Supabase e o arquivo local fica limitado às imagens", () => {
  const imageService = read("lib/redacao-automatica/editorial-source-image.ts");
  const packageService = read("lib/redacao-automatica/editorial-source-package.ts");
  const packageType = read("lib/redacao-automatica/editorial-source-package-internal.ts");
  const imageZipService = read("lib/redacao-automatica/editorial-source-image-zip.ts");
  const zipArchive = read("lib/redacao-automatica/zip-archive.ts");
  const preflightSql = read(
    "supabase/steps/52-redacao-automatica-pacotes-fontes-persistentes-preflight.sql",
  );
  const applySql = read(
    "supabase/steps/53-redacao-automatica-pacotes-fontes-persistentes-apply.sql",
  );
  const postflightSql = read(
    "supabase/steps/54-redacao-automatica-pacotes-fontes-persistentes-postflight.sql",
  );
  const smokeSql = read(
    "supabase/steps/55-redacao-automatica-pacotes-fontes-persistentes-smoke-rollback.sql",
  );

  assert.match(imageService, /"Pictures", "Jornada\.pt", "Editorial"/);
  assert.match(imageService, /export function editorialLocalArchiveDirectory/);
  assert.match(packageService, /editorialLocalArchiveDirectory\(input\.packageId, now\)/);
  assert.match(packageService, /const archivedImages = localDirectory/);
  assert.match(packageService, /writeSupabaseAdmin\("newsroom_editorial_source_packages"/);
  assert.match(packageService, /fetchSupabaseAdminTable<EditorialSourcePackageRow>/);
  assert.match(packageService, /writeSupabaseAdminReturning<EditorialSourcePackageUpdateRow>/);
  assert.doesNotMatch(packageService, /local_archive_unavailable/);
  assert.doesNotMatch(packageService, /writeFile\(/);
  assert.match(packageType, /localDirectory: string \| null/);
  assert.match(packageType, /imageUrl\?: string \| null/);
  assert.match(imageZipService, /MAX_ZIP_IMAGE_BYTES/);
  assert.match(imageZipService, /downloadCache/);
  assert.doesNotMatch(imageZipService, /unique\.has\(imageUrl\)/);
  assert.match(imageZipService, /LEIA-ME\.txt/);
  assert.match(zipArchive, /0x04034b50/);
  assert.match(zipArchive, /0x06054b50/);
  assert.match(applySql, /create table public\.newsroom_editorial_source_packages/);
  assert.match(applySql, /manifest jsonb not null/);
  assert.match(applySql, /markdown text not null/);
  assert.match(preflightSql, /service_role_missing/);
  assert.match(applySql, /force row level security/);
  assert.match(applySql, /to service_role/);
  assert.match(postflightSql, /public_privilege_detected/);
  assert.match(postflightSql, /service_role_privilege_missing/);
  assert.match(smokeSql, /set local role service_role/);
  assert.match(smokeSql, /rollback/);
});
