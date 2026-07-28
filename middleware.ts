import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";

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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (
    (!isAdminPage && !isAdminApi) ||
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (await verifyAdminSession(session)) {
    return NextResponse.next();
  }

  return relativeRedirect("/admin/login", {
    next: isAdminApi ? "/admin/clubes" : `${pathname}${search}`
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
