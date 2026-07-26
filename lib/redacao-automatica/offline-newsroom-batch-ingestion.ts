import "server-only";

import { ingestOfflineNewsroomArticle } from "@/lib/redacao-automatica/offline-newsroom-ingestion";
import {
  createOfflineNewsroomBatchIngestion,
  type IngestOfflineNewsroomBatchResult,
  type OfflineNewsroomBatchInput,
} from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion-internal";

export {
  OFFLINE_NEWSROOM_BATCH_MAX_ITEMS,
} from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion-internal";
export type {
  IngestOfflineNewsroomBatchResult,
  OfflineNewsroomBatchError,
  OfflineNewsroomBatchErrorCode,
  OfflineNewsroomBatchInput,
  OfflineNewsroomBatchItem,
  OfflineNewsroomBatchItemIngestionResult,
  OfflineNewsroomBatchItemResult,
  OfflineNewsroomBatchSuccess,
  OfflineNewsroomBatchUnexpectedItemError,
} from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion-internal";

const ingestWithOfflineNewsroomPipeline =
  createOfflineNewsroomBatchIngestion({
    ingestArticle: ingestOfflineNewsroomArticle,
  });

export async function ingestOfflineNewsroomBatch(
  input: OfflineNewsroomBatchInput,
): Promise<IngestOfflineNewsroomBatchResult> {
  return ingestWithOfflineNewsroomPipeline(input);
}
