import { createHash } from "node:crypto";

export const JORNADA_EDITORIAL_PROFILE_CODE = "jornada-pt";
export const EDITORIAL_PROFILE_DOCUMENT_MAX_LENGTH = 20_000;
export const EDITORIAL_PROFILE_CHANGE_SUMMARY_MAX_LENGTH = 1_000;
export const EDITORIAL_PROFILE_ACTIVATION_REASON_MAX_LENGTH = 1_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type EditorialProfileActorType = "system_migration" | "admin_session";
export type EditorialProfileApprovalState = "approved";
export type EditorialProfileActivationEventType = "activate" | "rollback";

export type EditorialProfileVersion = {
  id: string;
  profileId: string;
  versionNumber: number;
  documentText: string;
  contentHash: string;
  changeSummary: string;
  basedOnVersionId: string | null;
  approvalState: EditorialProfileApprovalState;
  createdAt: string;
  createdByActorType: EditorialProfileActorType;
  createdByActorId: string | null;
};

export type EditorialProfileActivationEvent = {
  id: string;
  profileId: string;
  previousVersionId: string | null;
  activatedVersionId: string;
  eventType: EditorialProfileActivationEventType;
  reason: string | null;
  createdAt: string;
  createdByActorType: EditorialProfileActorType;
  createdByActorId: string | null;
};

export type EditorialProfileOverview = {
  id: string;
  code: string;
  name: string;
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
  createdByActorType: EditorialProfileActorType;
  createdByActorId: string | null;
  activeVersion: EditorialProfileVersion;
  versions: EditorialProfileVersion[];
  activationEvents: EditorialProfileActivationEvent[];
};

export type PinnedEditorialProfileVersion = {
  profileId: string;
  profileCode: string;
  profileName: string;
  versionId: string;
  versionNumber: number;
  documentText: string;
  contentHash: string;
  approvalState: EditorialProfileApprovalState;
  versionCreatedAt: string;
  pinnedAt: string;
};

export type EditorialProfileValidationError =
  | "invalid_profile_id"
  | "invalid_version_id"
  | "invalid_expected_active_version_id"
  | "invalid_expected_latest_version_number"
  | "invalid_document"
  | "invalid_change_summary"
  | "invalid_event_type"
  | "invalid_reason";

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isSha256(value: string): boolean {
  return SHA256_PATTERN.test(value);
}

export function normalizeEditorialProfileDocument(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function editorialProfileContentHash(documentText: string): string {
  return createHash("sha256")
    .update(normalizeEditorialProfileDocument(documentText), "utf8")
    .digest("hex");
}

export function validateCreateEditorialProfileVersionInput(input: {
  profileId: string;
  basedOnVersionId: string | null;
  expectedLatestVersionNumber: number;
  documentText: string;
  changeSummary: string;
}):
  | {
      ok: true;
      value: {
        profileId: string;
        basedOnVersionId: string | null;
        expectedLatestVersionNumber: number;
        documentText: string;
        contentHash: string;
        changeSummary: string;
      };
    }
  | { ok: false; error: EditorialProfileValidationError } {
  if (!isUuid(input.profileId)) {
    return { ok: false, error: "invalid_profile_id" };
  }

  if (input.basedOnVersionId !== null && !isUuid(input.basedOnVersionId)) {
    return { ok: false, error: "invalid_version_id" };
  }

  if (
    !Number.isSafeInteger(input.expectedLatestVersionNumber) ||
    input.expectedLatestVersionNumber < 1
  ) {
    return { ok: false, error: "invalid_expected_latest_version_number" };
  }

  const documentText = normalizeEditorialProfileDocument(input.documentText);

  if (
    documentText.length === 0 ||
    documentText.length > EDITORIAL_PROFILE_DOCUMENT_MAX_LENGTH
  ) {
    return { ok: false, error: "invalid_document" };
  }

  const changeSummary = input.changeSummary.trim();

  if (
    changeSummary.length === 0 ||
    changeSummary.length > EDITORIAL_PROFILE_CHANGE_SUMMARY_MAX_LENGTH
  ) {
    return { ok: false, error: "invalid_change_summary" };
  }

  return {
    ok: true,
    value: {
      profileId: input.profileId,
      basedOnVersionId: input.basedOnVersionId,
      expectedLatestVersionNumber: input.expectedLatestVersionNumber,
      documentText,
      contentHash: editorialProfileContentHash(documentText),
      changeSummary,
    },
  };
}

export function validateActivateEditorialProfileVersionInput(input: {
  profileId: string;
  versionId: string;
  expectedActiveVersionId: string;
  eventType: string;
  reason: string | null;
}):
  | {
      ok: true;
      value: {
        profileId: string;
        versionId: string;
        expectedActiveVersionId: string;
        eventType: EditorialProfileActivationEventType;
        reason: string | null;
      };
    }
  | { ok: false; error: EditorialProfileValidationError } {
  if (!isUuid(input.profileId)) {
    return { ok: false, error: "invalid_profile_id" };
  }

  if (!isUuid(input.versionId)) {
    return { ok: false, error: "invalid_version_id" };
  }

  if (!isUuid(input.expectedActiveVersionId)) {
    return { ok: false, error: "invalid_expected_active_version_id" };
  }

  if (input.eventType !== "activate" && input.eventType !== "rollback") {
    return { ok: false, error: "invalid_event_type" };
  }

  const reason = input.reason?.trim() || null;

  if (
    reason !== null &&
    reason.length > EDITORIAL_PROFILE_ACTIVATION_REASON_MAX_LENGTH
  ) {
    return { ok: false, error: "invalid_reason" };
  }

  return {
    ok: true,
    value: {
      profileId: input.profileId,
      versionId: input.versionId,
      expectedActiveVersionId: input.expectedActiveVersionId,
      eventType: input.eventType,
      reason,
    },
  };
}
