import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH,
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
  EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH,
  buildEditorialSourcePackageMarkdown,
  editorialSourceAnteTitle,
  editorialSourcePackageFileName,
  editorialSourcePackagePrompt,
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

test("normaliza entre uma e vinte seleções e rejeita duplicados", () => {
  assert.deepEqual(
    normalizeEditorialSourcePackageSelections([{
      newsroomArticleId: ` ${ARTICLE_ID.toUpperCase()} `,
      newsroomSnapshotId: ` ${SNAPSHOT_ID.toUpperCase()} `,
    }]),
    [{
      newsroomArticleId: ARTICLE_ID,
      newsroomSnapshotId: SNAPSHOT_ID,
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

  assert.match(editorialSourcePackagePrompt("news"), /notícia jornalística desenvolvida/i);
  assert.match(editorialSourcePackagePrompt("brief"), /entre 100 e 180 palavras/i);
  assert.match(editorialSourcePackagePrompt("analysis"), /análise jornalística/i);
  assert.match(editorialSourcePackagePrompt("editorial"), /posição clara, institucional e argumentada/i);

  for (const genre of ["news", "brief", "analysis", "editorial"] as const) {
    const prompt = editorialSourcePackagePrompt(genre);
    assert.match(prompt, /Leia e considere todas as fontes/);
    assert.match(prompt, /Melhore-o ou substitua-o/);
    assert.match(prompt, /Não invente factos/);
    assert.match(prompt, /\[JORNADA_ARTIGO_V1\]/);
    assert.match(prompt, /\[\/JORNADA_ARTIGO_V1\]/);
    assert.match(prompt, /importar a resposta diretamente para o editor da Jornada\.pt/i);
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
  assert.match(markdown, /\*\*NOTÍCIAS SELECIONADAS:\*\* 2/);
  assert.match(markdown, /# NOTÍCIA 01 DE 02/);
  assert.match(markdown, /## ANTETÍTULO[\s\S]*Mercado/);
  assert.match(markdown, /## TÍTULO[\s\S]*Primeiro título/);
  assert.match(markdown, /## PÓS-TÍTULO[\s\S]*Primeiro pós-título/);
  assert.match(markdown, /### Intertítulo original/);
  assert.match(markdown, /# NOTÍCIA 02 DE 02/);
  assert.doesNotMatch(
    markdown.slice(markdown.indexOf("# NOTÍCIA 02 DE 02")),
    /## ANTETÍTULO|## PÓS-TÍTULO/,
  );
  assert.match(markdown, /Não foram resumidos nem reescritos por IA/);
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
  assert.match(markdown, /Não foi possível preparar integralmente esta notícia/);
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

test("a interface recolhe género, título e instruções e expõe as três ações finais", () => {
  const mainPage = read("app/admin/editorial/redacao-automatica/page.tsx");
  const page = read(
    "app/admin/editorial/redacao-automatica/pacotes/[year]/[month]/[id]/page.tsx",
  );
  const actions = read(
    "app/admin/editorial/redacao-automatica/_sourcePackageActions.tsx",
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

  assert.match(mainPage, /name="editorial_genre"/);
  assert.match(mainPage, /name="suggested_title"/);
  assert.match(mainPage, /name="editorial_instructions"/);
  assert.match(mainPage, /EDITORIAL_SOURCE_PACKAGE_GENRES\.map/);
  assert.match(internal, /label: "Notícia"/);
  assert.match(internal, /label: "Breve"/);
  assert.match(internal, /label: "Análise"/);
  assert.match(internal, /label: "Editorial"/);
  assert.match(actions, /Descarregar \.md —/);
  assert.match(actions, /Copiar fontes —/);
  assert.match(actions, /Importar resposta e abrir Artigos/);
  assert.doesNotMatch(actions, />\s*Ir para Artigos\s*</);
  assert.match(actions, /navigator\.clipboard/);
  assert.match(actions, /Resposta da IA/);
  assert.match(actions, /onPaste=\{importPastedResponse\}/);
  assert.match(actions, /Ao colar, o editor de Artigos abre automaticamente/);
  assert.match(actions, /Abrir Artigos com o texto colado/);
  assert.match(actions, /parseEditorialExternalArticleResponse/);
  assert.match(actions, /localStorage\.setItem/);
  assert.match(actions, /import_external=1/);
  assert.match(page, /manifest\.genreLabel/);
  assert.match(page, /manifest\.suggestedTitle/);
  assert.match(page, /manifest\.additionalInstructions/);
  assert.match(page, /Ajustar antes de copiar/);
  assert.match(page, /name="suggested_title"/);
  assert.match(page, /name="editorial_instructions"/);
  assert.match(page, /Atualizar título e instruções/);
  assert.match(page, /sem voltar a recolher as fontes nem as imagens/i);
  assert.match(page, /package_updated/);
  assert.match(page, /package_update_error/);
  assert.match(page, /Imagens guardadas/);
  assert.match(page, /manifest\.localDirectory/);
  assert.match(route, /editorial_genre/);
  assert.match(route, /suggested_title/);
  assert.match(route, /editorial_instructions/);
  assert.match(route, /source_snapshot_/);
  assert.match(route, /createEditorialSourcePackage/);
  assert.match(contentRoute, /text\/markdown; charset=utf-8/);
  assert.match(contentRoute, /manifest\.markdownFileName/);
  assert.match(contentRoute, /Content-Disposition/);
  assert.match(contentRoute, /export async function POST/);
  assert.match(contentRoute, /updateEditorialSourcePackageEditorial/);
  assert.match(contentRoute, /package_updated/);
  assert.match(contentRoute, /package_update_error/);

  const packageService = read(
    "lib/redacao-automatica/editorial-source-package.ts",
  );
  assert.match(packageService, /replacePackageFilesAtomically/);
  assert.match(packageService, /updateEditorialSourcePackageMarkdown/);
  assert.match(packageService, /suggestedTitle: editorial\.suggestedTitle/);
  assert.match(packageService, /additionalInstructions: editorial\.additionalInstructions/);

  const articleForm = read("app/admin/editorial/artigos/_articleForm.tsx");
  const articleImporter = read("app/admin/editorial/artigos/_externalArticleImport.tsx");
  assert.match(articleForm, /<ExternalArticleImport \/>/);
  assert.match(articleImporter, /Preencher a partir do clipboard/);
  assert.match(articleImporter, /Resposta da IA/);
  assert.match(articleImporter, /onPaste=\{importPastedResponse\}/);
  assert.match(articleImporter, /Ao colar, os campos são preenchidos imediatamente/);
  assert.match(articleImporter, /Preencher com o texto colado/);
  assert.match(articleImporter, /formField\(form, "label"\)/);
  assert.match(articleImporter, /formField\(form, "title"\)/);
  assert.match(articleImporter, /formField\(form, "subtitle"\)/);
  assert.match(articleImporter, /formField\(form, "body"\)/);
  assert.match(articleImporter, /Nada é guardado ou publicado automaticamente/);
});

test("o pacote reutiliza a mesma pasta local das imagens editoriais", () => {
  const imageService = read("lib/redacao-automatica/editorial-source-image.ts");
  const packageService = read("lib/redacao-automatica/editorial-source-package.ts");

  assert.match(imageService, /"Pictures", "Jornada\.pt", "Editorial"/);
  assert.match(imageService, /export function editorialLocalArchiveDirectory/);
  assert.match(packageService, /editorialLocalArchiveDirectory\(input\.packageId, now\)/);
  assert.match(packageService, /archiveEditorialSourceImagesLocally/);
  assert.match(packageService, /editorialSourcePackageFileName/);
});
