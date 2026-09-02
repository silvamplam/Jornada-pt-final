"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type MatchdayEditorialContextSelectorData = Readonly<{
  competitions: readonly Readonly<{
    id: string;
    name: string;
  }>[];
  seasons: readonly Readonly<{
    id: string;
    competitionId: string;
    label: string;
  }>[];
  matchdays: readonly Readonly<{
    id: string;
    seasonId: string;
    label: string;
    thematicCompatible: boolean;
  }>[];
  error: string | null;
}>;

const styles = `
  .thematic-context-selector { min-width: 0; padding: 4px 6px; border: 1px solid #d7e0e9; border-radius: 7px; background: #fff; box-shadow: 0 3px 10px rgba(12,22,34,.03); }
  .thematic-context-selector form { display: grid; grid-template-columns: auto minmax(180px,.8fr) minmax(150px,.65fr) minmax(210px,1fr) auto; gap: 5px; align-items: center; }
  .thematic-context-selector h2 { margin: 0 5px 0 0; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
  .thematic-context-selector label { display: flex; min-width: 0; align-items: center; gap: 4px; color: #64748b; font-size: 8px; font-weight: 850; text-transform: uppercase; }
  .thematic-context-selector select { min-width: 0; width: 100%; min-height: 28px; padding: 0 6px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #10151b; font: inherit; font-size: 10px; text-transform: none; }
  .thematic-context-selector button { min-height: 28px; padding: 3px 8px; border: 1px solid #101820; border-radius: 5px; background: #101820; color: #fff; font: inherit; font-size: 9px; font-weight: 900; cursor: pointer; white-space: nowrap; }
  .thematic-context-selector button:disabled { cursor: default; opacity: .4; }
  .thematic-context-selector-message { grid-column: 1 / -1; margin: 0; padding: 4px 6px; border-radius: 4px; background: #fff5e8; color: #7c4a03; font-size: 9px; font-weight: 750; }
  @media (max-width: 1050px) { .thematic-context-selector form { grid-template-columns: repeat(2,minmax(0,1fr)); } .thematic-context-selector h2, .thematic-context-selector button { grid-column: 1 / -1; } }
  @media (max-width: 620px) { .thematic-context-selector form { grid-template-columns: 1fr; } .thematic-context-selector h2, .thematic-context-selector button { grid-column: auto; } .thematic-context-selector label { align-items: stretch; flex-direction: column; } }
`;

export default function MatchdayEditorialContextSelector({
  currentCompetitionId,
  currentMatchdayId,
  currentSeasonId,
  data,
}: Readonly<{
  currentCompetitionId: string;
  currentMatchdayId: string;
  currentSeasonId: string;
  data: MatchdayEditorialContextSelectorData;
}>) {
  const router = useRouter();
  const [competitionId, setCompetitionId] = useState(currentCompetitionId);
  const [seasonId, setSeasonId] = useState(currentSeasonId);
  const [matchdayId, setMatchdayId] = useState(currentMatchdayId);
  const [message, setMessage] = useState<string | null>(null);
  const visibleSeasons = data.seasons.filter(
    (season) => season.competitionId === competitionId,
  );
  const visibleMatchdays = data.matchdays.filter(
    (matchday) => matchday.seasonId === seasonId,
  );
  const selectedMatchday = data.matchdays.find(
    (matchday) => matchday.id === matchdayId,
  ) ?? null;
  const administrativeMessage = message
    ?? (selectedMatchday && !selectedMatchday.thematicCompatible
      ? "Esta Jornada não tem assignment/perfil temático compatível com a Mesa viva."
      : null);

  function changeCompetition(nextCompetitionId: string) {
    setCompetitionId(nextCompetitionId);
    setSeasonId("");
    setMatchdayId("");
    setMessage(null);
  }

  function changeSeason(nextSeasonId: string) {
    setSeasonId(nextSeasonId);
    setMatchdayId("");
    setMessage(null);
  }

  function openMatchday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMatchday) {
      setMessage("Escolha uma Jornada para abrir a Mesa editorial.");
      return;
    }

    if (!selectedMatchday.thematicCompatible) {
      setMessage("Esta Jornada não é a Mesa Viva atual com perfil temático compatível.");
      return;
    }

    setMessage(null);
    router.push(
      `/admin/editorial/jornada/${encodeURIComponent(selectedMatchday.id)}/organizar`,
    );
  }

  return (
    <section className="thematic-context-selector" aria-label="Alterar Jornada da Mesa editorial">
      <style>{styles}</style>
      <form onSubmit={openMatchday}>
        <h2>Alterar Jornada</h2>
        <label>
          <span>Competição</span>
          <select
            aria-label="Competição"
            onChange={(event) => changeCompetition(event.target.value)}
            value={competitionId}
          >
            <option value="">Escolher competição</option>
            {data.competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Época</span>
          <select
            aria-label="Época"
            onChange={(event) => changeSeason(event.target.value)}
            value={seasonId}
          >
            <option value="">Escolher época</option>
            {visibleSeasons.map((season) => (
              <option key={season.id} value={season.id}>{season.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Jornada</span>
          <select
            aria-label="Jornada"
            onChange={(event) => {
              setMatchdayId(event.target.value);
              setMessage(null);
            }}
            value={matchdayId}
          >
            <option value="">Escolher Jornada</option>
            {visibleMatchdays.map((matchday) => (
              <option key={matchday.id} value={matchday.id}>{matchday.label}</option>
            ))}
          </select>
        </label>
        <button disabled={!matchdayId || Boolean(data.error)} type="submit">
          Abrir Mesa editorial
        </button>
        {data.error || administrativeMessage ? (
          <p className="thematic-context-selector-message" role="status">
            {data.error ?? administrativeMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
}
