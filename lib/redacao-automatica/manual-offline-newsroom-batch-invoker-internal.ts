import type {
  IngestOfflineNewsroomBatchResult,
  OfflineNewsroomBatchInput,
} from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion-internal";

export type ManualOfflineNewsroomBatchInvocationResult =
  | Readonly<{
      ok: true;
      report: IngestOfflineNewsroomBatchResult;
      output: string;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "invoker_structural_failure";
        message: string;
      }>;
    }>;

type ManualOfflineNewsroomBatchInvokerDependencies = Readonly<{
  ingestBatch(
    input: OfflineNewsroomBatchInput,
  ): Promise<IngestOfflineNewsroomBatchResult>;
}>;

type ManualOfflineNewsroomBatchCommandDependencies = Readonly<{
  readBatch(path: string): Promise<OfflineNewsroomBatchInput>;
  invoke(
    input: OfflineNewsroomBatchInput,
  ): Promise<ManualOfflineNewsroomBatchInvocationResult>;
  writeOutput(output: string): void;
  writeError(output: string): void;
}>;

const STRUCTURAL_FAILURE_MESSAGE =
  "Falha estrutural controlada no invocador manual do lote offline.";

function itemReportLine(
  item: Extract<
    IngestOfflineNewsroomBatchResult,
    { ok: true }
  >["value"]["items"][number],
): string {
  if (!item.ingestion.ok) {
    return `${item.index + 1}. ${item.itemId}: falha (${item.ingestion.error.code})`;
  }

  return [
    `${item.index + 1}. ${item.itemId}: sucesso`,
    `artigo=${item.ingestion.value.article.action}`,
    `snapshot=${item.ingestion.value.snapshot.action}`,
  ].join("; ");
}

export function formatOfflineNewsroomBatchReport(
  report: IngestOfflineNewsroomBatchResult,
): string {
  const lines = ["Relatorio agregado da ingestao offline"];

  if (!report.ok) {
    lines.push(
      "Estado: rejeitado pelo orquestrador",
      `Codigo: ${report.error.code}`,
    );
    return lines.join("\n");
  }

  lines.push(
    "Estado: concluido",
    `Total: ${report.value.total}`,
    `Sucessos: ${report.value.succeeded}`,
    `Falhas: ${report.value.failed}`,
    `Artigos: criados=${report.value.createdArticles}; reutilizados=${report.value.reusedArticles}; atualizados=${report.value.updatedArticles}`,
    `Snapshots: criados=${report.value.createdSnapshots}; reutilizados=${report.value.reusedSnapshots}`,
    "Itens:",
    ...report.value.items.map(itemReportLine),
  );

  return lines.join("\n");
}

export function createManualOfflineNewsroomBatchInvoker(
  dependencies: ManualOfflineNewsroomBatchInvokerDependencies,
): (
  input: OfflineNewsroomBatchInput,
) => Promise<ManualOfflineNewsroomBatchInvocationResult> {
  return async (input) => {
    try {
      const report = await dependencies.ingestBatch(input);
      return {
        ok: true,
        report,
        output: formatOfflineNewsroomBatchReport(report),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "invoker_structural_failure",
          message: STRUCTURAL_FAILURE_MESSAGE,
        },
      };
    }
  };
}

export async function runManualOfflineNewsroomBatchCommand(
  args: readonly string[],
  dependencies: ManualOfflineNewsroomBatchCommandDependencies,
): Promise<number> {
  if (args.length !== 1) {
    dependencies.writeError(
      "Uso: indicar exatamente um ficheiro JSON local com o lote offline.",
    );
    return 1;
  }

  let input: OfflineNewsroomBatchInput;
  try {
    input = await dependencies.readBatch(args[0]);
  } catch {
    dependencies.writeError(
      "Nao foi possivel ler o ficheiro JSON local do lote offline.",
    );
    return 1;
  }

  let invocation: ManualOfflineNewsroomBatchInvocationResult;
  try {
    invocation = await dependencies.invoke(input);
  } catch {
    dependencies.writeError(STRUCTURAL_FAILURE_MESSAGE);
    return 1;
  }

  if (!invocation.ok) {
    dependencies.writeError(invocation.error.message);
    return 1;
  }

  dependencies.writeOutput(invocation.output);
  return 0;
}
