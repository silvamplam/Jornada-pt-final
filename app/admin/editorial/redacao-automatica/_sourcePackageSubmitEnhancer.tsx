"use client";

import { useEffect } from "react";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

const FORM_ID = "create-editorial-source-package";
const IDLE_BUTTON_TEXT = "Preparar fontes";
const SUBMITTING_BUTTON_TEXT = "A preparar as fontes…";

export function installSourcePackageSubmitEnhancer(
  form: HTMLFormElement,
  pageLifecycleTarget: EventTarget = window,
): () => void {
  const button = form.querySelector<HTMLButtonElement>("[data-source-package-submit]");
  const status = form.querySelector<HTMLElement>("[data-source-package-submit-status]");
  const count = form.querySelector<HTMLElement>("[data-source-package-selection-count]");
  const sources = Array.from(
    form.querySelectorAll<HTMLInputElement>("[data-source-package-source]"),
  );
  let submitting = false;

  const selectedCount = () => sources.filter((source) => source.checked).length;

  const showStatus = (message: string) => {
    if (status) {
      status.textContent = message;
      status.hidden = !message;
    }
  };

  const update = () => {
    const selected = selectedCount();

    if (count) {
      count.textContent = selected === 1
        ? "1 notícia selecionada"
        : `${selected} notícias selecionadas`;
    }

    if (button) {
      button.disabled = submitting || selected < 1;
    }
  };

  const reset = () => {
    submitting = false;

    if (button) {
      button.textContent = IDLE_BUTTON_TEXT;
    }

    showStatus("");
    update();
  };

  const handleChange = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-source-package-source]")) {
      return;
    }

    if (target.checked && selectedCount() > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES) {
      target.checked = false;
      showStatus(`Podes selecionar no máximo ${EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES} notícias.`);
    } else {
      showStatus("");
    }

    update();
  };

  const handleSubmit = (event: Event) => {
    const selected = selectedCount();

    if (
      submitting
      || selected < 1
      || selected > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
    ) {
      event.preventDefault();

      if (!submitting) {
        showStatus(
          selected < 1
            ? "Seleciona pelo menos uma notícia."
            : `Podes selecionar no máximo ${EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES} notícias.`,
        );
      }

      return;
    }

    submitting = true;

    if (button) {
      button.disabled = true;
      button.textContent = SUBMITTING_BUTTON_TEXT;
    }

    showStatus("A recolher os textos integrais e a preparar o pacote.");
  };

  form.addEventListener("change", handleChange);
  form.addEventListener("submit", handleSubmit);
  pageLifecycleTarget.addEventListener("pageshow", reset);
  update();

  return () => {
    form.removeEventListener("change", handleChange);
    form.removeEventListener("submit", handleSubmit);
    pageLifecycleTarget.removeEventListener("pageshow", reset);
  };
}

export default function SourcePackageSubmitEnhancer() {
  useEffect(() => {
    const form = document.getElementById(FORM_ID);
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    return installSourcePackageSubmitEnhancer(form);
  }, []);

  return null;
}
