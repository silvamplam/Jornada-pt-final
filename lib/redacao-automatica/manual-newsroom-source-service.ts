import "server-only";

import { getSupabaseServiceConfig, writeSupabaseAdminReturning } from "@/lib/supabase";
import {
  createManualNewsroomSourcePersistence,
  createManualNewsroomSourceWorkflow,
} from "@/lib/redacao-automatica/manual-newsroom-source-internal";
import { attemptOperationalDeskAutomaticClassification } from "@/lib/redacao-automatica/newsroom-operational-desk-classification";

export type {
  ManualNewsroomSourceErrorCode,
  ManualNewsroomSourceInput,
  ManualNewsroomSourceResult,
  ManualNewsroomSourceSuccess,
  NormalizedManualNewsroomSource,
} from "@/lib/redacao-automatica/manual-newsroom-source-internal";

const persist = createManualNewsroomSourcePersistence({
  isConfigured: () => Boolean(getSupabaseServiceConfig()),
  executeRpc(functionName, argumentsValue) {
    return writeSupabaseAdminReturning<unknown>(`rpc/${functionName}`, {
      method: "POST",
      body: JSON.stringify(argumentsValue),
    });
  },
});

export const createManualNewsroomSource = createManualNewsroomSourceWorkflow({
  persist,
  classify: attemptOperationalDeskAutomaticClassification,
});
