import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TEAM_BATCH_CREATION_HEADER,
  TeamBatchCreationPolicyError,
  buildTeamBatchCreationRpcArguments,
  parseTeamBatchCreationRequest,
  parseTeamBatchCreationText,
  validateTeamBatchCreationRpcRows,
  type TeamBatchCreationInputRow,
  type TeamBatchCreationRpcRow,
  type TeamBatchCreationStatus
} from "@/lib/team-batch-creation-policy";

const COUNTRY_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID_1 = "22222222-2222-4222-8222-222222222222";
const TEAM_ID_2 = "33333333-3333-4333-8333-333333333333";
const FINGERPRINT = "v1:0123456789abcdef0123456789abcdef";

type TextColumns = {
  canonicalName: string;
  publicName: string;
  shortName: string;
  code: string;
  slug: string;
  aliases: string;
  logoUrl: string;
  primaryColor: string;
};

const DEFAULT_COLUMNS: TextColumns = {
  canonicalName: "Clube Atlético Exemplo",
  publicName: "Clube Exemplo",
  shortName: "cae",
  code: "CAE",
  slug: "clube-atletico-exemplo",
  aliases: "Atlético Exemplo|CAE Clube",
  logoUrl: "https://example.invalid/logo.svg?variant=1",
  primaryColor: "#12ab34"
};

function textLine(overrides: Partial<TextColumns> = {}) {
  const value = { ...DEFAULT_COLUMNS, ...overrides };
  return [
    value.canonicalName,
    value.publicName,
    value.shortName,
    value.code,
    value.slug,
    value.aliases,
    value.logoUrl,
    value.primaryColor
  ].join(";");
}

function validInputRow(
  overrides: Partial<TeamBatchCreationInputRow> = {}
): TeamBatchCreationInputRow {
  return {
    lineNumber: 1,
    canonicalName: "Clube Atlético Exemplo",
    publicName: null,
    shortName: "CAE",
    code: "CAE-CODE",
    slug: "clube-atletico-exemplo",
    aliases: [],
    logoUrl: "https://example.invalid/logo.svg",
    primaryColor: "#12AB34",
    ...overrides
  };
}

function policyErrorCode(callback: () => unknown) {
  let caught: unknown;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof TeamBatchCreationPolicyError);
  return caught.code;
}

function existingIdentity(teamId: string) {
  return {
    team_id: teamId,
    country_id: COUNTRY_ID,
    canonical_name: "Clube existente",
    public_name: null,
    short_name: "CE",
    code: null,
    slug: "clube-existente",
    logo_url: null,
    primary_color: null
  };
}

function actionForStatus(status: TeamBatchCreationStatus) {
  if (status === "create") return "create" as const;
  if (status === "existing") return "noop" as const;
  if (status === "complete_existing") return "complete" as const;
  if (status === "probable" || status === "ambiguous") return "review" as const;
  return "block" as const;
}

function makeRpcBatch(
  statuses: TeamBatchCreationStatus[],
  operation: "preview" | "apply",
  confirmedCompleteExistingLines: number[] = []
): TeamBatchCreationRpcRow[] {
  const count = (status: TeamBatchCreationStatus) =>
    statuses.filter((current) => current === status).length;
  const confirmed = new Set(confirmedCompleteExistingLines);
  const blockingCount = statuses.filter(
    (status, index) =>
      ["probable", "ambiguous", "conflict", "invalid"].includes(status) ||
      (status === "complete_existing" &&
        (operation === "preview" || !confirmed.has(index + 1)))
  ).length;
  const applied = operation === "apply";
  const teamIds = [TEAM_ID_1, TEAM_ID_2];

  return statuses.map((status, index) => {
    const lineNumber = index + 1;
    const teamId = teamIds[index] ?? TEAM_ID_1;
    const resolved =
      status === "existing" ||
      status === "complete_existing" ||
      status === "probable"
        ? teamId
        : null;
    return {
      line_number: lineNumber,
      result_status: status,
      reason_code: status === "create" ? "new_team" : status + "_reason",
      reason_message: "Resultado sintético.",
      proposed_identity: {
        canonical_name: "Clube " + lineNumber,
        normalized_canonical_name: "clube-" + lineNumber,
        public_name: null,
        short_name: "C" + lineNumber,
        normalized_short_name: "c" + lineNumber,
        code: null,
        normalized_code: null,
        slug: "clube-" + lineNumber,
        country_id: COUNTRY_ID,
        logo_url: null,
        primary_color: null
      },
      resolved_team_id: resolved,
      existing_identity: resolved ? existingIdentity(teamId) : null,
      conflicts: [],
      normalized_aliases: [],
      proposed_action: actionForStatus(status),
      final_team_id: applied || resolved ? teamId : null,
      changed: applied && (status === "create" || status === "complete_existing"),
      batch_applied: applied,
      batch_total_count: statuses.length,
      batch_create_count: count("create"),
      batch_existing_count: count("existing"),
      batch_complete_existing_count: count("complete_existing"),
      batch_probable_count: count("probable"),
      batch_ambiguous_count: count("ambiguous"),
      batch_conflict_count: count("conflict"),
      batch_invalid_count: count("invalid"),
      batch_blocking_count: blockingCount,
      batch_can_apply: blockingCount === 0,
      batch_created_count: applied ? count("create") : 0,
      batch_completed_existing_count: applied ? count("complete_existing") : 0,
      batch_existing_result_count: count("existing"),
      batch_aliases_created_count: 0,
      batch_aliases_unchanged_count: 0,
      batch_public_names_changed_count: 0,
      batch_integrally_applied: applied && blockingCount === 0,
      preview_fingerprint: FINGERPRINT
    };
  });
}

function previewContext(lineNumbers: number[] = [1]) {
  return {
    operation: "preview" as const,
    countryId: COUNTRY_ID,
    expectedLineNumbers: lineNumbers,
    confirmedCompleteExistingLines: []
  };
}

function applyContext(lineNumbers: number[] = [1], confirmed: number[] = []) {
  return {
    operation: "apply" as const,
    countryId: COUNTRY_ID,
    expectedLineNumbers: lineNumbers,
    confirmedCompleteExistingLines: confirmed
  };
}

test("1. analisa um lote válido", () => {
  const result = parseTeamBatchCreationText(textLine());
  assert.equal(result.summary.canSubmit, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.primaryColor, "#12AB34");
});

test("2. aceita o cabeçalho exato", () => {
  const result = parseTeamBatchCreationText(TEAM_BATCH_CREATION_HEADER + "\n" + textLine());
  assert.equal(result.summary.headerPresent, true);
  assert.equal(result.rows[0]?.lineNumber, 2);
});

test("3. rejeita um cabeçalho semelhante mas inexato", () => {
  const invalidHeader = TEAM_BATCH_CREATION_HEADER.replace("canónico", "canonico");
  const result = parseTeamBatchCreationText(invalidHeader + "\n" + textLine());
  assert.ok(result.issues.some((item) => item.code === "header-invalid"));
});

test("4. rejeita cabeçalho repetido", () => {
  const result = parseTeamBatchCreationText(
    TEAM_BATCH_CREATION_HEADER + "\n" + textLine() + "\n" + TEAM_BATCH_CREATION_HEADER
  );
  assert.ok(result.issues.some((item) => item.code === "header-position-invalid"));
});

test("5. exige exatamente oito colunas", () => {
  const result = parseTeamBatchCreationText("Clube;Nome;ABC;COD;slug;Alias;https://example.invalid");
  assert.ok(result.issues.some((item) => item.code === "column-count-invalid"));
});

test("6. ignora linhas integralmente vazias", () => {
  const result = parseTeamBatchCreationText("\n   \n" + textLine() + "\n\n");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.lineNumber, 3);
});

test("7. aceita CRLF", () => {
  const result = parseTeamBatchCreationText(
    TEAM_BATCH_CREATION_HEADER + "\r\n" + textLine()
  );
  assert.equal(result.rows[0]?.lineNumber, 2);
});

test("8. aceita LF", () => {
  const result = parseTeamBatchCreationText(TEAM_BATCH_CREATION_HEADER + "\n" + textLine());
  assert.equal(result.summary.canSubmit, true);
});

test("9. aplica trim apenas nas extremidades", () => {
  const result = parseTeamBatchCreationText(
    textLine({ canonicalName: "  Clube  do  Norte  ", publicName: "  Norte  " })
  );
  assert.equal(result.rows[0]?.canonicalName, "Clube  do  Norte");
  assert.equal(result.rows[0]?.publicName, "Norte");
});

test("10. aceita BOM apenas no início", () => {
  const result = parseTeamBatchCreationText("\uFEFF" + TEAM_BATCH_CREATION_HEADER + "\n" + textLine());
  assert.equal(result.summary.headerPresent, true);
  assert.equal(result.summary.canSubmit, true);
});

test("11. separa aliases por barra vertical", () => {
  const result = parseTeamBatchCreationText(
    textLine({ aliases: "Alias Norte|Alias Sul" })
  );
  assert.deepEqual(result.rows[0]?.aliases, ["Alias Norte", "Alias Sul"]);
});

test("12. remove segmentos vazios de aliases com warning", () => {
  const result = parseTeamBatchCreationText(
    textLine({ aliases: "Alias Norte||Alias Sul|" })
  );
  assert.deepEqual(result.rows[0]?.aliases, ["Alias Norte", "Alias Sul"]);
  assert.ok(result.issues.some((item) => item.code === "empty-alias-ignored"));
});

test("13. deduplica aliases pela identidade normalizada", () => {
  const result = parseTeamBatchCreationText(
    textLine({ aliases: "Águia do Norte|Aguia do Norte" })
  );
  assert.deepEqual(result.rows[0]?.aliases, ["Águia do Norte"]);
  assert.ok(result.issues.some((item) => item.code === "duplicate-alias-removed"));
});

test("14. preserva Unicode e normaliza acentos apenas na identidade", () => {
  const result = parseTeamBatchCreationText(
    textLine({
      canonicalName: "Clube Águia",
      shortName: "águ",
      code: "",
      slug: "clube-aguia",
      aliases: "Águia Azul"
    })
  );
  assert.equal(result.rows[0]?.canonicalName, "Clube Águia");
  assert.equal(result.rows[0]?.shortName, "ÁGU");
});

test("15. exige canonicalName", () => {
  const result = parseTeamBatchCreationText(textLine({ canonicalName: "" }));
  assert.ok(result.issues.some((item) => item.code === "canonical-name-required"));
});

test("16. exige shortName", () => {
  const result = parseTeamBatchCreationText(textLine({ shortName: "" }));
  assert.ok(result.issues.some((item) => item.code === "short-name-required"));
});

test("17. rejeita shortName acima de seis caracteres", () => {
  const result = parseTeamBatchCreationText(textLine({ shortName: "SETE123" }));
  assert.ok(result.issues.some((item) => item.code === "short-name-too-long"));
});

test("18. converte shortName para maiúsculas", () => {
  const result = parseTeamBatchCreationText(textLine({ shortName: "abc" }));
  assert.equal(result.rows[0]?.shortName, "ABC");
});

test("19. rejeita publicName acima de 80 caracteres", () => {
  const result = parseTeamBatchCreationText(textLine({ publicName: "P".repeat(81) }));
  assert.ok(result.issues.some((item) => item.code === "public-name-too-long"));
});

test("20. sugere slug quando a coluna está vazia", () => {
  const result = parseTeamBatchCreationText(
    textLine({ canonicalName: "Clube Águia Nova", slug: "" })
  );
  assert.equal(result.rows[0]?.slug, "clube-aguia-nova");
  assert.equal(result.lines[0]?.ok && result.lines[0].suggestions.slug.suggested, true);
});

test("21. rejeita slug preenchido inválido sem o corrigir", () => {
  const result = parseTeamBatchCreationText(textLine({ slug: "Clube Inválido" }));
  assert.ok(result.issues.some((item) => item.code === "slug-invalid"));
});

test("22. aceita URL HTTP absoluta", () => {
  const result = parseTeamBatchCreationText(
    textLine({ logoUrl: "http://example.invalid/logo.svg?x=1" })
  );
  assert.equal(result.rows[0]?.logoUrl, "http://example.invalid/logo.svg?x=1");
});

test("23. aceita URL HTTPS absoluta", () => {
  const result = parseTeamBatchCreationText(
    textLine({ logoUrl: "https://example.invalid/logo.svg?x=%3B" })
  );
  assert.equal(result.summary.canSubmit, true);
});

test("24. rejeita URL relativa", () => {
  const result = parseTeamBatchCreationText(textLine({ logoUrl: "/logo.svg" }));
  assert.ok(result.issues.some((item) => item.code === "logo-url-invalid"));
});

test("25. rejeita URL javascript", () => {
  const result = parseTeamBatchCreationText(textLine({ logoUrl: "javascript:alert(1)" }));
  assert.ok(result.issues.some((item) => item.code === "logo-url-invalid"));
});

test("26. rejeita URL data", () => {
  const result = parseTeamBatchCreationText(textLine({ logoUrl: "data:image/svg+xml,x" }));
  assert.ok(result.issues.some((item) => item.code === "logo-url-invalid"));
});

test("27. rejeita URL com credenciais", () => {
  const result = parseTeamBatchCreationText(
    textLine({ logoUrl: "https://user:secret@example.invalid/logo.svg" })
  );
  assert.ok(result.issues.some((item) => item.code === "logo-url-invalid"));
});

test("28. normaliza cor válida para maiúsculas", () => {
  const result = parseTeamBatchCreationText(textLine({ primaryColor: "#abcdef" }));
  assert.equal(result.rows[0]?.primaryColor, "#ABCDEF");
});

test("29. rejeita cor abreviada", () => {
  const result = parseTeamBatchCreationText(textLine({ primaryColor: "#FFF" }));
  assert.ok(result.issues.some((item) => item.code === "primary-color-invalid"));
});

test("30. rejeita todas as ocorrências de uma linha duplicada", () => {
  const line = textLine();
  const result = parseTeamBatchCreationText(line + "\n" + line);
  assert.equal(result.rows.length, 0);
  assert.equal(result.issues.filter((item) => item.code === "duplicate-row").length, 2);
});

test("31. deteta colisão de identidade entre linhas", () => {
  const second = textLine({
    canonicalName: "Clube Diferente",
    publicName: "",
    code: "OUTRO",
    slug: "clube-diferente",
    aliases: ""
  });
  const result = parseTeamBatchCreationText(textLine() + "\n" + second);
  assert.ok(result.issues.some((item) => item.code === "batch-identity-conflict"));
});

test("32. rejeita mais de 500 linhas", () => {
  const lines = Array.from({ length: 501 }, (_, index) =>
    textLine({
      canonicalName: "Clube " + index,
      publicName: "",
      shortName: "C" + index,
      code: "",
      slug: "clube-" + index,
      aliases: "",
      logoUrl: "",
      primaryColor: ""
    })
  );
  const result = parseTeamBatchCreationText(lines.join("\n"));
  assert.ok(result.issues.some((item) => item.code === "too-many-rows"));
});

test("33. rejeita texto acima de 256 KiB", () => {
  const result = parseTeamBatchCreationText("X".repeat(256 * 1024 + 1));
  assert.ok(result.issues.some((item) => item.code === "input-too-large"));
});

test("34. rejeita linha acima de 8192 caracteres", () => {
  const result = parseTeamBatchCreationText("X".repeat(8193));
  assert.ok(result.issues.some((item) => item.code === "line-too-long"));
});

test("35. rejeita lote vazio", () => {
  const result = parseTeamBatchCreationText(" \n ");
  assert.ok(result.issues.some((item) => item.code === "empty-input"));
});

test("36. trata apenas cabeçalho como lote vazio", () => {
  const result = parseTeamBatchCreationText(TEAM_BATCH_CREATION_HEADER);
  assert.equal(result.summary.headerPresent, true);
  assert.ok(result.issues.some((item) => item.code === "empty-input"));
});

test("37. rejeita mais de 34 aliases", () => {
  const aliases = Array.from({ length: 35 }, (_, index) => "Alias " + index).join("|");
  const result = parseTeamBatchCreationText(textLine({ aliases }));
  assert.ok(result.issues.some((item) => item.code === "too-many-aliases"));
});

test("38. rejeita alias acima de 160 caracteres", () => {
  const result = parseTeamBatchCreationText(textLine({ aliases: "A".repeat(161) }));
  assert.ok(result.issues.some((item) => item.code === "alias-too-long"));
});

test("39. não insere automaticamente a sugestão de publicName", () => {
  const result = parseTeamBatchCreationText(
    textLine({
      canonicalName: "Associação Desportiva",
      publicName: "",
      shortName: "AD",
      code: "",
      slug: "associacao-desportiva",
      aliases: ""
    })
  );
  assert.equal(result.rows[0]?.publicName, null);
  assert.equal(
    result.lines[0]?.ok && result.lines[0].suggestions.publicName.value,
    "A. Desportiva"
  );
});

test("40. não insere automaticamente a sugestão de alias", () => {
  const result = parseTeamBatchCreationText(
    textLine({
      canonicalName: "Associação Desportiva",
      publicName: "",
      shortName: "AD",
      code: "",
      slug: "associacao-desportiva",
      aliases: ""
    })
  );
  assert.deepEqual(result.rows[0]?.aliases, []);
  assert.equal(
    result.lines[0]?.ok && result.lines[0].suggestions.publicNameAsAlias,
    "A. Desportiva"
  );
});

test("41. valida pedido preview", () => {
  const result = parseTeamBatchCreationRequest({
    action: "preview",
    countryId: COUNTRY_ID.toUpperCase(),
    rows: [validInputRow()]
  });
  assert.equal(result.action, "preview");
  assert.equal(result.countryId, COUNTRY_ID);
});

test("42. rejeita campos adicionais no pedido", () => {
  const code = policyErrorCode(() =>
    parseTeamBatchCreationRequest({
      action: "preview",
      countryId: COUNTRY_ID,
      rows: [validInputRow()],
      actorType: "browser"
    })
  );
  assert.equal(code, "team-batch-creation-request-fields-invalid");
});

test("43. valida pedido apply", () => {
  const result = parseTeamBatchCreationRequest({
    action: "apply",
    countryId: COUNTRY_ID,
    rows: [validInputRow()],
    previewFingerprint: FINGERPRINT,
    confirmedCompleteExistingLines: [1]
  });
  assert.equal(result.action, "apply");
});

test("44. rejeita apply sem fingerprint", () => {
  const code = policyErrorCode(() =>
    parseTeamBatchCreationRequest({
      action: "apply",
      countryId: COUNTRY_ID,
      rows: [validInputRow()],
      confirmedCompleteExistingLines: []
    })
  );
  assert.equal(code, "team-batch-creation-request-fields-invalid");
});

test("45. rejeita confirmações duplicadas", () => {
  const code = policyErrorCode(() =>
    parseTeamBatchCreationRequest({
      action: "apply",
      countryId: COUNTRY_ID,
      rows: [validInputRow()],
      previewFingerprint: FINGERPRINT,
      confirmedCompleteExistingLines: [1, 1]
    })
  );
  assert.equal(code, "team-batch-creation-confirmed-line-duplicate");
});

test("46. rejeita confirmação de linha inexistente", () => {
  const code = policyErrorCode(() =>
    parseTeamBatchCreationRequest({
      action: "apply",
      countryId: COUNTRY_ID,
      rows: [validInputRow()],
      previewFingerprint: FINGERPRINT,
      confirmedCompleteExistingLines: [2]
    })
  );
  assert.equal(code, "team-batch-creation-confirmed-line-missing");
});

test("47. valida resposta RPC de preview", () => {
  const result = validateTeamBatchCreationRpcRows(
    makeRpcBatch(["create"], "preview"),
    previewContext()
  );
  assert.equal(result.ok, true);
});

test("48. valida resposta RPC de apply", () => {
  const result = validateTeamBatchCreationRpcRows(
    makeRpcBatch(["create"], "apply"),
    applyContext()
  );
  assert.equal(result.ok, true);
});

test("49. rejeita estado RPC desconhecido", () => {
  const rows = makeRpcBatch(["create"], "preview") as unknown as Array<Record<string, unknown>>;
  rows[0]!.result_status = "unknown";
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});

test("50. rejeita ação RPC desconhecida", () => {
  const rows = makeRpcBatch(["create"], "preview") as unknown as Array<Record<string, unknown>>;
  rows[0]!.proposed_action = "unknown";
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});

test("51. rejeita UUID inválido no RPC", () => {
  const rows = makeRpcBatch(["create"], "preview") as unknown as Array<Record<string, unknown>>;
  rows[0]!.final_team_id = "not-a-uuid";
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});

test("52. rejeita coluna RPC ausente", () => {
  const rows = makeRpcBatch(["create"], "preview") as unknown as Array<Record<string, unknown>>;
  delete rows[0]!.reason_message;
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});

test("53. rejeita coluna RPC adicional", () => {
  const rows = makeRpcBatch(["create"], "preview") as unknown as Array<Record<string, unknown>>;
  rows[0]!.unexpected = true;
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});

test("54. rejeita totais inconsistentes", () => {
  const rows = makeRpcBatch(["create"], "preview");
  rows[0]!.batch_create_count = 0;
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});

test("55. rejeita fingerprints diferentes entre linhas", () => {
  const rows = makeRpcBatch(["create", "create"], "preview");
  rows[1]!.preview_fingerprint = "v1:abcdef0123456789abcdef0123456789";
  assert.equal(
    validateTeamBatchCreationRpcRows(rows, previewContext([1, 2])).ok,
    false
  );
});

test("56. rejeita line_number duplicado no RPC", () => {
  const rows = makeRpcBatch(["create", "create"], "preview");
  rows[1]!.line_number = 1;
  assert.equal(
    validateTeamBatchCreationRpcRows(rows, previewContext([1, 2])).ok,
    false
  );
});

test("57. considera complete_existing bloqueante no preview", () => {
  const result = validateTeamBatchCreationRpcRows(
    makeRpcBatch(["complete_existing"], "preview"),
    previewContext()
  );
  assert.equal(result.ok && result.summary.blockingCount, 1);
  assert.equal(result.ok && result.summary.canApply, false);
});

test("58. aceita complete_existing confirmado no apply", () => {
  const result = validateTeamBatchCreationRpcRows(
    makeRpcBatch(["complete_existing"], "apply", [1]),
    applyContext([1], [1])
  );
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.summary.completedExistingCount, 1);
});

test("59. aceita resposta conflict coerente", () => {
  const rows = makeRpcBatch(["conflict"], "preview");
  rows[0]!.conflicts = [{ type: "slug", team_id: TEAM_ID_1, value: "clube-1" }];
  const result = validateTeamBatchCreationRpcRows(rows, previewContext());
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.summary.canApply, false);
});

test("60. constrói argumentos funcionais sem metadata ou efeitos laterais", () => {
  const preview = parseTeamBatchCreationRequest({
    action: "preview",
    countryId: COUNTRY_ID,
    rows: [validInputRow()]
  });
  const args = buildTeamBatchCreationRpcArguments(preview);
  assert.deepEqual(Object.keys(args).sort(), [
    "p_apply",
    "p_confirmed_complete_existing_lines",
    "p_confirmed_preview_fingerprint",
    "p_country_id",
    "p_rows"
  ]);
  assert.equal(args.p_apply, false);
});

test("61. rejeita alias redundante com a identidade própria", () => {
  const result = parseTeamBatchCreationText(
    textLine({ aliases: "Clube Atlético Exemplo" })
  );
  assert.ok(result.issues.some((item) => item.code === "alias-redundant-with-identity"));
});

test("62. rejeita BOM fora do início", () => {
  const result = parseTeamBatchCreationText(textLine() + "\n\uFEFF" + textLine({
    canonicalName: "Clube Dois",
    shortName: "CD",
    code: "",
    slug: "clube-dois",
    aliases: ""
  }));
  assert.ok(result.issues.some((item) => item.code === "bom-position-invalid"));
});

test("63. rejeita lineNumber duplicado no pedido", () => {
  const code = policyErrorCode(() =>
    parseTeamBatchCreationRequest({
      action: "preview",
      countryId: COUNTRY_ID,
      rows: [
        validInputRow(),
        validInputRow({
          canonicalName: "Clube Dois",
          shortName: "CD",
          code: null,
          slug: "clube-dois",
          lineNumber: 1
        })
      ]
    })
  );
  assert.equal(code, "team-batch-creation-line-number-duplicate");
});

test("64. rejeita alias normalizado inválido na resposta RPC", () => {
  const rows = makeRpcBatch(["create"], "preview");
  rows[0]!.normalized_aliases = ["Álias"];
  assert.equal(validateTeamBatchCreationRpcRows(rows, previewContext()).ok, false);
});
