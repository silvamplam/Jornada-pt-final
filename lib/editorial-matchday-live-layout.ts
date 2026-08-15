import type { LiveMatchdayHierarchicalTransferSlotType } from "@/lib/editorial-hierarchical-composition";

export type MatchdayLiveLayoutItem = {
  id: string;
  matchday_id: string;
  slot_type: LiveMatchdayHierarchicalTransferSlotType;
  article_id: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};
