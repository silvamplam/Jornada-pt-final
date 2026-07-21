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
  ["santa-clara", { opticalScale: 1, contrastMode: "light-detail" }]
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
