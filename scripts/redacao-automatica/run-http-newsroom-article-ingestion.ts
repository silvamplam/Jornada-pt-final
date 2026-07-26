import "server-only";

import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ingestHttpNewsroomArticle } from "@/lib/redacao-automatica/http-newsroom-ingestion";
import {
  createManualHttpNewsroomArticleInvoker,
  runManualHttpNewsroomArticleCommand,
} from "@/lib/redacao-automatica/manual-http-newsroom-article-invoker-internal";

// Execucao manual (PowerShell, a partir da raiz do repositorio):
// $env:NODE_PATH = (Resolve-Path "node_modules\next\dist\compiled").Path
// node --conditions=react-server --import tsx scripts/redacao-automatica/run-http-newsroom-article-ingestion.ts <sourceCode> <articleUrl>

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "../..");
const STRUCTURAL_FAILURE_MESSAGE =
  "Falha estrutural controlada no invocador manual de artigo HTTP.";

export function isDirectManualHttpArticleExecution(
  moduleUrl: string,
  entryPath: string | undefined,
): boolean {
  return Boolean(
    entryPath
    && fileURLToPath(moduleUrl) === resolve(entryPath),
  );
}

export async function runHttpNewsroomArticleIngestionCli(
  args: readonly string[],
): Promise<number> {
  loadEnvConfig(repositoryRoot);
  const invoke = createManualHttpNewsroomArticleInvoker({
    clock: () => new Date(),
    ingestArticle: ingestHttpNewsroomArticle,
  });

  return runManualHttpNewsroomArticleCommand(args, {
    invoke,
    writeOutput(output) {
      console.log(output);
    },
    writeError(output) {
      console.error(output);
    },
  });
}

if (isDirectManualHttpArticleExecution(import.meta.url, process.argv[1])) {
  void runHttpNewsroomArticleIngestionCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      console.error(STRUCTURAL_FAILURE_MESSAGE);
      process.exitCode = 1;
    });
}
