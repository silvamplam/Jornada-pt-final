// Called once after a successful original upload, never by an image renderer.
// Call with void: the original must be available without waiting for previews.
// Self-contained so legacy inline upload forms can embed this same function.
export async function completeEditorialImagePreviews(signed: { path?: unknown; previewTicket?: unknown } | null) {
  if (!signed || typeof signed.path !== "string" || typeof signed.previewTicket !== "string") return;
  try {
    const response = await fetch("/api/admin/editorial/image-previews/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: signed.path, ticket: signed.previewTicket }),
      keepalive: true, // Small path/ticket POST can continue across navigation.
      signal: AbortSignal.timeout(45000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) console.warn("[editorial-preview] completion failed", { path: signed.path, status: response.status });
  } catch {
    console.warn("[editorial-preview] completion unavailable", { path: signed.path });
  }
}
