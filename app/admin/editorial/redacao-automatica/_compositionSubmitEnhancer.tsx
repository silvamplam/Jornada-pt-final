"use client";

import { useEffect } from "react";

const FORM_ID = "create-editorial-composition";
const IDLE_BUTTON_TEXT = "Gerar primeira versão";
const SUBMITTING_BUTTON_TEXT = "A preparar a primeira versão…";

export function installCompositionSubmitEnhancer(
  form: HTMLFormElement,
  pageLifecycleTarget: EventTarget = window,
): () => void {
  const button = form.querySelector<HTMLButtonElement>("[data-composition-submit]");
  const status = form.querySelector<HTMLElement>("[data-composition-submit-status]");
  let submitting = false;

  const reset = () => {
    submitting = false;
    if (button) {
      button.disabled = false;
      button.textContent = IDLE_BUTTON_TEXT;
    }
    if (status) {
      status.hidden = true;
    }
  };

  const handleSubmit = (event: Event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }

    submitting = true;
    if (button) {
      button.disabled = true;
      button.textContent = SUBMITTING_BUTTON_TEXT;
    }
    if (status) {
      status.hidden = false;
    }
  };

  form.addEventListener("submit", handleSubmit);
  pageLifecycleTarget.addEventListener("pageshow", reset);

  return () => {
    form.removeEventListener("submit", handleSubmit);
    pageLifecycleTarget.removeEventListener("pageshow", reset);
  };
}

export default function CompositionSubmitEnhancer() {
  useEffect(() => {
    const form = document.getElementById(FORM_ID);
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    return installCompositionSubmitEnhancer(form);
  }, []);

  return null;
}
