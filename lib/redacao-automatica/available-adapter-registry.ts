import { createAdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { abolaAdapter } from "@/lib/redacao-automatica/adapters/abola";
import { recordAdapter } from "@/lib/redacao-automatica/adapters/record";

const availableSourceAdapters = [
  recordAdapter,
  abolaAdapter,
] as const;

export function createAvailableAdapterRegistry() {
  return createAdapterRegistry(availableSourceAdapters);
}
