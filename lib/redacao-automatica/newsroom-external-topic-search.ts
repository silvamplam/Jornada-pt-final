import "server-only";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import { ingestHttpNewsroomArticle } from "@/lib/redacao-automatica/http-newsroom-ingestion";
import {
  createNewsroomExternalTopicSearch,
  type NewsroomExternalTopicSearchInput,
  type NewsroomExternalTopicSearchResult,
} from "@/lib/redacao-automatica/newsroom-external-topic-search-internal";
import {
  listUndatedNewsroomTopicRecoveryCandidates,
  searchNewsroomArticles,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

export type {
  NewsroomExternalTopicSearchError,
  NewsroomExternalTopicSearchErrorCode,
  NewsroomExternalTopicSearchInput,
  NewsroomExternalTopicSearchResult,
  NewsroomExternalTopicSearchSourceReport,
  NewsroomExternalTopicSearchStatus,
  NewsroomExternalTopicSearchSuccess,
} from "@/lib/redacao-automatica/newsroom-external-topic-search-internal";

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

const adapterRegistry = availableAdapterRegistry();
const pageLoader = createHttpPageLoader();
const searchWithControlledHttp = createNewsroomExternalTopicSearch({
  listSources: listRegisteredSources,
  collectSource(input) {
    return collectSource(input, {
      sourceProvider: registeredSourceConfigurationProvider,
      adapterRegistry,
      pageLoader,
      now: () => new Date().toISOString(),
    });
  },
  ingestArticle: ingestHttpNewsroomArticle,
  async searchArchive(input) {
    const result = await searchNewsroomArticles({
      query: input.topic,
      periodDays: input.periodDays,
      sourceCode: input.sourceCode,
    });
    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      value: {
        articleIds: result.value.items.map((article) => article.id),
        reasonsByArticleId: result.value.topicDiagnostics?.reasonsByArticleId ?? {},
      },
    };
  },
  async listUndatedRecoveryCandidates(input) {
    return listUndatedNewsroomTopicRecoveryCandidates({
      query: input.topic,
      sourceCode: input.sourceCode,
      limit: input.limit,
      cooldownHours: input.cooldownHours,
      now: input.now,
    });
  },
  clock: () => new Date(),
});

export async function searchExternalNewsroomTopic(
  input: NewsroomExternalTopicSearchInput,
): Promise<NewsroomExternalTopicSearchResult> {
  return searchWithControlledHttp(input);
}
