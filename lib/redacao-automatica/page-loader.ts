import type {
  CollectionError,
  LoadedPage,
  OperationResult,
} from "@/lib/redacao-automatica/types";

export type PageLoadRequest = Readonly<{
  sourceCode: string;
  url: string;
}>;

export interface PageLoader {
  load(
    request: PageLoadRequest,
  ): Promise<OperationResult<LoadedPage, CollectionError>>;
}
