export const EDITORIAL_BATCH_ARTICLE_START_MARKER = "[JORNADA_ARTIGO_V1]";
export const EDITORIAL_BATCH_ARTICLE_END_MARKER = "[/JORNADA_ARTIGO_V1]";
export const EDITORIAL_BATCH_MAX_ARTICLES = 30;
export const EDITORIAL_BATCH_PROVENANCE_OUTPUT_HEADING = "OUTPUT_ID";
export const EDITORIAL_BATCH_PROVENANCE_SOURCES_HEADING = "FONTES_UTILIZADAS";

export type EditorialBatchArticleField = "label" | "title" | "subtitle" | "body";

export type EditorialBatchArticle = Readonly<{
  index: number;
  key: string;
  outputId: string | null;
  sourceIds: readonly string[];
  label: string;
  title: string;
  subtitle: string;
  body: string;
}>;

export type EditorialBatchIssueCode =
  | "empty_input"
  | "no_articles"
  | "too_many_articles"
  | "text_outside_blocks"
  | "missing_open_marker"
  | "missing_close_marker"
  | "nested_article_marker"
  | "missing_field_heading"
  | "duplicate_field_heading"
  | "wrong_field_order"
  | "unexpected_block_text"
  | "empty_label"
  | "empty_title"
  | "empty_subtitle"
  | "empty_body"
  | "incomplete_provenance"
  | "invalid_output_id"
  | "missing_source_id"
  | "invalid_source_id"
  | "duplicate_source_id"
  | "invalid_mesa_v2_contract"
  | "unknown_output_id"
  | "duplicate_output_id"
  | "missing_expected_output"
  | "unknown_source_id"
  | "duplicate_title";

export type EditorialBatchIssue = Readonly<{
  code: EditorialBatchIssueCode;
  severity: "error" | "warning";
  index?: number;
  key?: string;
  field?: EditorialBatchArticleField;
  message: string;
}>;

export type EditorialBatchParseResult = Readonly<{
  articles: readonly EditorialBatchArticle[];
  issues: readonly EditorialBatchIssue[];
  total: number;
}>;

export type EditorialBatchPreflight = Readonly<{
  articles: readonly EditorialBatchArticle[];
  issues: readonly EditorialBatchIssue[];
  total: number;
  valid: number;
  invalid: number;
  ready: boolean;
}>;

type CapturedArticleBlock = Readonly<{
  index: number;
  key: string;
  lines: readonly string[];
}>;

const FIELD_ORDER: readonly EditorialBatchArticleField[] = [
  "label",
  "title",
  "subtitle",
  "body",
];

const FIELD_BY_HEADING: Readonly<Record<string, EditorialBatchArticleField>> = {
  "ANTETÍTULO": "label",
  "TÍTULO": "title",
  "PÓS-TÍTULO": "subtitle",
  "CORPO": "body",
};

const HEADING_BY_FIELD: Readonly<Record<EditorialBatchArticleField, string>> = {
  label: "ANTETÍTULO",
  title: "TÍTULO",
  subtitle: "PÓS-TÍTULO",
  body: "CORPO",
};

const EMPTY_CODE_BY_FIELD: Readonly<
  Record<EditorialBatchArticleField, EditorialBatchIssueCode>
> = {
  label: "empty_label",
  title: "empty_title",
  subtitle: "empty_subtitle",
  body: "empty_body",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProvenanceField = "outputId" | "sourceIds";
type CapturedField = EditorialBatchArticleField | ProvenanceField;
type EditorialBatchParserContract = "historical" | "mesa-v2";

export type EditorialBatchMesaV2PreflightContract = Readonly<{
  outputIds: readonly string[];
  sourceIds: readonly string[];
}>;

const PROVENANCE_FIELD_BY_HEADING: Readonly<Record<string, ProvenanceField>> = {
  [EDITORIAL_BATCH_PROVENANCE_OUTPUT_HEADING]: "outputId",
  [EDITORIAL_BATCH_PROVENANCE_SOURCES_HEADING]: "sourceIds",
};

function parseSourceIds(lines: readonly string[]): readonly string[] {
  return lines
    .flatMap((line) => line.split(/[\s,;]+/u))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function batchKey(index: number) {
  return String(index).padStart(2, "0");
}

function normalizeLineEndings(input: string) {
  return input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function issue(
  code: EditorialBatchIssueCode,
  message: string,
  context: Readonly<{
    index?: number;
    key?: string;
    field?: EditorialBatchArticleField;
  }> = {},
): EditorialBatchIssue {
  return {
    code,
    severity: "error",
    ...context,
    message,
  };
}

function indexedIssue(
  block: Pick<CapturedArticleBlock, "index" | "key">,
  code: EditorialBatchIssueCode,
  message: string,
  field?: EditorialBatchArticleField,
) {
  return issue(code, message, {
    index: block.index,
    key: block.key,
    ...(field ? { field } : {}),
  });
}

function withoutStructuralBoundaryLines(lines: readonly string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end).join("\n");
}

function parseCapturedBlock(
  block: CapturedArticleBlock,
  contract: EditorialBatchParserContract,
) {
  const values: Record<EditorialBatchArticleField, string[]> = {
    label: [],
    title: [],
    subtitle: [],
    body: [],
  };
  const headingSequence: EditorialBatchArticleField[] = [];
  const headingCounts: Record<EditorialBatchArticleField, number> = {
    label: 0,
    title: 0,
    subtitle: 0,
    body: 0,
  };
  const issues: EditorialBatchIssue[] = [];
  const provenanceValues: Record<ProvenanceField, string[]> = {
    outputId: [],
    sourceIds: [],
  };
  const provenanceSequence: ProvenanceField[] = [];
  const provenanceCounts: Record<ProvenanceField, number> = {
    outputId: 0,
    sourceIds: 0,
  };
  const capturedSequence: CapturedField[] = [];
  let currentField: CapturedField | null = null;
  let bodyStarted = false;
  let hasUnexpectedText = false;

  for (const line of block.lines) {
    const structuralHeading = line.trim();
    const detectedProvenanceHeading = bodyStarted
      ? null
      : PROVENANCE_FIELD_BY_HEADING[structuralHeading] ?? null;
    if (contract === "historical" && detectedProvenanceHeading) {
      hasUnexpectedText = true;
      currentField = null;
      continue;
    }
    const provenanceHeading = contract === "mesa-v2"
      ? detectedProvenanceHeading
      : null;
    const heading = bodyStarted ? null : FIELD_BY_HEADING[structuralHeading] ?? null;

    if (provenanceHeading) {
      provenanceSequence.push(provenanceHeading);
      capturedSequence.push(provenanceHeading);
      provenanceCounts[provenanceHeading] += 1;
      currentField = provenanceHeading;
      continue;
    }

    if (heading) {
      headingSequence.push(heading);
      capturedSequence.push(heading);
      headingCounts[heading] += 1;
      currentField = heading;
      if (heading === "body") {
        bodyStarted = true;
      }
      continue;
    }

    if (currentField) {
      if (currentField === "outputId" || currentField === "sourceIds") {
        provenanceValues[currentField].push(line);
      } else {
        values[currentField].push(line);
      }
    } else if (line.trim() !== "") {
      hasUnexpectedText = true;
    }
  }

  const hasAnyProvenanceHeading = provenanceCounts.outputId > 0
    || provenanceCounts.sourceIds > 0;
  const hasCompleteProvenanceHeadings = provenanceCounts.outputId === 1
    && provenanceCounts.sourceIds === 1;

  if ((contract === "mesa-v2" || hasAnyProvenanceHeading) && !hasCompleteProvenanceHeadings) {
    issues.push(indexedIssue(
      block,
      "incomplete_provenance",
      `O artigo ${block.key} tem proveniência incompleta: OUTPUT_ID e FONTES_UTILIZADAS são inseparáveis.`,
    ));
  }
  if (provenanceCounts.outputId > 1 || provenanceCounts.sourceIds > 1) {
    issues.push(indexedIssue(
      block,
      "incomplete_provenance",
      `O artigo ${block.key} repete um cabeçalho de proveniência.`,
    ));
  }
  if (
    hasCompleteProvenanceHeadings
    && (
      provenanceSequence[0] !== "outputId"
      || provenanceSequence[1] !== "sourceIds"
      || capturedSequence.some((field, index) => (
        field !== (["outputId", "sourceIds", ...FIELD_ORDER] as const)[index]
      ))
    )
  ) {
    issues.push(indexedIssue(
      block,
      "wrong_field_order",
      `Os cabeçalhos de proveniência do artigo ${block.key} não estão na ordem obrigatória.`,
    ));
  }

  if (hasUnexpectedText) {
    issues.push(indexedIssue(
      block,
      "unexpected_block_text",
      `O artigo ${block.key} contém texto antes do primeiro cabeçalho.`,
    ));
  }

  for (const field of FIELD_ORDER) {
    if (headingCounts[field] === 0) {
      issues.push(indexedIssue(
        block,
        "missing_field_heading",
        `O artigo ${block.key} não contém o cabeçalho ${HEADING_BY_FIELD[field]}.`,
        field,
      ));
    } else if (headingCounts[field] > 1) {
      issues.push(indexedIssue(
        block,
        "duplicate_field_heading",
        `O artigo ${block.key} repete o cabeçalho ${HEADING_BY_FIELD[field]}.`,
        field,
      ));
    }
  }

  const hasEveryHeadingOnce = FIELD_ORDER.every((field) => headingCounts[field] === 1);
  if (
    hasEveryHeadingOnce
    && headingSequence.some((field, index) => field !== FIELD_ORDER[index])
  ) {
    issues.push(indexedIssue(
      block,
      "wrong_field_order",
      `Os cabeçalhos do artigo ${block.key} não estão na ordem obrigatória.`,
    ));
  }

  if (issues.length > 0) {
    return { article: null, issues } as const;
  }

  const outputId = withoutStructuralBoundaryLines(provenanceValues.outputId)
    .trim()
    .toLowerCase();
  const sourceIds = parseSourceIds(provenanceValues.sourceIds);

  if (hasCompleteProvenanceHeadings) {
    if (!UUID_PATTERN.test(outputId)) {
      issues.push(indexedIssue(
        block,
        "invalid_output_id",
        `O OUTPUT_ID do artigo ${block.key} não é um UUID válido.`,
      ));
    }
    if (sourceIds.length === 0) {
      issues.push(indexedIssue(
        block,
        "missing_source_id",
        `O artigo ${block.key} não identifica nenhuma fonte utilizada.`,
      ));
    }
    if (sourceIds.some((sourceId) => !UUID_PATTERN.test(sourceId))) {
      issues.push(indexedIssue(
        block,
        "invalid_source_id",
        `FONTES_UTILIZADAS do artigo ${block.key} contém um UUID inválido.`,
      ));
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      issues.push(indexedIssue(
        block,
        "duplicate_source_id",
        `FONTES_UTILIZADAS do artigo ${block.key} repete uma fonte.`,
      ));
    }
  }

  if (issues.length > 0) {
    return { article: null, issues } as const;
  }

  return {
    article: {
      index: block.index,
      key: block.key,
      outputId: hasCompleteProvenanceHeadings ? outputId : null,
      sourceIds: hasCompleteProvenanceHeadings ? sourceIds : [],
      label: withoutStructuralBoundaryLines(values.label),
      title: withoutStructuralBoundaryLines(values.title),
      subtitle: withoutStructuralBoundaryLines(values.subtitle),
      body: withoutStructuralBoundaryLines(values.body),
    },
    issues,
  } as const;
}

function parseEditorialArticleBatchWithContract(
  input: string,
  contract: EditorialBatchParserContract,
): EditorialBatchParseResult {
  const normalizedInput = normalizeLineEndings(input);
  if (normalizedInput.trim() === "") {
    return {
      articles: [],
      issues: [issue("empty_input", "Introduza pelo menos um artigo.")],
      total: 0,
    };
  }

  const blocks: CapturedArticleBlock[] = [];
  const issues: EditorialBatchIssue[] = [];
  const issueKeys = new Set<string>();
  let currentBlock: { index: number; key: string; lines: string[] } | null = null;
  let total = 0;

  function addIssueOnce(nextIssue: EditorialBatchIssue) {
    const issueKey = `${nextIssue.code}:${nextIssue.index ?? "batch"}:${nextIssue.field ?? ""}`;
    if (!issueKeys.has(issueKey)) {
      issueKeys.add(issueKey);
      issues.push(nextIssue);
    }
  }

  for (const line of normalizedInput.split("\n")) {
    const structuralLine = line.trim();

    if (!currentBlock) {
      if (structuralLine === "") {
        continue;
      }

      if (structuralLine === EDITORIAL_BATCH_ARTICLE_START_MARKER) {
        total += 1;
        currentBlock = { index: total, key: batchKey(total), lines: [] };
        continue;
      }

      if (structuralLine === EDITORIAL_BATCH_ARTICLE_END_MARKER) {
        addIssueOnce(issue(
          "missing_open_marker",
          "Foi encontrado um marcador de fecho sem abertura correspondente.",
        ));
        continue;
      }

      addIssueOnce(issue(
        "text_outside_blocks",
        "Existe texto não vazio fora dos blocos de artigo.",
      ));
      continue;
    }

    if (structuralLine === EDITORIAL_BATCH_ARTICLE_START_MARKER) {
      addIssueOnce(indexedIssue(
        currentBlock,
        "nested_article_marker",
        `O artigo ${currentBlock.key} contém um marcador de artigo aninhado.`,
      ));
      continue;
    }

    if (structuralLine === EDITORIAL_BATCH_ARTICLE_END_MARKER) {
      blocks.push(currentBlock);
      currentBlock = null;
      continue;
    }

    if (
      line.includes(EDITORIAL_BATCH_ARTICLE_START_MARKER)
      || line.includes(EDITORIAL_BATCH_ARTICLE_END_MARKER)
    ) {
      addIssueOnce(indexedIssue(
        currentBlock,
        "nested_article_marker",
        `O artigo ${currentBlock.key} contém um marcador ambíguo no conteúdo.`,
      ));
    }

    currentBlock.lines.push(line);
  }

  if (currentBlock) {
    addIssueOnce(indexedIssue(
      currentBlock,
      "missing_close_marker",
      `O artigo ${currentBlock.key} não contém o marcador de fecho obrigatório.`,
    ));
    blocks.push(currentBlock);
  }

  if (total === 0) {
    addIssueOnce(issue("no_articles", "Não foi encontrado nenhum bloco de artigo."));
  }

  const candidates: EditorialBatchArticle[] = [];
  for (const block of blocks) {
    const parsedBlock = parseCapturedBlock(block, contract);
    issues.push(...parsedBlock.issues);
    if (parsedBlock.article) {
      candidates.push(parsedBlock.article);
    }
  }

  const structurallyInvalid = new Set(
    issues
      .filter((batchIssue) => batchIssue.severity === "error" && batchIssue.index)
      .map((batchIssue) => batchIssue.index),
  );

  return {
    articles: candidates.filter((article) => !structurallyInvalid.has(article.index)),
    issues,
    total,
  };
}

export function parseEditorialArticleBatch(input: string): EditorialBatchParseResult {
  return parseEditorialArticleBatchWithContract(input, "historical");
}

function comparableTitle(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function preflightEditorialArticleBatchResult(
  parsed: EditorialBatchParseResult,
  additionalIssues: readonly EditorialBatchIssue[] = [],
): EditorialBatchPreflight {
  const issues = [...parsed.issues, ...additionalIssues];
  const firstArticleByTitle = new Map<string, EditorialBatchArticle>();

  for (const article of parsed.articles) {
    for (const field of FIELD_ORDER) {
      if (article[field].trim() === "") {
        issues.push(indexedIssue(
          article,
          EMPTY_CODE_BY_FIELD[field],
          `O campo ${HEADING_BY_FIELD[field]} do artigo ${article.key} está vazio.`,
          field,
        ));
      }
    }

    const normalizedTitle = comparableTitle(article.title);
    if (!normalizedTitle) {
      continue;
    }

    const firstArticle = firstArticleByTitle.get(normalizedTitle);
    if (firstArticle) {
      issues.push(indexedIssue(
        article,
        "duplicate_title",
        `O título do artigo ${article.key} repete exatamente o artigo ${firstArticle.key}.`,
        "title",
      ));
    } else {
      firstArticleByTitle.set(normalizedTitle, article);
    }
  }

  if (parsed.total > EDITORIAL_BATCH_MAX_ARTICLES) {
    issues.push(issue(
      "too_many_articles",
      `O lote contém ${parsed.total} artigos; o máximo é ${EDITORIAL_BATCH_MAX_ARTICLES}.`,
    ));
  }

  const invalidArticleIndexes = new Set(
    issues
      .filter((batchIssue) => batchIssue.severity === "error" && batchIssue.index)
      .map((batchIssue) => batchIssue.index),
  );
  const invalid = invalidArticleIndexes.size;
  const valid = Math.max(0, parsed.total - invalid);
  const hasErrors = issues.some((batchIssue) => batchIssue.severity === "error");

  return {
    articles: parsed.articles,
    issues,
    total: parsed.total,
    valid,
    invalid,
    ready: parsed.total > 0
      && parsed.total <= EDITORIAL_BATCH_MAX_ARTICLES
      && !hasErrors,
  };
}

export function preflightEditorialArticleBatch(input: string): EditorialBatchPreflight {
  return preflightEditorialArticleBatchResult(
    parseEditorialArticleBatchWithContract(input, "historical"),
  );
}

export function preflightEditorialMesaV2ArticleBatch(
  input: string,
  contract: EditorialBatchMesaV2PreflightContract,
): EditorialBatchPreflight {
  const parsed = parseEditorialArticleBatchWithContract(input, "mesa-v2");
  const additionalIssues: EditorialBatchIssue[] = [];
  const outputIds = contract.outputIds.map((value) => value.trim().toLowerCase());
  const sourceIds = contract.sourceIds.map((value) => value.trim().toLowerCase());
  const expectedOutputIds = new Set(outputIds);
  const authorizedSourceIds = new Set(sourceIds);

  if (
    outputIds.length < 1
    || sourceIds.length < 1
    || outputIds.some((value) => !UUID_PATTERN.test(value))
    || sourceIds.some((value) => !UUID_PATTERN.test(value))
    || expectedOutputIds.size !== outputIds.length
    || authorizedSourceIds.size !== sourceIds.length
  ) {
    additionalIssues.push(issue(
      "invalid_mesa_v2_contract",
      "O pacote Mesa v2 não contém um contrato de outputs e fontes válido.",
    ));
    return preflightEditorialArticleBatchResult(parsed, additionalIssues);
  }

  const seenOutputIds = new Set<string>();
  for (const article of parsed.articles) {
    if (!article.outputId) continue;
    if (!expectedOutputIds.has(article.outputId)) {
      additionalIssues.push(indexedIssue(
        article,
        "unknown_output_id",
        `O OUTPUT_ID do artigo ${article.key} não pertence a este pacote.`,
      ));
    } else if (seenOutputIds.has(article.outputId)) {
      additionalIssues.push(indexedIssue(
        article,
        "duplicate_output_id",
        `O OUTPUT_ID do artigo ${article.key} já foi usado noutro bloco.`,
      ));
    } else {
      seenOutputIds.add(article.outputId);
    }
    if (article.sourceIds.some((sourceId) => !authorizedSourceIds.has(sourceId))) {
      additionalIssues.push(indexedIssue(
        article,
        "unknown_source_id",
        `FONTES_UTILIZADAS do artigo ${article.key} refere material externo a este workspace.`,
      ));
    }
  }

  if ([...expectedOutputIds].some((outputId) => !seenOutputIds.has(outputId))) {
    additionalIssues.push(issue(
      "missing_expected_output",
      "A resposta não contém exatamente uma vez todos os OUTPUT_ID esperados.",
    ));
  }

  return preflightEditorialArticleBatchResult(parsed, additionalIssues);
}
