"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import {
  EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,
  parseEditorialExternalArticleResponse,
  storedEditorialExternalArticle,
  type EditorialExternalArticle,
} from "@/lib/redacao-automatica/editorial-external-article-import";

import styles from "./redacao-automatica.module.css";

type SourcePackageActionsProps = Readonly<{
  contentUrl: string;
  downloadUrl: string;
  fileName: string;
  genreLabel: string;
  imagesUrl: string;
  imagesFileName: string;
  imageSourceCount: number;
}>;

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy_failed");
    }
  } finally {
    textarea.remove();
  }
}

function parseErrorMessage(error: string): string {
  if (error === "response_empty") {
    return "A resposta está vazia.";
  }
  if (error === "title_missing") {
    return "Não foi encontrado um TÍTULO válido.";
  }
  if (error === "body_missing") {
    return "Não foi encontrado um CORPO válido.";
  }
  if (error === "markers_incomplete") {
    return "A resposta contém apenas um dos marcadores de importação.";
  }
  if (error === "field_too_long") {
    return "A resposta ultrapassa o limite de um dos campos editoriais.";
  }

  return "A resposta não respeita a estrutura de importação da Jornada.pt.";
}

function storeArticle(article: EditorialExternalArticle): void {
  window.localStorage.setItem(
    EDITORIAL_EXTERNAL_ARTICLE_STORAGE_KEY,
    JSON.stringify(storedEditorialExternalArticle(article)),
  );
}

function articlesUrl(): string {
  return new URL(
    "/admin/editorial/artigos?import_external=1",
    window.location.origin,
  ).toString();
}

export default function SourcePackageActions({
  contentUrl,
  downloadUrl,
  fileName,
  genreLabel,
  imagesUrl,
  imagesFileName,
  imageSourceCount,
}: SourcePackageActionsProps) {
  const manualResponseRef = useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [manualResponse, setManualResponse] = useState("");

  const copyPackage = async () => {
    if (copying) {
      return;
    }

    setCopying(true);
    setStatus(`A copiar o pacote para ${genreLabel.toLowerCase()}…`);

    try {
      const response = await fetch(contentUrl, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("package_unavailable");
      }

      await copyText(await response.text());
      setStatus(`Pacote para ${genreLabel.toLowerCase()} copiado. Já podes trabalhá-lo aqui.`);
    } catch {
      setStatus("Não foi possível copiar. Descarrega o ficheiro .md.");
    } finally {
      setCopying(false);
    }
  };

  const openArticle = (article: EditorialExternalArticle) => {
    storeArticle(article);
    setStatus("Notícia preparada para preencher o editor.");
    window.location.assign(articlesUrl());
  };

  const importText = (text: string): boolean => {
    const parsed = parseEditorialExternalArticleResponse(text);

    if (!parsed.ok) {
      setStatus(parseErrorMessage(parsed.error));
      return false;
    }

    openArticle(parsed.value);
    return true;
  };

  const focusManualPaste = () => {
    window.requestAnimationFrame(() => {
      manualResponseRef.current?.focus();
    });
  };

  const importResponse = async () => {
    if (importing) {
      return;
    }

    if (manualResponse.trim()) {
      importText(manualResponse);
      return;
    }

    setImporting(true);
    setStatus("A ler a notícia copiada…");

    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("clipboard_unavailable");
      }

      const clipboardText = await navigator.clipboard.readText();
      importText(clipboardText);
    } catch {
      setStatus("O navegador bloqueou a leitura automática. Cola a resposta no campo abaixo; ao colar, os Artigos abrem automaticamente.");
      focusManualPaste();
    } finally {
      setImporting(false);
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

    importText(pastedText);
  };

  const importManualResponse = () => {
    importText(manualResponse);
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
    <div className={styles.sourcePackageActions}>
      <div className={styles.sourcePackageActionButtons}>
        <a
          className={styles.sourcePackageButton}
          href={downloadUrl}
          download={fileName}
          onClick={() => setStatus(`Download de ${fileName} iniciado.`)}
        >
          Descarregar .md — {genreLabel}
        </a>
        {imageSourceCount > 0 ? (
          <a
            className={styles.sourcePackageButton}
            href={imagesUrl}
            download={imagesFileName}
            onClick={() => setStatus(
              `A preparar ${imageSourceCount} ${imageSourceCount === 1 ? "imagem" : "imagens"} para download…`,
            )}
          >
            Descarregar imagens (.zip) — {imageSourceCount}
          </a>
        ) : null}
        <button
          className={styles.sourcePackageButton}
          type="button"
          onClick={copyPackage}
          disabled={copying}
        >
          {copying ? "A copiar…" : `Copiar fontes — ${genreLabel}`}
        </button>
        <button
          className={`${styles.sourcePackageButton} ${styles.sourcePackagePrimaryButton}`}
          type="button"
          onClick={importResponse}
          disabled={importing}
        >
          {importing ? "A importar…" : "Ler clipboard e abrir Artigos"}
        </button>
      </div>

      <label className={styles.sourcePackagePasteField}>
        <span>Resposta da IA</span>
        <textarea
          ref={manualResponseRef}
          value={manualResponse}
          onChange={(event) => setManualResponse(event.target.value)}
          onPaste={importPastedResponse}
          onKeyDown={handleManualKeyDown}
          rows={7}
          placeholder="Cola aqui a resposta completa. Ao colar, o editor de Artigos abre automaticamente."
        />
      </label>

      <div className={styles.sourcePackagePasteFooter}>
        <button
          className={styles.sourcePackagePasteButton}
          type="button"
          onClick={importManualResponse}
          disabled={!manualResponse.trim()}
        >
          Abrir Artigos com o texto colado
        </button>
        <small>O botão principal tenta ler o clipboard; se o navegador bloquear, cola aqui. Também podes usar Ctrl+Enter depois de corrigir o texto.</small>
      </div>

      <p className={styles.sourcePackageActionStatus} role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
