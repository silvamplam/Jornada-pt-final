export const SOURCE_OPERATIONAL_STATUSES = [
  "active",
  "paused",
  "legal_hold",
  "degraded",
  "disabled",
] as const;

export type SourceOperationalStatus = (typeof SOURCE_OPERATIONAL_STATUSES)[number];

export type SourceRegistryEntry = Readonly<{
  code: string;
  name: string;
  homepage: string;
  adapterKey: string;
  operationalStatus: SourceOperationalStatus;
  monitoringEnabled: boolean;
  legalNote: string | null;
  editorialNote: string;
  displayOrder: number;
}>;

const sourceRegistry = [
  {
    code: "record",
    name: "Record",
    homepage: "https://www.record.pt/",
    adapterKey: "record",
    operationalStatus: "paused",
    monitoringEnabled: false,
    legalNote: null,
    editorialNote: "Preparado para futura ativação.",
    displayOrder: 10,
  },
  {
    code: "abola",
    name: "A Bola",
    homepage: "https://www.abola.pt/",
    adapterKey: "abola",
    operationalStatus: "paused",
    monitoringEnabled: false,
    legalNote: null,
    editorialNote: "Preparado para futura ativação.",
    displayOrder: 20,
  },
  {
    code: "maisfutebol",
    name: "Maisfutebol",
    homepage: "https://maisfutebol.iol.pt/",
    adapterKey: "maisfutebol",
    operationalStatus: "paused",
    monitoringEnabled: false,
    legalNote: null,
    editorialNote: "Preparado para futura ativação.",
    displayOrder: 30,
  },
  {
    code: "ojogo",
    name: "O Jogo",
    homepage: "https://www.ojogo.pt/",
    adapterKey: "ojogo",
    operationalStatus: "legal_hold",
    monitoringEnabled: false,
    legalNote: "Monitorização inativa até validação jurídica ou licenciamento.",
    editorialNote: "Aguardará validação jurídica antes de qualquer ativação.",
    displayOrder: 40,
  },
] as const satisfies readonly SourceRegistryEntry[];

export function listRegisteredSources(): SourceRegistryEntry[] {
  return [...sourceRegistry].sort((first, second) => first.displayOrder - second.displayOrder);
}
