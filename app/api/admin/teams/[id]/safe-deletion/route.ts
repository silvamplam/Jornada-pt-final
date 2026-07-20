import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import {
  TeamSafeDeletionAuthorization,
  handleTeamSafeDeletionRequest,
} from "@/lib/team-safe-deletion-api";
import { getSupabaseServiceConfig, writeSupabaseAdminReturning } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function authorizeAdministrator(): Promise<TeamSafeDeletionAuthorization> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!session) return { status: "unauthenticated" };
  if (!(await verifyAdminSession(session))) return { status: "forbidden" };

  const sessionReference = createHash("sha256").update(session).digest("hex").slice(0, 24);
  return { status: "authorized", actorReference: `admin-session:${sessionReference}` };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return handleTeamSafeDeletionRequest(request, id, {
    authorize: authorizeAdministrator,
    serviceConfigured: Boolean(getSupabaseServiceConfig()),
    createRequestReference: randomUUID,
    executeRpc: (arguments_) =>
      writeSupabaseAdminReturning<unknown>("rpc/manage_team_safe_deletion", {
        method: "POST",
        body: JSON.stringify(arguments_),
      }),
    logError: (message, detail) => console.error(message, detail),
  });
}
