import { NextResponse } from "next/server";

import {
  activateEditorialProfileVersion,
  createEditorialProfileVersion,
} from "@/lib/redacao-automatica/editorial-profile-service";

const PAGE_PATH = "/admin/editorial/redacao-automatica/linha-editorial";

function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function redirectTo(params: Readonly<Record<string, string | null>>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `${PAGE_PATH}${query ? `?${query}` : ""}`,
    },
  });
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectTo({ error: "invalid_request" });
  }

  const action = textValue(formData.get("action")).trim();

  if (action === "create_version") {
    const expectedLatestVersionNumber = Number.parseInt(
      textValue(formData.get("expected_latest_version_number")),
      10,
    );
    const result = await createEditorialProfileVersion({
      profileId: textValue(formData.get("profile_id")).trim().toLowerCase(),
      basedOnVersionId:
        textValue(formData.get("based_on_version_id")).trim().toLowerCase() ||
        null,
      expectedLatestVersionNumber,
      documentText: textValue(formData.get("document_text")),
      changeSummary: textValue(formData.get("change_summary")),
    });

    return result.ok
      ? redirectTo({ state: "version_created" })
      : redirectTo({ error: result.error });
  }

  if (action === "activate" || action === "rollback") {
    const result = await activateEditorialProfileVersion({
      profileId: textValue(formData.get("profile_id")).trim().toLowerCase(),
      versionId: textValue(formData.get("version_id")).trim().toLowerCase(),
      expectedActiveVersionId: textValue(
        formData.get("expected_active_version_id"),
      )
        .trim()
        .toLowerCase(),
      eventType: action,
      reason: textValue(formData.get("reason")) || null,
    });

    return result.ok
      ? redirectTo({
          state:
            action === "rollback"
              ? "version_rolled_back"
              : "version_activated",
        })
      : redirectTo({ error: result.error });
  }

  return redirectTo({ error: "invalid_request" });
}
