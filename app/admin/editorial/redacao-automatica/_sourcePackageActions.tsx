"use client";

import { useState, type ClipboardEvent, type KeyboardEvent } from "react";

import {
  preflightEditorialArticleBatch,
} from "@/lib/redacao-automatica/editorial-batch-parser";
import {
  EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
  EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
  type EditorialBatchTransferSourcePackage,
} from "@/lib/redacao-automatica/editorial-batch-transfer";

import styles from "./redacao-automatica.module.css";

type SourcePackageActionsProps = Readonly<{
  contentUrl: string;
  genreLabel: string;
  imagesUrl: string;
  imagesFileName: string;
  imageSourceCount: number;
  articleCount: number;
  sourcePackage: EditorialBatchTransferSourcePackage;
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

function batchPublicationUrl(): string {
  return new URL(
    "/admin/editorial/redacao-automatica/publicacao-lote",
    window.location.origin,
  ).toString();
}

export default function SourcePackageActions({
  contentUrl,
  genreLabel,
  imagesUrl,
  imagesFileName,
  imageSourceCount,
  articleCount,
  sourcePackage,
}: SourcePackageActionsProps) {
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);
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
      setStatus(`Pacote para ${genreLabel.toLowerCase()} copiado.`);
    } catch {
      setStatus("Não foi possível copiar o pacote neste momento.");
    } finally {
      setCopying(false);
    }
  };

  const importText = (text: string): boolean => {
    const preflight = preflightEditorialArticleBatch(text);

    if (!preflight.ready) {
      setStatus("A resposta ainda não respeita integralmente o formato JORNADA_ARTIGO_V1.");
      return false;
    }

    if (preflight.total !== articleCount) {
      setStatus(
        `Este pacote tem ${articleCount} ${articleCount === 1 ? "artigo final" : "artigos finais"}, mas a resposta contém ${preflight.total}.`,
      );
      return false;
    }

    window.sessionStorage.setItem(EDITORIAL_BATCH_TRANSFER_STORAGE_KEY, text);
    window.sessionStorage.setItem(
      EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
      JSON.stringify(sourcePackage),
    );
    setStatus(
      `${articleCount} ${articleCount === 1 ? "artigo reconhecido" : "artigos reconhecidos"}. A abrir Publicação em lote…`,
    );
    window.location.assign(batchPublicationUrl());
    return true;
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

  const handleManualKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      importText(manualResponse);
    }
  };

  return (
    <div className={styles.sourcePackageActions}>
      <div className={styles.sourcePackageActionButtons}>
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
          {copying ? "A copiar…" : `Copiar pacote para ChatGPT — ${genreLabel}`}
        </button>
      </div>

      <label className={styles.sourcePackagePasteField}>
        <span>Colar resposta do ChatGPT</span>
        <textarea
          value={manualResponse}
          onChange={(event) => setManualResponse(event.target.value)}
          onPaste={importPastedResponse}
          onKeyDown={handleManualKeyDown}
          rows={9}
          placeholder={`Cola aqui ${articleCount === 1 ? "o artigo" : `os ${articleCount} artigos`} JORNADA_ARTIGO_V1. Ao colar, o texto segue diretamente para a Publicação em lote.`}
        />
      </label>

      <p className={styles.sourcePackagePasteHint}>
        Cola diretamente no campo. Se corrigires o texto depois de colar, usa Ctrl+Enter para continuar.
      </p>

      {status ? (
        <p className={styles.sourcePackageActionStatus} role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}
