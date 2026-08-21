import {
  preflightEditorialArticleBatch,
  type EditorialBatchPreflight,
} from "./editorial-batch-parser";

export type EditorialBatchPublicationPlanLike = Readonly<{
  key: string;
  mode: "create" | "resume" | "update_required" | "update";
  articleId?: string;
}>;

type EditorialBatchPublicationPreflightResponse<TPlan> = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  items?: readonly TPlan[];
}>;

export async function requestEditorialBatchPublicationPreflight<TPlan>({
  route,
  matchdayId,
  author,
  articles,
  sourcePackage,
  confirmedUpdates,
  signal,
  fetcher = fetch,
}: Readonly<{
  route: string;
  matchdayId: string;
  author: string;
  articles: readonly unknown[];
  sourcePackage?: unknown;
  confirmedUpdates: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}>) {
  const response = await fetcher(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      action: "preflight",
      matchdayId,
      author: author.trim(),
      articles,
      ...(sourcePackage ? { sourcePackage } : {}),
      ...(Object.keys(confirmedUpdates).length > 0
        ? { confirmedUpdates }
        : {}),
    }),
  });
  const payload = await response.json().catch(() => null) as
    | EditorialBatchPublicationPreflightResponse<TPlan>
    | null;

  if (!response.ok || !payload?.ok || !payload.items) {
    const message = payload?.detail?.trim()
      || payload?.error?.trim()
      || "A verificação final da publicação falhou.";
    throw new Error(message);
  }

  return payload.items;
}

type AnalyseEditorialBatchCallbacks<TPlan> = Readonly<{
  onLocalPreflight: (preflight: EditorialBatchPreflight) => void;
  onServerPreflightSkipped: (message: string) => void;
  onServerPreflightStarted: () => void;
  requestServerPreflight: (
    preflight: EditorialBatchPreflight,
  ) => Promise<readonly TPlan[]>;
  onServerPreflightSucceeded: (plan: readonly TPlan[]) => void;
  onServerPreflightFailed: (message: string) => void;
  onServerPreflightFinished: () => void;
}>;

export async function analyseEditorialBatchForPublication<TPlan>({
  articleText,
  contextComplete,
  imagesReady,
  matchdayId,
  author,
  callbacks,
}: Readonly<{
  articleText: string;
  contextComplete: boolean;
  imagesReady: boolean;
  matchdayId: string;
  author: string;
  callbacks: AnalyseEditorialBatchCallbacks<TPlan>;
}>) {
  const preflight = preflightEditorialArticleBatch(articleText);
  callbacks.onLocalPreflight(preflight);

  if (!preflight.ready) {
    callbacks.onServerPreflightSkipped(
      "Corrige os problemas do lote antes da verificação editorial final.",
    );
    return { preflight, serverPreflightRequested: false } as const;
  }

  if (!contextComplete || !matchdayId.trim()) {
    callbacks.onServerPreflightSkipped(
      "Completa Competição, Época e Jornada antes da verificação editorial final.",
    );
    return { preflight, serverPreflightRequested: false } as const;
  }

  if (!author.trim()) {
    callbacks.onServerPreflightSkipped(
      "Indica o autor antes da verificação editorial final.",
    );
    return { preflight, serverPreflightRequested: false } as const;
  }

  if (!imagesReady) {
    callbacks.onServerPreflightSkipped(
      "Seleciona uma imagem válida por artigo antes da verificação editorial final.",
    );
    return { preflight, serverPreflightRequested: false } as const;
  }

  callbacks.onServerPreflightStarted();

  try {
    const plan = await callbacks.requestServerPreflight(preflight);
    callbacks.onServerPreflightSucceeded(plan);
    return { preflight, serverPreflightRequested: true, plan } as const;
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "A verificação editorial final do lote falhou.";
    callbacks.onServerPreflightFailed(message);
    return { preflight, serverPreflightRequested: true, error: message } as const;
  } finally {
    callbacks.onServerPreflightFinished();
  }
}

type EditorialBatchPublicationFingerprintImage = Readonly<{
  name: string;
  size: number;
  type: string;
  lastModified: number;
}>;

export function editorialBatchPublicationFingerprint({
  articleText,
  competitionId,
  seasonId,
  matchdayId,
  author,
  images,
  sourcePackage,
}: Readonly<{
  articleText: string;
  competitionId: string;
  seasonId: string;
  matchdayId: string;
  author: string;
  images: readonly EditorialBatchPublicationFingerprintImage[];
  sourcePackage: unknown;
}>) {
  return JSON.stringify({
    articleText,
    competitionId,
    seasonId,
    matchdayId,
    author: author.trim(),
    images: images.map((image) => ({
      name: image.name,
      size: image.size,
      type: image.type,
      lastModified: image.lastModified,
    })),
    sourcePackage: sourcePackage ?? null,
  });
}

export function shouldRequestAutomaticEditorialBatchPreflight({
  ready,
  fingerprint,
  lastRequestedFingerprint,
  activeFingerprint,
}: Readonly<{
  ready: boolean;
  fingerprint: string;
  lastRequestedFingerprint: string | null;
  activeFingerprint: string | null;
}>) {
  return ready
    && fingerprint !== lastRequestedFingerprint
    && fingerprint !== activeFingerprint;
}

export function isEditorialBatchPreflightResponseCurrent({
  requestId,
  fingerprint,
  currentRequestId,
  currentFingerprint,
}: Readonly<{
  requestId: number;
  fingerprint: string;
  currentRequestId: number;
  currentFingerprint: string;
}>) {
  return requestId === currentRequestId
    && fingerprint === currentFingerprint;
}

export function editorialBatchPublicationUiState<
  TPlan extends EditorialBatchPublicationPlanLike,
>({
  plan,
  confirmedUpdates,
  canPublish,
  isChecking,
  isPublishing,
  allPublished,
  hasIncompleteRun,
  hasError,
}: Readonly<{
  plan: readonly TPlan[] | null;
  confirmedUpdates: Readonly<Record<string, string>>;
  canPublish: boolean;
  isChecking: boolean;
  isPublishing: boolean;
  allPublished: boolean;
  hasIncompleteRun: boolean;
  hasError: boolean;
}>) {
  const updateCandidates = (plan ?? []).filter(
    (item) => item.mode === "update_required",
  );
  const hasUpdatePlan = (plan ?? []).some(
    (item) => item.mode === "update_required" || item.mode === "update",
  );
  const hasCreateOrResumePlan = (plan ?? []).some(
    (item) => item.mode === "create" || item.mode === "resume",
  );
  const updatesConfirmed = updateCandidates.length === 0
    || updateCandidates.every(
      (item) => Boolean(
        item.articleId && confirmedUpdates[item.key] === item.articleId,
      ),
    );

  const statusLabel = allPublished
    ? "LOTE PUBLICADO"
    : isPublishing
      ? "PUBLICAÇÃO EM CURSO"
      : isChecking
        ? "A verificar destino editorial…"
        : hasError && !plan
          ? "Não foi possível verificar o destino editorial"
          : hasUpdatePlan
            ? updatesConfirmed
              ? "ATUALIZAÇÃO CONFIRMADA"
              : "ATUALIZAÇÃO DETETADA"
            : plan
              ? plan.length === 1
                ? "NOVO ARTIGO"
                : "DESTINOS EDITORIAIS VERIFICADOS"
              : "A verificar destino editorial…";

  const actionLabel: string | null = isPublishing
    ? "A PUBLICAR…"
    : isChecking || allPublished || !plan || !canPublish || !updatesConfirmed
      ? null
      : hasIncompleteRun
        ? "RETOMAR PUBLICAÇÃO"
        : hasUpdatePlan && hasCreateOrResumePlan
          ? "PUBLICAR E ATUALIZAR"
          : hasUpdatePlan
            ? "ATUALIZAR ARTIGO"
            : "PUBLICAR EM ÚLTIMAS";

  const statusTone = allPublished || Boolean(plan && canPublish && updatesConfirmed)
    ? "success"
    : hasError
      ? "error"
      : hasUpdatePlan && !updatesConfirmed
        ? "warning"
        : "neutral";

  return {
    updateCandidates,
    hasUpdatePlan,
    hasCreateOrResumePlan,
    updatesConfirmed,
    statusLabel,
    statusTone,
    actionLabel,
    showRetry: hasError && !plan && !isChecking,
    ready: allPublished || Boolean(plan && canPublish && updatesConfirmed),
  } as const;
}
