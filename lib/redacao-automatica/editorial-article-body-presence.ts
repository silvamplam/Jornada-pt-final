const NON_WHITESPACE_BODY_PATTERN = "[^[:space:]]";

export function editorialArticleBodyPresencePostgrestFilter(): string {
  return `body=match.${encodeURIComponent(NON_WHITESPACE_BODY_PATTERN)}`;
}

export function editorialArticleBodyHasContent(value: string | null): boolean {
  return Boolean(value?.trim());
}
