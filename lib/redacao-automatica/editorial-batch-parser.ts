export const EDITORIAL_BATCH_ARTICLE_START_MARKER = "[JORNADA_ARTIGO_V1]";
export const EDITORIAL_BATCH_ARTICLE_END_MARKER = "[/JORNADA_ARTIGO_V1]";
export const EDITORIAL_BATCH_MAX_ARTICLES = 30;

export type EditorialBatchArticleField = "label" | "title" | "subtitle" | "body";

export type EditorialBatchArticle = Readonly<{
  index: number;
  key: string;
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

function parseCapturedBlock(block: CapturedArticleBlock) {
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
  let currentField: EditorialBatchArticleField | null = null;
  let bodyStarted = false;
  let hasUnexpectedText = false;

  for (const line of block.lines) {
    const heading = bodyStarted ? null : FIELD_BY_HEADING[line.trim()] ?? null;

    if (heading) {
      headingSequence.push(heading);
      headingCounts[heading] += 1;
      currentField = heading;
      if (heading === "body") {
        bodyStarted = true;
      }
      continue;
    }

    if (currentField) {
      values[currentField].push(line);
    } else if (line.trim() !== "") {
      hasUnexpectedText = true;
    }
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

  return {
    article: {
      index: block.index,
      key: block.key,
      label: withoutStructuralBoundaryLines(values.label),
      title: withoutStructuralBoundaryLines(values.title),
      subtitle: withoutStructuralBoundaryLines(values.subtitle),
      body: withoutStructuralBoundaryLines(values.body),
    },
    issues,
  } as const;
}

export function parseEditorialArticleBatch(input: string): EditorialBatchParseResult {
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
    const parsedBlock = parseCapturedBlock(block);
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

function comparableTitle(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function preflightEditorialArticleBatch(input: string): EditorialBatchPreflight {
  const parsed = parseEditorialArticleBatch(input);
  const issues = [...parsed.issues];
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
