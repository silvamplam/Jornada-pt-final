export type BroadcastChannelLogoContrastMode = "standard" | "light-logo";

type BroadcastChannelLogoMatchMetaGeometry = {
  baseWidth: number;
  baseHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  sourceViewport?: {
    width: number;
    height: number;
    viewBox: string;
  };
};

type BroadcastChannelLogoVisualConfig = {
  opticalScale: number;
  contrastMode: BroadcastChannelLogoContrastMode;
  slotMinWidth?: number;
  matchMetaGeometry?: BroadcastChannelLogoMatchMetaGeometry;
};

export type BroadcastChannelLogoPresentation =
  | { kind: "hidden" }
  | { kind: "fallback"; name: string }
  | {
      kind: "image";
      name: string;
      logoUrl: string;
      opticalScale: number;
      contrastMode: BroadcastChannelLogoContrastMode;
      slotMinWidth: number;
      matchMetaGeometry?: BroadcastChannelLogoMatchMetaGeometry;
    };

const DEFAULT_VISUAL_CONFIG: BroadcastChannelLogoVisualConfig = {
  opticalScale: 1,
  contrastMode: "standard",
  slotMinWidth: 46
};

const CHANNEL_VISUAL_CONFIG = new Map<string, BroadcastChannelLogoVisualConfig>([
  ["rtp1", {
    opticalScale: 0.72,
    contrastMode: "standard",
    matchMetaGeometry: {
      baseWidth: 54,
      baseHeight: 15.26,
      renderedWidth: 38.88,
      renderedHeight: 10.99
    }
  }],
  ["sport tv 1", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv 2", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv 3", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv 4", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv 5", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv 6", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv 7", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["sport tv+", { opticalScale: 1.14, contrastMode: "light-logo", slotMinWidth: 64 }],
  ["btv", { opticalScale: 0.82, contrastMode: "standard" }],
  ["tvi", {
    opticalScale: 1.48,
    contrastMode: "standard",
    matchMetaGeometry: {
      baseWidth: 15.83,
      baseHeight: 12,
      renderedWidth: 23.43,
      renderedHeight: 17.76,
      sourceViewport: {
        width: 1920,
        height: 1080,
        viewBox: "530 214 860 652"
      }
    }
  }],
  ["dazn 1", { opticalScale: 0.82, contrastMode: "standard" }],
  ["dazn 2", { opticalScale: 0.82, contrastMode: "standard" }],
  ["dazn 3", { opticalScale: 0.82, contrastMode: "standard" }]
]);

function resolveBroadcastChannelLogoVisualConfig(
  name: string
): BroadcastChannelLogoVisualConfig & { slotMinWidth: number } {
  const config = CHANNEL_VISUAL_CONFIG.get(name.toLocaleLowerCase("pt-PT")) ?? DEFAULT_VISUAL_CONFIG;
  return {
    ...config,
    slotMinWidth: config.slotMinWidth ?? 46
  };
}

export function resolveBroadcastChannelLogoPresentation(
  name: string | null | undefined,
  logoUrl: string | null | undefined
): BroadcastChannelLogoPresentation {
  const exactName = name?.trim();
  if (!exactName) return { kind: "hidden" };

  const candidateUrl = logoUrl?.trim();
  if (!candidateUrl) return { kind: "fallback", name: exactName };

  try {
    const parsedUrl = new URL(candidateUrl);
    if (parsedUrl.protocol !== "https:") return { kind: "fallback", name: exactName };
    return {
      kind: "image",
      name: exactName,
      logoUrl: candidateUrl,
      ...resolveBroadcastChannelLogoVisualConfig(exactName)
    };
  } catch {
    return { kind: "fallback", name: exactName };
  }
}
