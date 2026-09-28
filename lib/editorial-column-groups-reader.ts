import { fetchSupabaseAdminTable } from "@/lib/supabase";
import { parseEditorialColumnGroups, type EditorialColumnGroup } from "@/lib/editorial-column-groups";

/** Missing-table fallback is only for the deploy-before-migration visual gate. */
export async function readHistoricalColumnGroups(compositionId: string): Promise<readonly EditorialColumnGroup[]> {
  type Row = { id: string; public_title: string; is_enabled: boolean;
    members: { zone_id: string; member_position: number }[] };
  let rows: Row[];
  try {
    rows = await fetchSupabaseAdminTable<Row>(`matchday_historical_column_groups?select=id,public_title,is_enabled,members:matchday_historical_column_group_members(zone_id,member_position)&composition_id=eq.${encodeURIComponent(compositionId)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("PGRST205") && message.includes("matchday_historical_column_groups")) return [];
    throw error;
  }
  return parseEditorialColumnGroups(rows.map((row) => ({ id: row.id, publicTitle: row.public_title,
    enabled: row.is_enabled, zoneIds: [...row.members].sort((a, b) => a.member_position - b.member_position).map((member) => member.zone_id) })));
}
