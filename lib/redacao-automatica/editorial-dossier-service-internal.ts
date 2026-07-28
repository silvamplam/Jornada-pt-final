import type { ArticleBodyBlock, ArticleProcessingStatus } from "@/lib/redacao-automatica/types";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
  EditorialDossierOutputMode,
  EditorialDossierSourceRole,
} from "@/lib/redacao-automatica/editorial-dossier-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCES = 20;
const MAX_TITLE_LENGTH = 180;
const MAX_EDITORIAL_INSTRUCTIONS_LENGTH = 12000;
const MAX_CONTEXT_INSTRUCTIONS_LENGTH = 8000;

const allowedSourceStatuses = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "ready_for_review",
]);

export type EditorialDossierSourceSelection = Readonly<{
  newsroomArticleId: string;
  priority: number;
  sourceRole: EditorialDossierSourceRole;
}>;

export type EditorialDossierSourceCandidate = Readonly<{
  id: string;
  title: string;
  processingStatus: ArticleProcessingStatus;
  snapshot: Readonly<{
    id: string;
    body: readonly ArticleBodyBlock[];
  }> | null;
}>;

export type CreateEditorialDossierInput = Readonly<{
  title: string;
  editorialInstructions: string;
  contextInstructions: string;
  sources: readonly EditorialDossierSourceSelection[];
}>;

export type UpdateEditorialDossierInput = Readonly<{
  dossierId: string;
  title: string;
  editorialInstructions: string;
  contextInstructions: string;
  outputMode: EditorialDossierOutputMode;
  outputCount: number;
  lengthMode: EditorialDossierLengthMode;
  articleKind: EditorialDossierArticleKind;
}>;

export type EditorialDossierInsert = Readonly<{
  id: string;
  title: string;
  status: "draft";
  editorial_instructions: string;
  context_instructions: string;
  output_mode: "single";
  output_count: 1;
  length_mode: "standard";
  article_kind: "news";
  output_language: "pt-PT";
}>;

export type EditorialDossierSourceInsert = Readonly<{
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  source_role: EditorialDossierSourceRole;
  sort_order: number;
  editorial_note: null;
  included: true;
}>;

export type EditorialDossierUpdate = Readonly<{
  title: string;
  editorial_instructions: string;
  context_instructions: string;
  output_mode: EditorialDossierOutputMode;
  output_count: number;
  length_mode: EditorialDossierLengthMode;
  article_kind: EditorialDossierArticleKind;
  output_language: "pt-PT";
}>;

export type EditorialDossierWrite = Readonly<{
  id: string;
  title: string;
}>;

export interface EditorialDossierTransport {
  isConfigured(): boolean;
  randomUuid(): string;
  readSourceCandidates(articleIds: readonly string[]): Promise<readonly EditorialDossierSourceCandidate[]>;
  insertDossier(payload: EditorialDossierInsert): Promise<EditorialDossierWrite | null>;
  insertSources(payload: readonly EditorialDossierSourceInsert[]): Promise<number>;
  deleteDossier(dossierId: string): Promise<void>;
  updateDossier(
    dossierId: string,
    payload: EditorialDossierUpdate,
  ): Promise<EditorialDossierWrite | null>;
}

export type EditorialDossierErrorCode =
  | "input_invalid"
  | "service_unavailable"
  | "source_not_found"
  | "source_not_eligible"
  | "source_snapshot_missing"
  | "dossier_creation_failed"
  | "dossier_not_found"
  | "dossier_update_failed";

export type EditorialDossierCreateResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        dossier: EditorialDossierWrite;
        sourceCount: number;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialDossierErrorCode;
        message: string;
      }>;
    }>;

export type EditorialDossierUpdateResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        dossier: EditorialDossierWrite;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialDossierErrorCode;
        message: string;
      }>;
    }>;

function createFailure(
  code: EditorialDossierErrorCode,
  message: string,
): EditorialDossierCreateResult {
  return { ok: false, error: { code, message } };
}

function updateFailure(
  code: EditorialDossierErrorCode,
  message: string,
): EditorialDossierUpdateResult {
  return { ok: false, error: { code, message } };
}

function cleanText(value: string): string {
  return value.trim();
}

function validTitle(value: string): boolean {
  return value.length > 0 && value.length <= MAX_TITLE_LENGTH;
}

function validInstructions(
  editorialInstructions: string,
  contextInstructions: string,
): boolean {
  return editorialInstructions.length <= MAX_EDITORIAL_INSTRUCTIONS_LENGTH
    && contextInstructions.length <= MAX_CONTEXT_INSTRUCTIONS_LENGTH;
}

function normalizedUuid(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function hasUsableBody(body: readonly ArticleBodyBlock[]): boolean {
  return body.some((block) => block.text.trim().length > 0);
}

function validRole(value: EditorialDossierSourceRole): boolean {
  return ["primary", "corroboration", "context", "complementary"].includes(value);
}

function normalizedSelections(
  sources: readonly EditorialDossierSourceSelection[],
): readonly EditorialDossierSourceSelection[] | null {
  const unique = new Map<string, EditorialDossierSourceSelection>();

  for (const source of sources) {
    const articleId = normalizedUuid(source.newsroomArticleId);
    if (!articleId || !Number.isFinite(source.priority) || source.priority < 0 || !validRole(source.sourceRole)) {
      return null;
    }

    if (!unique.has(articleId)) {
      unique.set(articleId, {
        newsroomArticleId: articleId,
        priority: source.priority,
        sourceRole: source.sourceRole,
      });
    }
  }

  if (unique.size < 1 || unique.size > MAX_SOURCES) {
    return null;
  }

  return [...unique.values()]
    .map((source, index) => ({ ...source, inputIndex: index }))
    .sort((left, right) => left.priority - right.priority || left.inputIndex - right.inputIndex)
    .map(({ inputIndex: _inputIndex, ...source }) => source);
}

function normalizedOutputCount(
  outputMode: EditorialDossierOutputMode,
  outputCount: number,
): number | null {
  if (!Number.isInteger(outputCount)) {
    return null;
  }

  if (outputMode === "single") {
    return outputCount === 1 ? 1 : null;
  }

  return outputCount >= 2 && outputCount <= 5 ? outputCount : null;
}

function validOutputMode(value: EditorialDossierOutputMode): boolean {
  return value === "single" || value === "multiple";
}

function validLengthMode(value: EditorialDossierLengthMode): boolean {
  return ["brief", "standard", "developed"].includes(value);
}

function validArticleKind(value: EditorialDossierArticleKind): boolean {
  return ["news", "analysis", "preview", "summary"].includes(value);
}

export function createEditorialDossierService(transport: EditorialDossierTransport) {
  return async function createEditorialDossier(
    input: CreateEditorialDossierInput,
  ): Promise<EditorialDossierCreateResult> {
    const title = cleanText(input.title);
    const editorialInstructions = cleanText(input.editorialInstructions);
    const contextInstructions = cleanText(input.contextInstructions);
    const selections = normalizedSelections(input.sources);

    if (!validTitle(title) || !validInstructions(editorialInstructions, contextInstructions) || !selections) {
      return createFailure("input_invalid", "Os dados do Dossiê não são válidos.");
    }

    if (!transport.isConfigured()) {
      return createFailure("service_unavailable", "O serviço dos Dossiês não está configurado.");
    }

    let candidates: readonly EditorialDossierSourceCandidate[];
    try {
      candidates = await transport.readSourceCandidates(
        selections.map((selection) => selection.newsroomArticleId),
      );
    } catch {
      return createFailure("dossier_creation_failed", "Não foi possível validar as fontes selecionadas.");
    }

    const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const orderedCandidates: Array<{
      selection: EditorialDossierSourceSelection;
      candidate: EditorialDossierSourceCandidate;
    }> = [];

    for (const selection of selections) {
      const candidate = candidatesById.get(selection.newsroomArticleId);
      if (!candidate) {
        return createFailure("source_not_found", "Uma das fontes selecionadas já não existe.");
      }

      if (!allowedSourceStatuses.has(candidate.processingStatus)) {
        return createFailure("source_not_eligible", "Uma das fontes selecionadas não está disponível para o Dossiê.");
      }

      if (!candidate.snapshot || !hasUsableBody(candidate.snapshot.body)) {
        return createFailure("source_snapshot_missing", "Uma das fontes não tem um snapshot normalizado utilizável.");
      }

      orderedCandidates.push({ selection, candidate });
    }

    const dossierId = transport.randomUuid();
    const hasPrimary = orderedCandidates.some(({ selection }) => selection.sourceRole === "primary");
    const dossierPayload: EditorialDossierInsert = {
      id: dossierId,
      title,
      status: "draft",
      editorial_instructions: editorialInstructions,
      context_instructions: contextInstructions,
      output_mode: "single",
      output_count: 1,
      length_mode: "standard",
      article_kind: "news",
      output_language: "pt-PT",
    };
    const sourcePayload = orderedCandidates.map(({ selection, candidate }, index): EditorialDossierSourceInsert => ({
      id: transport.randomUuid(),
      dossier_id: dossierId,
      newsroom_article_id: candidate.id,
      newsroom_snapshot_id: candidate.snapshot!.id,
      source_role: !hasPrimary && index === 0 ? "primary" : selection.sourceRole,
      sort_order: (index + 1) * 10,
      editorial_note: null,
      included: true,
    }));

    let createdDossier: EditorialDossierWrite | null;
    try {
      createdDossier = await transport.insertDossier(dossierPayload);
    } catch {
      return createFailure("dossier_creation_failed", "Não foi possível criar o Dossiê.");
    }

    if (!createdDossier || createdDossier.id !== dossierId) {
      return createFailure("dossier_creation_failed", "O serviço não devolveu um Dossiê válido.");
    }

    try {
      const insertedSourceCount = await transport.insertSources(sourcePayload);
      if (insertedSourceCount !== sourcePayload.length) {
        throw new Error("source_count_mismatch");
      }
    } catch {
      try {
        await transport.deleteDossier(dossierId);
      } catch {
        // A resposta controlada não expõe detalhes internos da compensação.
      }

      return createFailure("dossier_creation_failed", "Não foi possível guardar todas as fontes do Dossiê.");
    }

    return {
      ok: true,
      value: {
        dossier: createdDossier,
        sourceCount: sourcePayload.length,
      },
    };
  };
}

export function updateEditorialDossierService(transport: EditorialDossierTransport) {
  return async function updateEditorialDossier(
    input: UpdateEditorialDossierInput,
  ): Promise<EditorialDossierUpdateResult> {
    const dossierId = normalizedUuid(input.dossierId);
    const title = cleanText(input.title);
    const editorialInstructions = cleanText(input.editorialInstructions);
    const contextInstructions = cleanText(input.contextInstructions);
    const outputCount = validOutputMode(input.outputMode)
      ? normalizedOutputCount(input.outputMode, input.outputCount)
      : null;

    if (
      !dossierId
      || !validTitle(title)
      || !validInstructions(editorialInstructions, contextInstructions)
      || outputCount === null
      || !validLengthMode(input.lengthMode)
      || !validArticleKind(input.articleKind)
    ) {
      return updateFailure("input_invalid", "Os dados do Dossiê não são válidos.");
    }

    if (!transport.isConfigured()) {
      return updateFailure("service_unavailable", "O serviço dos Dossiês não está configurado.");
    }

    const payload: EditorialDossierUpdate = {
      title,
      editorial_instructions: editorialInstructions,
      context_instructions: contextInstructions,
      output_mode: input.outputMode,
      output_count: outputCount,
      length_mode: input.lengthMode,
      article_kind: input.articleKind,
      output_language: "pt-PT",
    };

    try {
      const updated = await transport.updateDossier(dossierId, payload);
      if (!updated) {
        return updateFailure("dossier_not_found", "O Dossiê já não existe.");
      }

      if (updated.id !== dossierId) {
        return updateFailure("dossier_update_failed", "O serviço não devolveu o Dossiê esperado.");
      }

      return {
        ok: true,
        value: { dossier: updated },
      };
    } catch {
      return updateFailure("dossier_update_failed", "Não foi possível guardar o Dossiê.");
    }
  };
}
