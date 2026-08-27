const MAX_ADMIN_RESPONSE_DETAIL_LENGTH = 240;

function responseMediaType(contentType: string | null) {
  return contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase() ?? "";
}

function isJsonMediaType(mediaType: string) {
  return mediaType === "application/json"
    || mediaType.endsWith("+json");
}

function safeResponseDetail(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= MAX_ADMIN_RESPONSE_DETAIL_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ADMIN_RESPONSE_DETAIL_LENGTH)}…`;
}

function jsonErrorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["detail", "message", "error"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return safeResponseDetail(value);
    }
  }

  const nestedError = record.error;
  if (
    nestedError
    && typeof nestedError === "object"
    && !Array.isArray(nestedError)
  ) {
    const message = (nestedError as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return safeResponseDetail(message);
    }
  }

  return "";
}

export async function readAdminJsonResponse<T>(response: Response): Promise<T> {
  const mediaType = responseMediaType(
    response.headers.get("content-type"),
  );

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch {
    throw new Error(
      `Não foi possível ler a resposta administrativa (HTTP ${response.status}).`,
    );
  }

  if (!isJsonMediaType(mediaType)) {
    const safeText = mediaType === "text/html"
      || mediaType === "application/xhtml+xml"
      ? ""
      : safeResponseDetail(rawBody);

    if (!response.ok) {
      throw new Error(
        safeText
          ? `Pedido administrativo falhou (HTTP ${response.status}): ${safeText}`
          : `Pedido administrativo falhou (HTTP ${response.status}; ${mediaType || "Content-Type ausente"}).`,
      );
    }

    throw new Error(
      `Resposta administrativa sem JSON (HTTP ${response.status}; ${mediaType || "Content-Type ausente"}).`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Resposta JSON inválida (HTTP ${response.status}; ${mediaType}).`,
    );
  }

  if (!response.ok) {
    const detail = jsonErrorDetail(payload);
    throw new Error(
      detail
        ? `Pedido administrativo falhou (HTTP ${response.status}): ${detail}`
        : `Pedido administrativo falhou (HTTP ${response.status}).`,
    );
  }

  return payload as T;
}
