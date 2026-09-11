import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createManualNewsroomEntryPersistence,
  type ManualNewsroomEntryInput,
  type ManualNewsroomEntryResult,
} from "@/lib/redacao-automatica/manual-newsroom-entry-internal";
import {
  attemptOperationalDeskAutomaticClassification,
} from "@/lib/redacao-automatica/newsroom-operational-desk-classification";

export type {
  ManualNewsroomEntryErrorCode,
  ManualNewsroomEntryInput,
  ManualNewsroomEntryResult,
  ManualNewsroomEntrySuccess,
  NormalizedManualNewsroomEntry,
} from "@/lib/redacao-automatica/manual-newsroom-entry-internal";

const persistManualNewsroomEntry = createManualNewsroomEntryPersistence({
  configuration() {
    const config = getSupabaseServiceConfig();
    return config ? { storageBaseUrl: config.url.replace(/\/$/, "") } : null;
  },
  executeRpc(functionName, argumentsValue) {
    return writeSupabaseAdminReturning<unknown>(
      `rpc/${functionName}`,
      {
        method: "POST",
        body: JSON.stringify(argumentsValue),
      },
    );
  },
});

export async function createManualNewsroomEntry(
  input: ManualNewsroomEntryInput,
): Promise<ManualNewsroomEntryResult> {
  const result = await persistManualNewsroomEntry(input);
  if (result.ok) {
    await attemptOperationalDeskAutomaticClassification({
      newsroomArticleId: result.value.newsroomArticleId,
      articleAction: result.value.action,
    });
  }
  return result;
}
