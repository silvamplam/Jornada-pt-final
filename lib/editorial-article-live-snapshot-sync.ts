import type { EditorialArticleZoneSource } from "@/lib/editorial-zone-presentation";
import { writeSupabaseAdminReturning } from "@/lib/supabase";

export type EditorialArticleLiveSnapshot = EditorialArticleZoneSource & {
  author: string | null;
};

export type EditorialArticleLiveSnapshotSyncInput = Readonly<{
  previousSlug?: string | null;
  article: EditorialArticleLiveSnapshot;
}>;

export type EditorialArticleLiveSnapshotSyncResult = Readonly<{
  affectedMatchdayIds: readonly string[];
  updatedLiveLayoutItemIds: readonly string[];
  updatedCarryoverMatchdayIds: readonly string[];
}>;

type AtomicSnapshotSyncRow = Readonly<{
  affected_matchday_ids: string[] | null;
  updated_live_layout_item_ids: string[] | null;
  updated_carryover_matchday_ids: string[] | null;
}>;

export async function syncEditorialArticleLiveSnapshots(
  input: EditorialArticleLiveSnapshotSyncInput,
) {
  const rows = await writeSupabaseAdminReturning<AtomicSnapshotSyncRow>(
    "rpc/sync_editorial_article_live_snapshots_v15",
    {
      method: "POST",
      body: JSON.stringify({
        p_article_id: input.article.id,
        p_previous_slug: input.previousSlug ?? null,
      }),
    },
  );
  const result = rows[0];

  if (!result) {
    throw new Error("editorial-article-live-snapshot-v15-result-missing");
  }

  return {
    affectedMatchdayIds: result.affected_matchday_ids ?? [],
    updatedLiveLayoutItemIds: result.updated_live_layout_item_ids ?? [],
    updatedCarryoverMatchdayIds: result.updated_carryover_matchday_ids ?? [],
  } satisfies EditorialArticleLiveSnapshotSyncResult;
}
