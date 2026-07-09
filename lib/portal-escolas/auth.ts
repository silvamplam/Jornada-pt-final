import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const PORTAL_ESCOLAS_LOGIN_PATH = "/portal-escolas/login";
export const PORTAL_ESCOLAS_CALLBACK_PATH = "/portal-escolas/auth/callback";
export const PORTAL_ESCOLAS_PANEL_PATH = "/portal-escolas/painel";

type PortalSupabaseConfig = {
  url: string;
  anonKey: string;
};

export type PortalSafeAuthError = {
  name: string | null;
  code: string | null;
  status: number | null;
  message: string;
  reason: string;
  isRateLimited: boolean;
};

export type PortalUserRow = {
  id: string;
  auth_user_id: string | null;
  portal_entity_id: string;
  display_name: string | null;
  invite_email: string | null;
  status: string;
};

export type PortalPermissionRow = {
  id: string;
  portal_entity_id: string;
  portal_context_id: string | null;
  portal_competition_id: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_submit_content: boolean;
  can_validate: boolean;
  status: string;
};

export type PortalAuthorization =
  | {
      allowed: true;
      portalUser: PortalUserRow;
      permissions: PortalPermissionRow[];
      message: string;
    }
  | {
      allowed: false;
      portalUser: PortalUserRow | null;
      permissions: PortalPermissionRow[];
      message: string;
    };

export function getPortalSupabaseConfig(): PortalSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function readStringProperty(error: unknown, property: string) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const value = (error as Record<string, unknown>)[property];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberProperty(error: unknown, property: string) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const value = (error as Record<string, unknown>)[property];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function cleanIdentifier(value: string | null) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);

  return cleaned || null;
}

export function sanitizePortalAuthErrorText(value: string | null | undefined) {
  const cleaned = (value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[token]")
    .replace(/([?&](?:access_token|refresh_token|token|apikey|anon_key|code|otp|confirmation_url|redirect_to)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/[a-zA-Z0-9_-]{48,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? cleaned.slice(0, 220) : "erro sem mensagem";
}

export function getSafePortalAuthError(error: unknown): PortalSafeAuthError {
  const name =
    cleanIdentifier(readStringProperty(error, "name")) ??
    cleanIdentifier(error instanceof Error ? error.constructor.name : null);
  const code = cleanIdentifier(readStringProperty(error, "code") ?? readStringProperty(error, "error_code"));
  const status =
    readNumberProperty(error, "status") ??
    readNumberProperty(error, "statusCode") ??
    readNumberProperty(error, "status_code");
  const message = sanitizePortalAuthErrorText(
    error instanceof Error ? error.message : readStringProperty(error, "message") ?? String(error)
  );
  const rateLimitText = `${name ?? ""} ${code ?? ""} ${message}`.toLowerCase();
  const isRateLimited =
    status === 429 ||
    rateLimitText.includes("rate") ||
    rateLimitText.includes("too many") ||
    rateLimitText.includes("only request") ||
    rateLimitText.includes("security purposes") ||
    rateLimitText.includes("wait");
  const meta = [
    name,
    status !== null ? `status ${status}` : null,
    code ? `code ${code}` : null
  ].filter(Boolean);
  const reason = sanitizePortalAuthErrorText(meta.length > 0 ? `${meta.join(", ")}: ${message}` : message);

  return {
    name,
    code,
    status,
    message,
    reason,
    isRateLimited
  };
}

export async function createPortalEscolasServerClient() {
  const config = getPortalSupabaseConfig();

  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always persist refreshed cookies.
        }
      }
    }
  });
}

export function createPortalEscolasRouteHandlerClient(request: NextRequest, response: NextResponse) {
  const config = getPortalSupabaseConfig();

  if (!config) {
    return null;
  }

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });
}

export async function readPortalAuthorization(
  supabase: SupabaseClient,
  authUserId: string
): Promise<PortalAuthorization> {
  const { data: portalUser, error: portalUserError } = await supabase
    .from("portal_users")
    .select("id,auth_user_id,portal_entity_id,display_name,invite_email,status")
    .eq("auth_user_id", authUserId)
    .maybeSingle<PortalUserRow>();

  if (portalUserError) {
    return {
      allowed: false,
      portalUser: null,
      permissions: [],
      message: "Nao foi possivel validar o utilizador do portal."
    };
  }

  if (!portalUser) {
    return {
      allowed: false,
      portalUser: null,
      permissions: [],
      message: "Este acesso ainda nao esta ativo para o Portal das Escolas."
    };
  }

  if (portalUser.status !== "active") {
    return {
      allowed: false,
      portalUser,
      permissions: [],
      message: "Este utilizador do Portal das Escolas nao esta ativo."
    };
  }

  const { data: permissions, error: permissionsError } = await supabase
    .from("portal_permissions")
    .select("id,portal_entity_id,portal_context_id,portal_competition_id,can_view,can_create,can_edit,can_submit_content,can_validate,status")
    .eq("portal_user_id", portalUser.id)
    .eq("status", "active")
    .eq("can_view", true)
    .returns<PortalPermissionRow[]>();

  if (permissionsError) {
    return {
      allowed: false,
      portalUser,
      permissions: [],
      message: "Nao foi possivel validar as permissoes do portal."
    };
  }

  if (!permissions || permissions.length === 0) {
    return {
      allowed: false,
      portalUser,
      permissions: [],
      message: "Este utilizador nao tem permissao ativa de leitura no Portal das Escolas."
    };
  }

  return {
    allowed: true,
    portalUser,
    permissions,
    message: "Acesso autorizado."
  };
}
