import type { MesaThemeCard } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";

export const MESA_THEME_UPDATED_EVENT = "jornada:mesa-theme-updated";
export const MESA_SOURCE_HIDDEN_EVENT = "jornada:mesa-source-hidden";

export function publishMesaThemeUpdate(theme: MesaThemeCard): void {
  window.dispatchEvent(new CustomEvent<MesaThemeCard>(MESA_THEME_UPDATED_EVENT, {
    detail: theme,
  }));
}

export function mesaThemeFromEvent(event: Event): MesaThemeCard | null {
  if (!(event instanceof CustomEvent)) return null;
  const theme = event.detail as Partial<MesaThemeCard> | null;
  return theme && typeof theme.id === "string" && typeof theme.title === "string"
    ? theme as MesaThemeCard
    : null;
}

export function publishMesaSourceHidden(newsroomArticleId: string): void {
  window.dispatchEvent(new CustomEvent<string>(MESA_SOURCE_HIDDEN_EVENT, {
    detail: newsroomArticleId,
  }));
}
