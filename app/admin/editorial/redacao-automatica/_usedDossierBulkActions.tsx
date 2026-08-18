"use client";

import { useEffect, useState } from "react";

import styles from "./redacao-automatica.module.css";

const FORM_ID = "create-editorial-source-package";

type SelectedDossier = Readonly<{
  value: string;
  title: string;
}>;

function selectedDossiers(): SelectedDossier[] {
  const form = document.getElementById(FORM_ID);

  if (!(form instanceof HTMLFormElement)) {
    return [];
  }

  return Array.from(
    form.querySelectorAll<HTMLInputElement>(
      "[data-used-dossier-select]",
    ),
  )
    .filter((input) => input.checked)
    .map((input) => ({
      value: input.value,
      title:
        input.dataset.usedDossierTitle?.trim()
        || "Dossiê selecionado",
    }));
}

export default function UsedDossierBulkActions() {
  const [selected, setSelected] = useState<SelectedDossier[]>([]);
  const [canonical, setCanonical] = useState("");

  useEffect(() => {
    const form = document.getElementById(FORM_ID);

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const update = () => {
      const next = selectedDossiers();

      setSelected(next);

      setCanonical((current) => (
        next.some((item) => item.value === current)
          ? current
          : next[0]?.value ?? ""
      ));
    };

    form.addEventListener("change", update);
    window.addEventListener("pageshow", update);

    update();

    return () => {
      form.removeEventListener("change", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  return (
    <div
      className={styles.usedDossierJoinToolbar}
      data-used-dossier-join-toolbar
    >
      <div className={styles.usedDossierJoinIntro}>
        <strong>Juntar Dossiês</strong>
        <span>
          Seleciona dois ou mais Dossiês que pertencem ao mesmo
          assunto. A associação é feita apenas pela tua escolha.
        </span>
      </div>

      {selected.length >= 2 ? (
        <div className={styles.usedDossierJoinControls}>
          <label>
            <span>Artigo publicado principal</span>

            <select
              name="canonical_dossier_ref"
              value={canonical}
              onChange={(event) => setCanonical(event.target.value)}
              form={FORM_ID}
              required
            >
              {selected.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            form={FORM_ID}
            formAction="/api/admin/editorial/redacao-automatica/juntar-dossies"
            formMethod="post"
            formNoValidate
            disabled={!canonical}
          >
            Juntar {selected.length} Dossiês
          </button>
        </div>
      ) : (
        <span className={styles.usedDossierJoinHint}>
          {selected.length === 1
            ? "Seleciona pelo menos mais um Dossiê."
            : "Nenhum Dossiê selecionado."}
        </span>
      )}
    </div>
  );
}
