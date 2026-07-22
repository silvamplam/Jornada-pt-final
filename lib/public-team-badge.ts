export type PublicTeamBadgeContrastMode = "standard" | "light-detail";

type PublicTeamBadgeVisualConfig = {
  opticalScale: number;
  contrastMode: PublicTeamBadgeContrastMode;
};

export type PublicTeamBadgePresentation =
  | { kind: "fallback"; opticalScale: number; contrastMode: PublicTeamBadgeContrastMode }
  | {
      kind: "image";
      logoUrl: string;
      opticalScale: number;
      contrastMode: PublicTeamBadgeContrastMode;
    };

const DEFAULT_VISUAL_CONFIG: PublicTeamBadgeVisualConfig = {
  opticalScale: 1,
  contrastMode: "standard"
};

const TEAM_VISUAL_CONFIG = new Map<string, PublicTeamBadgeVisualConfig>([
  ["sporting", { opticalScale: 1.38, contrastMode: "standard" }],
  ["santa-clara", { opticalScale: 1, contrastMode: "light-detail" }],
  ["athletic-club", { opticalScale: 0.89, contrastMode: "standard" }],
  ["atletico-de-madrid", { opticalScale: 1.10, contrastMode: "standard" }],
  ["deportivo-alaves", { opticalScale: 1.10, contrastMode: "standard" }],
  ["elche-cf", { opticalScale: 0.98, contrastMode: "standard" }],
  ["fc-barcelona", { opticalScale: 0.88, contrastMode: "standard" }],
  ["getafe-cf", { opticalScale: 1.10, contrastMode: "standard" }],
  ["levante-ud", { opticalScale: 0.95, contrastMode: "standard" }],
  ["malaga-cf", { opticalScale: 0.92, contrastMode: "standard" }],
  ["osasuna", { opticalScale: 1.10, contrastMode: "standard" }],
  ["rayo-vallecano", { opticalScale: 1.10, contrastMode: "standard" }],
  ["rc-celta-de-vigo", { opticalScale: 1.10, contrastMode: "standard" }],
  ["rc-deportivo", { opticalScale: 0.96, contrastMode: "standard" }],
  ["rcd-espanyol", { opticalScale: 1.10, contrastMode: "standard" }],
  ["real-betis", { opticalScale: 1.10, contrastMode: "standard" }],
  ["real-madrid", { opticalScale: 1.02, contrastMode: "standard" }],
  ["real-racing-club", { opticalScale: 1.06, contrastMode: "standard" }],
  ["real-sociedad", { opticalScale: 0.96, contrastMode: "standard" }],
  ["sevilla-fc", { opticalScale: 0.97, contrastMode: "standard" }],
  ["valencia-cf", { opticalScale: 0.96, contrastMode: "standard" }],
  ["villarreal-cf", { opticalScale: 0.97, contrastMode: "standard" }]
]);

function resolveVisualConfig(slug?: string | null) {
  const normalizedSlug = slug?.trim().toLocaleLowerCase("pt-PT");
  return normalizedSlug ? TEAM_VISUAL_CONFIG.get(normalizedSlug) ?? DEFAULT_VISUAL_CONFIG : DEFAULT_VISUAL_CONFIG;
}

export function resolvePublicTeamBadgePresentation(
  logoUrl: string | null | undefined,
  slug?: string | null
): PublicTeamBadgePresentation {
  const visualConfig = resolveVisualConfig(slug);
  const candidateUrl = logoUrl?.trim();
  if (!candidateUrl) return { kind: "fallback", ...visualConfig };

  try {
    const parsedUrl = new URL(candidateUrl);
    if (parsedUrl.protocol !== "https:") return { kind: "fallback", ...visualConfig };
    return { kind: "image", logoUrl: candidateUrl, ...visualConfig };
  } catch {
    return { kind: "fallback", ...visualConfig };
  }
}
