import { NextResponse } from "next/server";

export const ARTICLE_ADMIN_PATH = "/admin/editorial/artigos";

const INTERNAL_REDIRECT_BASE_URL = "https://jornada.local";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isArticleAdminUuid(value: string | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function articleAdminRedirectLocation(path: string, params: Record<string, string>) {
  const url = new URL(path, INTERNAL_REDIRECT_BASE_URL);
  if (url.origin !== INTERNAL_REDIRECT_BASE_URL || url.pathname !== ARTICLE_ADMIN_PATH) {
    throw new Error("invalid-return-to");
  }

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}`;
}

export function articleAdminRedirect(path: string, params: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: articleAdminRedirectLocation(path, params),
    },
  });
}

export function safeArticleAdminReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, INTERNAL_REDIRECT_BASE_URL);
    if (url.origin !== INTERNAL_REDIRECT_BASE_URL || url.pathname !== ARTICLE_ADMIN_PATH) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
