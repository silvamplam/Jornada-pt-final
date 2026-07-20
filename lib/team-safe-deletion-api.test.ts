import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  type TeamSafeDeletionApiDependencies,
  type TeamSafeDeletionAuthorization,
  type TeamSafeDeletionRpcArguments,
  handleTeamSafeDeletionRequest,
} from "./team-safe-deletion-api";
import {
  buildTeamSafeDeletionApplyRequest,
  canApplyTeamSafeDeletion,
  type TeamSafeDeletionRpcResult,
} from "./team-safe-deletion-policy";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const COUNTRY_ID = "22222222-2222-4222-8222-222222222222";
const ALIAS_ID = "33333333-3333-4333-8333-333333333333";
const AUDIT_ID = "44444444-4444-4444-8444-444444444444";
const FINGERPRINT = `v1:${"a".repeat(32)}`;

const dependencyDefinitions = [
  ["season_teams", "season_teams", "team_id", true],
  ["matches_home", "matches", "home_team_id", true],
  ["matches_away", "matches", "away_team_id", true],
  ["standing_rows", "standing_rows", "team_id", true],
  ["goals", "goals", "team_id", true],
  ["players", "players", "team_id", true],
  ["match_events", "match_events", "team_id", true],
  ["aliases_active", "team_aliases", "team_id", false],
  ["aliases_inactive", "team_aliases", "team_id", false],
  ["alias_audit_events", "team_alias_audit_events", "team_alias_id", false],
  ["public_name_audit_events", "team_public_name_audit_events", "team_id", false],
] as const;

function makeRpcResult(
  status: "removable" | "removable_with_aliases" | "blocked" = "removable",
  mode: "preview" | "apply" = "preview",
): TeamSafeDeletionRpcResult {
  const hasAliases = status === "removable_with_aliases";
  const blocked = status === "blocked";
  const proposedAction = hasAliases ? "delete_team_and_aliases" : blocked ? "none" : "delete_team";
  const applied = mode === "apply";
  return {
    contract_version: "v1",
    mode,
    applied,
    team_id: TEAM_ID,
    name: "Clube Sintético",
    public_name: "Clube",
    short_name: "CLU",
    code: "CLUBE",
    slug: "clube-sintetico",
    country: { id: COUNTRY_ID, name: "País Sintético", slug: "pais-sintetico", iso2: "PT" },
    active_aliases: hasAliases
      ? [{ id: ALIAS_ID, alias: "Clube Antigo", normalized_alias: "clube-antigo", status: "active" }]
      : [],
    inactive_aliases: [],
    alias_count: hasAliases ? 1 : 0,
    alias_audit_count: hasAliases ? 2 : 0,
    public_name_audit_count: 1,
    dependencies: dependencyDefinitions.map(([key, table, column, blocking]) => ({
      key,
      table,
      column,
      count:
        key === "season_teams" && blocked
          ? 1
          : key === "aliases_active" && hasAliases
            ? 1
            : key === "alias_audit_events" && hasAliases
              ? 2
              : key === "public_name_audit_events"
                ? 1
                : 0,
      blocking,
      reason: key,
    })),
    status,
    can_delete: !blocked && !applied,
    proposed_action: proposedAction,
    reason_code: status,
    reason_message: status,
    preview_fingerprint: FINGERPRINT,
    deleted_team_id: applied ? TEAM_ID : null,
    aliases_deleted_count: applied && hasAliases ? 1 : 0,
    alias_audit_events_preserved_count: applied && hasAliases ? 2 : 0,
    public_name_audit_events_preserved_count: applied ? 1 : 0,
    deletion_audit_event_id: applied ? AUDIT_ID : null,
  };
}

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/admin/teams/${TEAM_ID}/safe-deletion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDependencies(options?: {
  authorization?: TeamSafeDeletionAuthorization;
  result?: unknown;
  error?: unknown;
  onArguments?: (arguments_: TeamSafeDeletionRpcArguments) => void;
}): TeamSafeDeletionApiDependencies {
  return {
    authorize: async () => options?.authorization ?? { status: "authorized", actorReference: "admin-session:test" },
    serviceConfigured: true,
    createRequestReference: () => "request-id",
    executeRpc: async (arguments_) => {
      options?.onArguments?.(arguments_);
      if (options && "error" in options) throw options.error;
      return options?.result ?? makeRpcResult();
    },
    logError: () => undefined,
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("rejeita utilizador não autenticado", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ authorization: { status: "unauthenticated" } }),
  );
  assert.equal(response.status, 401);
  assert.equal((await responseJson(response)).code, "authentication_required");
});

test("rejeita utilizador sem autorização administrativa", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ authorization: { status: "forbidden" } }),
  );
  assert.equal(response.status, 403);
});

test("rejeita UUID de clube inválido", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    "invalid",
    makeDependencies(),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseJson(response)).code, "invalid_team_id");
});

test("rejeita operação desconhecida", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "delete" }),
    TEAM_ID,
    makeDependencies(),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseJson(response)).code, "invalid_operation");
});

test("preview válido envia argumentos exatos e metadata do servidor", async () => {
  const captured: TeamSafeDeletionRpcArguments[] = [];
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ onArguments: (arguments_) => captured.push(arguments_) }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(captured[0], {
    p_team_id: TEAM_ID,
    p_apply: false,
    p_confirmed_preview_fingerprint: null,
    p_confirmed_action: null,
    p_actor_type: "admin_session",
    p_actor_reference: "admin-session:test",
    p_source: "admin_team_safe_deletion",
    p_request_reference: "team-safe-deletion:preview:request-id",
  });
});

test("apply exige fingerprint", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "apply", confirmedAction: "delete_team" }),
    TEAM_ID,
    makeDependencies(),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseJson(response)).code, "unexpected_fields");
});

test("apply exige ação confirmada", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "apply", previewFingerprint: FINGERPRINT }),
    TEAM_ID,
    makeDependencies(),
  );
  assert.equal(response.status, 400);
});

test("apply rejeita ação inválida", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "apply", previewFingerprint: FINGERPRINT, confirmedAction: "none" }),
    TEAM_ID,
    makeDependencies(),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseJson(response)).code, "invalid_action");
});

test("valida resposta removable", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ result: makeRpcResult("removable") }),
  );
  assert.equal(response.status, 200);
  const body = await responseJson(response);
  assert.equal((body.result as TeamSafeDeletionRpcResult).status, "removable");
});

test("valida resposta removable_with_aliases", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ result: makeRpcResult("removable_with_aliases") }),
  );
  assert.equal(response.status, 200);
  const result = (await responseJson(response)).result as TeamSafeDeletionRpcResult;
  assert.equal(result.alias_count, 1);
  assert.equal(result.proposed_action, "delete_team_and_aliases");
});

test("valida resposta blocked sem permitir eliminação", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ result: makeRpcResult("blocked") }),
  );
  assert.equal(response.status, 200);
  const result = (await responseJson(response)).result as TeamSafeDeletionRpcResult;
  assert.equal(result.can_delete, false);
  assert.equal(result.proposed_action, "none");
});

test("apply válido conserva fingerprint e ação do preview", async () => {
  const captured: TeamSafeDeletionRpcArguments[] = [];
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({
      operation: "apply",
      previewFingerprint: FINGERPRINT,
      confirmedAction: "delete_team_and_aliases",
    }),
    TEAM_ID,
    makeDependencies({
      result: makeRpcResult("removable_with_aliases", "apply"),
      onArguments: (arguments_) => captured.push(arguments_),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(captured[0]?.p_apply, true);
  assert.equal(captured[0]?.p_confirmed_preview_fingerprint, FINGERPRINT);
  assert.equal(captured[0]?.p_confirmed_action, "delete_team_and_aliases");
});

test("mapeia preview desatualizado sem repetir apply", async () => {
  let calls = 0;
  const dependencies = makeDependencies({
    error: { code: "40001", message: "preview_stale" },
    onArguments: () => calls++,
  });
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "apply", previewFingerprint: FINGERPRINT, confirmedAction: "delete_team" }),
    TEAM_ID,
    dependencies,
  );
  const body = await responseJson(response);
  assert.equal(response.status, 409);
  assert.equal(body.code, "preview_stale");
  assert.equal(body.requiresNewPreview, true);
  assert.equal(calls, 1);
});

test("mapeia clube inexistente sem fallback", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ error: { code: "P0002", message: "team_not_found" } }),
  );
  assert.equal(response.status, 404);
  assert.equal((await responseJson(response)).code, "team_not_found");
});

test("falha fechada perante erro da RPC", async () => {
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ error: new Error("internal database detail") }),
  );
  const body = await responseJson(response);
  assert.equal(response.status, 500);
  assert.equal(body.code, "safe_deletion_failed");
  assert.doesNotMatch(String(body.message), /database detail/i);
});

test("falha fechada perante retorno estruturalmente inválido", async () => {
  const invalid = { ...makeRpcResult() } as Record<string, unknown>;
  delete invalid.dependencies;
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies({ result: invalid }),
  );
  assert.equal(response.status, 502);
  assert.equal((await responseJson(response)).code, "rpc_contract_invalid");
});

test("rejeita metadata de ator enviada pelo cliente", async () => {
  let calls = 0;
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview", actorReference: "client" }),
    TEAM_ID,
    makeDependencies({ onArguments: () => calls++ }),
  );
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("confirmação nominal e preview válido são obrigatórios antes de apply", () => {
  const preview = makeRpcResult();
  assert.equal(canApplyTeamSafeDeletion(null, preview.name), false);
  assert.equal(canApplyTeamSafeDeletion(preview, "Nome incorreto"), false);
  assert.equal(canApplyTeamSafeDeletion(preview, preview.name), true);
  assert.equal(canApplyTeamSafeDeletion(makeRpcResult("blocked"), preview.name), false);
});

test("constrói apply apenas com fingerprint e ação devolvidos pelo preview", () => {
  const preview = makeRpcResult("removable_with_aliases");
  assert.deepEqual(buildTeamSafeDeletionApplyRequest(preview), {
    operation: "apply",
    previewFingerprint: FINGERPRINT,
    confirmedAction: "delete_team_and_aliases",
  });
  assert.throws(() => buildTeamSafeDeletionApplyRequest(makeRpcResult("blocked")));
});

test("DELETE antigo de teams está fechado com safe_deletion_required", async () => {
  const source = await readFile(new URL("../app/api/admin/teams/[id]/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function DELETE/);
  assert.match(source, /safe_deletion_required/);
  assert.doesNotMatch(
    source,
    /writeSupabaseAdmin\(\s*`teams[^`]*`\s*,\s*\{[^}]*method:\s*"DELETE"/,
  );
});

test("remoção antiga do Gestor está fechada e encaminha para Clubes", async () => {
  const apiSource = await readFile(new URL("../app/api/admin/gestor/route.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/admin/gestor/page.tsx", import.meta.url), "utf8");
  assert.match(apiSource, /actionType === "remove_team"[\s\S]*safe-deletion-required/);
  assert.doesNotMatch(apiSource, /async function removeTeam/);
  assert.doesNotMatch(
    apiSource,
    /writeSupabaseAdmin\(\s*`teams[^`]*`\s*,\s*\{[^}]*method:\s*"DELETE"/,
  );
  assert.doesNotMatch(pageSource, /name="action_type" value="remove_team"/);
  assert.match(pageSource, /Remover em Clubes/);
});

test("interface mostra aliases, bloqueios e limpa preview desatualizado", async () => {
  const source = await readFile(
    new URL("../app/admin/clubes/TeamSafeDeletion.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /O clube e os aliases associados podem ser removidos\./);
  assert.match(source, /O clube não pode ser removido porque possui dependências\./);
  assert.match(source, /payload\.requiresNewPreview[\s\S]*setPreview\(null\)[\s\S]*setConfirmation\(""\)/);
  assert.match(source, /onDeleted\(teamId, payload\.result\.name\)/);
});

async function listSourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...(await listSourceFiles(child)));
    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

test("nenhum caminho administrativo TypeScript mantém DELETE direto de teams", async () => {
  const roots = [new URL("../app/api/admin/", import.meta.url), new URL("./", import.meta.url)];
  const sources = await Promise.all(
    (await Promise.all(roots.map(listSourceFiles))).flat().map(async (file) => ({
      file: file.pathname,
      source: await readFile(file, "utf8"),
    })),
  );
  const offenders = sources.filter(({ source }) =>
    /(?:from\(["']teams["']\)\.delete\(|writeSupabaseAdmin\(\s*`teams[^`]*`\s*,\s*\{\s*method:\s*["']DELETE["'])/.test(
      source,
    ),
  );
  assert.deepEqual(offenders.map(({ file }) => file), []);
});

test("rota segura não contém nem expõe o nome da chave service role", async () => {
  const source = await readFile(
    new URL("../app/api/admin/teams/[id]/safe-deletion/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  const response = await handleTeamSafeDeletionRequest(
    makeRequest({ operation: "preview" }),
    TEAM_ID,
    makeDependencies(),
  );
  assert.doesNotMatch(JSON.stringify(await response.json()), /service_role|admin-session:test/i);
});
