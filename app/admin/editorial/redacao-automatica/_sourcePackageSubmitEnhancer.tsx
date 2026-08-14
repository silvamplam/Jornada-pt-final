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

function imagePreferenceFor(source: HTMLInputElement) {
  return source.closest("li")?.querySelector<HTMLInputElement>("[data-source-package-image-preference]") ?? null;
}

function sourceHasImage(source: HTMLInputElement) {
  return source.dataset.sourcePackageHasImage === "1";
}

function sourceTitle(source: HTMLInputElement) {
  return source.dataset.sourcePackageTitle?.trim() || "Fonte selecionada";
}

function sourceImageUrl(source: HTMLInputElement) {
  return source.dataset.sourcePackageImageUrl?.trim() || null;
}

export function installSourcePackageSubmitEnhancer(
  form: HTMLFormElement,
  pageLifecycleTarget: EventTarget = window,
): () => void {
  const button = form.querySelector<HTMLButtonElement>("[data-source-package-submit]");
  const status = form.querySelector<HTMLElement>("[data-source-package-submit-status]");
  const count = form.querySelector<HTMLElement>("[data-source-package-selection-count]");
  const suggestedTitleField = form.querySelector<HTMLElement>("[data-source-package-suggested-title]");
  const suggestedTitleInput = suggestedTitleField?.querySelector<HTMLInputElement>('input[name="suggested_title"]') ?? null;
  const imageSummary = form.querySelector<HTMLElement>("[data-source-package-image-summary]");
  const imageSummaryList = imageSummary?.querySelector<HTMLElement>("[data-source-package-image-summary-list]") ?? null;
  const sources = Array.from(
    form.querySelectorAll<HTMLInputElement>("[data-source-package-source]"),
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
    for (const source of sources) {
      if (!source.checked) {
        groupBySource.delete(source.value);
        const preference = imagePreferenceFor(source);
        if (preference) preference.value = "";
        continue;
      }

      if (!groupBySource.has(source.value)) {
        groupBySource.set(source.value, nextUnusedGroup());
      }
    }

    normalizeGroups();
  };

  const ensureImagePreferences = () => {
    const selected = selectedSources();
    const groups = [...new Set(
      selected.map((source) => groupBySource.get(source.value)).filter((value): value is number => Boolean(value)),
    )];

    for (const group of groups) {
      const candidates = selected.filter(
        (source) => groupBySource.get(source.value) === group && sourceHasImage(source),
      );
      const preferred = candidates.find((source) => imagePreferenceFor(source)?.value === "1")
        ?? candidates[0]
        ?? null;

      for (const source of selected.filter((candidate) => groupBySource.get(candidate.value) === group)) {
        const preference = imagePreferenceFor(source);
        if (preference) {
          preference.value = preferred === source ? "1" : "";
        }
      }
    }
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

      if (!source.checked || selected.length < 2) {
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
        option.textContent = `Artigo ${String(group).padStart(2, "0")}`;
        option.selected = group === currentGroup;
        return option;
      });
      const splitOption = document.createElement("option");
      splitOption.value = NEW_ARTICLE_VALUE;
      splitOption.textContent = "Separar para novo artigo";

      select.replaceChildren(
        ...options,
        ...(currentGroupSize > 1 ? [splitOption] : []),
      );
      select.disabled = false;
      control.hidden = false;
    }
  };

  const renderImageSummary = () => {
    if (!imageSummary || !imageSummaryList) {
      return;
    }

    const selected = selectedSources();
    const groups = [...new Set(
      selected.map((source) => groupBySource.get(source.value)).filter((value): value is number => Boolean(value)),
    )].sort((left, right) => left - right);
    const articleCards: HTMLElement[] = [];

    for (const group of groups) {
      const groupSources = selected.filter(
        (source) => groupBySource.get(source.value) === group,
      );
      const candidates = groupSources.filter(
        (source) => sourceHasImage(source) && Boolean(sourceImageUrl(source)),
      );

      if (candidates.length < 2) {
        continue;
      }

      const chosen = candidates.find((source) => imagePreferenceFor(source)?.value === "1")
        ?? candidates[0];
      const articleCard = document.createElement("section");
      articleCard.dataset.sourcePackageImageArticle = String(group);

      const header = document.createElement("div");
      header.dataset.sourcePackageImageArticleHeader = "";
      const title = document.createElement("strong");
      title.textContent = `Artigo ${String(group).padStart(2, "0")}`;
      const detail = document.createElement("span");
      detail.textContent = `${groupSources.length} ${groupSources.length === 1 ? "fonte" : "fontes"} · ${candidates.length} imagens disponíveis`;
      header.append(title, detail);

      const options = document.createElement("div");
      options.dataset.sourcePackageImageOptions = "";

      for (const candidate of candidates) {
        const imageUrl = sourceImageUrl(candidate);
        if (!imageUrl) {
          continue;
        }

        const isChosen = candidate === chosen;
        const option = isChosen ? document.createElement("div") : document.createElement("button");
        option.dataset.sourcePackageImageOption = "";
        option.dataset.selected = isChosen ? "true" : "false";

        if (option instanceof HTMLButtonElement) {
          option.type = "button";
          option.dataset.sourcePackageUseImage = candidate.value;
        }

        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";

        const copy = document.createElement("span");
        const sourceName = document.createElement("strong");
        sourceName.textContent = sourceTitle(candidate);
        const action = document.createElement("small");
        action.textContent = isChosen ? "Imagem escolhida" : "Usar esta imagem";
        copy.append(sourceName, action);
        option.append(image, copy);
        options.append(option);
      }

      articleCard.append(header, options);
      articleCards.push(articleCard);
    }

    imageSummaryList.replaceChildren(...articleCards);
    imageSummary.hidden = articleCards.length === 0;
  };

  const update = () => {
    ensureSelectedGroups();
    ensureImagePreferences();
    renderGroupControls();
    renderImageSummary();

    const selected = selectedSources().length;
    const articleCount = new Set(groupBySource.values()).size;

    if (count) {
      count.textContent = selected === 0
        ? "0 fontes selecionadas"
        : `${selected} ${selected === 1 ? "fonte selecionada" : "fontes selecionadas"} · ${articleCount} ${articleCount === 1 ? "artigo final" : "artigos finais"}`;
    }

    if (suggestedTitleField && suggestedTitleInput) {
      const titleApplies = selected > 0 && articleCount === 1;
      suggestedTitleField.hidden = !titleApplies;
      suggestedTitleInput.disabled = !titleApplies;
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
    const button = target instanceof Element
      ? target.closest<HTMLButtonElement>("[data-source-package-use-image]")
      : null;
    const sourceId = button?.dataset.sourcePackageUseImage?.trim() ?? "";
    const source = sources.find((candidate) => candidate.value === sourceId) ?? null;
    const group = source ? groupBySource.get(source.value) : null;

    if (!button || !source?.checked || !group || !sourceHasImage(source)) {
      return;
    }

    for (const candidate of selectedSources()) {
      if (groupBySource.get(candidate.value) !== group) {
        continue;
      }
      const preference = imagePreferenceFor(candidate);
      if (preference) {
        preference.value = candidate === source ? "1" : "";
      }
    }

    showStatus("");
    renderImageSummary();
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
