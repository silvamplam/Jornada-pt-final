import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  JORNADA_EDITORIAL_PROFILE_CODE,
  type EditorialProfileActivationEvent,
  type EditorialProfileActorType,
  type EditorialProfileOverview,
  type EditorialProfileVersion,
} from "@/lib/redacao-automatica/editorial-profile-internal";

type ProfileRow = {
  id: string;
  code: string;
  name: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_actor_type: EditorialProfileActorType;
  created_by_actor_id: string | null;
};

type VersionRow = {
  id: string;
  profile_id: string;
  version_number: number;
  document_text: string;
  content_hash: string;
  change_summary: string;
  based_on_version_id: string | null;
  approval_state: "approved";
  created_at: string;
  created_by_actor_type: EditorialProfileActorType;
  created_by_actor_id: string | null;
};

type ActivationEventRow = {
  id: string;
  profile_id: string;
  previous_version_id: string | null;
  activated_version_id: string;
  event_type: "activate" | "rollback";
  reason: string | null;
  created_at: string;
  created_by_actor_type: EditorialProfileActorType;
  created_by_actor_id: string | null;
};

export type EditorialProfileRepositoryResult =
  | { ok: true; profile: EditorialProfileOverview }
  | { ok: false; reason: "not_configured" | "not_found" | "invalid_relation" };

function toVersion(row: VersionRow): EditorialProfileVersion {
  return {
    id: row.id,
    profileId: row.profile_id,
    versionNumber: row.version_number,
    documentText: row.document_text,
    contentHash: row.content_hash,
    changeSummary: row.change_summary,
    basedOnVersionId: row.based_on_version_id,
    approvalState: row.approval_state,
    createdAt: row.created_at,
    createdByActorType: row.created_by_actor_type,
    createdByActorId: row.created_by_actor_id,
  };
}

function toEvent(row: ActivationEventRow): EditorialProfileActivationEvent {
  return {
    id: row.id,
    profileId: row.profile_id,
    previousVersionId: row.previous_version_id,
    activatedVersionId: row.activated_version_id,
    eventType: row.event_type,
    reason: row.reason,
    createdAt: row.created_at,
    createdByActorType: row.created_by_actor_type,
    createdByActorId: row.created_by_actor_id,
  };
}

export async function getEditorialProfileOverview(): Promise<EditorialProfileRepositoryResult> {
  if (!getSupabaseServiceConfig()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const profiles = await fetchSupabaseAdminTable<ProfileRow>(
      "newsroom_editorial_profiles"
        + "?select=id,code,name,active_version_id,created_at,updated_at,created_by_actor_type,created_by_actor_id"
        + `&code=eq.${encodeURIComponent(JORNADA_EDITORIAL_PROFILE_CODE)}`
        + "&limit=1",
    );
    const profile = profiles[0];

    if (!profile || !profile.active_version_id) {
      return { ok: false, reason: "not_found" };
    }

    const [versionRows, eventRows] = await Promise.all([
      fetchSupabaseAdminTable<VersionRow>(
        "newsroom_editorial_profile_versions"
          + "?select=id,profile_id,version_number,document_text,content_hash,change_summary,based_on_version_id,approval_state,created_at,created_by_actor_type,created_by_actor_id"
          + `&profile_id=eq.${encodeURIComponent(profile.id)}`
          + "&order=version_number.desc",
      ),
      fetchSupabaseAdminTable<ActivationEventRow>(
        "newsroom_editorial_profile_activation_events"
          + "?select=id,profile_id,previous_version_id,activated_version_id,event_type,reason,created_at,created_by_actor_type,created_by_actor_id"
          + `&profile_id=eq.${encodeURIComponent(profile.id)}`
          + "&order=created_at.desc&limit=100",
      ),
    ]);
    const versions = versionRows.map(toVersion);
    const activeVersion =
      versions.find((version) => version.id === profile.active_version_id) ??
      null;

    if (!activeVersion) {
      return { ok: false, reason: "invalid_relation" };
    }

    return {
      ok: true,
      profile: {
        id: profile.id,
        code: profile.code,
        name: profile.name,
        activeVersionId: profile.active_version_id,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        createdByActorType: profile.created_by_actor_type,
        createdByActorId: profile.created_by_actor_id,
        activeVersion,
        versions,
        activationEvents: eventRows.map(toEvent),
      },
    };
  } catch {
    return { ok: false, reason: "not_configured" };
  }
}
