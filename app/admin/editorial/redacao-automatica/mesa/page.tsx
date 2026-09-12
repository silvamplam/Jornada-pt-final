import Link from "next/link";

import { isArticleClassificationKey, type ArticleClassificationKey } from "@/lib/editorial-classifications";
import {
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_SOURCE_LABEL,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import {
  loadOperationalDeskReadModel,
  MESA_OPERATIONAL_CLASSIFICATION_CONTEXT,
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
  type OperationalDeskClassificationCounts,
  type OperationalDeskSourceCounts,
  type OperationalDeskSourceItem,
  type OperationalDeskSourceLifecycle,
  type OperationalDeskReadModelResult,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

import {
  MESA_CLASSIFICATION_OPTIONS,
  classificationLabel,
  mesaHref,
  mesaOperationalReadModelInput,
  parseMesaQuery,
  type MesaClassificationValue,
  type MesaQuery,
  type MesaSearchParams,
} from "./_mesa-query";
import {
  MesaClassificationEditor,
  MesaLiveCount,
  MesaOperationalSourceRow,
  MesaSelectionProvider,
  MesaSelectionToggle,
  MesaSelectionTray,
} from "./_mesa-selection-client";
import type { MesaMaterialSelection } from "./_mesa-selection-state";
import { MesaSourceItem } from "./_mesa-source-item";
import { MesaSourceWindow, MesaOrganizationPanel, MesaLooseSourcesPanel } from "./_mesa-organization-client";
import { loadMesaOrganization } from "@/lib/redacao-automatica/newsroom-mesa-organization";
import { sourceIsUnassigned, filterMesaOrganization, type MesaOrganization } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import styles from "./mesa.module.css";

export const dynamic = "force-dynamic";

type MesaPageProps = Readonly<{
  searchParams?: Promise<MesaSearchParams>;
}>;

const classificationSourceLabels = {
  automatic: "Automática",
  manual: "Manual",
} as const;

const errorCopy = {
  invalid_request: {
    title: "Pedido inválido",
    body: "Os filtros recebidos não formam um pedido válido para a Mesa da Redação.",
  },
  not_configured: {
    title: "Mesa não configurada",
    body: "A leitura administrativa necessária para abrir a Mesa não está configurada neste ambiente.",
  },
  relation_invalid: {
    title: "Dados editoriais inconsistentes",
    body: "Foi encontrada uma relação persistida inválida. A Mesa não ocultou o problema como uma coleção vazia.",
  },
  read_unavailable: {
    title: "Leitura indisponível",
    body: "Não foi possível ler a Mesa da Redação neste momento.",
  },
} as const;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isoAt(hoursAgo: number): string {
  return new Date(Date.now() - (hoursAgo * 60 * 60 * 1000)).toISOString();
}

function fixtureImage(label: string, start: string, end: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="90" viewBox="0 0 140 90"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="140" height="90" fill="url(#g)"/><circle cx="112" cy="17" r="28" fill="rgba(255,255,255,.13)"/><text x="10" y="73" fill="white" font-family="Arial,sans-serif" font-size="24" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(date);
}

function sumVisibleCount(
  counts: OperationalDeskSourceCounts | null,
  classification: MesaClassificationValue,
  lifecycle: "new" | "published",
): number {
  if (!counts) return 0;
  const universe = lifecycle === "published" ? counts.publicadas : counts.novas;
  if (classification === "all") return universe.total;
  if (classification === "unclassified") return universe.unclassified;
  return universe[classification];
}

function fixtureClassification(
  classification: ArticleClassificationKey | "unclassified",
  source: "automatic" | "manual",
  at: string,
) {
  if (classification === "unclassified") {
    return {
      status: "unclassified" as const,
      classificationKey: null as null,
      classificationSource: null,
      classifiedAt: null,
      updatedAt: null,
    };
  }
  return {
    status: "classified" as const,
    classificationKey: classification,
    classificationSource: source,
    classifiedAt: at,
    updatedAt: at,
  };
}

type FixtureLifecycle = OperationalDeskSourceLifecycle;
type FixtureContribution = NonNullable<OperationalDeskSourceItem["publishedContributions"]>[number];

type FixtureSeed = Readonly<{
  lifecycle: FixtureLifecycle;
  sourceCode: string;
  sourceName: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  imageCandidateUrl: string | null;
  publishedAtHours: number | null;
  firstDetectedHours: number;
  lastDetectedHours: number;
  snapshotHours: number | null;
  classification: ArticleClassificationKey | "unclassified";
  classificationSource: "automatic" | "manual";
  sourceUpdated: boolean;
  themeIds?: readonly string[];
  publishedContribution?: Readonly<{
    origin: "dossier_plan" | "legacy_source_package";
    editorialArticleId: string;
    title: string;
    slug: string;
    dossierTitle?: string;
    packageId?: string;
    usedAtHours?: number;
  }>;
}>;

const FIXTURE_PUBLIC_ARTICLE_IDS = [
  "8dd0a4d3-5f35-4df4-85bc-5bf6e9f3f8a1",
  "1f7c4f18-4f7f-4a7c-8a6e-f6b9f8dfb5c2",
  "5ab7dcbf-8f9e-4a6f-a7f6-3d91f8c2c8c1",
  "d1d8e1f3-6ab4-4f9e-98a7-9e7c5f6aef3d",
];

const FIXTURE_SEEDS: readonly FixtureSeed[] = [
  {
    lifecycle: "new",
    sourceCode: "a-bola",
    sourceName: "A Bola",
    title: "Benfica avança no campeonato com vitória apertada",
    subtitle: "Notícia de atualização rápida no quadro de competição local.",
    summary: "Resumo curto de apoio editorial para leitura de contexto imediato.",
    imageCandidateUrl: fixtureImage("SLB", "#8f1226", "#d84b45"),
    publishedAtHours: 36,
    firstDetectedHours: 80,
    lastDetectedHours: 4,
    snapshotHours: 4,
    classification: "benfica",
    classificationSource: "automatic",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "o-jogo",
    sourceName: "O Jogo",
    title: "Sporting estreia com jovem na equipa principal para partida de amanhã",
    subtitle: "Material com múltiplas fontes confirmando alinhamento técnico.",
    summary: "Entrada pronta para ser trabalhada em produção.",
    imageCandidateUrl: null,
    publishedAtHours: null,
    firstDetectedHours: 95,
    lastDetectedHours: 3,
    snapshotHours: 3,
    classification: "sporting",
    classificationSource: "manual",
    sourceUpdated: false,
    themeIds: ["b11111111-1111-4a1b-8123-111111111111"],
  },
  {
    lifecycle: "new",
    sourceCode: "record",
    sourceName: "Record",
    title: "FC Porto reforça setor de jogo aéreo em treino de alta carga",
    subtitle: null,
    summary: "Sem URL pública neste registo inicial da mesa.",
    imageCandidateUrl: fixtureImage("FCP", "#0e4d83", "#2c8ebd"),
    publishedAtHours: 50,
    firstDetectedHours: 102,
    lastDetectedHours: 2,
    snapshotHours: null,
    classification: "fc_porto",
    classificationSource: "automatic",
    sourceUpdated: true,
  },
  {
    lifecycle: "new",
    sourceCode: "cm",
    sourceName: "Canal Mais",
    title: "Análise tática de conjunto para cenário de tabela em confronto da taça",
    subtitle: "Matéria longa com detalhes de jogo e contexto de campeonato.",
    summary: "Texto extenso para avaliação de densidade visual em composição local.",
    imageCandidateUrl: fixtureImage("LIGA", "#284b35", "#86a54d"),
    publishedAtHours: 70,
    firstDetectedHours: 112,
    lastDetectedHours: 6,
    snapshotHours: 6,
    classification: "other_liga_clubs",
    classificationSource: "automatic",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "dn",
    sourceName: "Diário de Notícias",
    title: "Lesão em treino gera dúvidas sobre disponibilidade de jogador-chave",
    subtitle: "Classificação ainda por confirmar para evitar decisão automática",
    summary: null,
    imageCandidateUrl: null,
    publishedAtHours: null,
    firstDetectedHours: 140,
    lastDetectedHours: 6,
    snapshotHours: 6,
    classification: "unclassified",
    classificationSource: "manual",
    sourceUpdated: false,
    themeIds: ["b22222222-2222-4a1b-8123-222222222222"],
  },
  {
    lifecycle: "new",
    sourceCode: "a-bola",
    sourceName: "A Bola",
    title: "Mercado de verão: clube define lista curta para reforços",
    subtitle: "Entrada com resumo longo e título extenso para verificar quebra de linha.",
    summary: "Notícia de referência com risco de atualização constante.",
    imageCandidateUrl: fixtureImage("MERC.", "#3f5267", "#8190a3"),
    publishedAtHours: 41,
    firstDetectedHours: 390,
    lastDetectedHours: 18,
    snapshotHours: null,
    classification: "fc_porto",
    classificationSource: "manual",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "o-jogo",
    sourceName: "O Jogo",
    title: "Confronto em preparação após semanas de polémica no balneário",
    subtitle: "Notícia mais longa para simular densidade do painel.",
    summary: "Texto de apoio para contexto editorial.",
    imageCandidateUrl: null,
    publishedAtHours: null,
    firstDetectedHours: 420,
    lastDetectedHours: 20,
    snapshotHours: 20,
    classification: "other_liga_clubs",
    classificationSource: "automatic",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "dn",
    sourceName: "Diário de Notícias",
    title: "Desempenho irregular levanta discussão nos bastidores técnicos",
    subtitle: "Matéria com assinatura de contexto e poucas informações visuais.",
    summary: "Sem imagem para confirmar rapidamente o enquadramento visual.",
    imageCandidateUrl: null,
    publishedAtHours: 51,
    firstDetectedHours: 450,
    lastDetectedHours: 22,
    snapshotHours: 22,
    classification: "outside_liga_other",
    classificationSource: "manual",
    sourceUpdated: true,
    themeIds: ["b33333333-3333-4a1b-8123-333333333333"],
  },
  {
    lifecycle: "new",
    sourceCode: "abola",
    sourceName: "A Bola",
    title: "Leitores reagem a mudanças de treinador em bloco",
    subtitle: "Fonte ainda pode ficar sem snapshot dependendo da ingestão externa.",
    summary: null,
    imageCandidateUrl: fixtureImage("SLB", "#801224", "#c63239"),
    publishedAtHours: null,
    firstDetectedHours: 480,
    lastDetectedHours: 24,
    snapshotHours: 24,
    classification: "benfica",
    classificationSource: "manual",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "observador",
    sourceName: "Observador",
    title: "Seminário de treino e recuperação para peças decisivas do plantel",
    subtitle: "Sem dados completos de imagem; útil para verificar estado incompleto.",
    summary: "Entrada útil para prova de densidade com texto curto.",
    imageCandidateUrl: null,
    publishedAtHours: 61,
    firstDetectedHours: 520,
    lastDetectedHours: 28,
    snapshotHours: 28,
    classification: "outside_liga_other",
    classificationSource: "manual",
    sourceUpdated: true,
  },
  {
    lifecycle: "new",
    sourceCode: "observador",
    sourceName: "Observador",
    title: "Conselho da equipa altera estratégia de finalização",
    subtitle: "Entrada final para completar o volume de notícias Novas.",
    summary: "Não tem URL e pode estar num estado intermédio.",
    imageCandidateUrl: fixtureImage("SCP", "#0c593d", "#49a66f"),
    publishedAtHours: 33,
    firstDetectedHours: 560,
    lastDetectedHours: 30,
    snapshotHours: 30,
    classification: "sporting",
    classificationSource: "automatic",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "record",
    sourceName: "Record",
    title: "Conselho disciplinar adia decisão e deixa dúvida em torno de calendário",
    subtitle: null,
    summary: "Entrada já com fonte confiável e classificação definida.",
    imageCandidateUrl: null,
    publishedAtHours: 73,
    firstDetectedHours: 590,
    lastDetectedHours: 32,
    snapshotHours: 32,
    classification: "fc_porto",
    classificationSource: "manual",
    sourceUpdated: true,
  },
  {
    lifecycle: "new",
    sourceCode: "abola",
    sourceName: "A Bola",
    title: "Apostas de mercado e risco para o próximo bloco tático",
    subtitle: "Fonte curta com informação suficiente para seleção.",
    summary: "Notícia de entrada nova com classificação de Benfica.",
    imageCandidateUrl: fixtureImage("SLB", "#9c1828", "#e35d4e"),
    publishedAtHours: 24,
    firstDetectedHours: 620,
    lastDetectedHours: 34,
    snapshotHours: 34,
    classification: "benfica",
    classificationSource: "automatic",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "jornal",
    sourceName: "Jornal de Notícias",
    title: "Relato de bastidor com mudança de titularidade em treino de domingo",
    subtitle: "Entrada curta e útil para contexto complementar.",
    summary: "Material de apoio para decisões rápidas.",
    imageCandidateUrl: null,
    publishedAtHours: 65,
    firstDetectedHours: 660,
    lastDetectedHours: 36,
    snapshotHours: 36,
    classification: "sporting",
    classificationSource: "manual",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "jogo.pt",
    sourceName: "Jogo.net",
    title: "Confronto físico no final do mês deixa equipa sob vigilância médica",
    subtitle: "Entrada curta e sem imagem para prova de visual denso.",
    summary: "Material ainda precisa de validação de conteúdo em seguida.",
    imageCandidateUrl: null,
    publishedAtHours: 24,
    firstDetectedHours: 700,
    lastDetectedHours: 40,
    snapshotHours: null,
    classification: "sporting",
    classificationSource: "automatic",
    sourceUpdated: true,
  },
  {
    lifecycle: "new",
    sourceCode: "o-jogo",
    sourceName: "O Jogo",
    title: "Concurso de jovens revela nova estrutura de rotação na equipa principal",
    subtitle: "Matéria nova de leitura rápida.",
    summary: null,
    imageCandidateUrl: fixtureImage("FORA", "#493653", "#8c6a91"),
    publishedAtHours: 49,
    firstDetectedHours: 740,
    lastDetectedHours: 42,
    snapshotHours: 42,
    classification: "outside_liga_other",
    classificationSource: "manual",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "cm",
    sourceName: "Canal Mais",
    title: "Relatório técnico do clube com plano de treino para semana decisiva",
    subtitle: "Matéria mais longa para testar títulos de duas linhas no quadro.",
    summary: "Sem URL pública para teste de fallback de informação.",
    imageCandidateUrl: fixtureImage("LIGA", "#62502e", "#ae8a46"),
    publishedAtHours: 73,
    firstDetectedHours: 780,
    lastDetectedHours: 45,
    snapshotHours: 45,
    classification: "other_liga_clubs",
    classificationSource: "automatic",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "jogo.pt",
    sourceName: "Jogo.net",
    title: "Atraso de transporte afeta deslocamento de equipa em deslocação",
    subtitle: "Notícia curta com classificação por completar.",
    summary: "Fonte sem evidência de imagem.",
    imageCandidateUrl: null,
    publishedAtHours: 22,
    firstDetectedHours: 820,
    lastDetectedHours: 47,
    snapshotHours: 47,
    classification: "unclassified",
    classificationSource: "manual",
    sourceUpdated: true,
  },
  {
    lifecycle: "new",
    sourceCode: "a-bola",
    sourceName: "A Bola",
    title: "Aposta local aponta para alteração de abordagem na zona de jogo",
    subtitle: "Entrada nova para completar massa mínima de teste visual.",
    summary: null,
    imageCandidateUrl: fixtureImage("SLB", "#7d1725", "#cf4545"),
    publishedAtHours: 57,
    firstDetectedHours: 860,
    lastDetectedHours: 50,
    snapshotHours: 50,
    classification: "benfica",
    classificationSource: "manual",
    sourceUpdated: false,
  },
  {
    lifecycle: "new",
    sourceCode: "record",
    sourceName: "Record",
    title: "Reação rápida dos bastidores após pausa internacional",
    subtitle: null,
    summary: "Notícia curta e útil no estado do ciclo.",
    imageCandidateUrl: null,
    publishedAtHours: 49,
    firstDetectedHours: 900,
    lastDetectedHours: 52,
    snapshotHours: 52,
    classification: "fc_porto",
    classificationSource: "automatic",
    sourceUpdated: true,
  },
  {
    lifecycle: "new",
    sourceCode: "cm",
    sourceName: "Canal Mais",
    title: "Clima organizacional entre departamentos e decisões de comunicação",
    subtitle: "Fonte operacional nova com potencial de contexto cruzado.",
    summary: "Entrada sem imagem e sem URL direta.",
    imageCandidateUrl: null,
    publishedAtHours: 33,
    firstDetectedHours: 940,
    lastDetectedHours: 54,
    snapshotHours: 54,
    classification: "outside_liga_other",
    classificationSource: "manual",
    sourceUpdated: false,
  },
  {
    lifecycle: "published",
    sourceCode: "record",
    sourceName: "Record",
    title: "FC Porto mantém ritmo com nova sequência de ataques",
    subtitle: "Entrada já contribuiu para texto publicado e entra na caixa de contexto.",
    summary: "Uma das 6 fontes publicadas de referência.",
    imageCandidateUrl: null,
    publishedAtHours: 20,
    firstDetectedHours: 120,
    lastDetectedHours: 8,
    snapshotHours: 8,
    classification: "fc_porto",
    classificationSource: "automatic",
    sourceUpdated: false,
    publishedContribution: {
      origin: "legacy_source_package",
      editorialArticleId: FIXTURE_PUBLIC_ARTICLE_IDS[0],
      title: "FC Porto fecha fase com vitória",
      slug: "porto-vence",
      packageId: "p22222222-2222-4a1f-8f17-222222222222",
      usedAtHours: 2,
    },
  },
  {
    lifecycle: "published",
    sourceCode: "o-jogo",
    sourceName: "O Jogo",
    title: "Sporting recupera ponto em jogo duro e mantém pressão",
    subtitle: "Publicada e reutilizável como contexto.",
    summary: "Fonte consolidada para seleção de produção.",
    imageCandidateUrl: fixtureImage("SCP", "#105842", "#4b9a72"),
    publishedAtHours: 18,
    firstDetectedHours: 160,
    lastDetectedHours: 9,
    snapshotHours: 9,
    classification: "sporting",
    classificationSource: "manual",
    sourceUpdated: false,
    themeIds: ["b77777777-7777-4a1b-8123-777777777777"],
    publishedContribution: {
      origin: "dossier_plan",
      editorialArticleId: FIXTURE_PUBLIC_ARTICLE_IDS[1],
      title: "Sporting pressiona no fim de jogo",
      slug: "sporting-pressao",
      dossierTitle: "Dossiê Sporting",
    },
  },
  {
    lifecycle: "published",
    sourceCode: "a-bola",
    sourceName: "A Bola",
    title: "Análise pós-jogo confirma protagonismo tático em nova fase",
    subtitle: "Contribuição consolidada para texto publicado já no ciclo atual.",
    summary: null,
    imageCandidateUrl: fixtureImage("SLB", "#821321", "#d84f49"),
    publishedAtHours: 15,
    firstDetectedHours: 200,
    lastDetectedHours: 10,
    snapshotHours: 10,
    classification: "benfica",
    classificationSource: "automatic",
    sourceUpdated: false,
    themeIds: ["b66666666-6666-4a1b-8123-666666666666"],
    publishedContribution: {
      origin: "dossier_plan",
      editorialArticleId: FIXTURE_PUBLIC_ARTICLE_IDS[2],
      title: "Benfica vira no dérbi",
      slug: "benfica-vira",
      dossierTitle: "Dossiê derbis",
    },
  },
  {
    lifecycle: "published",
    sourceCode: "jornal",
    sourceName: "Jornal de Notícias",
    title: "Crónica de bastidores abre nova fase para o elenco principal",
    subtitle: "Publicação integrada e reutilizável para contexto cruzado.",
    summary: "Entrada de publicação para compor painel de referencia.",
    imageCandidateUrl: fixtureImage("LIGA", "#364f5d", "#72969a"),
    publishedAtHours: 10,
    firstDetectedHours: 240,
    lastDetectedHours: 11,
    snapshotHours: 11,
    classification: "other_liga_clubs",
    classificationSource: "manual",
    sourceUpdated: true,
    publishedContribution: {
      origin: "legacy_source_package",
      editorialArticleId: FIXTURE_PUBLIC_ARTICLE_IDS[3],
      title: "Crise no Derby local",
      slug: "derby-local",
      packageId: "p33333333-3333-4a1f-8f17-333333333333",
      usedAtHours: 1,
    },
  },
  {
    lifecycle: "published",
    sourceCode: "dn",
    sourceName: "Diário de Notícias",
    title: "Clima tático no fim de semana já ganhou cobertura integral",
    subtitle: "Notícia publicável e já reutilizada no ciclo atual.",
    summary: "Entrada publicada para completar o bloco de seis.",
    imageCandidateUrl: null,
    publishedAtHours: 7,
    firstDetectedHours: 300,
    lastDetectedHours: 12,
    snapshotHours: 12,
    classification: "sporting",
    classificationSource: "automatic",
    sourceUpdated: true,
    publishedContribution: {
      origin: "legacy_source_package",
      editorialArticleId: FIXTURE_PUBLIC_ARTICLE_IDS[0],
      title: "Finais do dia",
      slug: "finais-do-dia",
      packageId: "p44444444-4444-4a1f-8f17-444444444444",
      usedAtHours: 1,
    },
  },
  {
    lifecycle: "published",
    sourceCode: "cm",
    sourceName: "Canal Mais",
    title: "Derby tático em análise: decisão editorial já materializada",
    subtitle: "Fonte de contexto final para o grupo visual completo.",
    summary: null,
    imageCandidateUrl: fixtureImage("FORA", "#40364d", "#876c92"),
    publishedAtHours: 14,
    firstDetectedHours: 360,
    lastDetectedHours: 13,
    snapshotHours: 13,
    classification: "outside_liga_other",
    classificationSource: "manual",
    sourceUpdated: false,
    publishedContribution: {
      origin: "dossier_plan",
      editorialArticleId: FIXTURE_PUBLIC_ARTICLE_IDS[2],
      title: "Decisões em foco",
      slug: "decisoes-em-foco",
      dossierTitle: "Dossiê de Bastidores",
    },
  },
];

function fixtureUuid(prefix: "a" | "b" | "c" | "d" | "e" | "f", index: number): string {
  const compact = index.toString(16).padStart(7, "0");
  return `${prefix}${compact}-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function buildFixtureContribution(
  seed: FixtureSeed,
  index: number,
): ReadonlyArray<FixtureContribution> {
  if (!seed.publishedContribution) return [];
  const publishedAt = isoAt(seed.publishedContribution.usedAtHours ?? seed.publishedAtHours ?? 0);
  if (seed.publishedContribution.origin === "dossier_plan") {
    return [{
      origin: "dossier_plan",
      editorialArticleId: seed.publishedContribution.editorialArticleId,
      slug: seed.publishedContribution.slug,
      title: seed.publishedContribution.title,
      publishedAt,
      dossierId: fixtureUuid("d", index + 1),
      dossierTitle: seed.publishedContribution.dossierTitle ?? "Dossiê operacional",
      articlePlanId: fixtureUuid("c", index + 1),
      dossierSourceId: fixtureUuid("b", index + 1),
      newsroomSnapshotId: fixtureUuid("e", index + 1),
    }];
  }
  return [{
    origin: "legacy_source_package",
    editorialArticleId: seed.publishedContribution.editorialArticleId,
    slug: seed.publishedContribution.slug,
    title: seed.publishedContribution.title,
    publishedAt,
    packageId: seed.publishedContribution.packageId ?? fixtureUuid("a", index + 1),
    usedAt: publishedAt,
    newsroomSnapshotId: fixtureUuid("e", index + 1),
  }];
}

function buildFixtureSources(): readonly OperationalDeskSourceItem[] {
  return FIXTURE_SEEDS.map((seed, index) => {
    const snapshotId = fixtureUuid("e", index + 1);
    const articleId = fixtureUuid("f", index + 1);
    return {
      lifecycle: seed.lifecycle,
      newsroomArticleId: articleId,
      sourceCode: seed.sourceCode,
      sourceName: seed.sourceName,
      url: `https://exemplo.pt/${seed.sourceCode}/${index}`,
      title: seed.title,
      subtitle: seed.subtitle,
      summary: seed.summary,
      imageCandidateUrl: seed.imageCandidateUrl,
      publishedAt: seed.publishedAtHours === null ? null : isoAt(seed.publishedAtHours),
      firstDetectedAt: isoAt(seed.firstDetectedHours),
      lastDetectedAt: isoAt(seed.lastDetectedHours),
      snapshot: seed.snapshotHours === null ? null : {
        id: snapshotId,
        contentHash: `${snapshotId}-hash`,
        body: [{ type: "paragraph", text: "Sinopse curta para validação da linha editorial." }],
        extractedAt: isoAt(seed.snapshotHours),
        createdAt: isoAt(seed.snapshotHours + 0.5),
        sourceMetadata: {},
      },
      classification: fixtureClassification(seed.classification, seed.classificationSource, isoAt(seed.snapshotHours ?? seed.lastDetectedHours)),
      themeMembership: {
        status: seed.themeIds && seed.themeIds.length > 0 ? "associated" : "none",
        themeIds: [...(seed.themeIds ?? [])],
      },
      publishedContributions: buildFixtureContribution(seed, index),
      sourceUpdated: seed.sourceUpdated,
    };
  });
}

const FIXTURE_SOURCES = buildFixtureSources();

function fixtureMaterial(item: OperationalDeskSourceItem): MesaMaterialSelection {
  const usableSnapshot = item.snapshot && item.snapshot.body.some(
    (block) => block.text.trim().length > 0,
  ) ? item.snapshot : null;
  return {
    kind: "source",
    lifecycle: item.lifecycle,
    newsroomArticleId: item.newsroomArticleId,
    newsroomSnapshotId: usableSnapshot?.id ?? null,
    classificationKey: item.classification.status === "classified"
      ? item.classification.classificationKey
      : null,
    title: item.title,
    sourceLabel: item.sourceName ?? item.sourceCode,
    imageUrl: item.imageCandidateUrl,
  };
}

const FIXTURE_INITIAL_SELECTION = [0, 2, 4, 21]
  .map((index) => FIXTURE_SOURCES[index])
  .filter((item): item is OperationalDeskSourceItem => Boolean(item))
  .map(fixtureMaterial);

function presentationHref(
  query: MesaQuery,
  update: Parameters<typeof mesaHref>[1],
  fixtureMode: boolean,
): string {
  const href = mesaHref(query, update);
  return fixtureMode ? `${href}&fixture=visual` : href;
}

function matchesClassificationFilter(
  item: OperationalDeskSourceItem,
  filter: MesaQuery["classification"],
) {
  if (filter.mode === "all") return true;
  if (filter.mode === "unclassified") return item.classification.status === "unclassified";
  return item.classification.status === "classified"
    && item.classification.classificationKey === filter.classificationKey;
}

function matchesSourceFilter(item: OperationalDeskSourceItem, sourceCode: string | null) {
  return !sourceCode || item.sourceCode === sourceCode;
}

function countFor(items: readonly OperationalDeskSourceItem[]): OperationalDeskClassificationCounts {
  const counts: {
    total: number;
    benfica: number;
    sporting: number;
    fc_porto: number;
    other_liga_clubs: number;
    outside_liga_other: number;
    unclassified: number;
  } = {
    total: 0,
    benfica: 0,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 0,
  };

  for (const item of items) {
    counts.total += 1;
    if (item.classification.status === "unclassified") {
      counts.unclassified += 1;
      continue;
    }
    if (isArticleClassificationKey(item.classification.classificationKey)) {
      counts[item.classification.classificationKey] += 1;
    }
  }

  return counts;
}

function paginateFixture<T>(
  items: readonly T[],
  input: { limit: number; offset: number },
) {
  return {
    items: items.slice(input.offset, input.offset + input.limit),
    pagination: {
      limit: input.limit,
      offset: input.offset,
      hasNextPage: items.length > input.offset + input.limit,
    },
  };
}

function createMesaFixtureReadModel(query: MesaQuery): OperationalDeskReadModelResult {
  const limit = 24;
  const offset = (query.page - 1) * limit;
  const filtered = FIXTURE_SOURCES.filter((item) => (
    matchesClassificationFilter(item, query.classification)
    && matchesSourceFilter(item, query.sourceCode)
  ));
  const novas = filtered.filter(sourceIsUnassigned);
  const publicadas = filtered.filter((item) => item.lifecycle === "published");
  return {
    ok: true,
    value: {
      cycleStartedAt: MESA_OPERATIONAL_CYCLE_STARTED_AT,
      classification: query.classification,
      sources: filtered,
      counts: {
        novas: countFor(FIXTURE_SOURCES.filter((item) => (
          sourceIsUnassigned(item)
          && matchesSourceFilter(item, query.sourceCode)
        ))),
        publicadas: countFor(FIXTURE_SOURCES.filter((item) => (
          item.lifecycle === "published"
          && matchesSourceFilter(item, query.sourceCode)
        ))),
      },
      novas: paginateFixture(novas, { limit, offset }),
      publicadas: paginateFixture(publicadas, { limit, offset }),
    },
  };
}

function formatSourceLabel(item: OperationalDeskSourceItem): string {
  return item.sourceName ?? item.sourceCode;
}

function ReadError({ code }: Readonly<{ code: keyof typeof errorCopy }>) {
  const copy = errorCopy[code];
  return (
    <section className={styles.errorState} role="alert">
      <p>Mesa da Redação</p>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <Link href="/admin/editorial/redacao-automatica/mesa?tab=novas&classification=all">
        Reabrir a Mesa
      </Link>
    </section>
  );
}

export default async function EditorialDeskPage({ searchParams }: MesaPageProps) {
  const parsed = parseMesaQuery((await searchParams) ?? {});
  if (!parsed.ok) {
    return (
      <main className={styles.shell}>
        <div className={styles.container}><ReadError code="invalid_request" /></div>
      </main>
    );
  }

  const query = parsed.value;
  const queryParams = (await searchParams) as Record<string, string | string[] | undefined> | undefined;
  const isFixture = process.env.NODE_ENV !== "production"
    && firstValue(queryParams?.fixture) === "visual";

  const sourceResult = isFixture
    ? createMesaFixtureReadModel(query)
    : await loadOperationalDeskReadModel({ ...mesaOperationalReadModelInput(query) });
  let organization: MesaOrganization = { themes: [], unlinkedDossiers: [] };
  let organizationError = false;
  if (sourceResult.ok) {
    if (isFixture) {
      organization = {
        themes: [{ id: "a0000000-0000-4000-8000-000000000001", title: "Sporting · cobertura do jogo",
          classificationKey: "sporting", status: "open", sourceCount: 6, articleCount: 3, updatedSourceCount: 2,
          dossiers: [{ id: "b0000000-0000-4000-8000-000000000001", kind: "dossier", title: "Crónica, reações e arbitragem",
            themeId: "a0000000-0000-4000-8000-000000000001", status: "completed", sourceCount: 6, articleCount: 3, updatedSourceCount: 2 }] }],
        unlinkedDossiers: [],
      };
    } else {
      try { organization = await loadMesaOrganization(sourceResult.value.sources); }
      catch { organizationError = true; }
    }
  }
  const groupedSourceIds = new Set(organization.groupedSourceIds ?? []);
  const looseNewItems = sourceResult.ok ? sourceResult.value.sources.filter(sourceIsUnassigned) : [];
  const loosePublishedItems = sourceResult.ok ? sourceResult.value.sources.filter((item) => (
    item.lifecycle === "published"
    && item.themeMembership.themeIds.length === 0
    && !groupedSourceIds.has(item.newsroomArticleId)
  )) : [];
  const inboxItems = looseNewItems.filter((item) => matchesClassificationFilter(item, query.classification));
  const publishedItems = loosePublishedItems.filter((item) => matchesClassificationFilter(item, query.classification));

  const sourceOptions = isFixture
    ? [...new Map(FIXTURE_SOURCES.map((item) => [item.sourceCode, {
      code: item.sourceCode,
      name: item.sourceName ?? item.sourceCode,
    }])).values()]
    : [
      ...listRegisteredSources().map((source) => ({ code: source.code, name: source.name })),
      { code: MANUAL_NEWSROOM_SOURCE_CODE, name: MANUAL_NEWSROOM_SOURCE_LABEL },
    ];

  const hasCurrentSource = query.sourceCode
    ? sourceOptions.some((source) => source.code === query.sourceCode)
    : true;
  const counts = sourceResult.ok ? {
    novas: countFor(looseNewItems),
    publicadas: countFor(loosePublishedItems),
  } : null;
  const activeLifecycle = query.tab === "publicadas" ? "published" : "new";

  return (
    <main className={styles.shell} data-fixture={isFixture ? "visual" : undefined}>
      <div className={styles.container}>
        <MesaSelectionProvider
          fixtureMode={isFixture}
          initialSelection={isFixture ? FIXTURE_INITIAL_SELECTION : []}
          themes={organization.themes}
          serverSourceIds={sourceResult.ok ? sourceResult.value.sources.map((source) => source.newsroomArticleId) : []}
        >
          <header className={styles.hero}>
            <div className={styles.heroIdentity}>
              <div>
                <p className={styles.eyebrow}>Redação · quadro operacional</p>
                <h1>Mesa da Redação</h1>
              </div>
              <p className={styles.cycleNote}>
                Ciclo {formatDate(MESA_OPERATIONAL_CYCLE_STARTED_AT)}
                {" · "}
                {MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonLabel}
                {isFixture ? <strong>Fixture visual local · sem writes</strong> : null}
              </p>
            </div>
            <div className={styles.heroOperations}>
              <div className={styles.universeCounter} aria-label="Totais da Mesa">
                <span>
                  <strong>
                    <MesaLiveCount
                      initial={activeLifecycle === "published" ? counts?.publicadas.total ?? 0 : counts?.novas.total ?? 0}
                      lifecycle={activeLifecycle}
                    />
                  </strong>
                  {activeLifecycle === "published" ? "publicadas" : "novas"}
                </span>
                <span>
                  <strong>{organization.themes.length}</strong>
                  temas
                </span>
              </div>
              <nav className={styles.heroLinks} aria-label="Navegação editorial">
                <Link href="/admin/editorial/artigos">Artigos</Link>
                <Link href="/admin/editorial/redacao-automatica">Legacy</Link>
                <Link href="/admin">Backoffice</Link>
              </nav>
            </div>
          </header>

          <section className={styles.workspaceChrome}>
            <section className={styles.controlStrip}>
              <nav className={styles.classificationFilters} aria-label="Classificação transversal">
                {MESA_CLASSIFICATION_OPTIONS.map((option) => (
                  <Link
                    key={option.value}
                    href={presentationHref(query, { classificationValue: option.value, page: 1 }, isFixture)}
                    aria-current={query.classificationValue === option.value ? "true" : undefined}
                    className={query.classificationValue === option.value ? styles.classificationActive : undefined}
                  >
                    <span title={`Contador de fontes ${activeLifecycle === "published" ? "publicadas" : "novas"}`}>{option.label}</span>
                    <MesaLiveCount
                      initial={sumVisibleCount(counts, option.value, activeLifecycle)}
                      lifecycle={activeLifecycle}
                      classificationKey={option.value === "all" ? undefined : option.value}
                    />
                  </Link>
                ))}
              </nav>

              <form method="get" className={styles.sourceFilter}>
                <input type="hidden" name="tab" value={query.tab} />
                <input type="hidden" name="classification" value={query.classificationValue} />
                {isFixture ? <input type="hidden" name="fixture" value="visual" /> : null}
                <label>
                  <span>Fonte</span>
                  <select name="source" defaultValue={query.sourceCode ?? ""}>
                    <option value="">Todas as fontes</option>
                    {!hasCurrentSource && query.sourceCode ? (
                      <option value={query.sourceCode}>{query.sourceCode}</option>
                    ) : null}
                    {[...sourceOptions].map((source) => (
                      <option key={source.code} value={source.code}>{source.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit">Filtrar</button>
                <Link
                  className={styles.themesLink}
                  href="#mesa-organizacao"
                >Temas</Link>
              </form>
            </section>

            <MesaSelectionTray />

            {sourceResult.ok ? (
              <section className={styles.sourcesWorkspace}>
                <MesaLooseSourcesPanel storageKey={`jornada.mesa.fontes.${query.classificationValue}.${query.sourceCode ?? "all"}`}
                  initialTab={activeLifecycle}
                  newHref={mesaHref(query, { tab: "novas", page: 1 })}
                  publishedHref={mesaHref(query, { tab: "publicadas", page: 1 })}
                  newItems={inboxItems.map((item) => <MesaSourceItem key={item.newsroomArticleId} item={item} fixtureMode={isFixture} />)}
                  publishedItems={publishedItems.map((item) => <MesaSourceItem key={item.newsroomArticleId} item={item} fixtureMode={isFixture} allowDiscard={false} />)} />
                {organizationError ? <section className={styles.errorState} role="alert">
                  <h2>Organização indisponível</h2>
                  <p>Não foi possível ler os Temas/Dossiês. Confirma a migration de organização antes de usar esta versão.</p>
                </section> : <MesaOrganizationPanel organization={filterMesaOrganization(organization, query.classificationValue)} fixtureMode={isFixture} />}
              </section>
            ) : (
              <ReadError code={sourceResult.error.code} />
            )}
          </section>
        </MesaSelectionProvider>
      </div>
    </main>
  );
}
