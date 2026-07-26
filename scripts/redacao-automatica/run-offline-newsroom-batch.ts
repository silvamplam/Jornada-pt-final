import "server-only";

import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ingestOfflineNewsroomBatch } from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion";
import type { OfflineNewsroomBatchInput } from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion";
import {
  createManualOfflineNewsroomBatchInvoker,
  runManualOfflineNewsroomBatchCommand,
} from "@/lib/redacao-automatica/manual-offline-newsroom-batch-invoker-internal";

// Execucao manual (PowerShell, a partir da raiz do repositorio):
// $env:NODE_PATH = (Resolve-Path "node_modules\next\dist\compiled").Path
// node --conditions=react-server --import tsx scripts/redacao-automatica/run-offline-newsroom-batch.ts <lote-local.json>

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "../..");
const invokeBatch = createManualOfflineNewsroomBatchInvoker({
  ingestBatch: ingestOfflineNewsroomBatch,
});

async function readLocalBatch(path: string): Promise<OfflineNewsroomBatchInput> {
  const content = await readFile(resolve(path), "utf8");
  return JSON.parse(content) as OfflineNewsroomBatchInput;
}

export function isDirectManualBatchExecution(
  moduleUrl: string,
  entryPath: string | undefined,
): boolean {
  return Boolean(
    entryPath
    && fileURLToPath(moduleUrl) === resolve(entryPath),
  );
}

export async function runOfflineNewsroomBatchCli(
  args: readonly string[],
): Promise<number> {
  loadEnvConfig(repositoryRoot);

  return runManualOfflineNewsroomBatchCommand(args, {
    readBatch: readLocalBatch,
    invoke: invokeBatch,
    writeOutput(output) {
      console.log(output);
    },
    writeError(output) {
      console.error(output);
    },
  });
}

if (isDirectManualBatchExecution(import.meta.url, process.argv[1])) {
  void runOfflineNewsroomBatchCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      console.error(
        "Falha estrutural controlada no invocador manual do lote offline.",
      );
      process.exitCode = 1;
    });
}
