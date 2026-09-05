import { writeSupabaseAdminReturning } from "@/lib/supabase";

type AtomicContentSnapshotSyncRow = Readonly<{
  affected_matchday_ids: string[] | null;
}>;

export async function syncEditorialContentSnapshots({
  contentId,
  previousSlug,
}: {
  contentId: string;
  previousSlug?: string | null;
}) {
  const rows = await writeSupabaseAdminReturning<AtomicContentSnapshotSyncRow>(
    "rpc/sync_editorial_content_live_snapshots_v15",
    {
      method: "POST",
      body: JSON.stringify({
        p_content_id: contentId,
        p_previous_slug: previousSlug ?? null,
      }),
    },
  );

  return rows[0]?.affected_matchday_ids ?? [];
}
