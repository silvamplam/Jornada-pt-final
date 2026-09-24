import { parseMesaProductionIntents, mesaProductionIntentSlots, type MesaProductionIntentsFrozen } from "./newsroom-mesa-production-intents-contract";
import {
  preflightEditorialArticleBatch,
  preflightEditorialMesaV2ArticleBatch,
  preflightEditorialThemeContinuityBatch,
  type EditorialBatchPreflight,
} from "./editorial-batch-parser";
import {
  parseThemeContinuityFrozenContract,
  type ThemeContinuityFrozenContract,
} from "./newsroom-theme-continuity-contract";
import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";

export const EDITORIAL_BATCH_TRANSFER_STORAGE_KEY =
  "jornada.editorial.batch-transfer.v1";

export const EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY =
  "jornada.editorial.batch-transfer.source-package.v1";

export type EditorialBatchTransferSourcePackage = Readonly<{
  year: string;
  month: string;
  packageId: string;
  dossierId?: string;
  matchdayId?: string;
  updateArticleCount?: number;
  outputImages?: readonly EditorialBatchTransferOutputImage[];
  dossierImages?: readonly EditorialBatchTransferDossierImage[];
  batchContract?: EditorialBatchTransferMesaV2Contract;
  themeContinuity?: ThemeContinuityFrozenContract;
  productionIntents?: MesaProductionIntentsFrozen;
  classificationsByOutputId?: Readonly<Record<string, ArticleClassificationKey>>;
  continuityResolution?: Readonly<{
    noChangeOutputIds: readonly string[];
    materializedOutputIds: readonly string[];
  }>;
}>;

export type EditorialBatchTransferMesaV2Contract = Readonly<{
  manifestVersion: 5;
  provenanceContract: "mesa-v2";
  workspaceContractVersion: 2;
  outputIds: readonly string[];
  sourceIds: readonly string[];
  sourceIdsByOutput?: Readonly<Record<string, readonly string[]>>;
}>;

export type EditorialBatchTransferOutputImage = Readonly<{
  position: number;
  outputId?: string;
  dossierImageId?: string;
  imageUrl: string;
  label: string;
}>;

export type EditorialBatchTransferDossierImage = Readonly<{
  id: string;
  imageUrl: string;
  label: string;
  newsroomArticleId?: string;
}>;

const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidList(value: unknown, maximum: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) return null;
  const ids = value.map((item) => typeof item === "string" ? item.trim().toLowerCase() : "");
  return ids.every((id) => UUID_PATTERN.test(id)) && new Set(ids).size === ids.length
    ? ids
    : null;
}

function mesaV2Contract(value: unknown): EditorialBatchTransferMesaV2Contract | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const outputIds = uuidList(candidate.outputIds, 30);
  const sourceIds = uuidList(candidate.sourceIds, 20);
  const rawSourceIdsByOutput = candidate.sourceIdsByOutput;
  let sourceIdsByOutput: Record<string, readonly string[]> | undefined;
  if (rawSourceIdsByOutput !== undefined) {
    if (!rawSourceIdsByOutput || typeof rawSourceIdsByOutput !== "object" || Array.isArray(rawSourceIdsByOutput)) return null;
    sourceIdsByOutput = {};
    for (const [outputId, values] of Object.entries(rawSourceIdsByOutput as Record<string, unknown>)) {
      const normalizedOutputId = outputId.trim().toLowerCase();
      const ids = uuidList(values, 20);
      if (!UUID_PATTERN.test(normalizedOutputId) || !ids) return null;
      sourceIdsByOutput[normalizedOutputId] = ids;
    }
  }
  return candidate.manifestVersion === 5
    && candidate.provenanceContract === "mesa-v2"
    && candidate.workspaceContractVersion === 2
    && outputIds
    && sourceIds
    && (!sourceIdsByOutput
      || Object.keys(sourceIdsByOutput).length === outputIds.length
        && outputIds.every((id) => sourceIdsByOutput?.[id]?.every((sourceId) => sourceIds.includes(sourceId))))
    ? {
        manifestVersion: 5,
        provenanceContract: "mesa-v2",
        workspaceContractVersion: 2,
        outputIds,
        sourceIds,
        ...(sourceIdsByOutput ? { sourceIdsByOutput } : {}),
      }
    : null;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseEditorialBatchTransferSourcePackage(
  value: string | null | undefined,
): EditorialBatchTransferSourcePackage | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<EditorialBatchTransferSourcePackage>;
    const year = typeof parsed.year === "string" ? parsed.year.trim() : "";
    const month = typeof parsed.month === "string" ? parsed.month.trim() : "";
    const packageId = typeof parsed.packageId === "string"
      ? parsed.packageId.trim().toLowerCase()
      : "";

    if (
      !YEAR_PATTERN.test(year)
      || !MONTH_PATTERN.test(month)
      || !UUID_PATTERN.test(packageId)
    ) {
      return null;
    }

    const matchdayId =
      parsed.matchdayId === undefined
        ? undefined
        : typeof parsed.matchdayId === "string"
          ? parsed.matchdayId.trim().toLowerCase()
          : "";
    const dossierId = parsed.dossierId === undefined
      ? undefined
      : typeof parsed.dossierId === "string"
        ? parsed.dossierId.trim().toLowerCase()
        : "";

    const updateArticleCount =
      parsed.updateArticleCount === undefined
        ? undefined
        : Number(parsed.updateArticleCount);
    const batchContract = parsed.batchContract === undefined
      ? undefined
      : mesaV2Contract(parsed.batchContract);
    const themeContinuity = parsed.themeContinuity === undefined
      ? undefined
      : parseThemeContinuityFrozenContract({ themeContinuity: parsed.themeContinuity });

    const productionIntents = parsed.productionIntents === undefined ? undefined
      : parseMesaProductionIntents(parsed.productionIntents);
    const intentSlots = productionIntents ? mesaProductionIntentSlots(productionIntents) : undefined;
    let classificationsByOutputId: Record<string, ArticleClassificationKey> | undefined;
    if (parsed.classificationsByOutputId !== undefined) {
      if (
        !parsed.classificationsByOutputId
        || typeof parsed.classificationsByOutputId !== "object"
        || Array.isArray(parsed.classificationsByOutputId)
      ) return null;
      classificationsByOutputId = {};
      for (const [outputId, key] of Object.entries(parsed.classificationsByOutputId)) {
        const normalizedOutputId = outputId.trim().toLowerCase();
        if (!UUID_PATTERN.test(normalizedOutputId) || !isArticleClassificationKey(key)) {
          return null;
        }
        classificationsByOutputId[normalizedOutputId] = key;
      }
    }

    if (
      (parsed.productionIntents !== undefined && !productionIntents)
      || (dossierId !== undefined && !UUID_PATTERN.test(dossierId))
      || (productionIntents && (!batchContract || themeContinuity
        || !batchContract.sourceIdsByOutput
        || intentSlots!.length !== batchContract.outputIds.length
        || intentSlots!.some((slot, index) => slot.outputId !== batchContract.outputIds[index])))
      || (matchdayId !== undefined && !UUID_PATTERN.test(matchdayId))
      || (parsed.batchContract !== undefined && !batchContract)
      || (parsed.themeContinuity !== undefined && !themeContinuity)
      || (
        classificationsByOutputId
        && (
          !batchContract
          || Object.keys(classificationsByOutputId).some(
            (id) => !batchContract.outputIds.includes(id),
          )
        )
      )
      || (themeContinuity && (
        !batchContract
        || themeContinuity.slots.length !== batchContract.outputIds.length
        || themeContinuity.slots.some((slot, index) => slot.outputId !== batchContract.outputIds[index])
      ))
      || (
        updateArticleCount !== undefined
        && (
          !Number.isInteger(updateArticleCount)
          || updateArticleCount < 1
          || updateArticleCount > 30
        )
      )
    ) {
      return null;
    }

    const base = {
      year,
      month,
      packageId,
      ...(dossierId ? { dossierId } : {}),
      ...(matchdayId ? { matchdayId } : {}),
      ...(updateArticleCount !== undefined
        ? { updateArticleCount }
        : {}),
      ...(batchContract ? { batchContract } : {}),
      ...(themeContinuity ? { themeContinuity } : {}),
      ...(productionIntents ? { productionIntents } : {}),
      ...(classificationsByOutputId ? { classificationsByOutputId } : {}),
    };

    const rawResolution = parsed.continuityResolution;
    const resolutionSlots = intentSlots ?? themeContinuity?.slots;
    let continuityResolution: EditorialBatchTransferSourcePackage["continuityResolution"];
    if (rawResolution !== undefined) {
      const noChangeOutputIds = uuidList(rawResolution.noChangeOutputIds, 30) ?? (
        Array.isArray(rawResolution.noChangeOutputIds) && rawResolution.noChangeOutputIds.length === 0
          ? []
          : null
      );
      const materializedOutputIds = uuidList(rawResolution.materializedOutputIds, 30) ?? (
        Array.isArray(rawResolution.materializedOutputIds) && rawResolution.materializedOutputIds.length === 0
          ? []
          : null
      );
      const combined = noChangeOutputIds && materializedOutputIds
        ? [...noChangeOutputIds, ...materializedOutputIds]
        : [];
      if (
        !resolutionSlots || !noChangeOutputIds || !materializedOutputIds
        || new Set(combined).size !== combined.length
        || combined.length !== resolutionSlots.length
        || combined.some((id) => !resolutionSlots.some((slot) => slot.outputId === id))
        || noChangeOutputIds.some((id) => !resolutionSlots.some((slot) => (
          slot.kind === "existing" && slot.outputId === id
        )))
      ) return null;
      continuityResolution = { noChangeOutputIds, materializedOutputIds };
    }
    const resolvedBase = continuityResolution ? { ...base, continuityResolution } : base;

    const positions = new Set<number>();
    const outputImages: EditorialBatchTransferOutputImage[] = [];
    if (parsed.outputImages !== undefined && !Array.isArray(parsed.outputImages)) return null;
    for (const value of parsed.outputImages ?? []) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }

      const candidate = value as Record<string, unknown>;
      const position = Number(candidate.position);
      const outputId = candidate.outputId === undefined
        ? undefined
        : typeof candidate.outputId === "string"
          ? candidate.outputId.trim().toLowerCase()
          : "";
      const dossierImageId = candidate.dossierImageId === undefined
        ? undefined
        : typeof candidate.dossierImageId === "string"
          ? candidate.dossierImageId.trim().toLowerCase()
          : "";
      const imageUrl = httpUrl(candidate.imageUrl);
      const label = typeof candidate.label === "string"
        ? candidate.label.trim().slice(0, 240)
        : "";

      if (
        !Number.isInteger(position)
        || position < 1
        || position > 30
        || positions.has(position)
        || (outputId !== undefined && !UUID_PATTERN.test(outputId))
        || (dossierImageId !== undefined && !UUID_PATTERN.test(dossierImageId))
        || (outputId !== undefined && batchContract && batchContract.outputIds[position - 1] !== outputId)
        || !imageUrl
        || !label
      ) {
        return null;
      }

      positions.add(position);
      outputImages.push({
        position,
        ...(outputId ? { outputId } : {}),
        ...(dossierImageId ? { dossierImageId } : {}),
        imageUrl,
        label,
      });
    }

    if (parsed.dossierImages !== undefined && !Array.isArray(parsed.dossierImages)) return null;
    const dossierImageIds = new Set<string>();
    const dossierImages: EditorialBatchTransferDossierImage[] = [];
    for (const value of parsed.dossierImages ?? []) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const candidate = value as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim().toLowerCase() : "";
      const imageUrl = httpUrl(candidate.imageUrl);
      const label = typeof candidate.label === "string" ? candidate.label.trim().slice(0, 240) : "";
      const newsroomArticleId = candidate.newsroomArticleId === undefined
        ? undefined
        : typeof candidate.newsroomArticleId === "string"
          ? candidate.newsroomArticleId.trim().toLowerCase()
          : "";
      if (
        !UUID_PATTERN.test(id)
        || dossierImageIds.has(id)
        || !imageUrl
        || !label
        || (newsroomArticleId !== undefined && !UUID_PATTERN.test(newsroomArticleId))
      ) return null;
      dossierImageIds.add(id);
      dossierImages.push({
        id,
        imageUrl,
        label,
        ...(newsroomArticleId ? { newsroomArticleId } : {}),
      });
    }

    return {
      ...resolvedBase,
      ...(parsed.outputImages === undefined ? {} : { outputImages }),
      ...(parsed.dossierImages === undefined ? {} : { dossierImages }),
    };
  } catch {
    return null;
  }
}

export function preflightEditorialArticleBatchForSourcePackage(
  input: string,
  sourcePackage: EditorialBatchTransferSourcePackage | null | undefined,
): EditorialBatchPreflight {
  if (sourcePackage && Object.hasOwn(sourcePackage, "productionIntents")) {
    const checked = parseEditorialBatchTransferSourcePackage(JSON.stringify(sourcePackage));
    if (!checked?.productionIntents || !checked.batchContract?.sourceIdsByOutput) {
      return { articles: [], issues: [{ severity: "error", code: "invalid_mesa_v2_contract",
        message: "O plano de intenções não é válido. O texto não foi encaminhado para o percurso antigo." }],
        total: 0, valid: 0, invalid: 1, ready: false };
    }
    return preflightEditorialThemeContinuityBatch(input,
      { slots: mesaProductionIntentSlots(checked.productionIntents) }, checked.batchContract.sourceIdsByOutput);
  }
  return sourcePackage?.batchContract && sourcePackage.themeContinuity
    ? preflightEditorialThemeContinuityBatch(
        input,
        sourcePackage.themeContinuity,
        sourcePackage.batchContract.sourceIdsByOutput ?? Object.fromEntries(
          sourcePackage.batchContract.outputIds.map((outputId) => (
            [outputId, sourcePackage.batchContract!.sourceIds]
          )),
        ),
      )
    : sourcePackage?.batchContract
    ? preflightEditorialMesaV2ArticleBatch(input, {
        outputIds: sourcePackage.batchContract.outputIds,
        sourceIds: sourcePackage.batchContract.sourceIds,
        sourceIdsByOutput: sourcePackage.batchContract.sourceIdsByOutput,
      })
    : preflightEditorialArticleBatch(input);
}
