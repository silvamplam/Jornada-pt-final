import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSession
} from "@/lib/admin-session";

function getSafeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }

  return value;
}

function relativeRedirect(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, "https://jornada.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `${url.pathname}${url.search}`
    }
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password");
  const nextPath = getSafeNext(formData.get("next"));
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return relativeRedirect("/admin/login", { error: "missing" });
  }

  if (typeof password !== "string" || password !== expectedPassword) {
    return relativeRedirect("/admin/login", {
      error: "invalid",
      next: nextPath
    });
  }

  const response = relativeRedirect(nextPath);
  const session = await createAdminSession();

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: session,
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
