"use client";
import { useRef, useState } from "react";
import BackofficeImage from "./BackofficeImage";

/** Only the explicit acquisition button starts networking. Retrying keeps the
 * same decision key, persisted in the browser across navigation/reloads. */
export default function FreezeEditorialImage({ sourceUrl, dossierImageId, onConfirm }: {
  sourceUrl: string; dossierImageId?: string; onConfirm(url: string): void;
}) {
  const key = useRef<string | null>(null);
  const [candidate, setCandidate] = useState<{ publicUrl: string; sha256: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function acquire(fresh = false, confirm = false) {
    setBusy(true); setError("");
    try {
      const cacheKey = `jornada:image-decision:${dossierImageId ?? sourceUrl}`;
      key.current = fresh ? crypto.randomUUID() : key.current ?? localStorage.getItem(cacheKey) ?? crypto.randomUUID();
      localStorage.setItem(cacheKey, key.current);
      if (fresh) { setCandidate(null); setLoaded(false); }
      const response = await fetch("/api/admin/editorial/images/freeze", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, dossierImageId, decisionKey: key.current, confirm }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "image-freeze-failed");
      setCandidate(result.image);
      if (confirm) onConfirm(result.image.publicUrl);
    } catch { setError("Não foi possível concluir. Repetir mantém a candidata; obter novamente inicia uma nova revisão."); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" disabled={busy} onClick={() => void acquire()}>{busy ? "A preparar…" : candidate ? "Repetir operação" : "Congelar para rever"}</button>
    {candidate ? <div>
      <BackofficeImage src={candidate.publicUrl} previewWidth={640} alt="Cópia congelada para confirmação" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
      <button type="button" disabled={busy || !loaded} onClick={() => void acquire(false, true)}>Confirmar esta imagem</button>
      <details><summary>Proveniência</summary><a href={sourceUrl} target="_blank" rel="noreferrer">Origem</a><code>{candidate.sha256}</code></details>
    </div> : null}
    <button type="button" disabled={busy} onClick={() => void acquire(true)}>Obter novamente da origem e rever</button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
