import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  addEditorialDossierSourcesService,
  createEditorialDossierService,
  manageEditorialDossierSourcesService,
  updateEditorialDossierService,
  type AddEditorialDossierSourcesInput,
  type CreateEditorialDossierInput,
  type EditorialDossierInsert,
  type EditorialDossierSourceInsert,
  type EditorialDossierSourceState,
  type EditorialDossierSourceUpsert,
  type EditorialDossierUpdate,
  type EditorialDossierWrite,
  type ManageEditorialDossierSourcesInput,
  type UpdateEditorialDossierInput,
} from "@/lib/redacao-automatica/editorial-dossier-service-internal";
import type { EditorialDossierSourceRole } from "@/lib/redacao-automatica/editorial-dossier-repository";
import { getNewsroomDossierSourceCandidates } from "@/lib/redacao-automatica/newsroom-article-repository";

export type {
  AddEditorialDossierSourcesInput,
  CreateEditorialDossierInput,
  EditorialDossierCreateResult,
  EditorialDossierErrorCode,
  EditorialDossierSourceAddition,
  EditorialDossierSourceEdit,
  EditorialDossierSourceSelection,
  EditorialDossierSourcesResult,
  EditorialDossierUpdateResult,
  ManageEditorialDossierSourcesInput,
  UpdateEditorialDossierInput,
} from "@/lib/redacao-automatica/editorial-dossier-service-internal";

type DossierWriteRow = {
  id: string;
  title: string;
};

type DossierSourceWriteRow = {
  id: string;
};

type DossierExistsRow = {
  id: string;
};

type DossierSourceStateRow = {
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  source_role: string;
  sort_order: number;
  editorial_note: string | null;
  included: boolean;
};

function dossierWrite(row: DossierWriteRow | undefined): EditorialDossierWrite | null {
  if (!row?.id || !row.title) {
    return null;
  }

  return { id: row.id, title: row.title };
}


function sourceRole(value: string): EditorialDossierSourceRole {
  return ["primary", "corroboration", "context", "complementary"].includes(value)
    ? value as EditorialDossierSourceRole
    : "complementary";
}

function dossierSourceState(row: DossierSourceStateRow): EditorialDossierSourceState {
  return {
    id: row.id,
    dossierId: row.dossier_id,
    newsroomArticleId: row.newsroom_article_id,
    newsroomSnapshotId: row.newsroom_snapshot_id,
    sourceRole: sourceRole(row.source_role),
    sortOrder: row.sort_order,
    editorialNote: row.editorial_note,
    included: row.included,
  };
}

const transport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  randomUuid() {
    return crypto.randomUUID();
  },

  async readSourceCandidates(articleIds: readonly string[]) {
    const result = await getNewsroomDossierSourceCandidates(articleIds);
    if (!result.ok) {
      throw new Error(result.error.code);
    }

    return result.value;
  },


  async readDossierSources(dossierId: string): Promise<readonly EditorialDossierSourceState[] | null> {
    const dossiers = await fetchSupabaseAdminTable<DossierExistsRow>(
      "newsroom_editorial_dossiers?select=id"
      + `&id=eq.${encodeURIComponent(dossierId)}&limit=1`,
    );

    if (!dossiers[0]) {
      return null;
    }

    const rows = await fetchSupabaseAdminTable<DossierSourceStateRow>(
      "newsroom_editorial_dossier_sources?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,source_role,sort_order,editorial_note,included"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=sort_order.asc,id.asc&limit=100",
    );

    return rows.map(dossierSourceState);
  },

  async insertDossier(payload: EditorialDossierInsert): Promise<EditorialDossierWrite | null> {
    const rows = await writeSupabaseAdminReturning<DossierWriteRow>(
      "newsroom_editorial_dossiers?select=id,title",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    return dossierWrite(rows[0]);
  },

  async insertSources(payload: readonly EditorialDossierSourceInsert[]): Promise<number> {
    const rows = await writeSupabaseAdminReturning<DossierSourceWriteRow>(
      "newsroom_editorial_dossier_sources?select=id",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    return rows.length;
  },


  async upsertSources(payload: readonly EditorialDossierSourceUpsert[]): Promise<number> {
    const rows = await writeSupabaseAdminReturning<DossierSourceWriteRow>(
      "newsroom_editorial_dossier_sources?on_conflict=id&select=id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(payload),
      },
    );

    return rows.length;
  },

  async touchDossier(dossierId: string): Promise<void> {
    await writeSupabaseAdmin(
      `newsroom_editorial_dossiers?id=eq.${encodeURIComponent(dossierId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      },
    );
  },

  async deleteDossier(dossierId: string): Promise<void> {
    await writeSupabaseAdmin(
      `newsroom_editorial_dossiers?id=eq.${encodeURIComponent(dossierId)}`,
      { method: "DELETE" },
    );
  },

  async updateDossier(
    dossierId: string,
    payload: EditorialDossierUpdate,
  ): Promise<EditorialDossierWrite | null> {
    const rows = await writeSupabaseAdminReturning<DossierWriteRow>(
      "newsroom_editorial_dossiers?select=id,title"
      + `&id=eq.${encodeURIComponent(dossierId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );

    return dossierWrite(rows[0]);
  },
};

const createDossier = createEditorialDossierService(transport);
const updateDossier = updateEditorialDossierService(transport);
const manageSources = manageEditorialDossierSourcesService(transport);
const addSources = addEditorialDossierSourcesService(transport);

export function createEditorialDossier(input: CreateEditorialDossierInput) {
  return createDossier(input);
}

export function updateEditorialDossier(input: UpdateEditorialDossierInput) {
  return updateDossier(input);
}

export function manageEditorialDossierSources(input: ManageEditorialDossierSourcesInput) {
  return manageSources(input);
}

export function addEditorialDossierSources(input: AddEditorialDossierSourcesInput) {
  return addSources(input);
}
