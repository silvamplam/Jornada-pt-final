import TeamAliasesAdmin from "./TeamAliasesAdmin";
import { fetchSupabaseAdminTable, getAdminCountries } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type TeamOptionRow = {
  id: string;
  name: string;
  short_name: string | null;
  code: string | null;
  country_id: string;
};

async function readTeamOptions(): Promise<TeamOptionRow[]> {
  const rows: TeamOptionRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchSupabaseAdminTable<TeamOptionRow>(
      "teams?select=id,name,short_name,code,country_id&country_id=not.is.null" +
        `&order=name.asc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`
    );
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

export default async function TeamAliasesPage() {
  const countryOverview = await getAdminCountries();
  let teamRows: TeamOptionRow[] = [];
  let initialError: string | null = null;

  if (!countryOverview.configured || !countryOverview.writeConfigured) {
    initialError = "A ligação administrativa necessária para gerir aliases não está configurada.";
  } else if (countryOverview.error) {
    initialError = "Não foi possível carregar os países e os clubes.";
  } else {
    try {
      teamRows = await readTeamOptions();
    } catch {
      teamRows = [];
      initialError = "Não foi possível carregar os países e os clubes.";
    }
  }

  const apiAvailable = initialError === null;
  const countries = apiAvailable
    ? countryOverview.countries.map((country) => ({
        id: country.id,
        name: country.name,
        flagEmoji: country.flag_emoji
      }))
    : [];
  const teams = apiAvailable
    ? teamRows.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        code: team.code,
        countryId: team.country_id
      }))
    : [];

  return (
    <TeamAliasesAdmin
      apiAvailable={apiAvailable}
      countries={countries}
      initialError={initialError}
      teams={teams}
    />
  );
}
