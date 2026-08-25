import MatchdayEditorialThematicDeskClient from "./MatchdayEditorialThematicDeskClient";

import type { MatchdayEditorialProfileDeskReadResult } from "@/lib/editorial-matchday-profile-desk";

const unsupportedStyles = `
  body { margin: 0; background: #eef2f6; color: #10151b; font-family: Arial, Helvetica, sans-serif; }
  * { box-sizing: border-box; }
  .thematic-unsupported { display: grid; gap: 12px; width: min(900px, calc(100% - 28px)); margin: 14px auto; padding: 20px; border: 1px solid #d8e0e9; border-radius: 10px; background: #fff; }
  .thematic-unsupported h1, .thematic-unsupported p { margin: 0; }
  .thematic-unsupported code { width: fit-content; padding: 4px 7px; border-radius: 4px; background: #eef2f6; }
`;

export default function MatchdayEditorialThematicDesk({ desk }: Readonly<{
  desk: MatchdayEditorialProfileDeskReadResult;
}>) {
  if (desk.kind === "thematic") {
    return (
      <MatchdayEditorialThematicDeskClient
        desk={desk}
        key={`${desk.matchdayId}:${desk.profileKey}`}
      />
    );
  }

  return (
    <main className="thematic-unsupported">
      <style>{unsupportedStyles}</style>
      <p>Mesa Temática</p>
      <h1>Perfil temático não suportado</h1>
      <code>{desk.profileKey}</code>
      {desk.diagnostics.map((diagnostic) => (
        <p key={`${diagnostic.code}:${diagnostic.profileKey ?? ""}`}>{diagnostic.message}</p>
      ))}
      <a href={`/admin/editorial/jornada/${desk.matchdayId}`}>Voltar ao editorial atual</a>
    </main>
  );
}
