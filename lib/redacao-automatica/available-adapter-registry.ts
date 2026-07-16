import { createAdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { abolaAdapter } from "@/lib/redacao-automatica/adapters/abola";
import { maisfutebolAdapter } from "@/lib/redacao-automatica/adapters/maisfutebol";
import { recordAdapter } from "@/lib/redacao-automatica/adapters/record";

const availableSourceAdapters = [
  recordAdapter,
  abolaAdapter,
  maisfutebolAdapter,
] as const;

export function createAvailableAdapterRegistry() {
  return createAdapterRegistry(availableSourceAdapters);
}
