import { NextResponse } from "next/server";

import { markNewsroomArticleReadyForReview } from "@/lib/redacao-automatica/newsroom-review-service";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function safeReturnTo(value: string | null): string {
  if (!value) {
    return "/admin/editorial/redacao-automatica";
  }

  try {
    const url = new URL(value, "https://jornada.local");
    if (url.pathname !== "/admin/editorial/redacao-automatica") {
      return "/admin/editorial/redacao-automatica";
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return "/admin/editorial/redacao-automatica";
  }
}

function redirectTo(path: string, params: Record<string, string>) {
  const url = new URL(path, "https://jornada.local");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const location = `${url.pathname}${url.search}`;
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const newsroomArticleId = cleanText(formData.get("newsroom_article_id"));
  const returnTo = safeReturnTo(cleanText(formData.get("return_to")));

  if (!newsroomArticleId) {
    return redirectTo(returnTo, { review_error: "input_invalid" });
  }

  const result = await markNewsroomArticleReadyForReview(newsroomArticleId);
  if (!result.ok) {
    return redirectTo(returnTo, { review_error: result.error.code });
  }

  return redirectTo(returnTo, { review_state: result.value.action });
}
