/** Real application modules; only server-only and public-zone placement are test boundaries. */
export * from "../../lib/redacao-automatica/newsroom-mesa-production-intents-contract";
export * from "../../lib/redacao-automatica/newsroom-mesa-production-intents-service";
export * from "../../lib/redacao-automatica/editorial-source-package";
export * from "../../lib/redacao-automatica/editorial-batch-transfer";
export * from "../../lib/redacao-automatica/editorial-mesa-provenance";
export { publishEditorialMesaOutput } from "../../lib/redacao-automatica/editorial-dossier-article-plan-service";
export { POST as publishBatchPOST } from "../../app/api/admin/editorial/redacao-automatica/publicacao-lote/route";
