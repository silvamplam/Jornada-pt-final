const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestedEditorialArticle =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "invalid"; value: string }>
  | Readonly<{ kind: "valid"; id: string }>;

export function requestedEditorialArticleId(
  articleId: string | undefined,
  mode: string | undefined,
): RequestedEditorialArticle {
  if (mode === "novo" || articleId === undefined) {
    return { kind: "absent" };
  }

  const normalized = articleId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    return { kind: "invalid", value: articleId };
  }

  return { kind: "valid", id: normalized };
}

export type EditorialArticleEditorData<T> = Readonly<{
  request: RequestedEditorialArticle;
  article: T | null;
  state: "ready" | "invalid" | "not_found" | "unavailable";
}>;

export async function getEditorialArticleEditorData<T>(
  articleId: string | undefined,
  mode: string | undefined,
  readById: (id: string) => Promise<Readonly<{ ok: true; value: T | null }> | Readonly<{ ok: false }>>,
): Promise<EditorialArticleEditorData<T>> {
  const request = requestedEditorialArticleId(articleId, mode);
  if (request.kind === "absent") {
    return { request, article: null, state: "ready" };
  }
  if (request.kind === "invalid") {
    return { request, article: null, state: "invalid" };
  }

  const result = await readById(request.id);
  if (!result.ok) {
    return { request, article: null, state: "unavailable" };
  }
  return {
    request,
    article: result.value,
    state: result.value ? "ready" : "not_found",
  };
}
