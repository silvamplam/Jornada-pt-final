import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TEAM_BATCH_CREATION_MAX_HTTP_BODY_BYTES,
  handleTeamBatchCreationRequest,
  isTeamBatchCreationApiErrorResponse,
  isTeamBatchCreationApiSuccessResponse,
  type TeamBatchCreationApiDependencies,
  type TeamBatchCreationRpcArguments
} from "@/lib/team-batch-creation-api";
import type {
  TeamBatchCreationInputRow,
  TeamBatchCreationRpcRow,
  TeamBatchCreationStatus
} from "@/lib/team-batch-creation-policy";

const COUNTRY_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const FINGERPRINT = "v1:0123456789abcdef0123456789abcdef";

function inputRow(overrides: Partial<TeamBatchCreationInputRow> = {}): TeamBatchCreationInputRow {
  return {
    lineNumber: 1,
    canonicalName: "Clube Exemplo",
    publicName: null,
    shortName: "CEX",
    code: "CEX-CODE",
    slug: "clube-exemplo",
    aliases: ["Exemplo FC"],
    logoUrl: "https://example.invalid/logo.svg",
    primaryColor: "#123ABC",
    ...overrides
  };
}

function actionForStatus(status: TeamBatchCreationStatus) {
  if (status === "create") return "create" as const;
  if (status === "existing") return "noop" as const;
  if (status === "complete_existing") return "complete" as const;
  if (status === "probable" || status === "ambiguous") return "review" as const;
  return "block" as const;
}

function rpcRows(
  status: TeamBatchCreationStatus,
  operation: "preview" | "apply"
): TeamBatchCreationRpcRow[] {
  const applied = operation === "apply";
  const blocking =
    ["probable", "ambiguous", "conflict", "invalid"].includes(status) ||
    (status === "complete_existing" && operation === "preview");
  const resolved = ["existing", "complete_existing", "probable"].includes(status);
  return [
    {
      line_number: 1,
      result_status: status,
      reason_code: status === "create" ? "new_team" : `${status}_reason`,
      reason_message: "Resultado sintético.",
      proposed_identity: {
        canonical_name: "Clube Exemplo",
        normalized_canonical_name: "clube-exemplo",
        public_name: null,
        short_name: "CEX",
        normalized_short_name: "cex",
        code: "CEX-CODE",
        normalized_code: "cex-code",
        slug: "clube-exemplo",
        country_id: COUNTRY_ID,
        logo_url: "https://example.invalid/logo.svg",
        primary_color: "#123ABC"
      },
      resolved_team_id: resolved ? TEAM_ID : null,
      existing_identity: resolved
        ? {
            team_id: TEAM_ID,
            country_id: status === "complete_existing" ? null : COUNTRY_ID,
            canonical_name: "Clube Exemplo",
            public_name: null,
            short_name: "CEX",
            code: "CEX-CODE",
            slug: "clube-exemplo",
            logo_url: null,
            primary_color: null
          }
        : null,
      conflicts: [],
      normalized_aliases: ["exemplo-fc"],
      proposed_action: actionForStatus(status),
      final_team_id: applied || resolved ? TEAM_ID : null,
      changed: applied && (status === "create" || status === "complete_existing"),
      batch_applied: applied,
      batch_total_count: 1,
      batch_create_count: status === "create" ? 1 : 0,
      batch_existing_count: status === "existing" ? 1 : 0,
      batch_complete_existing_count: status === "complete_existing" ? 1 : 0,
      batch_probable_count: status === "probable" ? 1 : 0,
      batch_ambiguous_count: status === "ambiguous" ? 1 : 0,
      batch_conflict_count: status === "conflict" ? 1 : 0,
      batch_invalid_count: status === "invalid" ? 1 : 0,
      batch_blocking_count: blocking ? 1 : 0,
      batch_can_apply: !blocking,
      batch_created_count: applied && status === "create" ? 1 : 0,
      batch_completed_existing_count:
        applied && status === "complete_existing" ? 1 : 0,
      batch_existing_result_count: status === "existing" ? 1 : 0,
      batch_aliases_created_count: 0,
      batch_aliases_unchanged_count: 0,
      batch_public_names_changed_count: 0,
      batch_integrally_applied: applied && !blocking,
      preview_fingerprint: FINGERPRINT
    }
  ];
}

function previewBody(extra: Record<string, unknown> = {}) {
  return {
    action: "preview",
    countryId: COUNTRY_ID,
    rows: [inputRow()],
    ...extra
  };
}

function applyBody(extra: Record<string, unknown> = {}) {
  return {
    action: "apply",
    countryId: COUNTRY_ID,
    rows: [inputRow()],
    previewFingerprint: FINGERPRINT,
    confirmedCompleteExistingLines: [],
    ...extra
  };
}

async function callApi(options: {
  body?: unknown;
  rawBody?: string;
  rpcResult?: unknown;
  rpcError?: Error;
  configured?: boolean;
}) {
  const calls: TeamBatchCreationRpcArguments[] = [];
  const dependencies: TeamBatchCreationApiDependencies = {
    serviceConfigured: () => options.configured ?? true,
    createRequestId: () => "request-1",
    executeRpc: async (argumentsValue) => {
      calls.push(argumentsValue);
      if (options.rpcError) throw options.rpcError;
      return options.rpcResult ?? rpcRows("create", "preview");
    }
  };
  const request = new Request("http://local.test/api/admin/teams/batch", {
    method: "POST",
    body: options.rawBody ?? JSON.stringify(options.body ?? previewBody()),
    headers: { "Content-Type": "application/json" }
  });
  const response = await handleTeamBatchCreationRequest(request, dependencies);
  return { response, payload: (await response.json()) as unknown, calls };
}

test("1. aceita preview e valida o retorno da RPC", async () => {
  const { response, payload } = await callApi({ body: previewBody() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(isTeamBatchCreationApiSuccessResponse(payload));
  assert.equal(payload.operation, "preview");
});

test("2. aceita apply integral", async () => {
  const { response, payload } = await callApi({
    body: applyBody(),
    rpcResult: rpcRows("create", "apply")
  });
  assert.equal(response.status, 200);
  assert.ok(isTeamBatchCreationApiSuccessResponse(payload));
  assert.equal(payload.summary.integrallyApplied, true);
});

test("3. rejeita JSON inválido", async () => {
  const { response, payload, calls } = await callApi({ rawBody: "{" });
  assert.equal(response.status, 400);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-invalid-json");
  assert.equal(calls.length, 0);
});

test("4. rejeita body acima de 512 KiB antes do parse", async () => {
  const rawBody = "x".repeat(TEAM_BATCH_CREATION_MAX_HTTP_BODY_BYTES + 1);
  const { response, payload, calls } = await callApi({ rawBody });
  assert.equal(response.status, 413);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(calls.length, 0);
});

test("5. rejeita action desconhecida", async () => {
  const { response, payload } = await callApi({ body: previewBody({ action: "remove" }) });
  assert.equal(response.status, 400);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-action-invalid");
});

test("6. rejeita countryId inválido", async () => {
  const { response, payload } = await callApi({ body: previewBody({ countryId: "PT" }) });
  assert.equal(response.status, 400);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-country-id-invalid");
});

test("7. rejeita campos adicionais e metadata de ator do cliente", async () => {
  const { response, payload, calls } = await callApi({
    body: previewBody({ actorType: "service_role" })
  });
  assert.equal(response.status, 400);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-request-fields-invalid");
  assert.equal(calls.length, 0);
});

test("8. deriva metadata administrativa e argumentos exatos no servidor", async () => {
  const { calls } = await callApi({ body: previewBody() });
  assert.deepEqual(calls, [
    {
      p_country_id: COUNTRY_ID,
      p_rows: [inputRow()],
      p_apply: false,
      p_confirmed_preview_fingerprint: null,
      p_confirmed_complete_existing_lines: [],
      p_actor_type: "admin_session",
      p_actor_reference: "jornada_backoffice_shared_admin",
      p_source: "admin_team_batch_creation",
      p_request_reference: "team-batch-creation:preview:request-1"
    }
  ]);
});

test("9. envia fingerprint e confirmações exatas no apply", async () => {
  const body = applyBody({ confirmedCompleteExistingLines: [1] });
  const { calls, response } = await callApi({
    body,
    rpcResult: rpcRows("complete_existing", "apply")
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0]?.p_apply, true);
  assert.equal(calls[0]?.p_confirmed_preview_fingerprint, FINGERPRINT);
  assert.deepEqual(calls[0]?.p_confirmed_complete_existing_lines, [1]);
});

test("10. falha fechada perante retorno estruturalmente inválido", async () => {
  const { response, payload } = await callApi({ body: previewBody(), rpcResult: [{}] });
  assert.equal(response.status, 502);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-rpc-invalid-response");
});

test("11. mapeia preview desatualizado para 409", async () => {
  const error = new Error(JSON.stringify({ code: "40001", message: "team_creation_batch_preview_stale" }));
  const { response, payload } = await callApi({ body: applyBody(), rpcError: error });
  assert.equal(response.status, 409);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-preview-stale");
});

test("12. mapeia lote bloqueado para 409", async () => {
  const error = new Error(JSON.stringify({ code: "22023", message: "team_creation_batch_blocking_rows" }));
  const { response, payload } = await callApi({ body: applyBody(), rpcError: error });
  assert.equal(response.status, 409);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-batch-blocked");
});

test("13. mapeia input transacional inválido para 422", async () => {
  const error = new Error(JSON.stringify({ code: "22023", message: "team_creation_batch_rows_required" }));
  const { response, payload } = await callApi({ body: previewBody(), rpcError: error });
  assert.equal(response.status, 422);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-rpc-input-invalid");
});

test("14. não expõe detalhes de um erro interno", async () => {
  const { response, payload } = await callApi({
    body: previewBody(),
    rpcError: new Error("segredo interno")
  });
  assert.equal(response.status, 500);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "team-batch-creation-operation-failed");
  assert.doesNotMatch(payload.message, /segredo/i);
});

test("15. recusa a operação quando o service role não está configurado", async () => {
  const { response, payload, calls } = await callApi({ body: previewBody(), configured: false });
  assert.equal(response.status, 503);
  assert.ok(isTeamBatchCreationApiErrorResponse(payload));
  assert.equal(payload.code, "missing-service");
  assert.equal(calls.length, 0);
});
