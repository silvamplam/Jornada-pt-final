import type {
  AdapterResult,
  DiscoveredArticleLink,
  LoadedPage,
  NormalizedDetectedArticle,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

export type AdapterListingInput = Readonly<{
  source: SourceConfiguration;
  page: LoadedPage;
}>;

export type AdapterUrlInput = Readonly<{
  source: SourceConfiguration;
  url: string;
  baseUrl: string;
}>;

export type AdapterArticleInput = Readonly<{
  source: SourceConfiguration;
  page: LoadedPage;
  detectedAt: string;
}>;

export interface SourceAdapter {
  readonly key: string;
  readonly sourceCode: string;

  getListingUrls(source: SourceConfiguration): AdapterResult<readonly string[]>;

  discoverArticleLinks(input: AdapterListingInput): AdapterResult<readonly DiscoveredArticleLink[]>;

  normalizeArticleUrl(input: AdapterUrlInput): AdapterResult<string>;

  extractArticle(input: AdapterArticleInput): AdapterResult<NormalizedDetectedArticle>;
}
