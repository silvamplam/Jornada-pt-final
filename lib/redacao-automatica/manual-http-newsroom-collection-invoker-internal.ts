import type { CollectSourceInput } from "@/lib/redacao-automatica/collection-service";
import type {
  ArticleLinkCandidate,
  CollectionError,
  OperationResult,
  SourceCollectionSummary,
} from "@/lib/redacao-automatica/types";

export type ManualHttpNewsroomCollectionError = Readonly<{
  code: CollectionError["code"];
  stage: CollectionError["stage"];
  sourceCode: string | null;
  recoverable: boolean;
}>;

export type ManualHttpNewsroomCollectionCompletedReport = Readonly<{
  sourceCode: string;
  executionMode: "manual";
  detectedAt: string;
  status: "completed";
  listingUrls: readonly string[];
  loadedListingCount: number;
  discoveredCount: number;
  totalCandidates: number;
  duplicateCount: number;
  rejectedCount: number;
  candidates: readonly ArticleLinkCandidate[];
  errors: readonly ManualHttpNewsroomCollectionError[];
}>;

export type ManualHttpNewsroomCollectionFailedReport = Readonly<{
  sourceCode: string;
  executionMode: "manual";
  detectedAt: string;
  status: "failed";
  error: ManualHttpNewsroomCollectionError;
}>;

export type ManualHttpNewsroomCollectionInvocationResult =
  | Readonly<{
      ok: true;
      report: ManualHttpNewsroomCollectionCompletedReport;
      output: string;
    }>
  | Readonly<{
      ok: false;
      kind: "invalid_invocation" | "collection_failure" | "structural_failure";
      report: ManualHttpNewsroomCollectionFailedReport | null;
      error: Readonly<{
        code:
          | "invalid_invocation"
          | "invoker_structural_failure"
          | CollectionError["code"];
        message: string;
      }>;
      output: string;
    }>;

type ManualCollectSourceInput = CollectSourceInput &
  Readonly<{
    executionMode: "manual";
  }>;

type ManualHttpNewsroomCollectionInvokerDependencies = Readonly<{
  collectSource(
    input: ManualCollectSourceInput,
  ): Promise<OperationResult<SourceCollectionSummary, CollectionError>>;
  clock(): Date;
}>;

type ManualHttpNewsroomCollectionCommandDependencies = Readonly<{
  invoke(
    sourceCode: string,
  ): Promise<ManualHttpNewsroomCollectionInvocationResult>;
  writeOutput(output: string): void;
  writeError(output: string): void;
}>;

const USAGE_MESSAGE =
  "Uso: indicar exatamente um sourceCode (record ou abola).";
const STRUCTURAL_FAILURE_MESSAGE =
  "Falha estrutural controlada no invocador manual de recolha HTTP.";
const SOURCE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isValidSourceCode(sourceCode: string): boolean {
  return (
    sourceCode.length > 0
    && sourceCode.length <= 64
    && sourceCode === sourceCode.trim()
    && SOURCE_CODE_PATTERN.test(sourceCode)
  );
}

function sanitizeCollectionError(
  error: CollectionError,
): ManualHttpNewsroomCollectionError {
  return {
    code: error.code,
    stage: error.stage,
    sourceCode: error.sourceCode,
    recoverable: error.recoverable,
  };
}

function formatReport(
  report:
    | ManualHttpNewsroomCollectionCompletedReport
    | ManualHttpNewsroomCollectionFailedReport,
): string {
  return JSON.stringify(report, null, 2);
}

function invalidInvocationResult(): ManualHttpNewsroomCollectionInvocationResult {
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

function structuralFailureResult(): ManualHttpNewsroomCollectionInvocationResult {
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

export function createManualHttpNewsroomCollectionInvoker(
  dependencies: ManualHttpNewsroomCollectionInvokerDependencies,
): (
  sourceCode: string,
) => Promise<ManualHttpNewsroomCollectionInvocationResult> {
  return async (sourceCode) => {
    if (!isValidSourceCode(sourceCode)) {
      return invalidInvocationResult();
    }

    try {
      const detectedAt = dependencies.clock().toISOString();
      const result = await dependencies.collectSource({
        sourceCode,
        detectedAt,
        executionMode: "manual",
      });

      if (!result.ok) {
        const publicError = sanitizeCollectionError(result.error);
        const report: ManualHttpNewsroomCollectionFailedReport = {
          sourceCode: result.error.sourceCode ?? sourceCode,
          executionMode: "manual",
          detectedAt,
          status: "failed",
          error: publicError,
        };

        return {
          ok: false,
          kind: "collection_failure",
          report,
          error: {
            code: publicError.code,
            message: "A recolha manual foi rejeitada pelo percurso controlado.",
          },
          output: formatReport(report),
        };
      }

      const summary = result.value;
      const report: ManualHttpNewsroomCollectionCompletedReport = {
        sourceCode: summary.sourceCode,
        executionMode: "manual",
        detectedAt,
        status: "completed",
        listingUrls: summary.listingUrls,
        loadedListingCount: summary.loadedListingCount,
        discoveredCount: summary.discoveredCount,
        totalCandidates: summary.candidates.length,
        duplicateCount: summary.duplicateCount,
        rejectedCount: summary.rejectedCount,
        candidates: summary.candidates,
        errors: summary.errors.map(sanitizeCollectionError),
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

export async function runManualHttpNewsroomCollectionCommand(
  args: readonly string[],
  dependencies: ManualHttpNewsroomCollectionCommandDependencies,
): Promise<number> {
  if (args.length !== 1 || !isValidSourceCode(args[0])) {
    dependencies.writeError(USAGE_MESSAGE);
    return 1;
  }

  let invocation: ManualHttpNewsroomCollectionInvocationResult;
  try {
    invocation = await dependencies.invoke(args[0]);
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
