export function publicArticleParagraphs(body?: string | null) {
  const normalizedBody = (body ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalizedBody) {
    return [];
  }

  return normalizedBody
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
