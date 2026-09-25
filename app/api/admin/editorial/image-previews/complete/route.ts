import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import { getSupabaseServiceConfig } from "@/lib/supabase";
import { verifyEditorialPreviewTicket } from "@/lib/editorial-image-preview-ticket.server";
import { createEditorialPreviewStorage } from "@/lib/editorial-image-preview-storage.server";
import { ensureEditorialImagePreviews } from "@/lib/editorial-image-preview-generation.server";
import { PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "@/lib/editorial-image-preview";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!await verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (Number(request.headers.get("content-length")) > 2048) return NextResponse.json({ ok: false }, { status: 413 });
  const payload = await request.json().catch(() => null);
  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ ok: false }, { status: 503 });
  if (!payload || !verifyEditorialPreviewTicket(payload.path, payload.ticket, config.serviceRoleKey)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const result = await ensureEditorialImagePreviews(payload.path, createEditorialPreviewStorage(config), undefined, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.warn("[editorial-preview] completion unavailable", { path: payload.path });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
