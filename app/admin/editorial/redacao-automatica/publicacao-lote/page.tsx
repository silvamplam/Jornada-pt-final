import {
  fetchSupabaseAdminTable,
  type SupabaseCompetition,
  type SupabaseMatchday,
  type SupabaseSeason,
} from "@/lib/supabase";

import BatchPreflightClient from "./_batchPreflightClient";
import styles from "./publicacao-lote.module.css";

export const dynamic = "force-dynamic";

type BatchCompetitionOption = Pick<SupabaseCompetition, "id" | "name" | "slug">;
type BatchSeasonOption = Pick<SupabaseSeason, "id" | "competition_id" | "label">;
type BatchMatchdayOption = Pick<SupabaseMatchday, "id" | "season_id" | "number" | "label">;

async function loadBatchContextOptions() {
  try {
    const [competitions, seasons, matchdays] = await Promise.all([
      fetchSupabaseAdminTable<BatchCompetitionOption>(
        "competitions?select=id,name,slug,is_active&order=name.asc",
      ),
      fetchSupabaseAdminTable<BatchSeasonOption>(
        "seasons?select=id,competition_id,label,is_current,starts_on,ends_on&order=label.desc",
      ),
      fetchSupabaseAdminTable<BatchMatchdayOption>(
        "matchdays?select=id,season_id,number,label,status,starts_on,ends_on&order=number.asc",
      ),
    ]);

    return { competitions, seasons, matchdays, error: null as string | null };
  } catch (error) {
    return {
      competitions: [] as BatchCompetitionOption[],
      seasons: [] as BatchSeasonOption[],
      matchdays: [] as BatchMatchdayOption[],
      error: error instanceof Error
        ? error.message
        : "Não foi possível carregar o contexto editorial.",
    };
  }
}

export default async function EditorialBatchPreflightPage() {
  const context = await loadBatchContextOptions();

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Redação Automática</p>
            <h1>Publicação em lote</h1>
            <p className={styles.description}>
              Cole artigos já terminados, valide o lote e associe-o à Jornada pretendida.
            </p>
          </div>
          <nav aria-label="Navegação da publicação em lote">
            <a href="/admin/editorial/redacao-automatica">Redação Automática</a>
            <a href="/admin/editorial/artigos">Artigos</a>
            <a href="/admin">Backoffice</a>
          </nav>
        </header>

        {context.error ? (
          <p className={styles.contextError} role="alert">
            Não foi possível carregar Competição, Época e Jornada. {context.error}
          </p>
        ) : null}

        <BatchPreflightClient
          competitions={context.competitions}
          seasons={context.seasons}
          matchdays={context.matchdays}
        />
      </div>
    </main>
  );
}
