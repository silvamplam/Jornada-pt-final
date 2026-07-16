import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import type {
  CollectionError,
  CollectionErrorCode,
  OperationResult,
} from "@/lib/redacao-automatica/types";

export type AdapterRegistry = Readonly<{
  resolve(
    adapterKey: string | null,
    sourceCode?: string | null,
  ): OperationResult<SourceAdapter, CollectionError>;
  keys(): readonly string[];
}>;

function registryError(
  code: CollectionErrorCode,
  sourceCode: string | null,
  detail: string,
): CollectionError {
  return {
    code,
    stage: "configuration",
    sourceCode,
    url: null,
    recoverable: true,
    detail,
  };
}

export function createAdapterRegistry(
  adapters: readonly SourceAdapter[],
): OperationResult<AdapterRegistry, CollectionError> {
  const adaptersByKey = new Map<string, SourceAdapter>();

  for (const adapter of adapters) {
    const key = adapter.key.trim();

    if (!key) {
      return {
        ok: false,
        error: registryError(
          "invalid_adapter_key",
          adapter.sourceCode || null,
          "A chave do adaptador não pode estar vazia.",
        ),
      };
    }

    if (adaptersByKey.has(key)) {
      return {
        ok: false,
        error: registryError(
          "duplicate_adapter_key",
          adapter.sourceCode || null,
          `A chave de adaptador "${key}" está duplicada.`,
        ),
      };
    }

    adaptersByKey.set(key, adapter);
  }

  const registry: AdapterRegistry = {
    resolve(adapterKey, sourceCode = null) {
      const key = adapterKey?.trim() ?? "";

      if (!key) {
        return {
          ok: false,
          error: registryError(
            "invalid_adapter_key",
            sourceCode,
            "A chave do adaptador não pode estar vazia.",
          ),
        };
      }

      const adapter = adaptersByKey.get(key);
      if (!adapter) {
        return {
          ok: false,
          error: registryError(
            "adapter_missing",
            sourceCode,
            `Não existe um adaptador registado para a chave "${key}".`,
          ),
        };
      }

      return { ok: true, value: adapter };
    },
    keys() {
      return Array.from(adaptersByKey.keys());
    },
  };

  return { ok: true, value: registry };
}
