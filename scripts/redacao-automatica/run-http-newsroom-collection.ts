import "server-only";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import {
  createManualHttpNewsroomCollectionInvoker,
  runManualHttpNewsroomCollectionCommand,
} from "@/lib/redacao-automatica/manual-http-newsroom-collection-invoker-internal";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";

// Execucao manual (PowerShell, a partir da raiz do repositorio):
// $env:NODE_PATH = (Resolve-Path "node_modules\next\dist\compiled").Path
// node --conditions=react-server --import tsx scripts/redacao-automatica/run-http-newsroom-collection.ts <sourceCode>

const STRUCTURAL_FAILURE_MESSAGE =
  "Falha estrutural controlada no invocador manual de recolha HTTP.";

export function isDirectManualHttpCollectionExecution(
  moduleUrl: string,
  entryPath: string | undefined,
): boolean {
  return Boolean(
    entryPath
    && fileURLToPath(moduleUrl) === resolve(entryPath),
  );
}

export async function runHttpNewsroomCollectionCli(
  args: readonly string[],
): Promise<number> {
  return runManualHttpNewsroomCollectionCommand(args, {
    async invoke(sourceCode) {
      const adapterRegistryResult = createAvailableAdapterRegistry();
      if (!adapterRegistryResult.ok) {
        throw new Error(STRUCTURAL_FAILURE_MESSAGE);
      }

      const invoke = createManualHttpNewsroomCollectionInvoker({
        clock: () => new Date(),
        collectSource: (input) => collectSource(
          input,
          {
            sourceProvider: registeredSourceConfigurationProvider,
            adapterRegistry: adapterRegistryResult.value,
            pageLoader: createHttpPageLoader(),
            now: () => new Date().toISOString(),
          },
        ),
      });

      return invoke(sourceCode);
    },
    writeOutput(output) {
      console.log(output);
    },
    writeError(output) {
      console.error(output);
    },
  });
}

if (isDirectManualHttpCollectionExecution(import.meta.url, process.argv[1])) {
  void runHttpNewsroomCollectionCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      console.error(STRUCTURAL_FAILURE_MESSAGE);
      process.exitCode = 1;
    });
}
