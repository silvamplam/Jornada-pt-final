import { NextResponse } from "next/server";

import {
  applyNewsroomEditorialInboxAction,
  type NewsroomEditorialInboxAction,
  type NewsroomEditorialInboxActionItem,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `${url.pathname}${url.search}` },
  });
}

function actionItem(value: string): Readonly<{
  action: Exclude<NewsroomEditorialInboxAction, "close_block">;
  item: NewsroomEditorialInboxActionItem;
}> | null {
  const [action, articleId, snapshotId, ...rest] = value.split(":");
  if (
    rest.length > 0
    || !["working", "seen", "dismissed", "reopen"].includes(action)
    || !UUID_PATTERN.test(articleId ?? "")
    || !UUID_PATTERN.test(snapshotId ?? "")
  ) {
    return null;
  }

  return {
    action: action as Exclude<NewsroomEditorialInboxAction, "close_block">,
    item: { articleId, snapshotId },
  };
}

function blockItem(value: FormDataEntryValue): NewsroomEditorialInboxActionItem | null {
  if (typeof value !== "string") {
    return null;
  }

  const [, articleId, snapshotId, ...rest] = `item:${value}`.split(":");
  return rest.length === 0
    && UUID_PATTERN.test(articleId ?? "")
    && UUID_PATTERN.test(snapshotId ?? "")
    ? { articleId, snapshotId }
    : null;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const actionValue = cleanText(formData.get("inbox_action"));
  const returnTo = safeReturnTo(cleanText(formData.get("inbox_return_to")));

  if (!actionValue) {
    return redirectTo(returnTo, { inbox_error: "input_invalid" });
  }

  let action: NewsroomEditorialInboxAction;
  let items: readonly NewsroomEditorialInboxActionItem[];

  if (actionValue === "close_block") {
    action = "close_block";
    items = formData.getAll("inbox_block_item").flatMap((value) => {
      const item = blockItem(value);
      return item ? [item] : [];
    });
  } else {
    const parsed = actionItem(actionValue);
    if (!parsed) {
      return redirectTo(returnTo, { inbox_error: "input_invalid" });
    }

    action = parsed.action;
    items = [parsed.item];
  }

  const result = await applyNewsroomEditorialInboxAction(action, items);
  if (!result.ok) {
    return redirectTo(returnTo, { inbox_error: result.error.code });
  }

  return redirectTo(returnTo, {
    inbox_state: result.value.action,
    inbox_count: String(result.value.affectedCount),
  });
}
