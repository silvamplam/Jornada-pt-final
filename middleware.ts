import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import { isBlockedCrawlerUserAgent } from "@/lib/crawler-egress-policy";

function redirectToAdminLogin(request: NextRequest, nextPath: string) {
  const url = request.nextUrl.clone();

  url.pathname = "/admin/login";
  url.search = "";
  url.searchParams.set("next", nextPath);

  return NextResponse.redirect(url, { status: 303 });
}

function blockCrawler() {
  return new NextResponse("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function middleware(request: NextRequest) {
  if (isBlockedCrawlerUserAgent(request.headers.get("user-agent"))) {
    return blockCrawler();
  }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"]
};
