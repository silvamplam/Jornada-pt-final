"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { MANUAL_NEWSROOM_BODY_MAX_LENGTH } from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import {
  JORNADA_MANUAL_IMAGE_MESSAGE,
  JORNADA_MANUAL_SOURCE_HELLO,
  JORNADA_MANUAL_SOURCE_MESSAGE,
  JORNADA_MANUAL_SOURCE_READY,
  SEND_IMAGE_TO_JORNADA_BOOKMARKLET,
  SEND_TO_JORNADA_BOOKMARKLET,
} from "@/lib/redacao-automatica/manual-source-bookmarklets";

import styles from "./mesa.module.css";

const ROUTE = "/api/admin/editorial/redacao-automatica/mesa/manual-source";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

type SaveResponse = Readonly<{
  ok?: unknown;
  action?: unknown;
  newsroomArticleId?: unknown;
  error?: unknown;
}>;

function validDateOnly(value: string): boolean {
  if (!value) return true;
  const match = value.match(DATE_ONLY);
  if (!match) return false;
  const checked = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return checked.getUTCFullYear() === Number(match[1])
    && checked.getUTCMonth() === Number(match[2]) - 1
    && checked.getUTCDate() === Number(match[3]);
}

function validHttpUrl(value: string, required: boolean): boolean {
  const candidate = value.trim();
  if (!candidate) return !required;
  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

export default function ManualSourceEntry({
  initiallyOpen,
  maxDate,
  savedState,
}: Readonly<{
  initiallyOpen: boolean;
  maxDate: string;
  savedState: "created" | "reused" | null;
}>) {
  const [open, setOpen] = useState(initiallyOpen);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePageTitle, setSourcePageTitle] = useState("");
  const [sourceHost, setSourceHost] = useState("");
  const [status, setStatus] = useState(savedState
    ? savedState === "created" ? "Fonte guardada em NOVAS." : "Esta fonte já estava guardada em NOVAS."
    : "");
  const [submitting, setSubmitting] = useState(false);
  const submissionIdRef = useRef("");
  const acceptedSourcesRef = useRef(new Set<MessageEventSource>());
  const sourceBookmarkRef = useRef<HTMLAnchorElement>(null);
  const imageBookmarkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    sourceBookmarkRef.current?.setAttribute("href", SEND_TO_JORNADA_BOOKMARKLET);
    imageBookmarkRef.current?.setAttribute("href", SEND_IMAGE_TO_JORNADA_BOOKMARKLET);
  }, []);

  useEffect(() => {
    function ready(target: MessageEventSource, origin: string) {
      if ("postMessage" in target) {
        (target as Window).postMessage({
          type: JORNADA_MANUAL_SOURCE_READY,
          version: 1,
        }, origin);
      }
    }

    function onMessage(event: MessageEvent) {
      const payload = record(event.data);
      if (!payload || payload.version !== 1 || !event.source) return;

      if (payload.type === JORNADA_MANUAL_SOURCE_HELLO) {
        acceptedSourcesRef.current.add(event.source);
        ready(event.source, event.origin);
        return;
      }

      const sourceAccepted = acceptedSourcesRef.current.has(event.source);
      if (!sourceAccepted) return;

      if (payload.type === JORNADA_MANUAL_IMAGE_MESSAGE) {
        const nextImage = text(payload.imageUrl, 2048);
        if (nextImage === null || !validHttpUrl(nextImage, true)) {
          setOpen(true);
          setStatus("O favorito não encontrou um URL de imagem http/https válido.");
          return;
        }
        setImageUrl(nextImage);
        setOpen(true);
        setStatus("Imagem recebida. O Corpo e a Data foram mantidos.");
        return;
      }

      if (payload.type !== JORNADA_MANUAL_SOURCE_MESSAGE) return;
      const nextBody = text(payload.body, MANUAL_NEWSROOM_BODY_MAX_LENGTH);
      const nextImage = text(payload.imageUrl, 2048);
      const nextDate = text(payload.publishedDate, 10);
      const nextSourceUrl = text(payload.sourceUrl, 4096);
      const nextPageTitle = text(payload.sourcePageTitle, 500);
      const nextHost = text(payload.sourceHost, 255);
      if (
        nextBody === null
        || nextImage === null
        || nextDate === null
        || nextSourceUrl === null
        || nextPageTitle === null
        || nextHost === null
        || !validDateOnly(nextDate)
        || !validHttpUrl(nextImage, false)
        || !validHttpUrl(nextSourceUrl, false)
      ) {
        setOpen(true);
        setStatus("Os dados recebidos do favorito não são válidos.");
        return;
      }
      setBody(nextBody);
      setImageUrl(nextImage);
      setPublishedDate(nextDate);
      setSourceUrl(nextSourceUrl);
      setSourcePageTitle(nextPageTitle);
      setSourceHost(nextHost);
      setOpen(true);
      setStatus(!nextBody
        ? "Não foi possível extrair o corpo. Seleciona o texto na página ou cola-o aqui."
        : !nextImage
          ? "Corpo recebido, mas falta indicar uma imagem válida."
          : "Fonte recebida. Confirma os campos antes de guardar.");
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!body.trim()) {
      setStatus("O Corpo é obrigatório.");
      return;
    }
    if (!validHttpUrl(imageUrl, true)) {
      setStatus("Indica um URL de imagem http/https válido, sem credenciais.");
      return;
    }
    if (!validDateOnly(publishedDate) || (publishedDate && publishedDate > maxDate)) {
      setStatus("Indica uma data válida, não posterior a hoje.");
      return;
    }

    if (!submissionIdRef.current) submissionIdRef.current = crypto.randomUUID();
    setSubmitting(true);
    setStatus("A guardar a fonte em NOVAS…");
    try {
      const response = await fetch(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submissionIdRef.current,
          body,
          imageUrl,
          publishedDate: publishedDate || null,
          sourceUrl: sourceUrl || null,
          sourcePageTitle: sourcePageTitle || null,
          sourceHost: sourceHost || null,
        }),
      });
      const payload = await response.json().catch(() => null) as SaveResponse | null;
      if (
        !response.ok
        || payload?.ok !== true
        || (payload.action !== "created" && payload.action !== "reused")
        || typeof payload.newsroomArticleId !== "string"
      ) {
        if (response.status === 409) throw new Error("Esta tentativa já foi usada com dados diferentes. Abre de novo o painel.");
        throw new Error("Não foi possível guardar a fonte.");
      }
      const next = new URL("/admin/editorial/redacao-automatica/mesa", window.location.origin);
      next.searchParams.set("tab", "novas");
      next.searchParams.set("classification", "all");
      next.searchParams.set("manual_source_state", payload.action);
      next.searchParams.set("articleId", payload.newsroomArticleId);
      window.location.assign(next.toString());
    } catch (error) {
      setSubmitting(false);
      setStatus(error instanceof Error ? error.message : "Não foi possível guardar a fonte.");
    }
  }

  return (
    <div className={styles.manualSourceEntry}>
      <button
        type="button"
        className={styles.manualSourceToggle}
        aria-expanded={open}
        aria-controls="mesa-manual-source-panel"
        onClick={() => setOpen((current) => !current)}
      >
        Adicionar notícia
      </button>
      {savedState && !open ? <span className={styles.manualSourceSaved} role="status">{status}</span> : null}
      <section
        id="mesa-manual-source-panel"
        className={styles.manualSourcePanel}
        hidden={!open}
        aria-label="Adicionar fonte manual"
      >
        <header>
          <div>
            <strong>Adicionar notícia</strong>
            <span>Introduz uma fonte para a Mesa, não um artigo editorial.</span>
          </div>
          <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}>×</button>
        </header>

        <form onSubmit={handleSubmit}>
          <label>
            <span>Corpo</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={MANUAL_NEWSROOM_BODY_MAX_LENGTH}
              rows={11}
              required
            />
          </label>
          <label>
            <span>Imagem</span>
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              maxLength={2048}
              placeholder="https://…"
              required
            />
          </label>
          <label>
            <span>Data da notícia <small>(opcional)</small></span>
            <input
              type="date"
              value={publishedDate}
              onChange={(event) => setPublishedDate(event.target.value)}
              max={maxDate}
            />
          </label>

          <div className={styles.bookmarklets}>
            <p>Arrasta estes favoritos para a barra do browser:</p>
            <div>
              <a ref={sourceBookmarkRef} href="#" draggable>
                Enviar para Jornada
              </a>
              <span>traz Corpo + Imagem + Data opcional</span>
            </div>
            <div>
              <a ref={imageBookmarkRef} href="#" draggable>
                Enviar imagem para Jornada
              </a>
              <span>traz apenas uma imagem</span>
            </div>
          </div>

          <div className={styles.manualSourceSubmit}>
            <button type="submit" disabled={submitting}>Guardar em NOVAS</button>
            <span role="status" aria-live="polite">{status}</span>
          </div>
        </form>
      </section>
    </div>
  );
}
