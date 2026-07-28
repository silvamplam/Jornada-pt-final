import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

function redirectToLogin() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/admin/login?loggedOut=1"
    }
  });

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/"
  });

  return response;
}

export async function GET() {
  return redirectToLogin();
}

export async function POST() {
  return redirectToLogin();
}
