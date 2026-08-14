"use client";

import { useEffect, useState } from "react";

import styles from "./redacao-automatica.module.css";

const FORM_ID = "create-editorial-source-package";

export default function InboxBulkActions() {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(FORM_ID);
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement>("[data-inbox-bulk-item]"),
    );
    const update = () => setSelectedCount(inputs.filter((input) => input.checked).length);

    form.addEventListener("change", update);
    window.addEventListener("pageshow", update);
    update();

    return () => {
      form.removeEventListener("change", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  if (selectedCount < 1) {
    return null;
  }

  return (
    <div className={styles.inboxBulkActions} aria-live="polite">
      <strong>{selectedCount} {selectedCount === 1 ? "notícia selecionada" : "notícias selecionadas"}</strong>
      <div>
        <button
          type="submit"
          name="inbox_bulk_action"
          value="dismissed"
          form="create-editorial-source-package"
          formAction="/api/admin/editorial/redacao-automatica/inbox"
          formMethod="post"
          formNoValidate
        >
          Sem interesse
        </button>
        <button
          type="submit"
          name="inbox_bulk_action"
          value="working"
          form="create-editorial-source-package"
          formAction="/api/admin/editorial/redacao-automatica/inbox"
          formMethod="post"
          formNoValidate
        >
          Em trabalho
        </button>
      </div>
    </div>
  );
}
