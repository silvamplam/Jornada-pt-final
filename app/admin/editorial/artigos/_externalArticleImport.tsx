"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import {
  EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,
  parseEditorialExternalArticleResponse,
  parseStoredEditorialExternalArticle,
  type EditorialExternalArticle,
} from "@/lib/redacao-automatica/editorial-external-article-import";

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function formField(
  form: HTMLFormElement,
  name: string,
): FormField | null {
  return form.elements.namedItem(name) as FormField | null;
}

function fieldValue(field: FormField | null): string {
  return field?.value.trim() ?? "";
}

function setFieldValue(field: FormField | null, value: string): void {
  if (!field) {
    return;
  }

  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function formContainsEditorialText(form: HTMLFormElement): boolean {
  return ["label", "title", "subtitle", "body"].some((name) => (
    Boolean(fieldValue(formField(form, name)))
  ));
}

function applyArticleToForm(
  form: HTMLFormElement,
  article: EditorialExternalArticle,
): void {
  setFieldValue(formField(form, "label"), article.anteTitle ?? "");
  setFieldValue(formField(form, "title"), article.title);
  setFieldValue(formField(form, "subtitle"), article.postTitle ?? "");
  setFieldValue(formField(form, "body"), article.body);

  const slug = formField(form, "slug");
  if (slug && !fieldValue(slug)) {
    const title = formField(form, "title");
    title?.dispatchEvent(new Event("blur"));
  }

  formField(form, "title")?.focus();
}

function removeImportQueryParameter(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("import_external")) {
    return;
  }

  url.searchParams.delete("import_external");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function parseErrorMessage(error: string): string {
  if (error === "response_empty") {
    return "A resposta está vazia.";
  }
  if (error === "markers_incomplete") {
    return "A resposta contém apenas um dos marcadores de importação.";
  }
  if (error === "title_missing") {
    return "Não foi encontrado um TÍTULO válido.";
  }
  if (error === "body_missing") {
    return "Não foi encontrado um CORPO válido.";
  }
  if (error === "field_too_long") {
    return "A resposta ultrapassa o limite de um dos campos editoriais.";
  }

  return "A resposta não respeita a estrutura ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO.";
}

export default function ExternalArticleImport() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const manualResponseRef = useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = useState("");
  const [reading, setReading] = useState(false);
  const [manualResponse, setManualResponse] = useState("");

  const editorForm = (): HTMLFormElement | null => (
    rootRef.current?.closest("form") ?? null
  );

  const importArticle = (
    article: EditorialExternalArticle,
    confirmReplacement: boolean,
  ): boolean => {
    const form = editorForm();
    if (!form) {
      setStatus("Não foi possível localizar o formulário do artigo.");
      return false;
    }

    if (
      confirmReplacement
      && formContainsEditorialText(form)
      && !window.confirm("Substituir o antetítulo, título, pós-título e corpo atuais?")
    ) {
      setStatus("Importação cancelada.");
      return false;
    }

    applyArticleToForm(form, article);
    setStatus("Notícia preenchida. Revê os campos, escolhe a imagem e guarda em revisão.");
    return true;
  };

  const importText = (
    text: string,
    confirmReplacement: boolean,
  ): boolean => {
    const parsed = parseEditorialExternalArticleResponse(text);

    if (!parsed.ok) {
      setStatus(parseErrorMessage(parsed.error));
      return false;
    }

    return importArticle(parsed.value, confirmReplacement);
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("import_external") !== "1") {
      return;
    }

    const stored = window.localStorage.getItem(
      EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,
    );
    const article = stored
      ? parseStoredEditorialExternalArticle(stored)
      : null;

    window.localStorage.removeItem(EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY);
    removeImportQueryParameter();

    if (!article) {
      setStatus("A notícia preparada já não está disponível. Cola novamente a resposta no campo abaixo.");
      window.requestAnimationFrame(() => manualResponseRef.current?.focus());
      return;
    }

    importArticle(article, false);
  }, []);

  const importFromClipboard = async () => {
    if (reading) {
      return;
    }

    if (manualResponse.trim()) {
      importText(manualResponse, true);
      return;
    }

    if (!navigator.clipboard?.readText) {
      setStatus("O navegador bloqueia a leitura automática. Cola a resposta no campo abaixo; ao colar, os campos são preenchidos.");
      manualResponseRef.current?.focus();
      return;
    }

    setReading(true);
    setStatus("A ler a resposta copiada…");

    try {
      const clipboardText = await navigator.clipboard.readText();
      importText(clipboardText, true);
    } catch {
      setStatus("O navegador bloqueou a leitura automática. Cola a resposta no campo abaixo; ao colar, os campos são preenchidos.");
      manualResponseRef.current?.focus();
    } finally {
      setReading(false);
    }
  };

  const importPastedResponse = (
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText.trim()) {
      return;
    }

    event.preventDefault();
    setManualResponse(pastedText);
    importText(pastedText, true);
  };

  const importManualResponse = () => {
    importText(manualResponse, true);
  };

  const handleManualKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      importManualResponse();
    }
  };

  return (
    <div className="article-admin-external-import" ref={rootRef}>
      <div className="article-admin-external-import-heading">
        <div>
          <strong>Importar notícia gerada</strong>
          <p>
            Preenche antetítulo, título, pós-título e corpo. Nada é guardado ou publicado automaticamente.
          </p>
        </div>
        <button type="button" onClick={importFromClipboard} disabled={reading}>
          {reading ? "A importar…" : "Preencher a partir do clipboard"}
        </button>
      </div>

      <label className="article-admin-external-import-paste">
        <span>Resposta da IA</span>
        <textarea
          ref={manualResponseRef}
          value={manualResponse}
          onChange={(event) => setManualResponse(event.target.value)}
          onPaste={importPastedResponse}
          onKeyDown={handleManualKeyDown}
          rows={6}
          placeholder="Cola aqui a resposta completa. Ao colar, os campos são preenchidos imediatamente."
        />
      </label>

      <div className="article-admin-external-import-footer">
        <button
          type="button"
          onClick={importManualResponse}
          disabled={!manualResponse.trim()}
        >
          Preencher com o texto colado
        </button>
        <small>Também podes usar Ctrl+Enter depois de corrigir o texto.</small>
      </div>

      <p role="status" aria-live="polite">{status}</p>
    </div>
  );
}
