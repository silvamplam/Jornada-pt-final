type ReadDiagnostic = Readonly<{ operation: string; attempt: number; elapsedMs: number; code: string | null; retry: boolean }>;

export function mesaReadErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  try { const value = JSON.parse(error.message); return typeof value?.code === "string" ? value.code : null; }
  catch { return error instanceof TypeError && /fetch failed|network/i.test(error.message) ? "network" : null; }
}

/** One short retry for a failed read, never for invalid editorial relations or writes. */
export async function readMesaWithTransientRetry<T>(operation: string, read: () => Promise<T>, options: Readonly<{
  wait?: (ms: number) => Promise<void>; report?: (event: ReadDiagnostic) => void;
}> = {}): Promise<T> {
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const report = options.report ?? ((event) => console.warn("mesa-read-failure", event));
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try { return await read(); } catch (error) {
      const code = mesaReadErrorCode(error);
      const status = (error as { status?: number } | null)?.status;
      const transient = ["57014", "PGRST000", "PGRST001", "PGRST002", "network"].includes(code ?? "")
        || [408, 502, 503, 504].includes(status ?? 0);
      const retry = attempt === 1 && transient;
      report({ operation, attempt, elapsedMs: Date.now() - started, code, retry });
      if (!retry) throw error;
      await wait(250);
    }
  }
}
