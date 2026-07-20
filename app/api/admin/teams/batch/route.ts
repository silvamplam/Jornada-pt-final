import { handleTeamBatchCreationRequest } from "@/lib/team-batch-creation-api";
import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTeamBatchCreationRequest(request, {
    serviceConfigured: () => Boolean(getSupabaseServiceConfig()),
    createRequestId: () => crypto.randomUUID(),
    executeRpc: (argumentsValue) =>
      writeSupabaseAdminReturning("rpc/manage_team_creation_batch", {
        method: "POST",
        body: JSON.stringify(argumentsValue)
      }),
    logError: (message) => console.error(message)
  });
}
