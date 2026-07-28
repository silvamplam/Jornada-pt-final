import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";

function redirectToAdminLogin(request: NextRequest, nextPath: string) {
  const url = request.nextUrl.clone();

  url.pathname = "/admin/login";
  url.search = "";
  url.searchParams.set("next", nextPath);

  return NextResponse.redirect(url, { status: 303 });
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

  return redirectToAdminLogin(
    request,
    isAdminApi ? "/admin/clubes" : `${pathname}${search}`
  );
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
