import { NextResponse } from "next/server";

import {
  createManualNewsroomEntry,
  type ManualNewsroomEntryErrorCode,
} from "@/lib/redacao-automatica/manual-newsroom-entry-service";

const PAGE_PATH = "/admin/editorial/redacao-automatica";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function redirectTo(params: Readonly<Record<string, string | null | undefined>>) {
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

function failureRedirect(
  code: ManualNewsroomEntryErrorCode,
  submissionId: string,
) {
  return redirectTo({
    manual_entry_error: code,
    manual_entry_open: "1",
    manual_submission_id: UUID_PATTERN.test(submissionId) ? submissionId : null,
  });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo({
      manual_entry_error: "save_failed",
      manual_entry_open: "1",
    });
  }

  const submissionId = cleanText(formData.get("submission_id")).trim().toLowerCase();
  const result = await createManualNewsroomEntry({
    submissionId,
    title: cleanText(formData.get("title")),
    body: cleanText(formData.get("body")),
    publishedDate: cleanText(formData.get("published_date")),
    imageUrl: cleanText(formData.get("image_url")) || null,
  });

  if (!result.ok) {
    return failureRedirect(result.error.code, submissionId);
  }

  return redirectTo({
    topic: result.value.request.title,
    period: "all",
    articleId: result.value.newsroomArticleId,
    manual_entry_state: result.value.action,
  });
}
