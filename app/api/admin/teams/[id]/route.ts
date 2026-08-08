import { NextResponse } from "next/server";
import { adminRelativeRedirect, adminRelativeUrl } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

const TEAM_ADMIN_MESSAGE_KEYS = [
  "created",
  "deleted",
  "updated",
  "public_name_updated",
  "public_name_cleared",
  "public_name_unchanged",
  "error"
] as const;

function safeReturnTo(_request: Request, value: string | null): URL {
  const fallback = adminRelativeUrl("/admin/clubes");
  if (!value) {
    fallback.hash = "clubes-existentes";
    return fallback;
  }

  try {
    const target = adminRelativeUrl(value);
    if (target.origin !== fallback.origin || target.pathname !== "/admin/clubes") {
      fallback.hash = "clubes-existentes";
      return fallback;
    }

    target.hash = "clubes-existentes";
    return target;
  } catch {
    fallback.hash = "clubes-existentes";
    return fallback;
  }
}

function redirectToManager(
  request: Request,
  returnTo: string | null,
  key: "deleted" | "updated" | "error",
  value: string
) {
  const target = safeReturnTo(request, returnTo);
  for (const messageKey of TEAM_ADMIN_MESSAGE_KEYS) {
    target.searchParams.delete(messageKey);
  }
  target.searchParams.set(key, value);
  return adminRelativeRedirect(target);
}

function safeDeletionRequiredResponse() {
  return NextResponse.json(
    {
      error: "safe_deletion_required",
      message: "A remoção segura é obrigatória."
    },
    { status: 409, headers: { "Cache-Control": "no-store" } }
  );
}

type UpdateTeamContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateTeamContext) {
  const { id } = await context.params;
  const formData = await request.formData();
  const actionType = cleanText(formData.get("action_type"));
  const returnTo = cleanText(formData.get("return_to"));

  if (actionType === "delete") {
    return safeDeletionRequiredResponse();
  }

  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/clubes?error=missing-service");
  }

  const name = cleanText(formData.get("name"));
  const shortName = cleanText(formData.get("short_name"))?.toUpperCase();
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);

  if (!id || !name || !shortName || !slug) {
    return redirectToManager(request, returnTo, "error", "missing-fields");
  }

  try {
    await writeSupabaseAdmin(`teams?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        short_name: shortName,
        slug,
        country: cleanText(formData.get("country")),
        logo_url: cleanText(formData.get("logo_url")),
        primary_color: cleanText(formData.get("primary_color"))
      })
    });
  } catch {
    return redirectToManager(request, returnTo, "error", "save");
  }

  return redirectToManager(request, returnTo, "updated", "1");
}

export async function DELETE() {
  return safeDeletionRequiredResponse();
}
