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
  return persistManualNewsroomEntry(input);
}
