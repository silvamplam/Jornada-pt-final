"use client";

import { useEffect } from "react";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

const FORM_ID = "create-editorial-source-package";
const IDLE_BUTTON_TEXT = "Preparar fontes";
const SUBMITTING_BUTTON_TEXT = "A preparar as fontes…";
const NEW_ARTICLE_VALUE = "__new__";

function groupControlFor(source: HTMLInputElement) {
  return source.closest("li")?.querySelector<HTMLElement>("[data-source-package-group-control]") ?? null;
}

function groupSelectFor(source: HTMLInputElement) {
  return source.closest("li")?.querySelector<HTMLSelectElement>("[data-source-package-group]") ?? null;
}

function sourceIsVisible(source: HTMLInputElement) {
  const item = source.closest("li");
  return !item || !item.hidden;
}

export function installSourcePackageSubmitEnhancer(
  form: HTMLFormElement,
  pageLifecycleTarget: EventTarget = window,
): () => void {
  const button = form.querySelector<HTMLButtonElement>("[data-source-package-submit]");
  const selectAllButton = form.querySelector<HTMLButtonElement>("[data-source-package-select-all]");
  const clearAllButton = form.querySelector<HTMLButtonElement>("[data-source-package-clear-all]");
  const status = form.querySelector<HTMLElement>("[data-source-package-submit-status]");
  const count = form.querySelector<HTMLElement>("[data-source-package-selection-count]");
  const suggestedTitleField = form.querySelector<HTMLElement>("[data-source-package-suggested-title]");
  const suggestedTitleInput = suggestedTitleField?.querySelector<HTMLInputElement>('input[name="suggested_title"]') ?? null;
  const sources = Array.from(
    form.querySelectorAll<HTMLInputElement>("[data-source-package-source]"),
  );
  const reuseMode = form.dataset.sourcePackageReuse === "1";
  const reuseBaseSourceCount = Number(
    form.dataset.sourcePackageReuseBaseCount ?? "0",
  );
  const groupBySource = new Map<string, number>();
  let submitting = false;

  const selectedSources = () => sources.filter((source) => source.checked);

  const showStatus = (message: string) => {
    if (status) {
      status.textContent = message;
      status.hidden = !message;
    }
  };

  const nextUnusedGroup = () => {
    const used = [...groupBySource.values()];
    return used.length > 0 ? Math.max(...used) + 1 : 1;
  };

  const normalizeGroups = () => {
    const normalized = new Map<number, number>();
    let next = 1;

    for (const source of selectedSources()) {
      const current = groupBySource.get(source.value) ?? nextUnusedGroup();
      let normalizedGroup = normalized.get(current);
      if (!normalizedGroup) {
        normalizedGroup = next;
        normalized.set(current, normalizedGroup);
        next += 1;
      }
      groupBySource.set(source.value, normalizedGroup);
    }
  };

  const ensureSelectedGroups = () => {
    if (reuseMode) {
      for (const source of sources) {
        if (source.checked) {
          groupBySource.set(source.value, 1);
        } else {
          groupBySource.delete(source.value);
        }
      }
      return;
    }

    for (const source of sources) {
      if (!source.checked) {
        groupBySource.delete(source.value);
        continue;
      }

      if (!groupBySource.has(source.value)) {
        groupBySource.set(source.value, nextUnusedGroup());
      }
    }

    normalizeGroups();
  };

  const renderGroupControls = () => {
    const selected = selectedSources();
    const availableGroups = [...new Set(
      selected.map((source) => groupBySource.get(source.value)).filter((value): value is number => Boolean(value)),
    )].sort((left, right) => left - right);

    for (const source of sources) {
      const control = groupControlFor(source);
      const select = groupSelectFor(source);
      if (!control || !select) {
        continue;
      }

      if (reuseMode || !source.checked || selected.length < 2) {
        control.hidden = true;
        select.disabled = true;
        select.replaceChildren();
        continue;
      }

      const currentGroup = groupBySource.get(source.value) ?? 1;
      const currentGroupSize = selected.filter(
        (candidate) => groupBySource.get(candidate.value) === currentGroup,
      ).length;
      const options = availableGroups.map((group) => {
        const option = document.createElement("option");
        option.value = String(group);
        option.textContent = `Dossiê ${String(group).padStart(2, "0")}`;
        option.selected = group === currentGroup;
        return option;
      });
      const splitOption = document.createElement("option");
      splitOption.value = NEW_ARTICLE_VALUE;
      splitOption.textContent = "Separar para novo Dossiê";

      select.replaceChildren(
        ...options,
        ...(currentGroupSize > 1 ? [splitOption] : []),
      );
      select.disabled = false;
      control.hidden = false;
    }
  };

  const update = () => {
    ensureSelectedGroups();
    renderGroupControls();

    const selected = selectedSources().length;
    const articleCount = new Set(groupBySource.values()).size;

    if (count) {
      count.textContent = reuseMode
        ? selected === 0
          ? `${reuseBaseSourceCount} ${reuseBaseSourceCount === 1 ? "fonte anterior" : "fontes anteriores"} · seleciona informação nova`
          : `${reuseBaseSourceCount} anteriores + ${selected} ${selected === 1 ? "nova" : "novas"} · 1 Dossiê`
        : selected === 0
          ? "0 fontes selecionadas"
          : `${selected} ${selected === 1 ? "fonte selecionada" : "fontes selecionadas"} · ${articleCount} ${articleCount === 1 ? "Dossiê" : "Dossiês"}`;
    }

    if (suggestedTitleField && suggestedTitleInput) {
      const titleApplies = reuseMode || (selected > 0 && articleCount === 1);
      suggestedTitleField.hidden = !titleApplies;
      suggestedTitleInput.disabled = !titleApplies;
    }

    if (button) {
      button.disabled = submitting || selected < 1;
    }

    if (selectAllButton) {
      selectAllButton.disabled = submitting
        || !sources.some((source) => !source.disabled && sourceIsVisible(source));
    }

    if (clearAllButton) {
      clearAllButton.disabled = submitting || selected < 1;
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

    if (target instanceof HTMLInputElement && target.matches("[data-source-package-source]")) {
      if (target.checked && selectedSources().length > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES) {
        target.checked = false;
        showStatus(`Podes selecionar no máximo ${EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES} fontes.`);
      } else {
        showStatus("");
      }

      update();
      return;
    }

    if (target instanceof HTMLSelectElement && target.matches("[data-source-package-group]")) {
      const source = target.closest("li")?.querySelector<HTMLInputElement>("[data-source-package-source]");
      if (!source?.checked) {
        return;
      }

      if (target.value === NEW_ARTICLE_VALUE) {
        groupBySource.set(source.value, nextUnusedGroup());
      } else {
        const articleGroup = Number(target.value);
        if (Number.isInteger(articleGroup) && articleGroup > 0) {
          groupBySource.set(source.value, articleGroup);
        }
      }

      showStatus("");
      update();
    }
  };

  const handleClick = (event: Event) => {
    const target = event.target;
    const element = target instanceof Element ? target : null;

    if (element?.closest("[data-source-package-select-all]")) {
      const eligible = sources.filter(
        (source) => !source.disabled && sourceIsVisible(source),
      );

      for (const source of sources) {
        source.checked = false;
      }

      for (const source of eligible.slice(0, EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES)) {
        source.checked = true;
      }

      showStatus(
        eligible.length > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
          ? `Foram selecionadas as primeiras ${EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES} fontes visíveis.`
          : "",
      );

      update();
      return;
    }

    if (element?.closest("[data-source-package-clear-all]")) {
      for (const source of sources) {
        source.checked = false;
      }

      groupBySource.clear();
      showStatus("");
      update();
      return;
    }

  };

  const handleSubmit = (event: Event) => {
    if (!(event instanceof SubmitEvent) || event.submitter !== button) {
      return;
    }

    const selected = selectedSources().length;

    if (
      submitting
      || selected < 1
      || selected > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
    ) {
      event.preventDefault();

      if (!submitting) {
        showStatus(
          selected < 1
            ? "Seleciona pelo menos uma fonte."
            : `Podes selecionar no máximo ${EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES} fontes.`,
        );
      }

      return;
    }

    update();
    submitting = true;

    if (button) {
      button.disabled = true;
      button.textContent = SUBMITTING_BUTTON_TEXT;
    }

    showStatus("A recolher os textos integrais e a preparar os artigos.");
  };

  form.addEventListener("change", handleChange);
  form.addEventListener("click", handleClick);
  form.addEventListener("submit", handleSubmit);
  pageLifecycleTarget.addEventListener("pageshow", reset);
  update();

  return () => {
    form.removeEventListener("change", handleChange);
    form.removeEventListener("click", handleClick);
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
