import type { EditorialBatchTransferSourcePackage } from "@/lib/redacao-automatica/editorial-batch-transfer";

const WORKSPACE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/workspace";

export type PreparedSourcePackage = Readonly<{
  contentUrl: string;
  imagesUrl: string;
  imagesFileName: string;
  imageSourceCount: number;
  articleCount: number;
  genreLabel: string;
  sourcePackage: EditorialBatchTransferSourcePackage;
}>;

export type ReadyProductionPackage<T> = Readonly<{
  sourcePackage: T;
  text: string;
}>;

export type ProductionPackageState<T> =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "preparing" }>
  | Readonly<{ kind: "ready"; value: ReadyProductionPackage<T> }>
  | Readonly<{ kind: "error"; message: string }>;

export async function loadProductionPackage(
  dossierId: string,
  fetcher: typeof fetch = fetch,
): Promise<ReadyProductionPackage<PreparedSourcePackage>> {
  const response = await fetcher(WORKSPACE_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare_source_package", dossierId }),
  });
  const result = await response.json().catch(() => null) as
    (Partial<PreparedSourcePackage> & { ok?: boolean; message?: string }) | null;
  if (
    !response.ok
    || !result?.ok
    || !result.contentUrl
    || !result.imagesUrl
    || !result.imagesFileName
    || !result.sourcePackage
    || typeof result.articleCount !== "number"
    || typeof result.imageSourceCount !== "number"
    || !result.genreLabel
  ) {
    throw new Error(result?.message || "Não foi possível preparar o pacote editorial.");
  }
  const sourcePackage: PreparedSourcePackage = {
    contentUrl: result.contentUrl,
    imagesUrl: result.imagesUrl,
    imagesFileName: result.imagesFileName,
    imageSourceCount: result.imageSourceCount,
    articleCount: result.articleCount,
    genreLabel: result.genreLabel,
    sourcePackage: result.sourcePackage,
  };
  const contentResponse = await fetcher(sourcePackage.contentUrl, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!contentResponse.ok) {
    throw new Error("Não foi possível obter o texto do pacote editorial.");
  }
  return { sourcePackage, text: await contentResponse.text() };
}

export class ProductionPackagePreparation<T> {
  private state: ProductionPackageState<T> = { kind: "idle" };
  private generation = 0;
  private pending: Promise<ReadyProductionPackage<T>> | null = null;
  private readonly listeners = new Set<(state: ProductionPackageState<T>) => void>();

  constructor(private readonly load: () => Promise<ReadyProductionPackage<T>>) {}

  snapshot(): ProductionPackageState<T> {
    return this.state;
  }

  subscribe(listener: (state: ProductionPackageState<T>) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private update(state: ProductionPackageState<T>): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private prepare(): void {
    const generation = ++this.generation;
    this.update({ kind: "preparing" });
    this.pending = this.load().then((value) => {
      if (generation !== this.generation) throw new Error("package_stale");
      this.update({ kind: "ready", value });
      return value;
    }).catch((error: unknown) => {
      if (generation === this.generation) {
        this.update({
          kind: "error",
          message: error instanceof Error ? error.message : "Não foi possível preparar o pacote editorial.",
        });
      }
      throw error;
    });
    void this.pending.catch(() => {});
  }

  start(): void {
    if (this.state.kind === "idle") this.prepare();
  }

  retry(): void {
    if (this.state.kind === "error") this.prepare();
  }

  invalidate(): void {
    this.generation += 1;
    this.pending = null;
    this.update({ kind: "idle" });
  }

  async ensure(): Promise<ReadyProductionPackage<T>> {
    if (this.state.kind === "ready") return this.state.value;
    if (this.state.kind === "error") throw new Error(this.state.message);
    this.start();
    return this.pending!;
  }

  ready(): ReadyProductionPackage<T> | null {
    return this.state.kind === "ready" ? this.state.value : null;
  }

  copy(write: (text: string) => Promise<void>): Promise<void> | null {
    const value = this.ready();
    return value ? write(value.text) : null;
  }
}
