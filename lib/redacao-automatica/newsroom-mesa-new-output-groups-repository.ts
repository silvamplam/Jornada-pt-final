import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  parseMesaNewOutputGrouping,
  type MesaNewOutputGrouping,
} from "./newsroom-mesa-new-output-groups";

type GroupingRow = Readonly<{
  dossier_id: string;
  production_context_id: string;
  target_count: number | null;
  loose_source_ids: readonly string[];
  revision: number;
  state: string;
  existing_outputs: unknown;
}>;

type GroupRow = Readonly<{
  id: string;
  dossier_id: string;
  production_context_id: string;
  seed_kind: string;
  seed_theme_id: string | null;
  position: number;
  article_plan_id: string | null;
  state: string;
}>;

type ThemeRow = Readonly<{
  dossier_id: string;
  theme_id: string;
  title_snapshot: string;
  position: number;
  target_count: number | null;
  seed_source_ids: readonly string[];
}>;

type GroupSourceRow = Readonly<{
  group_id: string;
  dossier_source_id: string;
  sort_order: number;
}>;

type DossierSourceRow = Readonly<{
  id: string;
  newsroom_article_id: string;
  title_snapshot: string | null;
}>;

type DossierImageRow = Readonly<{
  id: string;
  newsroom_article_id: string | null;
  frozen_url: string;
}>;

export async function readMesaNewOutputGrouping(
  dossierId: string,
): Promise<MesaNewOutputGrouping | null> {
  const encoded = encodeURIComponent(dossierId);
  const headers = await fetchSupabaseAdminTable<GroupingRow>(
    "newsroom_mesa_new_output_groupings"
    + "?select=dossier_id,production_context_id,target_count,loose_source_ids,revision,state,existing_outputs"
    + `&dossier_id=eq.${encoded}&limit=1`,
  ).catch(() => []);
  const header = headers[0];
  if (!header) return null;
  const [groups, themes, memberships, sources, images] = await Promise.all([
    fetchSupabaseAdminTable<GroupRow>(
      "newsroom_mesa_new_output_groups"
      + "?select=id,dossier_id,production_context_id,seed_kind,seed_theme_id,position,article_plan_id,state"
      + `&dossier_id=eq.${encoded}&order=position.asc,id.asc`,
    ),
    fetchSupabaseAdminTable<ThemeRow>(
      "newsroom_mesa_new_output_theme_targets"
      + "?select=dossier_id,theme_id,title_snapshot,position,target_count,seed_source_ids"
      + `&dossier_id=eq.${encoded}&order=position.asc,theme_id.asc`,
    ),
    fetchSupabaseAdminTable<GroupSourceRow>(
      "newsroom_mesa_new_output_group_sources"
      + "?select=group_id,dossier_source_id,sort_order"
      + `&dossier_id=eq.${encoded}&order=sort_order.asc,dossier_source_id.asc`,
    ),
    fetchSupabaseAdminTable<DossierSourceRow>(
      "newsroom_editorial_dossier_sources"
      + "?select=id,newsroom_article_id,title_snapshot"
      + `&dossier_id=eq.${encoded}&included=eq.true&order=sort_order.asc,id.asc`,
    ),
    fetchSupabaseAdminTable<DossierImageRow>(
      "newsroom_editorial_dossier_images"
      + "?select=id,newsroom_article_id,frozen_url"
      + `&dossier_id=eq.${encoded}&origin_kind=eq.newsroom&order=created_at.asc,id.asc`,
    ),
  ]);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const imageByArticleId = new Map(images.flatMap((image) => (
    image.newsroom_article_id && !images.some((candidate) => candidate !== image
      && candidate.newsroom_article_id === image.newsroom_article_id
      && candidate.id.localeCompare(image.id) < 0)
      ? [[image.newsroom_article_id, image] as const]
      : []
  )));
  const parsed = parseMesaNewOutputGrouping({
    version: 2,
    dossierId: header.dossier_id,
    productionContextId: header.production_context_id,
    targetCount: header.target_count,
    revision: header.revision,
    state: header.state,
    sources: sources.map((source) => {
      const image = imageByArticleId.get(source.newsroom_article_id) ?? null;
      return {
        dossierSourceId: source.id,
        newsroomArticleId: source.newsroom_article_id,
        title: source.title_snapshot?.trim() || "Fonte selecionada",
        sourceLabel: "Fonte",
        imageId: image?.id ?? null,
        imageUrl: image?.frozen_url ?? null,
      };
    }),
    looseSourceIds: Array.isArray(header.loose_source_ids) ? header.loose_source_ids : [],
    themes: themes.map((theme) => ({
      themeId: theme.theme_id,
      title: theme.title_snapshot,
      position: theme.position,
      targetCount: theme.target_count,
      seedSourceIds: Array.isArray(theme.seed_source_ids) ? theme.seed_source_ids : [],
    })),
    groups: groups.map((group) => ({
      groupId: group.id,
      productionContextId: group.production_context_id,
      seedKind: group.seed_kind,
      seedThemeId: group.seed_theme_id,
      seedSourceIds: memberships.filter((membership) => membership.group_id === group.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap((membership) => {
          const source = sourceById.get(membership.dossier_source_id);
          return source ? [source.newsroom_article_id] : [];
        }),
      position: group.position,
      outputId: group.article_plan_id,
      articlePlanId: group.article_plan_id,
      state: group.state,
    })),
    existingOutputs: Array.isArray(header.existing_outputs) ? header.existing_outputs : [],
  });
  if (!parsed || parsed.dossierId !== dossierId) throw new Error("mesa-new-output-grouping-invalid");
  return parsed;
}
