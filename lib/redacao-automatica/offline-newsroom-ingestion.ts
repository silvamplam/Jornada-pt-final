import "server-only";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import {
  createOfflineNewsroomIngestion,
  type IngestOfflineNewsroomArticleInput,
  type IngestOfflineNewsroomArticleResult,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";
import { persistNewsroomArticle } from "@/lib/redacao-automatica/newsroom-article-persistence";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";

export type {
  IngestOfflineNewsroomArticleInput,
  IngestOfflineNewsroomArticleResult,
  OfflineNewsroomIngestionError,
  OfflineNewsroomIngestionErrorCode,
  OfflineNewsroomIngestionSuccess,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";

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

const ingestWithRegisteredSources = createOfflineNewsroomIngestion({
  sourceProvider: registeredSourceConfigurationProvider,
  adapterRegistry: availableAdapterRegistry(),
  persistArticle: persistNewsroomArticle,
});

export async function ingestOfflineNewsroomArticle(
  input: IngestOfflineNewsroomArticleInput,
): Promise<IngestOfflineNewsroomArticleResult> {
  return ingestWithRegisteredSources(input);
}
