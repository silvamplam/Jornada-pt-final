"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  activeMatchdayEditorialCircuit,
  matchdayEditorialCircuitAssignment,
  matchdayEditorialCircuitOptions,
  type MatchdayEditorialCircuit,
} from "@/lib/editorial-matchday-circuit";

type EditorialCircuitSelectorProps = Readonly<{
  matchdayId: string;
  competitionSlug: string;
  activeProfileKey: string | null;
}>;

export default function EditorialCircuitSelector({
  matchdayId,
  competitionSlug,
  activeProfileKey,
}: EditorialCircuitSelectorProps) {
  const router = useRouter();
  const options = matchdayEditorialCircuitOptions(competitionSlug);
  const currentCircuit = activeMatchdayEditorialCircuit(activeProfileKey);
  const currentOption = options.find((option) => option.profileKey === activeProfileKey);
  const [selectedCircuit, setSelectedCircuit] = useState<MatchdayEditorialCircuit>(currentCircuit);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const thematicAvailable = options.some((option) => option.circuit === "thematic");

  useEffect(() => {
    setSelectedCircuit(currentCircuit);
  }, [currentCircuit]);

  async function changeCircuit() {
    if (selectedCircuit === currentCircuit || pending) {
      return;
    }

    const profileKey = matchdayEditorialCircuitAssignment(selectedCircuit, competitionSlug);
    const targetLabel = options.find((option) => option.circuit === selectedCircuit)?.label ?? "circuito escolhido";
    const confirmed = window.confirm(
      `Alterar o circuito editorial para “${targetLabel}”? Esta operação não apaga o estado de nenhum dos circuitos.`,
    );

    if (!confirmed) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/editorial/jornada/${encodeURIComponent(matchdayId)}/circuito-editorial`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileKey }),
        },
      );
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(result?.message || "Não foi possível alterar o circuito editorial.");
      }

      router.push(`/admin/editorial/jornada/${encodeURIComponent(matchdayId)}/organizar`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar o circuito editorial.");
      setPending(false);
    }
  }

  return (
    <section className="editorial-circuit-control" aria-labelledby="editorial-circuit-title">
      <style>{`
        .editorial-circuit-control {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px 18px;
          margin: 14px 0;
          padding: 14px 16px;
          border: 1px solid #d7dee7;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 5px 16px rgba(15, 23, 42, .05);
        }
        .editorial-circuit-control > div:first-of-type { display: grid; gap: 3px; margin-right: auto; }
        .editorial-circuit-control h2,
        .editorial-circuit-control p { margin: 0; }
        .editorial-circuit-control h2 { font-size: 16px; }
        .editorial-circuit-control p { color: #64748b; font-size: 12px; }
        .editorial-circuit-current {
          width: fit-content;
          padding: 3px 8px;
          border-radius: 999px;
          background: #e8f0ff;
          color: #1d4ed8;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .03em;
          text-transform: uppercase;
        }
        .editorial-circuit-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
        .editorial-circuit-actions label { display: grid; gap: 4px; color: #475569; font-size: 11px; font-weight: 800; }
        .editorial-circuit-actions select,
        .editorial-circuit-actions button {
          min-height: 36px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          color: #10151b;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
        }
        .editorial-circuit-actions select { min-width: 220px; padding: 0 9px; }
        .editorial-circuit-actions button { padding: 0 13px; cursor: pointer; }
        .editorial-circuit-actions button:disabled { cursor: default; opacity: .5; }
        .editorial-circuit-error { flex-basis: 100%; color: #b42318 !important; font-weight: 700; }
      `}</style>
      <div>
        <h2 id="editorial-circuit-title">Circuito editorial</h2>
        <span className="editorial-circuit-current">
          Ativo: {currentOption?.label ?? (activeProfileKey ? `Perfil não suportado · ${activeProfileKey}` : "Atual / Legacy")}
        </span>
        <p>
          A mudança seleciona a Mesa ativa; não apaga estado editorial guardado.
          {!thematicAvailable ? " O perfil temático não é compatível com esta competição." : ""}
        </p>
      </div>
      <div className="editorial-circuit-actions">
        <label>
          Escolher circuito
          <select
            aria-label="Circuito editorial"
            disabled={pending}
            onChange={(event) => setSelectedCircuit(event.target.value as MatchdayEditorialCircuit)}
            value={selectedCircuit}
          >
            {options.map((option) => (
              <option key={option.profileKey ?? "legacy"} value={option.circuit}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={pending || selectedCircuit === currentCircuit} onClick={changeCircuit} type="button">
          {pending ? "A alterar…" : "Alterar circuito"}
        </button>
      </div>
      {message ? <p className="editorial-circuit-error" role="alert">{message}</p> : null}
    </section>
  );
}
