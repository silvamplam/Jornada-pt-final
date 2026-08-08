const INTERNAL_ADMIN_REDIRECT_BASE_URL = "https://jornada.local";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function adminRelativeUrl(path: string) {
  const url = new URL(path, INTERNAL_ADMIN_REDIRECT_BASE_URL);

  if (url.origin !== INTERNAL_ADMIN_REDIRECT_BASE_URL || !isAdminPath(url.pathname)) {
    throw new Error("invalid-admin-redirect");
  }

  return url;
}

export function adminRelativeLocation(path: string | URL) {
  const url = typeof path === "string" ? adminRelativeUrl(path) : path;

  if (url.origin !== INTERNAL_ADMIN_REDIRECT_BASE_URL || !isAdminPath(url.pathname)) {
    throw new Error("invalid-admin-redirect");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function adminRelativeRedirect(path: string | URL, status = 303) {
  return new Response(null, {
    status,
    headers: {
      Location: adminRelativeLocation(path)
    }
  });
}
