import {
  EDITORIAL_CONTEXT_DESTINATION_LABEL,
  EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE,
} from "@/lib/editorial-context-post-title";
import type {
  ArticleBodyBlock,
  JsonObject,
  JsonValue,
} from "@/lib/redacao-automatica/types";

export const EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES = 20;
export const EDITORIAL_SOURCE_PACKAGE_MANIFEST_FILE_NAME = "pacote-fontes.json";
export const EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH = 240;
export const EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH = 4000;

export const EDITORIAL_SOURCE_PACKAGE_GENRES = [
  { value: "news", label: "Notícia", fileSlug: "noticia" },
  { value: "brief", label: "Breve", fileSlug: "breve" },
  { value: "analysis", label: "Análise", fileSlug: "analise" },
  { value: "editorial", label: "Editorial", fileSlug: "editorial" },
] as const;

export type EditorialSourcePackageGenre =
  typeof EDITORIAL_SOURCE_PACKAGE_GENRES[number]["value"];

export type EditorialSourcePackageEditorialInput = Readonly<{
  genre: EditorialSourcePackageGenre;
  genreLabel: string;
  suggestedTitle: string | null;
  additionalInstructions: string | null;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;

export type EditorialSourcePackageSelection = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
}>;

export type EditorialSourcePackagePreparedEntry = Readonly<{
  position: number;
  status: "prepared";
  sourceCode: string;
  sourceName: string;
  sourceUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  anteTitle: string | null;
  title: string;
  postTitle: string | null;
  body: readonly ArticleBodyBlock[];
  imageUrl: string | null;
}>;

export type EditorialSourcePackageFailedEntry = Readonly<{
  position: number;
  status: "failed";
  sourceCode: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  title: string | null;
  errorCode:
    | "source_not_found"
    | "snapshot_not_found"
    | "snapshot_mismatch"
    | "source_body_unavailable";
  errorMessage: string;
}>;

export type EditorialSourcePackageEntry =
  | EditorialSourcePackagePreparedEntry
  | EditorialSourcePackageFailedEntry;

export type EditorialSourcePackageManifestEntry = Readonly<{
  position: number;
  status: "prepared" | "failed";
  sourceCode: string | null;
  sourceName: string | null;
  title: string | null;
  errorCode: string | null;
  imageUrl?: string | null;
}>;

export type EditorialSourcePackageManifest = Readonly<{
  version: 2;
  packageId: string;
  createdAt: string;
  year: string;
  month: string;
  markdownFileName: string;
  genre: EditorialSourcePackageGenre;
  genreLabel: string;
  suggestedTitle: string | null;
  additionalInstructions: string | null;
  selectedCount: number;
  preparedCount: number;
  failedCount: number;
  imageCount: number;
  localDirectory: string | null;
  entries: readonly EditorialSourcePackageManifestEntry[];
}>;

function cleanId(value: string): string {
  return value.trim().toLowerCase();
}

function cleanEditorialText(value: string, maxLength: number): string | null {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.length <= maxLength ? cleaned : null;
}

export function editorialSourcePackageGenreDefinition(
  genre: EditorialSourcePackageGenre,
) {
  return EDITORIAL_SOURCE_PACKAGE_GENRES.find((candidate) => candidate.value === genre)
    ?? EDITORIAL_SOURCE_PACKAGE_GENRES[0];
}

function editorialSourcePackageTopicSlug(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");

  return slug || null;
}

export function editorialSourcePackageFileName(
  genre: EditorialSourcePackageGenre,
  suggestedTitle: string | null = null,
): string {
  const topicSlug = editorialSourcePackageTopicSlug(suggestedTitle);
  return topicSlug
    ? `fontes-${topicSlug}.md`
    : `fontes-selecionadas-${editorialSourcePackageGenreDefinition(genre).fileSlug}.md`;
}

export function editorialSourcePackageImagesFileName(
  genre: EditorialSourcePackageGenre,
  suggestedTitle: string | null = null,
): string {
  const topicSlug = editorialSourcePackageTopicSlug(suggestedTitle);
  return topicSlug
    ? `imagens-${topicSlug}.zip`
    : `imagens-fontes-${editorialSourcePackageGenreDefinition(genre).fileSlug}.zip`;
}

export function normalizeEditorialSourcePackageEditorialInput(input: Readonly<{
  genre: string;
  suggestedTitle: string;
  additionalInstructions: string;
}>): EditorialSourcePackageEditorialInput | null {
  const genreDefinition = EDITORIAL_SOURCE_PACKAGE_GENRES.find(
    (candidate) => candidate.value === input.genre.trim(),
  );
  if (!genreDefinition) {
    return null;
  }

  const suggestedTitle = cleanEditorialText(
    input.suggestedTitle,
    EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH,
  );
  if (input.suggestedTitle.trim() && !suggestedTitle) {
    return null;
  }

  const additionalInstructions = cleanEditorialText(
    input.additionalInstructions,
    EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH,
  );
  if (input.additionalInstructions.trim() && !additionalInstructions) {
    return null;
  }

  return {
    genre: genreDefinition.value,
    genreLabel: genreDefinition.label,
    suggestedTitle,
    additionalInstructions,
  };
}

export function normalizeEditorialSourcePackageSelections(
  selections: readonly EditorialSourcePackageSelection[],
): readonly EditorialSourcePackageSelection[] | null {
  if (
    selections.length < 1
    || selections.length > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
  ) {
    return null;
  }

  const articleIds = new Set<string>();
  const snapshotIds = new Set<string>();
  const normalized: EditorialSourcePackageSelection[] = [];

  for (const selection of selections) {
    const newsroomArticleId = cleanId(selection.newsroomArticleId);
    const newsroomSnapshotId = cleanId(selection.newsroomSnapshotId);

    if (
      !UUID_PATTERN.test(newsroomArticleId)
      || !UUID_PATTERN.test(newsroomSnapshotId)
      || articleIds.has(newsroomArticleId)
      || snapshotIds.has(newsroomSnapshotId)
    ) {
      return null;
    }

    articleIds.add(newsroomArticleId);
    snapshotIds.add(newsroomSnapshotId);
    normalized.push({
      newsroomArticleId,
      newsroomSnapshotId,
    });
  }

  return normalized;
}

export function isEditorialSourcePackageLocation(input: Readonly<{
  year: string;
  month: string;
  packageId: string;
}>): boolean {
  return (
    YEAR_PATTERN.test(input.year)
    && MONTH_PATTERN.test(input.month)
    && UUID_PATTERN.test(input.packageId.trim())
  );
}

function directMetadataText(
  metadata: JsonObject,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value: JsonValue | undefined = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function editorialSourceAnteTitle(metadata: JsonObject): string | null {
  return directMetadataText(metadata, [
    "anteTitle",
    "ante_title",
    "antetitulo",
    "kicker",
  ]);
}

function markdownText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function markdownMetadata(label: string, value: string | null): string[] {
  return value
    ? [`- **${label}:** ${markdownText(value)}`]
    : [];
}

function markdownEditorValue(value: string | null, emptyText: string): string[] {
  const text = value ? markdownText(value) : "";
  return (text || emptyText)
    .split("\n")
    .map((line) => `> ${line}`);
}

function markdownBody(blocks: readonly ArticleBodyBlock[]): string[] {
  return blocks.flatMap((block): string[] => {
    const text = markdownText(block.text);
    if (!text) {
      return [];
    }

    return block.type === "heading"
      ? [`### ${text}`, ""]
      : [text, ""];
  });
}

function formatPreparedEntry(
  entry: EditorialSourcePackagePreparedEntry,
  total: number,
): string {
  const lines = [
    `# NOTÍCIA ${String(entry.position).padStart(2, "0")} DE ${String(total).padStart(2, "0")}`,
    "",
    ...markdownMetadata("FONTE", entry.sourceName),
    ...markdownMetadata("URL", entry.sourceUrl),
    ...markdownMetadata("PUBLICADA EM", entry.publishedAt),
    ...markdownMetadata("AUTOR", entry.author),
    "",
  ];

  if (entry.anteTitle) {
    lines.push("## ANTETÍTULO", "", markdownText(entry.anteTitle), "");
  }

  lines.push("## TÍTULO", "", markdownText(entry.title), "");

  if (entry.postTitle) {
    lines.push("## PÓS-TÍTULO", "", markdownText(entry.postTitle), "");
  }

  lines.push("## CORPO", "", ...markdownBody(entry.body), "");

  return lines.join("\n").trimEnd();
}

function formatFailedEntry(
  entry: EditorialSourcePackageFailedEntry,
  total: number,
): string {
  return [
    `# NOTÍCIA ${String(entry.position).padStart(2, "0")} DE ${String(total).padStart(2, "0")}`,
    "",
    ...markdownMetadata("FONTE", entry.sourceName),
    ...markdownMetadata("URL", entry.sourceUrl),
    ...markdownMetadata("TÍTULO IDENTIFICADO", entry.title),
    "",
    "## ESTADO",
    "",
    "Não foi possível preparar integralmente esta notícia.",
    "",
    "## ERRO",
    "",
    `${entry.errorCode}: ${entry.errorMessage}`,
  ].join("\n").trimEnd();
}

const EXTERNAL_ARTICLE_IMPORT_RULES = [
  "A resposta deve começar exatamente com [JORNADA_ARTIGO_V1] e terminar exatamente com [/JORNADA_ARTIGO_V1].",
  `Se o editor indicar explicitamente nesta conversa que o artigo se destina à zona editorial Contexto, acrescente antes de ANTETÍTULO duas linhas isoladas: DESTINO EDITORIAL e ${EDITORIAL_CONTEXT_DESTINATION_LABEL}. Se não existir essa indicação explícita, omita por completo DESTINO EDITORIAL.`,
  "Depois desse campo opcional, use exatamente esta ordem: ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO. Cada rótulo deve ocupar uma linha isolada.",
  "O ANTETÍTULO e o PÓS-TÍTULO podem ficar vazios quando o género ou o conteúdo não os justificarem. O TÍTULO e o CORPO são obrigatórios.",
  EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE,
  "Não use JSON, tabelas, blocos de código ou comentários fora dos marcadores. Estes marcadores permitem importar a resposta diretamente para o editor da Jornada.pt.",
];

const COMMON_PROMPT_RULES = [
  "Produza o texto em português europeu e baseie-se exclusivamente nas fontes integrais apresentadas abaixo.",
  "Leia e considere todas as fontes antes de escrever. Utilize toda a informação relevante para o tema principal, eliminando apenas repetições, elementos laterais ou conteúdo que não contribua para o género e o enfoque escolhidos.",
  "Use as fontes para confirmar, complementar e contextualizar os factos. Quando existirem versões divergentes, apresente e atribua claramente cada uma, sem escolher arbitrariamente uma como verdadeira.",
  "O título sugerido pelo editor é uma orientação inicial. Melhore-o ou substitua-o quando existir uma formulação mais rigorosa, informativa e adequada ao conteúdo efetivamente sustentado pelas fontes.",
  "Respeite as instruções adicionais do editor, desde que não contrariem os factos disponíveis.",
  "Não invente factos, citações, números, datas, intenções, relações causais ou conclusões não sustentadas. Preserve sempre a atribuição de declarações e interpretações.",
  "Não explique o processo de redação. Não mencione “as fontes abaixo”. Não apresente notas técnicas nem exponha o raciocínio usado para construir o texto.",
];

const GENRE_PROMPTS: Record<EditorialSourcePackageGenre, readonly string[]> = {
  news: [
    "Crie uma notícia jornalística desenvolvida.",
    "Identifique o tema jornalisticamente mais relevante e organize a informação numa narrativa coerente, em vez de resumir cada fonte separadamente.",
    "Estruture o resultado com ANTETÍTULO opcional, TÍTULO, PÓS-TÍTULO e CORPO.",
    "O título deve ser informativo, claro e coerente com o tema principal. O pós-título deve acrescentar informação relevante sem repetir o título.",
    "Comece o corpo com um lead que apresente o essencial. Desenvolva depois os factos por ordem de relevância, integrando contexto, declarações e consequências em parágrafos jornalísticos naturais.",
    "Não use listas nem secções chamadas “Factos”, “Interpretação” ou “Conclusão”, salvo indicação expressa do editor.",
  ],
  brief: [
    "Crie uma breve jornalística.",
    "Identifique o facto mais relevante e concentre o texto nesse acontecimento, usando apenas o contexto indispensável à sua compreensão.",
    "O resultado deve ser curto, direto e informativo, normalmente entre 100 e 180 palavras.",
    "Estruture o resultado com TÍTULO, PÓS-TÍTULO apenas quando acrescentar informação indispensável e CORPO.",
    "O corpo deve ter entre dois e quatro parágrafos. Não tente incluir todos os detalhes, antecedentes secundários ou declarações que não acrescentem informação essencial.",
  ],
  analysis: [
    "Crie uma análise jornalística.",
    "Identifique o problema, tendência ou questão central e construa uma interpretação sustentada nos factos disponíveis.",
    "Vá além da enumeração de acontecimentos, explicando relações, consequências, contradições e elementos de contexto.",
    "Distinga naturalmente factos, declarações, inferências e interpretação jornalística, sem usar essas categorias como títulos de secções.",
    "Estruture o resultado com ANTETÍTULO opcional, TÍTULO, PÓS-TÍTULO e CORPO.",
    "Abra o corpo com a questão central, desenvolva a análise através dos factos e termine com a consequência, dúvida ou cenário mais relevante, sem fabricar previsões.",
    "Não transforme a interpretação em opinião sem fundamento.",
  ],
  editorial: [
    "Crie um editorial.",
    "Leia todas as fontes antes de definir a tese. Identifique o problema central e assuma uma posição clara, institucional e argumentada.",
    "A posição deve resultar da apreciação crítica dos factos, sem informação inventada, ataques pessoais ou afirmações que as fontes não sustentem.",
    "Não esconda factos relevantes que contrariem a tese. Reconheça limitações e incertezas materialmente importantes sem abandonar a posição editorial.",
    "Estruture o resultado com ANTETÍTULO opcional, TÍTULO, PÓS-TÍTULO e CORPO.",
    "Introduza o tema e a posição, desenvolva os argumentos com base nos factos e termine com uma conclusão editorial clara.",
    "Não use a primeira pessoa do singular e não apresente opinião como facto.",
  ],
};

export function editorialSourcePackagePrompt(
  genre: EditorialSourcePackageGenre,
): string {
  return [
    ...GENRE_PROMPTS[genre],
    "",
    ...COMMON_PROMPT_RULES,
    "",
    ...EXTERNAL_ARTICLE_IMPORT_RULES,
  ].join("\n\n");
}

function buildEditorialSourcePackageTaskMarkdown(
  editorial: EditorialSourcePackageEditorialInput,
): string {
  return [
    "# TAREFA EDITORIAL",
    "",
    "## GÉNERO JORNALÍSTICO",
    "",
    editorial.genreLabel,
    "",
    "## TÍTULO SUGERIDO PELO EDITOR",
    "",
    ...markdownEditorValue(editorial.suggestedTitle, "Não indicado."),
    "",
    "## INSTRUÇÕES ADICIONAIS DO EDITOR",
    "",
    ...markdownEditorValue(editorial.additionalInstructions, "Sem instruções adicionais."),
    "",
    "## INSTRUÇÃO DE REDAÇÃO",
    "",
    editorialSourcePackagePrompt(editorial.genre),
  ].join("\n");
}

export function updateEditorialSourcePackageMarkdown(input: Readonly<{
  markdown: string;
  editorial: EditorialSourcePackageEditorialInput;
}>): string | null {
  const normalizedMarkdown = input.markdown.replace(/\r\n?/g, "\n");
  const sourcesMarker = "# FONTES INTEGRAIS";
  const sourcesIndex = normalizedMarkdown.indexOf(sourcesMarker);

  if (sourcesIndex < 0) {
    return null;
  }

  return [
    buildEditorialSourcePackageTaskMarkdown(input.editorial),
    "",
    "---",
    "",
    normalizedMarkdown.slice(sourcesIndex),
  ].join("\n");
}

export function buildEditorialSourcePackageMarkdown(input: Readonly<{
  createdAt: string;
  editorial: EditorialSourcePackageEditorialInput;
  entries: readonly EditorialSourcePackageEntry[];
}>): string {
  const selectedCount = input.entries.length;
  const preparedCount = input.entries.filter((entry) => entry.status === "prepared").length;
  const failedCount = selectedCount - preparedCount;
  const articleSections = input.entries.map((entry) => (
    entry.status === "prepared"
      ? formatPreparedEntry(entry, selectedCount)
      : formatFailedEntry(entry, selectedCount)
  ));

  return [
    buildEditorialSourcePackageTaskMarkdown(input.editorial),
    "",
    "---",
    "",
    "# FONTES INTEGRAIS",
    "",
    `**NOTÍCIAS SELECIONADAS:** ${selectedCount}`,
    `**PREPARADAS INTEGRALMENTE:** ${preparedCount}`,
    `**COM FALHA:** ${failedCount}`,
    `**CRIADO EM:** ${input.createdAt}`,
    "",
    "> Os textos abaixo correspondem aos snapshots editoriais selecionados. Não foram resumidos nem reescritos por IA.",
    "",
    ...articleSections.flatMap((section, index) => (
      index === 0
        ? [section]
        : ["---", "", section]
    )),
    "",
  ].join("\n");
}
