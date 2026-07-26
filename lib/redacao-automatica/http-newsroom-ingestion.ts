import "server-only";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import {
  createHttpNewsroomIngestion,
  type IngestHttpNewsroomArticleInput,
  type IngestHttpNewsroomArticleResult,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";
import { persistNewsroomArticle } from "@/lib/redacao-automatica/newsroom-article-persistence";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import { resolveHttpPageLoaderPolicy } from "@/lib/redacao-automatica/page-loaders/http-page-loader-policy";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { evaluateSourceExecution } from "@/lib/redacao-automatica/source-registry";

export type {
  HttpNewsroomIngestionError,
  HttpNewsroomIngestionErrorCode,
  HttpNewsroomIngestionSuccess,
  IngestHttpNewsroomArticleInput,
  IngestHttpNewsroomArticleResult,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";

function availableAdapterRegistry(): AdapterRegistry {
  const registryResult = createAvailableAdapterRegistry();
  if (registryResult.ok) {
    return registryResult.value;
  }

  return {
    resolve() {
      return registryResult;
    },
    keys() {
      return [];
    },
  };
}

const ingestWithHttpPageLoader = createHttpNewsroomIngestion({
  sourceProvider: registeredSourceConfigurationProvider,
  evaluateExecution: evaluateSourceExecution,
  resolvePolicy: resolveHttpPageLoaderPolicy,
  adapterRegistry: availableAdapterRegistry(),
  pageLoader: createHttpPageLoader(),
  persistArticle: persistNewsroomArticle,
});

export async function ingestHttpNewsroomArticle(
  input: IngestHttpNewsroomArticleInput,
): Promise<IngestHttpNewsroomArticleResult> {
  return ingestWithHttpPageLoader(input);
}
