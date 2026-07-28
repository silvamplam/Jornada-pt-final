import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createEditorialDossierService,
  updateEditorialDossierService,
  type CreateEditorialDossierInput,
  type EditorialDossierInsert,
  type EditorialDossierSourceInsert,
  type EditorialDossierUpdate,
  type EditorialDossierWrite,
  type UpdateEditorialDossierInput,
} from "@/lib/redacao-automatica/editorial-dossier-service-internal";
import { getNewsroomDossierSourceCandidates } from "@/lib/redacao-automatica/newsroom-article-repository";

export type {
  CreateEditorialDossierInput,
  EditorialDossierCreateResult,
  EditorialDossierErrorCode,
  EditorialDossierSourceSelection,
  EditorialDossierUpdateResult,
  UpdateEditorialDossierInput,
} from "@/lib/redacao-automatica/editorial-dossier-service-internal";

type DossierWriteRow = {
  id: string;
  title: string;
};

type DossierSourceWriteRow = {
  id: string;
};

function dossierWrite(row: DossierWriteRow | undefined): EditorialDossierWrite | null {
  if (!row?.id || !row.title) {
    return null;
  }

  return { id: row.id, title: row.title };
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

export function createEditorialDossier(input: CreateEditorialDossierInput) {
  return createDossier(input);
}

export function updateEditorialDossier(input: UpdateEditorialDossierInput) {
  return updateDossier(input);
}
