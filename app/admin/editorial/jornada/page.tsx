import { redirect } from "next/navigation";

import {
  resolveManagedMatchdayEditorialDesk,
  type ManagedMatchdayEditorialDeskRow,
} from "@/lib/editorial-managed-desk-entry";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const styles = `
  body { margin: 0; background: #eef2f6; }
  * { box-sizing: border-box; }
  .managed-desk-entry {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 24px;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }
  .managed-desk-entry section {
    width: min(620px, 100%);
    padding: 22px;
    border: 1px solid #d8e0e9;
    border-radius: 9px;
    background: #ffffff;
    box-shadow: 0 10px 28px rgba(15, 23, 42, .08);
  }
  .managed-desk-entry h1,
  .managed-desk-entry p { margin: 0; }
  .managed-desk-entry h1 { font-size: 22px; }
  .managed-desk-entry p {
    margin-top: 8px;
    color: #526174;
    font-size: 14px;
    line-height: 1.45;
  }
  .managed-desk-entry a {
    display: inline-flex;
    margin-top: 16px;
    padding: 8px 11px;
    border-radius: 6px;
    background: #101820;
    color: #ffffff;
    font-size: 12px;
    font-weight: 800;
    text-decoration: none;
  }
`;

async function readManagedDesks() {
  return fetchSupabaseAdminTable<ManagedMatchdayEditorialDeskRow>(
    "matchday_editorial_desk_control?select=matchday_id&is_managed=eq.true&limit=2",
  );
}

export default async function AdminEditorialMatchdayEntryPage() {
  let resolution;

  try {
    resolution = resolveManagedMatchdayEditorialDesk(
      await readManagedDesks(),
    );
  } catch {
    resolution = { kind: "error" } as const;
  }

  if (resolution.kind === "single") {
    redirect(
      `/admin/editorial/jornada/${encodeURIComponent(resolution.matchdayId)}/organizar`,
    );
  }

  return (
    <main className="managed-desk-entry">
      <style>{styles}</style>
      <section role="status">
        <h1>Mesa viva indisponível</h1>
        <p>
          {resolution.kind === "none"
            ? "Não existe nenhuma Mesa marcada como gerida."
            : resolution.kind === "multiple"
              ? `Invariante administrativa: existem ${resolution.count} Mesas marcadas como geridas.`
              : "Não foi possível resolver a Mesa gerida."}
        </p>
        <a href="/admin">Voltar ao Backoffice</a>
      </section>
    </main>
  );
}
