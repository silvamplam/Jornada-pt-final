import type {
  CollectionError,
  OperationResult,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

export { SOURCE_OPERATIONAL_STATUSES } from "@/lib/redacao-automatica/types";
export type { SourceOperationalStatus } from "@/lib/redacao-automatica/types";

export type SourceRegistryEntry = SourceConfiguration;

export type SourceExecutionError = CollectionError &
  Readonly<{
    code: "legal_hold" | "source_inactive";
    stage: "configuration";
  }>;

const sourceRegistry = [
  {
    code: "record",
    name: "Record",
    domain: "record.pt",
    homepage: "https://www.record.pt/",
    adapterKey: "record",
    operationalStatus: "paused",
    monitoringEnabled: false,
    inactiveReason: "Monitorização ainda não ativa.",
    legalNote: null,
    editorialNote: "Preparado para futura ativação.",
    displayOrder: 10,
  },
  {
    code: "abola",
    name: "A Bola",
    domain: "abola.pt",
    homepage: "https://www.abola.pt/",
    adapterKey: "abola",
    operationalStatus: "paused",
    monitoringEnabled: false,
    inactiveReason: "Monitorização ainda não ativa.",
    legalNote: null,
    editorialNote: "Preparado para futura ativação.",
    displayOrder: 20,
  },
  {
    code: "maisfutebol",
    name: "Maisfutebol",
    domain: "maisfutebol.iol.pt",
    homepage: "https://maisfutebol.iol.pt/",
    adapterKey: "maisfutebol",
    operationalStatus: "paused",
    monitoringEnabled: false,
    inactiveReason: "Monitorização ainda não ativa.",
    legalNote: null,
    editorialNote: "Preparado para futura ativação.",
    displayOrder: 30,
  },
  {
    code: "ojogo",
    name: "O Jogo",
    domain: "ojogo.pt",
    homepage: "https://www.ojogo.pt/",
    adapterKey: null,
    operationalStatus: "legal_hold",
    monitoringEnabled: false,
    inactiveReason: "Validação jurídica ou licenciamento pendente.",
    legalNote: "Monitorização inativa até validação jurídica ou licenciamento.",
    editorialNote: "Aguardará validação jurídica antes de qualquer ativação.",
    displayOrder: 40,
  },
] as const satisfies readonly SourceRegistryEntry[];

export function listRegisteredSources(): SourceRegistryEntry[] {
  return [...sourceRegistry].sort((first, second) => first.displayOrder - second.displayOrder);
}

export function findRegisteredSource(code: string): SourceRegistryEntry | null {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    return null;
  }

  return sourceRegistry.find((source) => source.code === normalizedCode) ?? null;
}

function sourceExecutionError(
  source: SourceConfiguration,
  code: SourceExecutionError["code"],
): SourceExecutionError {
  return {
    code,
    stage: "configuration",
    sourceCode: source.code,
    url: null,
    recoverable: code !== "legal_hold",
    detail: source.legalNote ?? source.inactiveReason ?? source.editorialNote,
  };
}

export function evaluateSourceExecution(
  source: SourceConfiguration,
): OperationResult<SourceConfiguration, SourceExecutionError> {
  if (source.operationalStatus === "legal_hold") {
    return { ok: false, error: sourceExecutionError(source, "legal_hold") };
  }

  const adapterKey = source.adapterKey?.trim();
  if (!source.monitoringEnabled || source.operationalStatus !== "active" || !adapterKey) {
    return { ok: false, error: sourceExecutionError(source, "source_inactive") };
  }

  return { ok: true, value: source };
}
