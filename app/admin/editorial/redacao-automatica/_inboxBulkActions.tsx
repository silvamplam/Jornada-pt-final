"use client";

import { useEffect, useState } from "react";

import styles from "./redacao-automatica.module.css";

const FORM_ID = "create-editorial-source-package";

type InboxBulkActionsProps = {
  view: "pending" | "working";
};

function inboxInputs(): HTMLInputElement[] {
  const form = document.getElementById(FORM_ID);

  if (!(form instanceof HTMLFormElement)) {
    return [];
  }

  return Array.from(
    form.querySelectorAll<HTMLInputElement>("[data-inbox-bulk-item]"),
  );
}

export default function InboxBulkActions({
  view,
}: InboxBulkActionsProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(FORM_ID);

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const update = () => {
      const inputs = inboxInputs();

      setAvailableCount(inputs.length);
      setSelectedCount(
        inputs.filter((input) => input.checked).length,
      );
    };

    form.addEventListener("change", update);
    window.addEventListener("pageshow", update);

    update();

    return () => {
      form.removeEventListener("change", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  const selectAll = () => {
    const inputs = inboxInputs();

    for (const input of inputs) {
      input.checked = true;
    }

    setAvailableCount(inputs.length);
    setSelectedCount(inputs.length);
  };

  const clearAll = () => {
    const inputs = inboxInputs();

    for (const input of inputs) {
      input.checked = false;
    }

    setAvailableCount(inputs.length);
    setSelectedCount(0);
  };

  if (availableCount < 1) {
    return null;
  }

  return (
    <div className={styles.inboxBulkActions} aria-live="polite">
      <div className={styles.inboxBulkSelectionActions}>
        <button
          type="button"
          onClick={selectAll}
          disabled={selectedCount === availableCount}
        >
          Selecionar tudo
        </button>

        <button
          type="button"
          onClick={clearAll}
          disabled={selectedCount === 0}
        >
          Desselecionar tudo
        </button>
      </div>

      {selectedCount > 0 ? (
        <>
          <strong>
            {selectedCount}{" "}
            {selectedCount === 1
              ? "notícia selecionada"
              : "notícias selecionadas"}
          </strong>

          <div>
            <button
              type="submit"
              name="inbox_bulk_action"
              value="dismissed"
              form={FORM_ID}
              formAction="/api/admin/editorial/redacao-automatica/inbox"
              formMethod="post"
              formNoValidate
            >
              Sem interesse
            </button>

            {view === "pending" ? (
              <button
                type="submit"
                name="inbox_bulk_action"
                value="working"
                form={FORM_ID}
                formAction="/api/admin/editorial/redacao-automatica/inbox"
                formMethod="post"
                formNoValidate
              >
                Em trabalho
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
