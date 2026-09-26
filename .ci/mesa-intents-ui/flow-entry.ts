/** Actual page functions, client identities and workspace/package route handlers. */
export { default as workspacePage } from "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/page";
export { MesaProductionWorkspaceClient as workspaceClient } from "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client";
export { default as batchPage } from "../../app/admin/editorial/redacao-automatica/publicacao-lote/page";
export { default as batchClient } from "../../app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient";
export { POST as workspacePOST } from "../../app/api/admin/editorial/redacao-automatica/mesa/workspace/route";
export { GET as packageGET } from "../../app/api/admin/editorial/redacao-automatica/source-package/[year]/[month]/[id]/route";

export { loadMesaPageReadModel } from "../../lib/redacao-automatica/newsroom-mesa-page-read-model";
