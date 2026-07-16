import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";
import type {
  CollectionError,
  OperationResult,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

export interface SourceConfigurationProvider {
  findByCode(
    code: string,
  ): Promise<OperationResult<SourceConfiguration, CollectionError>>;
}

export const registeredSourceConfigurationProvider: SourceConfigurationProvider = {
  async findByCode(code) {
    const normalizedCode = code.trim();
    const source = findRegisteredSource(normalizedCode);

    if (!source) {
      return {
        ok: false,
        error: {
          code: "source_not_found",
          stage: "configuration",
          sourceCode: normalizedCode || null,
          url: null,
          recoverable: false,
          detail: "Não existe uma fonte registada com o código indicado.",
        },
      };
    }

    return { ok: true, value: source };
  },
};
