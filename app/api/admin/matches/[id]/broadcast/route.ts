import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

type UpdateMatchBroadcastContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateMatchBroadcastContext) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/jogos-tv?error=missing-service");
  }

  const { id } = await context.params;
  const formData = await request.formData();

  if (!id) {
    return redirectTo(request, "/admin/jogos-tv?error=save");
  }

  try {
    await writeSupabaseAdmin(`matches?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        broadcast_channel_id: cleanText(formData.get("broadcast_channel_id"))
      })
    });
  } catch {
    return redirectTo(request, "/admin/jogos-tv?error=save");
  }

  return redirectTo(request, "/admin/jogos-tv?updated=1");
}
