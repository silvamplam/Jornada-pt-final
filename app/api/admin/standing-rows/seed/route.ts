import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { seedStandingRowsFromSeason } from "@/lib/standing-seeding";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig } from "@/lib/supabase";

type StandingSeedRecord = {
  id: string;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  moment_label: string | null;
};

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

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/classificacoes?error=missing-service");
  }

  const formData = await request.formData();
  const standingId = cleanText(formData.get("standing_id"));

  if (!standingId) {
    return redirectTo(request, "/admin/classificacoes?error=missing-fields");
  }

  try {
    const standings = await fetchSupabaseAdminTable<StandingSeedRecord>(
      `standings?select=id,competition_id,season_id,matchday_id,moment_label&id=eq.${encodeURIComponent(standingId)}&limit=1`
    );
    const standing = standings[0];

    if (!standing) {
      return redirectTo(request, "/admin/classificacoes?error=missing-fields");
    }

    const result = await seedStandingRowsFromSeason({
      standingId: standing.id,
      competitionId: standing.competition_id,
      seasonId: standing.season_id,
      matchdayId: standing.matchday_id,
      momentLabel: standing.moment_label,
      syncMetadataAvailable: cleanText(formData.get("sync_metadata_available")) === "1"
    });

    return redirectTo(request, `/admin/classificacoes?rowsSeeded=${result.created}&rowsUpdated=${result.updated}`);
  } catch {
    return redirectTo(request, "/admin/classificacoes?error=seed-rows");
  }
}
