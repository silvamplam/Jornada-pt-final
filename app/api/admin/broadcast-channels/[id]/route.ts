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

type UpdateBroadcastChannelContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: UpdateBroadcastChannelContext) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/canais-tv?error=missing-service");
  }

  const { id } = await context.params;
  const formData = await request.formData();
  const name = cleanText(formData.get("name"));

  if (!id || !name) {
    return redirectTo(request, "/admin/canais-tv?error=missing-fields");
  }

  try {
    await writeSupabaseAdmin(`broadcast_channels?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        platform: cleanText(formData.get("platform")),
        country: cleanText(formData.get("country")),
        logo_url: cleanText(formData.get("logo_url"))
      })
    });
  } catch {
    return redirectTo(request, "/admin/canais-tv?error=save");
  }

  return redirectTo(request, "/admin/canais-tv?updated=1");
}
