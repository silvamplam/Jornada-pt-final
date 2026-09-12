import type { EditorialBatchArticle } from "@/lib/redacao-automatica/editorial-batch-parser";
import type { EditorialBatchTransferMesaV2Contract } from "@/lib/redacao-automatica/editorial-batch-transfer";
import type {
  EditorialSourcePackageManifest,
  EditorialSourcePackageManifestEntry,
  EditorialSourcePackageOutput,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

export type EditorialMesaProvenanceErrorCode =
  | "mesa-v2-output-count-mismatch"
  | "mesa-v2-provenance-missing"
  | "mesa-v2-output-unknown"
  | "mesa-v2-output-duplicate"
  | "mesa-v2-source-unknown"
  | "mesa-v2-source-duplicate";

export type ValidatedEditorialMesaOutputProvenance = Readonly<{
  article: EditorialBatchArticle;
  output: EditorialSourcePackageOutput;
  sources: readonly EditorialSourcePackageManifestEntry[];
}>;

export type EditorialMesaProvenanceValidation =
  | Readonly<{
      ok: true;
      contract: "historical";
      outputs: readonly [];
    }>
  | Readonly<{
      ok: true;
      contract: "mesa-v2";
      outputs: readonly ValidatedEditorialMesaOutputProvenance[];
    }>
  | Readonly<{
      ok: false;
      code: EditorialMesaProvenanceErrorCode;
      articleKey?: string;
    }>;

export type EditorialMesaPackageBatchContract =
  | Readonly<{ kind: "historical" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{
      kind: "mesa-v2";
      value: EditorialBatchTransferMesaV2Contract;
    }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function editorialMesaPackageBatchContract(
  manifest: EditorialSourcePackageManifest,
): EditorialMesaPackageBatchContract {
  if (manifest.version !== 5) return { kind: "historical" };
  if (manifest.provenanceContract !== "mesa-v2") return { kind: "invalid" };

  const outputIds = manifest.outputs.map((output) => output.outputId ?? "");
  const sourceIds = manifest.entries.flatMap((entry) => (
    entry.status === "prepared" && entry.provenanceSourceId
      ? [entry.provenanceSourceId]
      : []
  ));
  if (
    outputIds.length < 1
    || sourceIds.length < 1
    || outputIds.some((id) => !UUID_PATTERN.test(id))
    || sourceIds.some((id) => !UUID_PATTERN.test(id))
    || new Set(outputIds).size !== outputIds.length
    || new Set(sourceIds).size !== sourceIds.length
    || manifest.outputs.some((output) => (
      output.articlePlan?.workspaceContractVersion !== 2
      || output.articlePlan.sourceScope !== "workspace"
    ))
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "mesa-v2",
    value: {
      manifestVersion: 5,
      provenanceContract: "mesa-v2",
      workspaceContractVersion: 2,
      outputIds,
      sourceIds,
    },
  };
}

export function validateEditorialMesaSingleOutputProvenance(
  manifest: EditorialSourcePackageManifest,
  article: EditorialBatchArticle,
): EditorialMesaProvenanceValidation {
  if (manifest.version !== 5 || manifest.provenanceContract !== "mesa-v2") {
    return { ok: true, contract: "historical", outputs: [] };
  }
  if (!article.outputId || article.sourceIds.length === 0) {
    return { ok: false, code: "mesa-v2-provenance-missing", articleKey: article.key };
  }
  const matchingOutputs = manifest.outputs.filter((output) => output.outputId === article.outputId);
  if (matchingOutputs.length !== 1) {
    return { ok: false, code: "mesa-v2-output-unknown", articleKey: article.key };
  }
  if (new Set(article.sourceIds).size !== article.sourceIds.length) {
    return { ok: false, code: "mesa-v2-source-duplicate", articleKey: article.key };
  }
  const sourceById = new Map(manifest.entries.flatMap((entry) => (
    entry.status === "prepared" && entry.provenanceSourceId
      ? [[entry.provenanceSourceId, entry] as const]
      : []
  )));
  const sources = article.sourceIds.map((sourceId) => sourceById.get(sourceId));
  if (sources.some((source) => !source)) {
    return { ok: false, code: "mesa-v2-source-unknown", articleKey: article.key };
  }
  return {
    ok: true,
    contract: "mesa-v2",
    outputs: [{
      article,
      output: matchingOutputs[0],
      sources: sources as EditorialSourcePackageManifestEntry[],
    }],
  };
}

/**
 * The package is the authorization boundary. Article-plan assignments are
 * deliberately absent from this validation: they seed the engine, while the
 * AI response is the authority for the sources actually used.
 */
export function validateEditorialMesaOutputProvenance(
  manifest: EditorialSourcePackageManifest,
  articles: readonly EditorialBatchArticle[],
): EditorialMesaProvenanceValidation {
  if (manifest.version !== 5 || manifest.provenanceContract !== "mesa-v2") {
    return { ok: true, contract: "historical", outputs: [] };
  }

  if (articles.length !== manifest.outputs.length) {
    return { ok: false, code: "mesa-v2-output-count-mismatch" };
  }

  const outputById = new Map(manifest.outputs.flatMap((output) => (
    output.outputId ? [[output.outputId, output] as const] : []
  )));
  const sourceById = new Map(manifest.entries.flatMap((entry) => (
    entry.status === "prepared" && entry.provenanceSourceId
      ? [[entry.provenanceSourceId, entry] as const]
      : []
  )));
  if (
    outputById.size !== manifest.outputs.length
    || sourceById.size !== manifest.entries.filter((entry) => entry.status === "prepared").length
  ) {
    return { ok: false, code: "mesa-v2-provenance-missing" };
  }

  const seenOutputIds = new Set<string>();
  const validated: ValidatedEditorialMesaOutputProvenance[] = [];
  for (const article of articles) {
    if (!article.outputId || article.sourceIds.length === 0) {
      return {
        ok: false,
        code: "mesa-v2-provenance-missing",
        articleKey: article.key,
      };
    }
    if (seenOutputIds.has(article.outputId)) {
      return {
        ok: false,
        code: "mesa-v2-output-duplicate",
        articleKey: article.key,
      };
    }
    const output = outputById.get(article.outputId);
    if (!output) {
      return {
        ok: false,
        code: "mesa-v2-output-unknown",
        articleKey: article.key,
      };
    }
    if (new Set(article.sourceIds).size !== article.sourceIds.length) {
      return {
        ok: false,
        code: "mesa-v2-source-duplicate",
        articleKey: article.key,
      };
    }
    const sources = article.sourceIds.map((sourceId) => sourceById.get(sourceId));
    if (sources.some((source) => !source)) {
      return {
        ok: false,
        code: "mesa-v2-source-unknown",
        articleKey: article.key,
      };
    }
    seenOutputIds.add(article.outputId);
    validated.push({
      article,
      output,
      sources: sources as EditorialSourcePackageManifestEntry[],
    });
  }

  if (seenOutputIds.size !== outputById.size) {
    return { ok: false, code: "mesa-v2-output-count-mismatch" };
  }

  return { ok: true, contract: "mesa-v2", outputs: validated };
}
