import type {
  HttpNewsroomIngestionError,
  IngestHttpNewsroomArticleInput,
  IngestHttpNewsroomArticleResult,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";

export type ManualHttpNewsroomArticleCompletedReport = Readonly<{
  sourceCode: string;
  executionMode: "manual";
  ingestionMode: "http_manual_article";
  originalUrl: string;
  finalUrl: string;
  normalizedUrl: string;
  status: "completed";
  articleAction: "created" | "reused" | "updated";
  snapshotAction: "created" | "reused";
  articleId: string;
  snapshotId: string;
  title: string;
  publishedAt: string | null;
  detectedAt: string;
  extractedAt: string;
  statusCode: number;
  redirectCount: number;
  byteLength: number;
}>;

export type ManualHttpNewsroomArticleFailedReport = Readonly<{
  sourceCode: string;
  executionMode: "manual";
  ingestionMode: "http_manual_article";
  originalUrl: string;
  status: "failed";
  error: Readonly<{
    code: HttpNewsroomIngestionError["code"];
    stage: HttpNewsroomIngestionError["stage"];
  }>;
}>;

export type ManualHttpNewsroomArticleInvocationResult =
  | Readonly<{
      ok: true;
      report: ManualHttpNewsroomArticleCompletedReport;
      output: string;
    }>
  | Readonly<{
      ok: false;
      kind: "invalid_invocation" | "ingestion_failure" | "structural_failure";
      report: ManualHttpNewsroomArticleFailedReport | null;
      error: Readonly<{
        code:
          | "invalid_invocation"
          | "invoker_structural_failure"
          | HttpNewsroomIngestionError["code"];
        message: string;
      }>;
      output: string;
    }>;

type ManualHttpNewsroomArticleInvokerDependencies = Readonly<{
  ingestArticle(
    input: IngestHttpNewsroomArticleInput,
  ): Promise<IngestHttpNewsroomArticleResult>;
  clock(): Date;
}>;

type ManualHttpNewsroomArticleCommandDependencies = Readonly<{
  invoke(
    sourceCode: string,
    articleUrl: string,
  ): Promise<ManualHttpNewsroomArticleInvocationResult>;
  writeOutput(output: string): void;
  writeError(output: string): void;
}>;

const USAGE_MESSAGE =
  "Uso: indicar exatamente <sourceCode> <articleUrl> (record ou abola).";
const STRUCTURAL_FAILURE_MESSAGE =
  "Falha estrutural controlada no invocador manual de artigo HTTP.";
const SOURCE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isValidSourceCode(sourceCode: string): boolean {
  return (
    sourceCode.length > 0
    && sourceCode.length <= 64
    && sourceCode === sourceCode.trim()
    && SOURCE_CODE_PATTERN.test(sourceCode)
  );
}

function isValidArticleUrl(articleUrl: string): boolean {
  if (!articleUrl || articleUrl !== articleUrl.trim()) {
    return false;
  }

  try {
    const url = new URL(articleUrl);
    return (
      (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
      && Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function formatReport(
  report:
    | ManualHttpNewsroomArticleCompletedReport
    | ManualHttpNewsroomArticleFailedReport,
): string {
  return JSON.stringify(report, null, 2);
}

function invalidInvocationResult(): ManualHttpNewsroomArticleInvocationResult {
  const output = JSON.stringify(
    {
      status: "failed",
      error: {
        code: "invalid_invocation",
        message: USAGE_MESSAGE,
      },
    },
    null,
    2,
  );
  return {
    ok: false,
    kind: "invalid_invocation",
    report: null,
    error: {
      code: "invalid_invocation",
      message: USAGE_MESSAGE,
    },
    output,
  };
}

function structuralFailureResult(): ManualHttpNewsroomArticleInvocationResult {
  const output = JSON.stringify(
    {
      status: "failed",
      error: {
        code: "invoker_structural_failure",
        message: STRUCTURAL_FAILURE_MESSAGE,
      },
    },
    null,
    2,
  );
  return {
    ok: false,
    kind: "structural_failure",
    report: null,
    error: {
      code: "invoker_structural_failure",
      message: STRUCTURAL_FAILURE_MESSAGE,
    },
    output,
  };
}

export function createManualHttpNewsroomArticleInvoker(
  dependencies: ManualHttpNewsroomArticleInvokerDependencies,
): (
  sourceCode: string,
  articleUrl: string,
) => Promise<ManualHttpNewsroomArticleInvocationResult> {
  return async (sourceCode, articleUrl) => {
    if (!isValidSourceCode(sourceCode) || !isValidArticleUrl(articleUrl)) {
      return invalidInvocationResult();
    }

    try {
      const timestamp = dependencies.clock().toISOString();
      const result = await dependencies.ingestArticle({
        sourceCode,
        articleUrl,
        detectedAt: timestamp,
        extractedAt: timestamp,
      });

      if (!result.ok) {
        const report: ManualHttpNewsroomArticleFailedReport = {
          sourceCode: result.error.sourceCode ?? sourceCode,
          executionMode: "manual",
          ingestionMode: "http_manual_article",
          originalUrl: articleUrl,
          status: "failed",
          error: {
            code: result.error.code,
            stage: result.error.stage,
          },
        };
        return {
          ok: false,
          kind: "ingestion_failure",
          report,
          error: {
            code: result.error.code,
            message:
              "A ingestao manual foi rejeitada pelo percurso controlado.",
          },
          output: formatReport(report),
        };
      }

      const value = result.value;
      const report: ManualHttpNewsroomArticleCompletedReport = {
        sourceCode: value.sourceCode,
        executionMode: "manual",
        ingestionMode: "http_manual_article",
        originalUrl: value.originalUrl,
        finalUrl: value.finalUrl,
        normalizedUrl: value.normalizedUrl,
        status: "completed",
        articleAction: value.article.action,
        snapshotAction: value.snapshot.action,
        articleId: value.article.id,
        snapshotId: value.snapshot.id,
        title: value.title,
        publishedAt: value.publishedAt,
        detectedAt: value.detectedAt,
        extractedAt: value.extractedAt,
        statusCode: value.statusCode,
        redirectCount: value.redirectCount,
        byteLength: value.byteLength,
      };
      return {
        ok: true,
        report,
        output: formatReport(report),
      };
    } catch {
      return structuralFailureResult();
    }
  };
}

export async function runManualHttpNewsroomArticleCommand(
  args: readonly string[],
  dependencies: ManualHttpNewsroomArticleCommandDependencies,
): Promise<number> {
  if (
    args.length !== 2
    || !isValidSourceCode(args[0])
    || !isValidArticleUrl(args[1])
  ) {
    dependencies.writeError(USAGE_MESSAGE);
    return 1;
  }

  let invocation: ManualHttpNewsroomArticleInvocationResult;
  try {
    invocation = await dependencies.invoke(args[0], args[1]);
  } catch {
    dependencies.writeError(structuralFailureResult().output);
    return 1;
  }

  if (!invocation.ok) {
    dependencies.writeError(invocation.output);
    return 1;
  }

  dependencies.writeOutput(invocation.output);
  return 0;
}
