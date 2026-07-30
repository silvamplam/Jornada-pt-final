import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  isUuid,
  type EditorialProfileActivationEventType,
  type PinnedEditorialProfileVersion,
  validateActivateEditorialProfileVersionInput,
  validateCreateEditorialProfileVersionInput,
} from "@/lib/redacao-automatica/editorial-profile-internal";

type RpcErrorCode =
  | "editorial_profile_not_found"
  | "editorial_profile_version_not_found"
  | "editorial_profile_version_conflict"
  | "editorial_profile_active_conflict"
  | "editorial_profile_version_already_active"
  | "editorial_profile_unavailable"
  | "editorial_profile_relation_invalid"
  | "invalid_request"
  | "persistence_failed";

type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RpcErrorCode };

type CreateVersionRpcRow = {
  version_id: string;
  version_number: number;
  content_hash: string;
};

type ActivateVersionRpcRow = {
  activation_event_id: string;
  previous_version_id: string | null;
  active_version_id: string;
};

type PinVersionRpcRow = {
  profile_id: string;
  profile_code: string;
  profile_name: string;
  version_id: string;
  version_number: number;
  document_text: string;
  content_hash: string;
  approval_state: "approved";
  version_created_at: string;
  pinned_at: string;
};

function classifyRpcError(error: unknown): RpcErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const knownCodes: RpcErrorCode[] = [
    "editorial_profile_not_found",
    "editorial_profile_version_not_found",
    "editorial_profile_version_conflict",
    "editorial_profile_active_conflict",
    "editorial_profile_version_already_active",
    "editorial_profile_unavailable",
    "editorial_profile_relation_invalid",
  ];

  return (
    knownCodes.find((code) => message.includes(code)) ?? "persistence_failed"
  );
}

export async function createEditorialProfileVersion(input: {
  profileId: string;
  basedOnVersionId: string | null;
  expectedLatestVersionNumber: number;
  documentText: string;
  changeSummary: string;
}): Promise<
  ServiceResult<{
    versionId: string;
    versionNumber: number;
    contentHash: string;
  }>
> {
  const validated = validateCreateEditorialProfileVersionInput(input);

  if (!validated.ok || !getSupabaseServiceConfig()) {
    return { ok: false, error: "invalid_request" };
  }

  try {
    const rows = await writeSupabaseAdminReturning<CreateVersionRpcRow>(
      "rpc/newsroom_create_editorial_profile_version",
      {
        method: "POST",
        body: JSON.stringify({
          p_profile_id: validated.value.profileId,
          p_based_on_version_id: validated.value.basedOnVersionId,
          p_expected_latest_version_number:
            validated.value.expectedLatestVersionNumber,
          p_document_text: validated.value.documentText,
          p_content_hash: validated.value.contentHash,
          p_change_summary: validated.value.changeSummary,
          p_created_by_actor_type: "admin_session",
          p_created_by_actor_id: null,
        }),
      },
    );
    const row = rows[0];

    if (!row) {
      return { ok: false, error: "persistence_failed" };
    }

    return {
      ok: true,
      value: {
        versionId: row.version_id,
        versionNumber: row.version_number,
        contentHash: row.content_hash,
      },
    };
  } catch (error) {
    return { ok: false, error: classifyRpcError(error) };
  }
}

export async function activateEditorialProfileVersion(input: {
  profileId: string;
  versionId: string;
  expectedActiveVersionId: string;
  eventType: EditorialProfileActivationEventType;
  reason: string | null;
}): Promise<
  ServiceResult<{
    activationEventId: string;
    previousVersionId: string | null;
    activeVersionId: string;
  }>
> {
  const validated = validateActivateEditorialProfileVersionInput(input);

  if (!validated.ok || !getSupabaseServiceConfig()) {
    return { ok: false, error: "invalid_request" };
  }

  try {
    const rows = await writeSupabaseAdminReturning<ActivateVersionRpcRow>(
      "rpc/newsroom_activate_editorial_profile_version",
      {
        method: "POST",
        body: JSON.stringify({
          p_profile_id: validated.value.profileId,
          p_version_id: validated.value.versionId,
          p_expected_active_version_id:
            validated.value.expectedActiveVersionId,
          p_event_type: validated.value.eventType,
          p_reason: validated.value.reason,
          p_created_by_actor_type: "admin_session",
          p_created_by_actor_id: null,
        }),
      },
    );
    const row = rows[0];

    if (!row) {
      return { ok: false, error: "persistence_failed" };
    }

    return {
      ok: true,
      value: {
        activationEventId: row.activation_event_id,
        previousVersionId: row.previous_version_id,
        activeVersionId: row.active_version_id,
      },
    };
  } catch (error) {
    return { ok: false, error: classifyRpcError(error) };
  }
}

export async function pinEditorialProfileVersionForPlan(input: {
  dossierId: string;
  planId: string;
}): Promise<ServiceResult<PinnedEditorialProfileVersion>> {
  if (
    !isUuid(input.dossierId) ||
    !isUuid(input.planId) ||
    !getSupabaseServiceConfig()
  ) {
    return { ok: false, error: "invalid_request" };
  }

  try {
    const rows = await writeSupabaseAdminReturning<PinVersionRpcRow>(
      "rpc/newsroom_pin_editorial_profile_version_for_plan",
      {
        method: "POST",
        body: JSON.stringify({
          p_dossier_id: input.dossierId,
          p_plan_id: input.planId,
        }),
      },
    );
    const row = rows[0];

    if (!row) {
      return { ok: false, error: "editorial_profile_unavailable" };
    }

    return {
      ok: true,
      value: {
        profileId: row.profile_id,
        profileCode: row.profile_code,
        profileName: row.profile_name,
        versionId: row.version_id,
        versionNumber: row.version_number,
        documentText: row.document_text,
        contentHash: row.content_hash,
        approvalState: row.approval_state,
        versionCreatedAt: row.version_created_at,
        pinnedAt: row.pinned_at,
      },
    };
  } catch (error) {
    return { ok: false, error: classifyRpcError(error) };
  }
}
