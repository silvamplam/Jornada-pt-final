import type {
  CollectionError,
  LoadedPage,
  OperationResult,
} from "@/lib/redacao-automatica/types";

export type PageLoadPurpose = "listing" | "article";

export type PageLoadRequest = Readonly<{
  sourceCode: string;
  url: string;
  purpose: PageLoadPurpose;
}>;

export interface PageLoader {
  load(
    request: PageLoadRequest,
  ): Promise<OperationResult<LoadedPage, CollectionError>>;
}
