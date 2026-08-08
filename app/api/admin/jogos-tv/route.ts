import { adminRelativeRedirect, adminRelativeUrl } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function redirectTo(_request: Request, formData: FormData, params: Record<string, string>) {
  const fallback = adminRelativeUrl("/admin/jogos-tv");
  const target = cleanText(formData.get("return_to"));
  const url = target ? adminRelativeUrl(target) : fallback;

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return adminRelativeRedirect(url);
}

export async function POST(request: Request) {
  const formData = await request.formData();

  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, formData, { error: "missing-service" });
  }

  const matchId = cleanText(formData.get("match_id"));
  const channelId = cleanText(formData.get("broadcast_channel_id"));

  if (!matchId) {
    return redirectTo(request, formData, { error: "missing-match" });
  }

  try {
    await writeSupabaseAdmin(`matches?id=eq.${encodeURIComponent(matchId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        broadcast_channel_id: channelId
      })
    });
  } catch {
    return redirectTo(request, formData, { error: "save" });
  }

  return redirectTo(request, formData, { saved: "1" });
}
