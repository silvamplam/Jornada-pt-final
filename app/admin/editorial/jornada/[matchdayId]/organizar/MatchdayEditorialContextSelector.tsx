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
  .thematic-context-selector { min-width: 0; padding: 4px 0 6px; border: 0; border-bottom: 1px solid #cbd4d9; border-radius: 0; background: transparent; }
  .thematic-context-selector form { display: grid; grid-template-columns: auto minmax(170px,1fr) minmax(110px,.55fr) minmax(160px,.9fr) auto; gap: 12px; align-items: end; }
  .thematic-context-selector h2 { align-self: center; margin: 0 8px 0 0; color: #526571; font-size: 10px; line-height: 1.4; letter-spacing: .07em; text-transform: uppercase; white-space: nowrap; }
  .thematic-context-selector label { display: grid; min-width: 0; gap: 4px; color: #526571; font-size: 10px; font-weight: 700; letter-spacing: .035em; text-transform: uppercase; }
  .thematic-context-selector select { min-width: 0; width: 100%; min-height: 30px; padding: 5px 8px; border: 1px solid #b8c5ce; border-radius: 3px; background: #fff; color: #243c4c; font: inherit; font-size: 12px; font-weight: 500; letter-spacing: 0; text-transform: none; }
  .thematic-context-selector button { min-height: 30px; padding: 6px 12px; border: 1px solid #9eafbb; border-radius: 3px; background: #fff; color: #2a4e65; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .thematic-context-selector button:hover:not(:disabled) { background: #e6eff5; }
  .thematic-context-selector button:disabled { cursor: default; opacity: .48; }
  .thematic-context-selector :is(button,select):focus-visible { outline: 2px solid #245575; outline-offset: 3px; }
  .thematic-context-selector-message { grid-column: 1 / -1; margin: 0; padding: 8px 10px; border-left: 3px solid #a87927; background: #fff8e9; color: #725017; font-size: 12px; }
  @media (max-width: 959px) { .thematic-context-selector form { grid-template-columns: minmax(0,1fr) minmax(0,.6fr) minmax(0,.8fr) auto; gap: 8px; } .thematic-context-selector h2 { grid-column: 1 / -1; margin: 0; } }
  @media (max-width: 620px) { .thematic-context-selector form { grid-template-columns: repeat(2,minmax(0,1fr)); } .thematic-context-selector button { align-self: end; } }
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
