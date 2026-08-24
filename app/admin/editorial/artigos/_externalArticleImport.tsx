"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import {
  EDITORIAL_CONTEXT_DESTINATION,
  EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
} from "@/lib/editorial-context-post-title";
import {
  EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,
  parseEditorialExternalArticleResponse,
  parseStoredEditorialExternalArticleTransfer,
  type EditorialExternalArticle,
  type EditorialExternalArticleImageCandidate,
  type EditorialExternalArticleSourcePackage,
} from "@/lib/redacao-automatica/editorial-external-article-import";

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type SourceImageImportResponse = Readonly<{
  ok?: boolean;
  publicUrl?: string;
  error?: string;
}>;

type ExternalArticleImportProps = Readonly<{
  mode?: "create" | "update";
}>;

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

function syncContextPostTitleProfile(form: HTMLFormElement): void {
  const destinationField = formField(form, "editorial_destination");
  const postTitleField = formField(form, "subtitle");
  const contextNote = form.querySelector<HTMLElement>(
    "[data-article-context-post-title-note]",
  );
  const isContext = fieldValue(destinationField) === EDITORIAL_CONTEXT_DESTINATION;

  if (postTitleField instanceof HTMLTextAreaElement) {
    if (isContext) {
      postTitleField.maxLength = EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS;
    } else {
      postTitleField.removeAttribute("maxlength");
    }
  }

  if (contextNote) {
    contextNote.hidden = !isContext;
  }
}

function formContainsEditorialText(form: HTMLFormElement): boolean {
  return ["label", "title", "subtitle", "body"].some((name) => (
    Boolean(fieldValue(formField(form, name)))
  ));
}

function applyArticleToForm(
  form: HTMLFormElement,
  article: EditorialExternalArticle,
  mode: "create" | "update",
): void {
  setFieldValue(formField(form, "label"), article.anteTitle ?? "");
  setFieldValue(formField(form, "title"), article.title);
  setFieldValue(formField(form, "subtitle"), article.postTitle ?? "");
  setFieldValue(formField(form, "body"), article.body);

  if (mode === "create") {
    setFieldValue(
      formField(form, "editorial_destination"),
      article.editorialDestination ?? "",
    );
    syncContextPostTitleProfile(form);

    const slug = formField(form, "slug");
    if (slug && !fieldValue(slug)) {
      const title = formField(form, "title");
      title?.dispatchEvent(new Event("blur"));
    }
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
  if (error === "context_post_title_too_long") {
    return `O pós-título indicado para Contexto ultrapassa ${EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS} caracteres.`;
  }

  return "A resposta não respeita a estrutura editorial esperada.";
}

function sourceImageErrorMessage(error: string | undefined): string {
  if (error === "package-not-found") {
    return "O pacote de fontes já não está disponível para importar a imagem.";
  }
  if (error === "image-unavailable") {
    return "A imagem desta fonte já não está disponível para importação automática.";
  }
  if (error === "missing-editorial-images-bucket") {
    return "O armazenamento editorial de imagens não está disponível.";
  }

  return "Não foi possível importar automaticamente esta imagem.";
}

export default function ExternalArticleImport({
  mode = "create",
}: ExternalArticleImportProps) {
  const isUpdate = mode === "update";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const manualResponseRef = useRef<HTMLTextAreaElement | null>(null);
  const preparedTransferHandledRef = useRef(false);
  const [status, setStatus] = useState("");
  const [reading, setReading] = useState(false);
  const [manualResponse, setManualResponse] = useState("");
  const [sourcePackage, setSourcePackage] = useState<EditorialExternalArticleSourcePackage | null>(null);
  const [imageCandidates, setImageCandidates] = useState<readonly EditorialExternalArticleImageCandidate[]>([]);
  const [importingImagePosition, setImportingImagePosition] = useState<number | null>(null);
  const [selectedImagePosition, setSelectedImagePosition] = useState<number | null>(null);

  const editorForm = (): HTMLFormElement | null => (
    rootRef.current?.closest("form") ?? null
  );

  const clearSourceImages = () => {
    setSourcePackage(null);
    setImageCandidates([]);
    setImportingImagePosition(null);
    setSelectedImagePosition(null);
  };

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

    applyArticleToForm(form, article, mode);

    if (isUpdate) {
      setStatus(
        "Texto atualizado no formulário. A imagem e os restantes dados do artigo foram mantidos. Guarda as alterações para aplicar.",
      );
      return true;
    }

    setStatus(
      article.editorialDestination === EDITORIAL_CONTEXT_DESTINATION
        ? "Notícia preenchida com destino Contexto identificado. Revê os campos e a imagem antes de guardar em revisão."
        : "Notícia preenchida. Revê os campos e a imagem antes de guardar em revisão.",
    );
    return true;
  };

  const importSourceImage = async (
    candidate: EditorialExternalArticleImageCandidate,
    packageLocation: EditorialExternalArticleSourcePackage,
    automatic = false,
  ): Promise<void> => {
    const form = editorForm();
    if (!form) {
      setStatus("Não foi possível localizar o formulário do artigo.");
      return;
    }

    if (isUpdate) {
      setStatus("A atualização por IA mantém a imagem existente.");
      return;
    }

    setImportingImagePosition(candidate.position);
    setStatus(automatic
      ? "A aplicar automaticamente a imagem do pacote…"
      : "A aplicar a imagem escolhida…");

    try {
      const response = await fetch("/api/admin/editorial/artigos/import-source-image", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: packageLocation.year,
          month: packageLocation.month,
          packageId: packageLocation.packageId,
          position: candidate.position,
        }),
      });
      const payload = await response.json().catch(() => null) as SourceImageImportResponse | null;

      if (!response.ok || !payload?.publicUrl) {
        throw new Error(payload?.error || "image-import-failed");
      }

      setFieldValue(formField(form, "image_url"), payload.publicUrl);
      setSelectedImagePosition(candidate.position);
      setStatus(automatic
        ? "Notícia preenchida e imagem do pacote aplicada automaticamente. Revê antes de guardar em revisão."
        : "Imagem aplicada ao artigo. Revê antes de guardar em revisão.");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setStatus(`${sourceImageErrorMessage(code)} Podes escolher outra imagem ou usar o carregamento manual.`);
    } finally {
      setImportingImagePosition(null);
    }
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

    clearSourceImages();
    return importArticle(parsed.value, confirmReplacement);
  };

  useEffect(() => {
    const form = editorForm();
    if (!form) {
      return;
    }

    const destinationField = formField(form, "editorial_destination");
    const sync = () => syncContextPostTitleProfile(form);
    destinationField?.addEventListener("change", sync);
    sync();

    return () => {
      destinationField?.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (preparedTransferHandledRef.current) {
      return;
    }
    preparedTransferHandledRef.current = true;

    if (isUpdate) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("import_external") !== "1") {
      return;
    }

    const stored = window.localStorage.getItem(
      EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,
    );
    const transfer = stored
      ? parseStoredEditorialExternalArticleTransfer(stored)
      : null;

    window.localStorage.removeItem(EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY);
    removeImportQueryParameter();

    if (!transfer) {
      setStatus("A notícia preparada já não está disponível. Cola novamente a resposta no campo abaixo.");
      window.requestAnimationFrame(() => manualResponseRef.current?.focus());
      return;
    }

    if (!importArticle(transfer.article, false)) {
      return;
    }

    setSourcePackage(transfer.sourcePackage);
    setImageCandidates(transfer.imageCandidates);

    if (
      transfer.sourcePackage
      && transfer.imageCandidates.length === 1
    ) {
      void importSourceImage(
        transfer.imageCandidates[0],
        transfer.sourcePackage,
        true,
      );
      return;
    }

    if (
      transfer.sourcePackage
      && transfer.imageCandidates.length > 1
    ) {
      setStatus(
        `Notícia preenchida. O pacote tem ${transfer.imageCandidates.length} imagens: escolhe uma abaixo.`,
      );
    }
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
          <strong>{isUpdate ? "Atualizar com IA" : "Importar notícia gerada"}</strong>
          <p>
            {isUpdate
              ? "Substitui apenas antetítulo, título, pós-título e corpo. Mantém imagem, legenda, autor, endereço, contexto e ligações editoriais."
              : "Preenche antetítulo, título, pós-título e corpo. Nada é guardado ou publicado automaticamente."}
          </p>
        </div>
        <button type="button" onClick={importFromClipboard} disabled={reading}>
          {reading ? "A importar…" : "Preencher a partir do clipboard"}
        </button>
      </div>

      {!isUpdate && sourcePackage && imageCandidates.length > 0 ? (
        <section className="article-admin-external-images" aria-label="Imagens do pacote de fontes">
          <div className="article-admin-external-images-heading">
            <strong>Imagem do pacote</strong>
            <small>
              {imageCandidates.length === 1
                ? "A única imagem disponível é aplicada automaticamente."
                : "Escolhe uma imagem. Nenhuma é selecionada arbitrariamente."}
            </small>
          </div>
          <div className="article-admin-external-images-grid">
            {imageCandidates.map((candidate) => {
              const isLoading = importingImagePosition === candidate.position;
              const isSelected = selectedImagePosition === candidate.position;

              return (
                <button
                  key={`${candidate.position}-${candidate.imageUrl}`}
                  type="button"
                  className="article-admin-external-image-option"
                  data-selected={isSelected ? "true" : undefined}
                  onClick={() => void importSourceImage(candidate, sourcePackage)}
                  disabled={importingImagePosition !== null}
                >
                  <img src={candidate.imageUrl} alt="" />
                  <span>{candidate.sourceCode}</span>
                  <strong>{candidate.articleTitle}</strong>
                  <small>{isLoading ? "A aplicar…" : isSelected ? "Aplicada" : "Usar esta imagem"}</small>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

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
