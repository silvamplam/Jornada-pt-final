import { getAdminCountries } from "@/lib/supabase";
import TeamBatchCreation from "./TeamBatchCreation";

export const dynamic = "force-dynamic";

export default async function TeamBatchCreationPage() {
  const overview = await getAdminCountries();
  const apiAvailable =
    overview.configured && overview.writeConfigured && !overview.error;
  const countries = apiAvailable
    ? overview.countries
        .filter((country) => country.is_active)
        .map((country) => ({
          id: country.id,
          name: country.name,
          flagEmoji: country.flag_emoji
        }))
    : [];
  const initialError = !overview.configured
    ? "Falta configurar a ligação ao Supabase."
    : !overview.writeConfigured
      ? "A ligação administrativa necessária para criar clubes não está configurada."
      : overview.error
        ? "Não foi possível carregar os países."
        : null;

  return (
    <TeamBatchCreation
      apiAvailable={apiAvailable}
      countries={countries}
      initialError={initialError}
    />
  );
}
