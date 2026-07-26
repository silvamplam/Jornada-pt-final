export type PublicTeamBadgeContrastMode = "standard" | "light-detail";
export type PublicTeamBadgeShape = "tall" | "balanced" | "wide";

export function classifyPublicTeamBadgeShape(width: number, height: number): PublicTeamBadgeShape {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "balanced";
  }

  const aspectRatio = width / height;
  if (aspectRatio < 0.82) return "tall";
  if (aspectRatio > 1.18) return "wide";
  return "balanced";
}

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
  ["villarreal-cf", { opticalScale: 0.97, contrastMode: "standard" }],
  ["arsenal", { opticalScale: 0.98, contrastMode: "standard" }],
  ["aston-villa", { opticalScale: 1, contrastMode: "standard" }],
  ["bournemouth", { opticalScale: 1, contrastMode: "standard" }],
  ["brentford", { opticalScale: 1, contrastMode: "standard" }],
  ["brighton-hove-albion", { opticalScale: 0.96, contrastMode: "standard" }],
  ["chelsea", { opticalScale: 0.96, contrastMode: "standard" }],
  ["coventry-city", { opticalScale: 0.98, contrastMode: "standard" }],
  ["crystal-palace", { opticalScale: 1.08, contrastMode: "standard" }],
  ["everton", { opticalScale: 1.08, contrastMode: "standard" }],
  ["fulham", { opticalScale: 1, contrastMode: "standard" }],
  ["hull-city", { opticalScale: 1.08, contrastMode: "standard" }],
  ["ipswich-town", { opticalScale: 1, contrastMode: "standard" }],
  ["leeds-united", { opticalScale: 1.02, contrastMode: "standard" }],
  ["liverpool", { opticalScale: 1.06, contrastMode: "standard" }],
  ["manchester-city", { opticalScale: 0.96, contrastMode: "standard" }],
  ["manchester-united", { opticalScale: 1, contrastMode: "standard" }],
  ["newcastle-united", { opticalScale: 0.96, contrastMode: "standard" }],
  ["nottingham-forest", { opticalScale: 1.08, contrastMode: "standard" }],
  ["sunderland", { opticalScale: 1.10, contrastMode: "standard" }],
  ["tottenham-hotspur", { opticalScale: 1.05, contrastMode: "standard" }]
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
